import assert from "node:assert/strict";
import { lstat, readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const applicationRoot = fileURLToPath(new URL("../", import.meta.url));
const outputRoot = join(applicationRoot, "dist");

async function filesBelow(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    const status = await lstat(absolute);
    assert.equal(status.isSymbolicLink(), false, `build output contains symlink: ${absolute}`);
    if (status.isDirectory()) output.push(...(await filesBelow(absolute)));
    else if (status.isFile()) output.push(relative(outputRoot, absolute).split(sep).join("/"));
    else assert.fail(`unsupported build output entry: ${absolute}`);
  }
  return output;
}

function localPath(value, source) {
  assert.match(value, /^\/[A-Za-z0-9_./-]+$/, `${source} contains a nonlocal resource URL`);
  assert.equal(value.includes(".."), false, `${source} contains traversal`);
  assert.equal(value.includes("?"), false, `${source} contains a query`);
  assert.equal(value.includes("#"), false, `${source} contains a fragment`);
  return value.slice(1);
}

export async function verifyBuild() {
  const files = (await filesBelow(outputRoot)).sort();
  assert(files.length >= 7, "build output is unexpectedly incomplete");
  for (const file of files) {
    assert.equal(file.endsWith(".map"), false, `source map emitted: ${file}`);
    assert.match(
      file,
      /^(?:index\.html|icon\.svg|manifest\.webmanifest|\.vite\/manifest\.json|assets\/[A-Za-z0-9_-]+\.(?:js|css))$/,
      `unexpected build artifact: ${file}`,
    );
  }

  const html = await readFile(join(outputRoot, "index.html"), "utf8");
  assert.doesNotMatch(html, /<style\b/i, "inline style block emitted");
  assert.doesNotMatch(html, /\sstyle\s*=/i, "inline style attribute emitted");
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, "inline event handler emitted");
  assert.doesNotMatch(html, /<base\b/i, "base element emitted");
  const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)];
  assert.equal(scripts.length, 1, "expected exactly one external window entry script");
  assert.match(scripts[0]?.[1] ?? "", /\bsrc="\/[^"]+\.js"/, "entry script is inline");

  const resourcePaths = new Set();
  for (const match of html.matchAll(/\b(?:src|href)="([^"]+)"/gi))
    resourcePaths.add(localPath(match[1], "index.html"));

  const manifest = JSON.parse(await readFile(join(outputRoot, "manifest.webmanifest"), "utf8"));
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.display, "standalone");
  assert(Array.isArray(manifest.icons) && manifest.icons.length > 0, "manifest has no icon");
  for (const icon of manifest.icons) resourcePaths.add(localPath(icon.src, "manifest.webmanifest"));

  const cssFiles = files.filter((file) => file.endsWith(".css"));
  for (const file of cssFiles) {
    const css = await readFile(join(outputRoot, file), "utf8");
    assert.doesNotMatch(css, /@import\b/i, `${file} contains CSS import`);
    for (const match of css.matchAll(/url\((?:"|')?([^"')]+)(?:"|')?\)/gi))
      resourcePaths.add(localPath(match[1], file));
  }

  for (const resource of resourcePaths)
    assert(files.includes(resource), `referenced resource is absent: ${resource}`);

  const viteManifest = JSON.parse(await readFile(join(outputRoot, ".vite/manifest.json"), "utf8"));
  const entry = viteManifest["index.html"];
  assert.equal(entry?.isEntry, true, "Vite manifest has no window entry");
  assert(files.includes(entry.file), "Vite entry file is absent");
  for (const css of entry.css ?? []) assert(files.includes(css), `Vite CSS is absent: ${css}`);

  const workerFiles = files.filter((file) =>
    /^assets\/vault-worker-entry-[A-Za-z0-9_-]{8}\.js$/.test(file),
  );
  assert.equal(workerFiles.length, 1, "expected exactly one hashed vault worker");
  const windowJavaScript = await readFile(join(outputRoot, entry.file), "utf8");
  assert(
    windowJavaScript.includes(`/${workerFiles[0]}`),
    "window entry does not bind emitted worker",
  );
  assert.doesNotMatch(
    windowJavaScript,
    /["'`](?:blob|data):/i,
    "window entry contains a literal blob/data URL",
  );

  for (const file of files.filter((candidate) => candidate.endsWith(".js"))) {
    const source = await readFile(join(outputRoot, file), "utf8");
    assert.doesNotMatch(source, /sourceMappingURL=/, `source map reference emitted: ${file}`);
  }
  return Object.freeze({ files: Object.freeze(files), workerFile: workerFiles[0] });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await verifyBuild();
  process.stdout.write(`Verified ${result.files.length} production files.\n`);
}
