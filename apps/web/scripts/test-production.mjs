import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { verifyBuild } from "./verify-build.mjs";

const applicationRoot = fileURLToPath(new URL("../", import.meta.url));
const outputRoot = join(applicationRoot, "dist");
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
      response.writeHead(404, { ...securityHeaders, "Content-Type": "text/plain; charset=utf-8" });
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
    async ({ matchTitle, password, replacementTitle }) => {
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
          protocol: 1,
          requestId: "1",
          sessionEpoch: "0",
          operation: "unlock",
          input: { password },
        });
        const vaultId = unlocked.result.metadata.vaults[0].id;
        const listed = await call({
          protocol: 1,
          requestId: "2",
          sessionEpoch: "1",
          operation: "list-item-summaries",
          input: { vaultId, limit: 24 },
        });
        const summary = listed.result.items.find((item) => item.title === matchTitle);
        if (summary === undefined) throw new Error("target summary missing");
        const read = await call({
          protocol: 1,
          requestId: "3",
          sessionEpoch: "1",
          operation: "get-item",
          input: { vaultId, itemId: summary.id },
        });
        const base = read.result.item;
        if (base === null) throw new Error("target item missing");
        const updated = await call({
          protocol: 1,
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
          protocol: 1,
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
    { matchTitle, password, replacementTitle },
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
    Object.defineProperty(globalThis, "Worker", { configurable: true, value: CapturingWorker });
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

  const password = "synthetic production password";
  await page.getByRole("button", { name: "Create a local vault" }).click();
  await page.locator("#new-password").fill(password);
  await page.locator("#new-password-again").fill(password);
  await page.getByRole("button", { name: "Continue" }).click();
  const recoveryKit = await page.getByRole("status", { name: "Recovery kit" }).textContent();
  assert.equal(typeof recoveryKit, "string");
  assert(recoveryKit.startsWith("ntrk1"));
  await page.locator("#recovery-confirmation").fill(recoveryKit);
  await page.getByRole("button", { name: "Confirm and create vault" }).click();
  await page.getByRole("heading", { name: "Your vault" }).waitFor();

  const originalTitle = "Production CRUD fixture";
  const username = "production-crud-username";
  const tag = "production-crud-tag";
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
  await activateWithKeyboard(page, createForm.getByRole("button", { name: "Generate password" }));
  await page.waitForFunction(() => document.querySelector("#item-password")?.value.length === 20);
  const generatedPassword = await createForm.getByLabel("Password").inputValue();
  assert.equal(generatedPassword.length, 20);
  assert.match(generatedPassword, /^[A-Za-z0-9!@#$%^&*()\-_=+[\]{};:,.?]+$/);
  sentinels.push(generatedPassword);
  assertNoSentinels(await originPersistenceDump(page), sentinels, "pre-save origin persistence");
  await activateWithKeyboard(page, createForm.getByRole("button", { name: "Create item" }));
  await page.getByRole("heading", { name: originalTitle }).waitFor();
  await page.getByText(/Revision 1 · key version 1/).waitFor();
  assertNoSentinels(await rawDatabaseDump(page), sentinels, "post-save encrypted IndexedDB");

  await activateWithKeyboard(page, page.getByRole("button", { name: "Edit item" }));
  const staleUpdateForm = page.getByRole("form", { name: "Edit item" });
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
  await activateWithKeyboard(page, staleUpdateForm.getByRole("button", { name: "Cancel editing" }));

  await activateWithKeyboard(page, page.getByRole("button", { name: new RegExp(originalTitle) }));
  await page.getByRole("heading", { name: externalWinnerOne }).waitFor();
  await activateWithKeyboard(page, page.getByRole("button", { name: "Edit item" }));
  await activateWithKeyboard(page, page.getByRole("button", { name: "Delete item" }));
  const deleteGroup = page.getByRole("group", { name: "Delete this item?" });
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

  assertNoSentinels(await rawDatabaseDump(page), sentinels, "live IndexedDB");

  await activateWithKeyboard(page, page.getByRole("button", { name: "Edit item" }));
  await activateWithKeyboard(page, page.getByRole("button", { name: "Delete item" }));
  await activateWithKeyboard(page, page.getByRole("button", { name: "Cancel deletion" }));
  await activateWithKeyboard(page, page.getByRole("button", { name: "Delete item" }));
  await activateWithKeyboard(page, page.getByRole("button", { name: "Confirm delete" }));
  await page.getByText("No items on this page.").waitFor();
  await page.getByRole("heading", { name: "Choose an item to decrypt it" }).waitFor();
  assertNoSentinels(await rawDatabaseDump(page), sentinels, "deleted IndexedDB");
  assertNoSentinels(await runtimeSurfaceDump(page), sentinels, "post-delete runtime");

  await activateWithKeyboard(page, page.getByRole("button", { name: "Create item" }));
  const cancelledForm = page.getByRole("form", { name: "Create item" });
  await activateWithKeyboard(
    page,
    cancelledForm.getByRole("button", { name: "Generate password" }),
  );
  await page.waitForFunction(() => document.querySelector("#item-password")?.value.length === 20);
  const cancelledGeneratedPassword = await cancelledForm.getByLabel("Password").inputValue();
  assert.equal(cancelledGeneratedPassword.length, 20);
  sentinels.push(cancelledGeneratedPassword);
  await activateWithKeyboard(page, cancelledForm.getByRole("button", { name: "Cancel editing" }));
  assertNoSentinels(await rawDatabaseDump(page), sentinels, "cancelled-generation IndexedDB");
  assertNoSentinels(await runtimeSurfaceDump(page), sentinels, "cancelled-generation runtime");

  await activateWithKeyboard(page, page.getByRole("button", { name: "Create item" }));
  const lockForm = page.getByRole("form", { name: "Create item" });
  await activateWithKeyboard(page, lockForm.getByRole("button", { name: "Generate password" }));
  await page.waitForFunction(() => document.querySelector("#item-password")?.value.length === 20);
  const lockedGeneratedPassword = await lockForm.getByLabel("Password").inputValue();
  assert.equal(lockedGeneratedPassword.length, 20);
  sentinels.push(lockedGeneratedPassword);
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
  await page.getByText("No items on this page.").waitFor();
  const freshWorker = page.workers()[0];
  assert(freshWorker !== undefined, "fresh unlock worker is absent");
  assert.notEqual(freshWorker, activeWorkerBeforeLock);

  const totpTitle = "Production TOTP fixture";
  const totpSeed = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  await activateWithKeyboard(page, page.getByRole("button", { name: "Create item" }));
  const totpForm = page.getByRole("form", { name: "Create item" });
  await totpForm.getByLabel("Type").selectOption("totp");
  await totpForm.getByLabel("Title").fill(totpTitle);
  await totpForm.getByLabel("Base32 secret").fill(totpSeed);
  await totpForm.getByLabel("Digits").selectOption("8");
  await activateWithKeyboard(page, totpForm.getByRole("button", { name: "Create item" }));
  await page.getByRole("heading", { name: totpTitle }).waitFor();
  const totpOutput = page.locator(".totp-code output");
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
  assertNoSentinels(await rawDatabaseDump(page), sentinels, "TOTP encrypted IndexedDB");
  assertNoSentinels(await originPersistenceDump(page), sentinels, "TOTP origin persistence");
  await page.setViewportSize({ width: 320, height: 640 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= globalThis.innerWidth),
    true,
  );
  await page.setViewportSize({ width: 1280, height: 720 });

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
      { headers, hex: body.toString("hex"), text: body.toString("utf8"), url: response.url() },
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
    Object.defineProperty(globalThis, "Worker", { configurable: true, value: UnsupportedWorker });
  });
  const unsupported = await unsupportedContext.newPage();
  await unsupported.goto(origin);
  await unsupported.getByRole("heading", { name: "Neutron cannot open safely here" }).waitFor();
  assert.equal(await unsupported.locator('input[type="password"]').count(), 0);
  await unsupportedContext.close();

  const mobileContext = await browser.newContext({ viewport: { width: 320, height: 640 } });
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
  await mobileContext.close();

  process.stdout.write("Production CSP Chromium flow passed.\n");
} finally {
  await browser.close();
  await closeServer(server);
}
