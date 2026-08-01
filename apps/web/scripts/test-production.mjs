import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { verifyBuild } from "./verify-build.mjs";

const applicationRoot = fileURLToPath(new URL("../", import.meta.url));
const outputRoot = join(applicationRoot, "dist");
const vaultWorkerProtocol = 2;
const contentSecurityPolicy =
  "default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'; script-src 'self' 'wasm-unsafe-eval'; script-src-attr 'none'; style-src 'self'; style-src-attr 'none'; img-src 'self'; font-src 'none'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; child-src 'none'; frame-src 'none'; media-src 'none'; require-trusted-types-for 'script'; trusted-types neutron-static-script-url; upgrade-insecure-requests";
const permissionsPolicy =
  "accelerometer=(), ambient-light-sensor=(), autoplay=(), browsing-topics=(), camera=(), clipboard-write=(self), display-capture=(), document-domain=(), encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), hid=(), identity-credentials-get=(), interest-cohort=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-create=(self), publickey-credentials-get=(self), screen-wake-lock=(), serial=(), storage-access=(), usb=(), web-share=(), xr-spatial-tracking=()";
const securityHeaders = Object.freeze({
  "Content-Security-Policy": contentSecurityPolicy,
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Origin-Agent-Cluster": "?1",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": permissionsPolicy,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Permitted-Cross-Domain-Policies": "none",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
});
const mediaTypes = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
});

function serve(publicFiles) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      assert.equal(url.search, "");
      const path = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      assert.equal(normalize(path), path);
      assert(publicFiles.has(path));
      const body = await readFile(join(outputRoot, path));
      response.writeHead(200, {
        ...securityHeaders,
        "Content-Type": mediaTypes[extname(path)] ?? "application/octet-stream",
        "Cache-Control": path.startsWith("assets/")
          ? "public, max-age=31536000, immutable"
          : "no-cache, max-age=0, must-revalidate",
      });
      response.end(body);
    } catch {
      response.writeHead(404, {
        ...securityHeaders,
        "Content-Type": "text/plain; charset=utf-8",
      });
      response.end("not found");
    }
  });
}

async function startServer(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(typeof address === "object" && address !== null);
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server) {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

async function waitForNoWorkers(page) {
  const deadline = Date.now() + 2_500;
  while (page.workers().length > 0 && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(page.workers().length, 0);
}

async function activateWithKeyboard(page, locator) {
  await locator.focus();
  await page.keyboard.press("Enter");
}

async function externalUpdate(page, password, matchTitle, replacementTitle) {
  return page.evaluate(
    async ({ matchTitle, password, protocol, replacementTitle }) => {
      const worker = globalThis.__neutronCreateCapturedWorker();
      const call = (message) =>
        new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("worker timeout")), 5_000);
          worker.addEventListener("message", function receive(event) {
            if (event.data?.requestId !== message.requestId) return;
            worker.removeEventListener("message", receive);
            clearTimeout(timeout);
            event.data.ok ? resolve(event.data) : reject(new Error(event.data.error));
          });
          worker.postMessage(message);
        });
      try {
        const unlocked = await call({
          protocol,
          requestId: "1",
          sessionEpoch: "0",
          operation: "unlock",
          input: { password },
        });
        const vaultId = unlocked.result.metadata.vaults[0].id;
        const listed = await call({
          protocol,
          requestId: "2",
          sessionEpoch: "1",
          operation: "list-item-summaries",
          input: { vaultId, limit: 24 },
        });
        const summary = listed.result.items.find((item) => item.title === matchTitle);
        if (summary === undefined) throw new Error("target summary missing");
        const read = await call({
          protocol,
          requestId: "3",
          sessionEpoch: "1",
          operation: "get-item",
          input: { vaultId, itemId: summary.id },
        });
        const base = read.result.item;
        if (base === null) throw new Error("target item missing");
        const updated = await call({
          protocol,
          requestId: "4",
          sessionEpoch: "1",
          operation: "update-item",
          input: {
            vaultId,
            itemId: base.id,
            generation: base.generation,
            keyVersion: base.keyVersion,
            item: { ...base.item, title: replacementTitle },
          },
        });
        await call({
          protocol,
          requestId: "5",
          sessionEpoch: "1",
          operation: "lock",
          input: {},
        });
        return updated.result.revision;
      } finally {
        worker.terminate();
      }
    },
    { matchTitle, password, protocol: vaultWorkerProtocol, replacementTitle },
  );
}

async function rawDatabaseDump(page) {
  return page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("neutron-vault-v1", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("database open failed"));
    });
    const transaction = database.transaction("encrypted-records", "readonly");
    const store = transaction.objectStore("encrypted-records");
    const result = (request) =>
      new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("database read failed"));
      });
    const [keys, rows] = await Promise.all([result(store.getAllKeys()), result(store.getAll())]);
    database.close();
    const snapshot = (value) => {
      if (value instanceof ArrayBuffer) {
        const bytes = new Uint8Array(value);
        return {
          hex: [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
          text: new TextDecoder().decode(bytes),
        };
      }
      if (ArrayBuffer.isView(value))
        return snapshot(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
      if (Array.isArray(value)) return value.map(snapshot);
      if (typeof value === "object" && value !== null)
        return Object.fromEntries(
          Object.entries(value).map(([key, entry]) => [key, snapshot(entry)]),
        );
      return value;
    };
    return JSON.stringify({ keys: snapshot(keys), rows: snapshot(rows) });
  });
}

