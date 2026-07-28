import assert from "node:assert/strict";
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
  const requested = new Set();
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("requestfailed", (request) => errors.push(`request: ${request.url()}`));
  page.on("request", (request) => {
    const url = new URL(request.url());
    assert.equal(url.origin, origin, `cross-origin request: ${url.href}`);
    assert(allowedPaths.has(url.pathname), `unexpected production request: ${url.pathname}`);
    requested.add(url.pathname);
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
  assert(recoveryKit?.startsWith("ntrk1"));
  await page.locator("#recovery-confirmation").fill(recoveryKit);
  await page.getByRole("button", { name: "Confirm and create vault" }).click();
  await page.getByRole("heading", { name: "Your vault" }).waitFor();

  const seeded = await page.evaluate(
    async ({ password }) => {
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
        const created = await call({
          protocol: 1,
          requestId: "2",
          sessionEpoch: "1",
          operation: "create-item",
          input: {
            vaultId,
            item: {
              schemaVersion: 1,
              type: "login",
              title: "Production fixture",
              tags: [],
              username: "fixture@example.invalid",
              password: "production-point-secret",
            },
          },
        });
        await call({
          protocol: 1,
          requestId: "3",
          sessionEpoch: "1",
          operation: "lock",
          input: {},
        });
        return { id: created.result.revision.id, vaultId };
      } finally {
        worker.terminate();
      }
    },
    { password },
  );
  assert.match(seeded.id, /^[0-9a-f]{32}$/);

  await page.getByRole("button", { name: "Lock now" }).click();
  await page.getByRole("heading", { name: "Welcome back" }).waitFor();
  assert.equal((await page.locator("body").textContent()).includes(recoveryKit), false);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#unlock-password").fill(password);
  await page.getByRole("button", { name: "Unlock vault" }).click();
  await page.getByRole("button", { name: /Production fixture/ }).click();
  await page.getByText("production-point-secret").waitFor();
  await page.getByRole("button", { name: "Lock now" }).click();
  await page.getByRole("heading", { name: "Welcome back" }).waitFor();
  assert.equal(
    (await page.locator("body").textContent()).includes("production-point-secret"),
    false,
  );
  await waitForNoWorkers(page);

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