async function corruptOnlyItemPayload(page) {
  return page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("neutron-vault-v1", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("database open failed"));
    });
    try {
      const transaction = database.transaction("encrypted-records", "readwrite");
      const store = transaction.objectStore("encrypted-records");
      const result = (request) =>
        new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error ?? new Error("database request failed"));
        });
      const keys = await result(store.getAllKeys());
      const payloadKeys = keys.filter((key) => typeof key === "string" && key.startsWith("v1:10:"));
      if (payloadKeys.length !== 1) throw new Error("expected one item payload");
      const key = payloadKeys[0];
      const stored = await result(store.get(key));
      if (
        typeof stored !== "object" ||
        stored === null ||
        stored.storageVersion !== 1 ||
        !(stored.envelope instanceof ArrayBuffer)
      )
        throw new Error("invalid stored item payload");
      const originalEnvelope = stored.envelope.slice(0);
      const envelope = originalEnvelope.slice(0);
      const bytes = new Uint8Array(envelope);
      bytes[bytes.length - 1] ^= 1;
      store.put({ envelope, storageVersion: 1 }, key);
      await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error ?? new Error("transaction failed"));
        transaction.onabort = () => reject(transaction.error ?? new Error("transaction aborted"));
      });
      const opaqueId = key.split(":")[3];
      if (!/^[0-9a-f]{32}$/.test(opaqueId)) throw new Error("invalid item identity");
      return { bytes: [...new Uint8Array(originalEnvelope)], key, opaqueId };
    } finally {
      database.close();
    }
  });
}

async function restoreItemPayload(page, snapshot) {
  await page.evaluate(async ({ bytes, key }) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("neutron-vault-v1", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("database open failed"));
    });
    try {
      const transaction = database.transaction("encrypted-records", "readwrite");
      transaction
        .objectStore("encrypted-records")
        .put({ envelope: new Uint8Array(bytes).buffer, storageVersion: 1 }, key);
      await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error ?? new Error("transaction failed"));
        transaction.onabort = () => reject(transaction.error ?? new Error("transaction aborted"));
      });
    } finally {
      database.close();
    }
  }, snapshot);
}

async function runtimeSurfaceDump(page) {
  return page.evaluate(async () =>
    JSON.stringify({
      cacheNames: await caches.keys(),
      cookie: document.cookie,
      formValues: [...document.querySelectorAll("input, textarea")].map((input) => input.value),
      historyState: history.state,
      html: document.documentElement.outerHTML,
      localStorage: Object.entries(localStorage),
      performanceUrls: performance.getEntriesByType("resource").map((entry) => entry.name),
      sessionStorage: Object.entries(sessionStorage),
      title: document.title,
      url: location.href,
      windowName: globalThis.name,
    }),
  );
}

async function originPersistenceDump(page) {
  const indexedDatabase = await rawDatabaseDump(page);
  const originStorage = await page.evaluate(async () => {
    const cacheEntries = [];
    for (const cacheName of await caches.keys()) {
      const cache = await caches.open(cacheName);
      for (const request of await cache.keys()) {
        const response = await cache.match(request);
        cacheEntries.push({
          cacheName,
          requestHeaders: [...request.headers],
          requestUrl: request.url,
          responseHeaders: response === undefined ? [] : [...response.headers],
          responseText: response === undefined ? "" : await response.clone().text(),
        });
      }
    }
    return {
      cacheEntries,
      historyState: history.state,
      localStorage: Object.entries(localStorage),
      sessionStorage: Object.entries(sessionStorage),
    };
  });
  return JSON.stringify({ indexedDatabase, originStorage });
}

function assertNoSentinels(value, sentinels, label) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  for (const sentinel of sentinels) {
    assert.equal(text.includes(sentinel), false, `${label} contains plaintext sentinel`);
    const hex = [...new TextEncoder().encode(sentinel)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    assert.equal(text.includes(hex), false, `${label} contains hex plaintext sentinel`);
  }
}

async function emittedPassphraseWordlist(build) {
  const worker = await readFile(join(outputRoot, build.workerFile), "utf8");
  const prefix = "Object.freeze(`abacus.";
  const suffix = "zoom`.split(`.`))";
  const start = worker.indexOf(prefix);
  assert.notEqual(start, -1, "emitted frozen passphrase wordlist is absent");
  assert.equal(worker.indexOf(prefix, start + 1), -1, "multiple emitted passphrase wordlists");
  const end = worker.indexOf(suffix, start);
  assert.notEqual(end, -1, "emitted passphrase wordlist terminator is absent");
  assert.equal(worker.indexOf(suffix, end + 1), -1, "multiple emitted wordlist terminators");
  const encoded = worker.slice(start + "Object.freeze(`".length, end + "zoom".length);
  const words = encoded.split(".");
  assert.equal(words.length, 7_776);
  assert.equal(words[0], "abacus");
  assert.equal(words.at(-1), "zoom");
  assert(
    words.every(
      (word) =>
        /^[a-z]+(?:-[a-z]+)*$/.test(word) &&
        word.length >= 3 &&
        word.length <= 9 &&
        !word.includes("."),
    ),
  );
  for (let index = 1; index < words.length; index += 1) assert(words[index - 1] < words[index]);
  assert.equal(
    createHash("sha256").update(words.join("\n")).digest("hex"),
    "abae49761b88f3f1ba31ef944bea1f61b795a3cd7e1cfb7d276ed45bf77967ba",
  );
  return Object.freeze(words);
}

function referenceTotp(secret, algorithm, digits, period, validFromUnixSeconds) {
  const counter = BigInt(validFromUnixSeconds) / BigInt(period);
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(counter);
  const digest = createHmac(algorithm, Buffer.from(secret, "ascii")).update(counterBytes).digest();
  const offset = digest.at(-1) & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

const build = await verifyBuild();
const passphraseWords = await emittedPassphraseWordlist(build);
const passphraseWordSet = new Set(passphraseWords);
const attribution =
  "Electronic Frontier Foundation; CC-BY-4.0; https://creativecommons.org/licenses/by/4.0/; source https://www.eff.org/files/2016/07/18/eff_large_wordlist.txt retrieved 2026-08-01. Neutron modified the material by discarding the dice indices and rejoining the 7,776 words with U+000A. The CC BY 4.0 disclaimer of warranties applies.";
const windowFiles = build.files.filter(
  (file) => file.startsWith("assets/index-") && file.endsWith(".js"),
);
assert.equal(windowFiles.length, 1, "expected exactly one emitted window entry");
const windowSource = await readFile(join(outputRoot, windowFiles[0]), "utf8");
assert.equal(windowSource.split(attribution).length - 1, 1, "emitted attribution mismatch");
const publicFiles = new Set(build.files.filter((file) => !file.startsWith(".vite/")));
const allowedPaths = new Set([...publicFiles].map((file) => `/${file}`));
allowedPaths.add("/");
const server = serve(publicFiles);
const origin = await startServer(server);
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const NativeWorker = globalThis.Worker;
    let approvedWorkerUrl;
    function CapturingWorker(url, options) {
      approvedWorkerUrl ??= url;
      return new NativeWorker(url, options);
    }
    CapturingWorker.prototype = NativeWorker.prototype;
    Object.setPrototypeOf(CapturingWorker, NativeWorker);
    Object.defineProperty(globalThis, "Worker", {
      configurable: true,
      value: CapturingWorker,
    });
    Object.defineProperty(globalThis, "__neutronCreateCapturedWorker", {
      value() {
        if (approvedWorkerUrl === undefined) throw new Error("worker URL not captured");
        return new NativeWorker(approvedWorkerUrl, { type: "module" });
      },
    });
  });
  const page = await context.newPage();
  const errors = [];
  const consoleMessages = [];
  const requested = new Set();
  const requestRecords = [];
  page.on("console", (message) => {
    consoleMessages.push(message.text());
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("requestfailed", (request) => errors.push(`request: ${request.url()}`));
  page.on("request", (request) => {
    const url = new URL(request.url());
    assert.equal(url.origin, origin, `cross-origin request: ${url.href}`);
    assert(allowedPaths.has(url.pathname), `unexpected production request: ${url.pathname}`);
    requested.add(url.pathname);
    requestRecords.push({
      headers: request.headers(),
      postData: request.postData(),
      url: request.url(),
    });
  });

  const navigation = await page.goto(origin, { waitUntil: "networkidle" });
  assert.equal(navigation?.status(), 200);
  assert.equal(await page.evaluate(() => globalThis.isSecureContext), true);
  assert.equal(await page.evaluate(() => globalThis.crossOriginIsolated), true);
  assert.equal(await page.evaluate(() => typeof globalThis.trustedTypes), "object");
  await page.getByRole("heading", { name: "Welcome back" }).waitFor();
  await page.getByText(/synthetic test data only.*Stage 5 security review/s).waitFor();
  await page.setViewportSize({ width: 320, height: 640 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= globalThis.innerWidth),
    true,
  );

  const password = "synthetic production password";
  await page.getByRole("button", { name: "Create a local vault" }).click();
  await page.getByText(/synthetic test data only.*Stage 5 security review/s).waitFor();
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= globalThis.innerWidth),
    true,
  );
  await page.locator("#new-password").fill(password);
  await page.locator("#new-password-again").fill(password);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText(/synthetic test data only.*Stage 5 security review/s).waitFor();
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= globalThis.innerWidth),
    true,
  );
  const recoveryKit = await page.getByRole("status", { name: "Recovery kit" }).textContent();
  assert.equal(typeof recoveryKit, "string");
  assert(recoveryKit.startsWith("ntrk1"));
  await page.locator("#recovery-confirmation").fill(recoveryKit);
  await page.getByRole("button", { name: "Confirm and create vault" }).click();
  await page.getByRole("heading", { name: "Your vault" }).waitFor();
  await page.getByText(/synthetic test data only.*Stage 5 security review/s).waitFor();
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= globalThis.innerWidth),
    true,
  );
  assert.equal(
    await page.locator(".item-list").evaluate((node) => getComputedStyle(node).display),
    "block",
  );
  assert.equal(
    await page.locator(".detail-panel").evaluate((node) => getComputedStyle(node).display),
    "none",
  );
  assert.equal(await page.getByRole("navigation", { name: "Item pages" }).count(), 0);
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".item-list .section-heading button"))
        .backgroundColor === "rgb(112, 225, 200)",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Create item" })
      .evaluate((node) => getComputedStyle(node).backgroundColor),
    "rgb(112, 225, 200)",
  );
  await activateWithKeyboard(page, page.getByRole("button", { name: "Create item" }));
  await page.getByRole("form", { name: "Create item" }).waitFor();
  assert.equal(
    await page.locator(".item-list").evaluate((node) => getComputedStyle(node).display),
    "none",
  );
  assert.equal(
    await page.locator(".detail-panel").evaluate((node) => getComputedStyle(node).display),
    "block",
  );
  await activateWithKeyboard(
    page,
    page.getByRole("form", { name: "Create item" }).getByRole("button", { name: "Cancel editing" }),
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Create item" })
      .evaluate((node) => node === document.activeElement),
    true,
  );
  assert.equal(
    await page.locator(".item-list").evaluate((node) => getComputedStyle(node).display),
    "block",
  );
  assert.equal(
    await page.locator(".detail-panel").evaluate((node) => getComputedStyle(node).display),
    "none",
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".item-list .section-heading button"))
        .backgroundColor === "rgba(0, 0, 0, 0)",
  );
  assert.equal(
    await page.locator(".item-list").evaluate((node) => getComputedStyle(node).display),
    "block",
  );
  assert.equal(
    await page.locator(".detail-panel").evaluate((node) => getComputedStyle(node).display),
    "block",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Create item" })
      .evaluate((node) => getComputedStyle(node).backgroundColor),
    "rgba(0, 0, 0, 0)",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Create your first item" })
      .evaluate((node) => getComputedStyle(node).backgroundColor),
    "rgb(112, 225, 200)",
  );

  const originalTitle = "Production CRUD fixture";
  const username = "production-crud-username";
  const tag = "production-crud-tag";
  const loginNotes = "production-login-notes-sentinel";
  const unsavedDraft = "Production unsaved draft";
  const externalWinnerOne = "Production external winner one";
  const externalWinnerTwo = "Production external winner two";
  const savedTitle = "Production saved title";
  const sentinels = [
    password,
    recoveryKit,
    originalTitle,
    username,
    tag,
    loginNotes,
    unsavedDraft,
    externalWinnerOne,
    externalWinnerTwo,
    savedTitle,
  ];

  await activateWithKeyboard(page, page.getByRole("button", { name: "Create item" }));
  const createForm = page.getByRole("form", { name: "Create item" });
  await page.setViewportSize({ width: 320, height: 640 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= globalThis.innerWidth),
    true,
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  await createForm.getByLabel("Title").fill(originalTitle);
  await createForm.getByLabel("Tags, one per line").fill(tag);
  await createForm.getByLabel("Username").fill(username);
  await createForm.getByLabel("Store a notes field").check();
  await createForm.getByLabel("Notes", { exact: true }).fill(loginNotes);
  await activateWithKeyboard(page, createForm.getByRole("button", { name: "Generate password" }));
  await page.waitForFunction(() => document.querySelector("#item-password")?.value.length === 20);
  assert.equal(
    await createForm.getByLabel("Password", { exact: true }).getAttribute("type"),
    "password",
  );
  const generatedPassword = await createForm.getByLabel("Password", { exact: true }).inputValue();
  assert.equal(generatedPassword.length, 20);
  assert.match(generatedPassword, /^[A-Za-z0-9!@#$%^&*()\-_=+[\]{};:,.?]+$/);
  sentinels.push(generatedPassword);
  await activateWithKeyboard(page, createForm.getByRole("button", { name: "Show password" }));
  assert.equal(
    await createForm.getByLabel("Password", { exact: true }).getAttribute("type"),
    "text",
  );
  await activateWithKeyboard(page, createForm.getByRole("button", { name: "Hide password" }));
  await createForm.getByLabel("Random-word passphrase").check();
  assert.equal(await createForm.getByLabel("Words").inputValue(), "8");
  assert.equal((await createForm.textContent()).includes(attribution), true);
  await page.setViewportSize({ width: 320, height: 640 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= globalThis.innerWidth),
    true,
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  await activateWithKeyboard(page, createForm.getByRole("button", { name: "Generate passphrase" }));
  await page
    .getByText("Passphrase generated and placed in the masked password field.", { exact: true })
    .waitFor({ state: "attached" });
  const generatedPassphrase = await createForm.getByLabel("Password", { exact: true }).inputValue();
  const generatedWords = generatedPassphrase.split(".");
  assert.equal(generatedWords.length, 8);
  assert(generatedWords.every((word) => passphraseWordSet.has(word)));
  sentinels.push(generatedPassphrase);
  assertNoSentinels(await originPersistenceDump(page), sentinels, "pre-save origin persistence");
  await activateWithKeyboard(page, createForm.getByRole("button", { name: "Create item" }));
  await page.getByRole("heading", { name: originalTitle }).waitFor();
  await page.getByText(/Revision 1 · key version 1/).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: new RegExp(originalTitle) })
      .getAttribute("aria-current"),
    "true",
  );
  assertNoSentinels(
    await runtimeSurfaceDump(page),
    [generatedPassphrase, loginNotes],
    "selected masked login runtime",
  );
  await page.setViewportSize({ width: 320, height: 640 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= globalThis.innerWidth),
    true,
  );
  await activateWithKeyboard(page, page.getByRole("button", { name: "Show password" }));
  assert.equal((await page.locator("body").textContent()).includes(generatedPassphrase), true);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= globalThis.innerWidth),
    true,
  );
  await activateWithKeyboard(page, page.getByRole("button", { name: "Hide password" }));
  assert.equal((await page.locator("body").textContent()).includes(generatedPassphrase), false);
  await activateWithKeyboard(page, page.getByRole("button", { name: "Show notes" }));
  assert.equal((await page.locator("body").textContent()).includes(loginNotes), true);
  await activateWithKeyboard(page, page.getByRole("button", { name: "Back to items" }));
  assert.equal((await page.locator("body").textContent()).includes(loginNotes), false);
  assert.equal(
    await page.locator("#items-title").evaluate((node) => node === document.activeElement),
    true,
  );
  assert.equal(
    await page.locator(".item-list").evaluate((node) => getComputedStyle(node).display),
    "block",
  );
  assert.equal(
    await page.locator(".detail-panel").evaluate((node) => getComputedStyle(node).display),
    "none",
  );
  await activateWithKeyboard(page, page.getByRole("button", { name: new RegExp(originalTitle) }));
  await page.setViewportSize({ width: 1280, height: 720 });
  assertNoSentinels(await rawDatabaseDump(page), sentinels, "post-save encrypted IndexedDB");

  await activateWithKeyboard(page, page.getByRole("button", { name: "Edit item" }));
  assert.equal(await page.locator("#detail-secret-notes").count(), 0);
  const staleUpdateForm = page.getByRole("form", { name: "Edit item" });
  await activateWithKeyboard(page, staleUpdateForm.getByRole("button", { name: "Show password" }));
  assert.equal(
    await staleUpdateForm.getByLabel("Password", { exact: true }).getAttribute("type"),
    "text",
  );
  await staleUpdateForm.getByLabel("Title").fill(unsavedDraft);
  const firstExternalRevision = await externalUpdate(
    page,
    password,
    originalTitle,
    externalWinnerOne,
  );
  assert.equal(firstExternalRevision.generation, "2");
  await activateWithKeyboard(page, staleUpdateForm.getByRole("button", { name: "Save changes" }));
  await page.getByText(/Your draft was not saved/).waitFor();
  assert.equal(await staleUpdateForm.getByLabel("Title").inputValue(), unsavedDraft);
  assert.equal(
    await staleUpdateForm.getByLabel("Password", { exact: true }).getAttribute("type"),
    "password",
  );
  await activateWithKeyboard(page, staleUpdateForm.getByRole("button", { name: "Cancel editing" }));
  await activateWithKeyboard(page, page.getByRole("button", { name: "Discard draft" }));
  assert.equal(await page.locator("#detail-secret-password, #detail-secret-notes").count(), 0);

  await activateWithKeyboard(page, page.getByRole("button", { name: new RegExp(originalTitle) }));
  await page.getByRole("heading", { name: externalWinnerOne }).waitFor();
  await activateWithKeyboard(page, page.getByRole("button", { name: "Edit item" }));
  await activateWithKeyboard(page, page.getByRole("button", { name: "Delete item" }));
  const deleteGroup = page.getByRole("group", {
    name: `Delete “${externalWinnerOne}”?`,
  });
  await page.setViewportSize({ width: 320, height: 640 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= globalThis.innerWidth),
    true,
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  const secondExternalRevision = await externalUpdate(
    page,
    password,
    externalWinnerOne,
    externalWinnerTwo,
  );
  assert.equal(secondExternalRevision.generation, "3");
  await activateWithKeyboard(page, deleteGroup.getByRole("button", { name: "Confirm delete" }));
  await page.getByText(/It was not deleted/).waitFor();
  await activateWithKeyboard(page, deleteGroup.getByRole("button", { name: "Cancel deletion" }));
  await activateWithKeyboard(
    page,
    page.getByRole("form", { name: "Edit item" }).getByRole("button", { name: "Cancel editing" }),
  );

  await activateWithKeyboard(page, page.getByRole("button", { name: new RegExp(originalTitle) }));
  await page.getByRole("heading", { name: externalWinnerTwo }).waitFor();
  await activateWithKeyboard(page, page.getByRole("button", { name: "Edit item" }));
  const successfulEdit = page.getByRole("form", { name: "Edit item" });
  await successfulEdit.getByLabel("Title").fill(savedTitle);
  await activateWithKeyboard(page, successfulEdit.getByRole("button", { name: "Save changes" }));
  await page.getByRole("heading", { name: savedTitle }).waitFor();
  await page.getByText(/Revision 4 · key version 1/).waitFor();
  assert.equal(await page.locator("#detail-secret-password, #detail-secret-notes").count(), 0);

  assertNoSentinels(await rawDatabaseDump(page), sentinels, "live IndexedDB");

  await activateWithKeyboard(page, page.getByRole("button", { name: "Edit item" }));
  await activateWithKeyboard(page, page.getByRole("button", { name: "Delete item" }));
  await activateWithKeyboard(page, page.getByRole("button", { name: "Cancel deletion" }));
  await activateWithKeyboard(page, page.getByRole("button", { name: "Delete item" }));
  await activateWithKeyboard(page, page.getByRole("button", { name: "Confirm delete" }));
  await page.getByText("Your vault has no items yet.").waitFor();
  await page.getByRole("heading", { name: "Create your first encrypted item" }).waitFor();
  assertNoSentinels(await rawDatabaseDump(page), sentinels, "deleted IndexedDB");
  assertNoSentinels(await runtimeSurfaceDump(page), sentinels, "post-delete runtime");

  await activateWithKeyboard(page, page.getByRole("button", { name: "Create item" }));
  const validationForm = page.getByRole("form", { name: "Create item" });
  await activateWithKeyboard(page, validationForm.getByRole("button", { name: "Create item" }));
  const firstValidationId = await page.locator(".editor-error").getAttribute("id");
  assert.equal(
    await page.locator(".editor-error").evaluate((node) => node === document.activeElement),
    true,
  );
  await activateWithKeyboard(page, validationForm.getByRole("button", { name: "Create item" }));
  const secondValidationId = await page.locator(".editor-error").getAttribute("id");
  assert.notEqual(secondValidationId, firstValidationId);
  assert.equal(
    await page.locator(".editor-error").evaluate((node) => node === document.activeElement),
    true,
  );
  await activateWithKeyboard(page, validationForm.getByRole("button", { name: "Cancel editing" }));

  const noteTitle = "Production secure note fixture";
  const noteBody = "production-secure-note-body-sentinel";
  sentinels.push(noteTitle, noteBody);
  await activateWithKeyboard(page, page.getByRole("button", { name: "Create item" }));
  const noteForm = page.getByRole("form", { name: "Create item" });
  await noteForm.getByLabel("Type").selectOption("secure-note");
  await noteForm.getByLabel("Title").fill(noteTitle);
  await noteForm.getByLabel("Note").fill(noteBody);
  await activateWithKeyboard(page, noteForm.getByRole("button", { name: "Create item" }));
  await page.getByRole("heading", { name: noteTitle }).waitFor();
  assertNoSentinels(
    await runtimeSurfaceDump(page),
    [noteBody],
    "selected masked secure-note runtime",
  );
  await activateWithKeyboard(page, page.getByRole("button", { name: "Show secure note" }));
  assert.equal((await page.locator("body").textContent()).includes(noteBody), true);
  await activateWithKeyboard(page, page.getByRole("button", { name: "Edit item" }));
  assert.equal(await page.locator("#detail-secret-body").count(), 0);
  await activateWithKeyboard(page, page.getByRole("button", { name: "Delete item" }));
  await activateWithKeyboard(page, page.getByRole("button", { name: "Confirm delete" }));
  await page.getByText("Your vault has no items yet.").waitFor();
  assertNoSentinels(await runtimeSurfaceDump(page), sentinels, "secure-note deleted runtime");

  const backupTitle = "Production backup fixture";
  const backupCode = "production-backup-code-sentinel";
  const backupNotes = "production-backup-notes-sentinel";
  sentinels.push(backupTitle, backupCode, backupNotes);
  await activateWithKeyboard(page, page.getByRole("button", { name: "Create item" }));
  const backupForm = page.getByRole("form", { name: "Create item" });
  await backupForm.getByLabel("Type").selectOption("backup-code");
  await backupForm.getByLabel("Title").fill(backupTitle);
  await backupForm.getByLabel("Codes, one per line").fill(backupCode);
  await backupForm.getByLabel("Store a notes field").check();
  await backupForm.getByLabel("Notes", { exact: true }).fill(backupNotes);
  await activateWithKeyboard(page, backupForm.getByRole("button", { name: "Create item" }));
  await page.getByRole("heading", { name: backupTitle }).waitFor();
  assertNoSentinels(
    await runtimeSurfaceDump(page),
    [backupCode, backupNotes],
    "selected masked backup-code runtime",
  );
  await page.setViewportSize({ width: 320, height: 640 });
  await activateWithKeyboard(page, page.getByRole("button", { name: "Show backup codes" }));
  assert.equal((await page.locator("body").textContent()).includes(backupCode), true);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= globalThis.innerWidth),
    true,
  );
  await activateWithKeyboard(page, page.getByRole("button", { name: "Hide backup codes" }));
  await activateWithKeyboard(page, page.getByRole("button", { name: "Show notes" }));
  assert.equal((await page.locator("body").textContent()).includes(backupNotes), true);
  await page.setViewportSize({ width: 1280, height: 720 });
  await activateWithKeyboard(page, page.getByRole("button", { name: "Edit item" }));
  assert.equal(await page.locator("#detail-secret-notes").count(), 0);
  await activateWithKeyboard(page, page.getByRole("button", { name: "Delete item" }));
  await activateWithKeyboard(page, page.getByRole("button", { name: "Confirm delete" }));
  await page.getByText("Your vault has no items yet.").waitFor();
  assertNoSentinels(await rawDatabaseDump(page), sentinels, "backup deleted IndexedDB");
  assertNoSentinels(await runtimeSurfaceDump(page), sentinels, "backup deleted runtime");

  const jsonTitle = "Production JSON fixture";
  const jsonSecret = "production-json-value-sentinel";
  sentinels.push(jsonTitle, jsonSecret);
  await activateWithKeyboard(page, page.getByRole("button", { name: "Create item" }));
  const jsonForm = page.getByRole("form", { name: "Create item" });
  await jsonForm.getByLabel("Type").selectOption("json");
  await jsonForm.getByLabel("Title").fill(jsonTitle);
  await jsonForm.getByLabel("JSON value").fill(JSON.stringify({ secret: jsonSecret }));
  await activateWithKeyboard(page, jsonForm.getByRole("button", { name: "Create item" }));
  await page.getByRole("heading", { name: jsonTitle }).waitFor();
  assertNoSentinels(await runtimeSurfaceDump(page), [jsonSecret], "selected masked JSON runtime");
  await page.setViewportSize({ width: 320, height: 640 });
  await activateWithKeyboard(page, page.getByRole("button", { name: "Show json value" }));
  assert.equal((await page.locator("body").textContent()).includes(jsonSecret), true);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= globalThis.innerWidth),
    true,
  );
  await activateWithKeyboard(page, page.getByRole("button", { name: "Hide json value" }));
  await page.setViewportSize({ width: 1280, height: 720 });
  await activateWithKeyboard(page, page.getByRole("button", { name: "Edit item" }));
  await activateWithKeyboard(page, page.getByRole("button", { name: "Delete item" }));
  await activateWithKeyboard(page, page.getByRole("button", { name: "Confirm delete" }));
  await page.getByText("Your vault has no items yet.").waitFor();
  assertNoSentinels(await rawDatabaseDump(page), sentinels, "JSON deleted IndexedDB");
  assertNoSentinels(await runtimeSurfaceDump(page), sentinels, "JSON deleted runtime");

  await activateWithKeyboard(page, page.getByRole("button", { name: "Create item" }));
  const cancelledForm = page.getByRole("form", { name: "Create item" });
  await cancelledForm.getByLabel("Random-word passphrase").check();
  await activateWithKeyboard(
    page,
    cancelledForm.getByRole("button", { name: "Generate passphrase" }),
  );
  await page
    .getByText("Passphrase generated and placed in the masked password field.", { exact: true })
    .waitFor({ state: "attached" });
  const cancelledGeneratedPassphrase = await cancelledForm
    .getByLabel("Password", { exact: true })
    .inputValue();
  assert.equal(cancelledGeneratedPassphrase.split(".").length, 8);
  sentinels.push(cancelledGeneratedPassphrase);
  await activateWithKeyboard(page, cancelledForm.getByRole("button", { name: "Cancel editing" }));
  await activateWithKeyboard(page, page.getByRole("button", { name: "Discard draft" }));
  assertNoSentinels(await rawDatabaseDump(page), sentinels, "cancelled-generation IndexedDB");
  assertNoSentinels(await runtimeSurfaceDump(page), sentinels, "cancelled-generation runtime");

  await activateWithKeyboard(page, page.getByRole("button", { name: "Create item" }));
  const lockForm = page.getByRole("form", { name: "Create item" });
  await lockForm.getByLabel("Random-word passphrase").check();
  await activateWithKeyboard(page, lockForm.getByRole("button", { name: "Generate passphrase" }));
  await page
    .getByText("Passphrase generated and placed in the masked password field.", { exact: true })
    .waitFor({ state: "attached" });
  const lockedGeneratedPassphrase = await lockForm
    .getByLabel("Password", { exact: true })
    .inputValue();
  assert.equal(lockedGeneratedPassphrase.split(".").length, 8);
  sentinels.push(lockedGeneratedPassphrase);
  assertNoSentinels(await originPersistenceDump(page), sentinels, "pre-lock origin persistence");
  const activeWorkerBeforeLock = page.workers()[0];
  assert(activeWorkerBeforeLock !== undefined, "unlocked vault worker is absent");
  await page.getByRole("button", { name: "Lock now" }).click();
  await page.getByRole("heading", { name: "Welcome back" }).waitFor();
  assertNoSentinels(await runtimeSurfaceDump(page), sentinels, "locked runtime");
  assertNoSentinels(await originPersistenceDump(page), sentinels, "locked origin persistence");
  await waitForNoWorkers(page);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#unlock-password").fill(password);
  await page.getByRole("button", { name: "Unlock vault" }).click();
  await page.getByText("Your vault has no items yet.").waitFor();
  const freshWorker = page.workers()[0];
  assert(freshWorker !== undefined, "fresh unlock worker is absent");
  assert.notEqual(freshWorker, activeWorkerBeforeLock);

  assert.equal(
    await page
      .getByRole("heading", { name: "Your vault" })
      .evaluate((node) => node === document.activeElement),
    true,
  );
  await page.keyboard.press("Tab");
  assert.equal(
    await page
      .getByRole("button", { name: "Lock now" })
      .evaluate((node) => node === document.activeElement),
    true,
  );
  await page.keyboard.press("Tab");
  const keyboardCreate = page.getByRole("button", { name: "Create item" });
  assert.equal(await keyboardCreate.evaluate((node) => node === document.activeElement), true);
  assert.notEqual(
    await keyboardCreate.evaluate((node) => getComputedStyle(node).outlineStyle),
    "none",
  );
  await page.keyboard.press("Enter");
  const keyboardEditor = page.getByRole("form", { name: "Create item" });
  assert.equal(
    await page
      .getByRole("heading", { name: "Create an item" })
      .evaluate((node) => node === document.activeElement),
    true,
  );
  await page.keyboard.press("Tab");
  assert.equal(
    await keyboardEditor.getByLabel("Type").evaluate((node) => node === document.activeElement),
    true,
  );
  await page.keyboard.press("Tab");
  assert.equal(
    await keyboardEditor.getByLabel("Title").evaluate((node) => node === document.activeElement),
    true,
  );
  await page.keyboard.press("Shift+Tab");
  assert.equal(
    await keyboardEditor.getByLabel("Type").evaluate((node) => node === document.activeElement),
    true,
  );

  const totpTitle = "Production TOTP fixture";
  const totpSeed = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  const totpForm = page.getByRole("form", { name: "Create item" });
  await totpForm.getByLabel("Type").selectOption("totp");
  await totpForm.getByLabel("Title").fill(totpTitle);
  await totpForm.getByLabel("Base32 secret").fill(totpSeed);
  await totpForm.getByLabel("Digits").selectOption("8");
  await activateWithKeyboard(page, totpForm.getByRole("button", { name: "Create item" }));
  await page.getByRole("heading", { name: totpTitle }).waitFor();
  const totpOutput = page.locator(".totp-value");
  await totpOutput.waitFor();
  const totpCode = await totpOutput.textContent();
  const validFromUnixSeconds = await totpOutput.getAttribute("data-valid-from");
  assert.match(totpCode, /^[0-9]{8}$/);
  assert.match(validFromUnixSeconds, /^(0|[1-9][0-9]*)$/);
  assert.equal(
    totpCode,
    referenceTotp("12345678901234567890", "sha1", 8, 30, validFromUnixSeconds),
  );
  sentinels.push(totpTitle, totpSeed, totpCode);
  assert.equal((await page.locator("body").textContent()).includes(totpSeed), false);
  await activateWithKeyboard(page, page.getByRole("button", { name: "Show totp secret" }));
  assert.equal((await page.locator("body").textContent()).includes(totpSeed), true);
  assert.equal(
    await page
      .locator('[role="status"], [aria-live]')
      .evaluateAll(
        (regions, secrets) =>
          regions.every((region) =>
            secrets.every((secret) => !region.textContent?.includes(secret)),
          ),
        [totpSeed, totpCode],
      ),
    true,
  );
  assertNoSentinels(await rawDatabaseDump(page), sentinels, "TOTP encrypted IndexedDB");
  assertNoSentinels(await originPersistenceDump(page), sentinels, "TOTP origin persistence");
  await page.setViewportSize({ width: 320, height: 640 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= globalThis.innerWidth),
    true,
  );
  await page.setViewportSize({ width: 1280, height: 720 });

  const recoverableCorruption = await corruptOnlyItemPayload(page);
  await page.evaluate(() => globalThis.dispatchEvent(new Event("focus")));
  await page.getByText(/current TOTP code could not be calculated/i).waitFor();
  assert.equal((await page.locator("body").textContent()).includes(totpSeed), false);
  await restoreItemPayload(page, recoverableCorruption);
  await activateWithKeyboard(page, page.getByRole("button", { name: "Try calculating again" }));
  await page.locator(".totp-value").waitFor();
  const finalCorruption = await corruptOnlyItemPayload(page);
  await page.getByRole("button", { name: "Lock now" }).click();
  await page.getByRole("heading", { name: "Welcome back" }).waitFor();
  assertNoSentinels(await runtimeSurfaceDump(page), sentinels, "corrupt-item locked runtime");
  await waitForNoWorkers(page);
  await page.locator("#unlock-password").fill(password);
  await page.getByRole("button", { name: "Unlock vault" }).click();
  await page.getByText(`Record ${finalCorruption.opaqueId}`).waitFor();
  await page.setViewportSize({ width: 320, height: 640 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= globalThis.innerWidth),
    true,
  );
  await page.setViewportSize({ width: 1280, height: 720 });

  for (let index = 0; index < 25; index += 1) {
    const paginationTitle = `Production pagination ${index.toString().padStart(2, "0")} sentinel`;
    sentinels.push(paginationTitle);
    await activateWithKeyboard(page, page.getByRole("button", { name: "Create item" }));
    const paginationForm = page.getByRole("form", { name: "Create item" });
    await paginationForm.getByLabel("Title").fill(paginationTitle);
    await activateWithKeyboard(page, paginationForm.getByRole("button", { name: "Create item" }));
    await page.getByRole("heading", { name: paginationTitle }).waitFor();
    await page.getByText("Item saved. Page 1 loaded.", { exact: true }).waitFor();
  }
  await page.getByText(/Page 1 · [0-9]+ shown/).waitFor();
  const productionNext = page.getByRole("button", { name: "Next page" });
  assert.equal(await productionNext.isEnabled(), true);
  await activateWithKeyboard(page, productionNext);
  await page.getByText(/Page 2 · [0-9]+ shown/).waitFor();
  await activateWithKeyboard(page, page.getByRole("button", { name: "Previous page" }));
  await page.getByText(/Page 1 · [0-9]+ shown/).waitFor();

  await page.getByRole("button", { name: "Lock now" }).click();
  await page.getByRole("heading", { name: "Welcome back" }).waitFor();
  assertNoSentinels(await runtimeSurfaceDump(page), sentinels, "TOTP locked runtime");
  assertNoSentinels(await originPersistenceDump(page), sentinels, "TOTP locked persistence");
  await waitForNoWorkers(page);

  assertNoSentinels(requestRecords, sentinels, "network requests");
  assertNoSentinels(consoleMessages, sentinels, "console output");

  for (const file of build.files.filter((entry) => !entry.startsWith(".vite/"))) {
    const response = await context.request.get(`${origin}/${file === "index.html" ? "" : file}`, {
      maxRedirects: 0,
    });
    assert.equal(response.status(), 200, `static response failed: ${file}`);
    assert.equal(response.url(), `${origin}/${file === "index.html" ? "" : file}`);
    const headers = response.headers();
    for (const [name, value] of Object.entries(securityHeaders))
      assert.equal(headers[name.toLowerCase()], value, `${file} header mismatch: ${name}`);
    assert.equal(headers["access-control-allow-origin"], undefined);
    assert.equal(headers["content-type"], mediaTypes[extname(file)]);
    assert.equal(
      headers["cache-control"],
      file.startsWith("assets/")
        ? "public, max-age=31536000, immutable"
        : "no-cache, max-age=0, must-revalidate",
    );
    const body = await response.body();
    assertNoSentinels(
      {
        headers,
        hex: body.toString("hex"),
        text: body.toString("utf8"),
        url: response.url(),
      },
      sentinels,
      `${file} response`,
    );
  }
  assert(requested.has(`/${build.workerFile}`), "production worker was not requested");
  assert.deepEqual(errors, []);
  await context.close();

  const unsupportedContext = await browser.newContext();
  await unsupportedContext.addInitScript(() => {
    function UnsupportedWorker() {
      throw new DOMException("module workers unavailable", "NotSupportedError");
    }
    Object.defineProperty(globalThis, "Worker", {
      configurable: true,
      value: UnsupportedWorker,
    });
  });
  const unsupported = await unsupportedContext.newPage();
  await unsupported.goto(origin);
  await unsupported.getByRole("heading", { name: "Neutron cannot open safely here" }).waitFor();
  assert.equal(await unsupported.locator('input[type="password"]').count(), 0);
  await unsupportedContext.close();

  const mobileContext = await browser.newContext({
    viewport: { width: 320, height: 640 },
  });
  const mobile = await mobileContext.newPage();
  await mobile.goto(origin);
  await mobile.getByRole("heading", { name: "Welcome back" }).waitFor();
  assert.equal(
    await mobile.evaluate(() => document.documentElement.scrollWidth <= globalThis.innerWidth),
    true,
  );
  await mobile.keyboard.press("Tab");
  assert.equal(
    await mobile.locator("#unlock-password").evaluate((node) => node === document.activeElement),
    true,
  );
  await mobile.keyboard.press("Tab");
  assert.equal(
    await mobile
      .getByRole("button", { name: "Unlock vault" })
      .evaluate((node) => node === document.activeElement),
    true,
  );
  await mobile.keyboard.press("Tab");
  assert.equal(
    await mobile
      .getByRole("button", { name: "Create a local vault" })
      .evaluate((node) => node === document.activeElement),
    true,
  );
  await mobile.keyboard.press("Enter");
  await mobile.getByRole("heading", { name: "Choose a master password" }).waitFor();
  await mobile.keyboard.press("Tab");
  assert.equal(
    await mobile.locator("#new-password").evaluate((node) => node === document.activeElement),
    true,
  );
  await mobile.keyboard.press("Tab");
  assert.equal(
    await mobile.locator("#new-password-again").evaluate((node) => node === document.activeElement),
    true,
  );
  await mobileContext.close();

  process.stdout.write("Production CSP Chromium flow passed.\n");
} finally {
  await browser.close();
  await closeServer(server);
}
