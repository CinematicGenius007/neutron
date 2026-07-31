import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const workerOnlyPackages = ["/packages/crypto/"];
const workerOnlyFiles = [
  "indexeddb-repository.ts",
  "local-vault.ts",
  "vault-worker-entry.ts",
  "vault-worker-runtime.ts",
];
const windowOnlyFiles = ["app.tsx", "main.tsx"];
const windowOnlyPackages = ["/react/", "/react-dom/"];

/**
 * Matches a module by file name anywhere in the tree rather than by its current
 * directory. Matching `/src/local-vault.ts` as a substring would stop matching
 * the moment someone moved that file one directory deeper, which is the same
 * silent-non-enforcement failure this plugin already had once (Task 0025).
 */
function hasFileName(id: string, fileNames: readonly string[]): boolean {
  const path = id.split("?")[0] ?? id;
  return fileNames.includes(path.slice(path.lastIndexOf("/") + 1));
}

type GenerateBundle = NonNullable<Plugin["generateBundle"]>;

/**
 * Walks one build's chunk graph from its entry and rejects forbidden modules.
 *
 * The check fails closed when it cannot find the entry it is supposed to walk.
 * The previous implementation skipped silently instead, which is why the vault
 * worker half of this boundary never ran: Vite bundles a `?worker&url` import
 * in its own build and emits the result into the parent as an asset, so the
 * parent's chunk lookup always missed (Task 0025).
 */
function enforceModuleBoundary(
  label: string,
  isEntryModule: (id: string) => boolean,
  isForbiddenModule: (id: string) => boolean,
  isIgnoredModule: (id: string) => boolean = () => false,
): GenerateBundle {
  return function generateBundle(_options, bundle) {
    const chunks = new Map(
      Object.values(bundle)
        .filter((output) => output.type === "chunk")
        .map((chunk) => [chunk.fileName, chunk]),
    );
    const entry = [...chunks.values()].find((chunk) =>
      Object.keys(chunk.modules).some(isEntryModule),
    );
    // Fail closed. This also fires for a build that legitimately has a
    // different entry — a second worker, say — because the check cannot tell
    // that apart from its own entry having moved. Adding another worker
    // therefore requires keying this on the build's own input first.
    if (entry === undefined)
      throw new Error(`${label} entry chunk is absent, so its boundary could not be checked`);
    const pending = [entry.fileName];
    const reached = new Set<string>();
    while (pending.length > 0) {
      const fileName = pending.pop();
      if (fileName === undefined || reached.has(fileName)) continue;
      const chunk = chunks.get(fileName);
      if (chunk === undefined) throw new Error(`${label} imports missing chunk: ${fileName}`);
      reached.add(fileName);
      for (const id of Object.keys(chunk.modules)) {
        if (isIgnoredModule(id)) continue;
        if (isForbiddenModule(id)) throw new Error(`${label} contains forbidden module: ${id}`);
      }
      pending.push(...chunk.imports, ...chunk.dynamicImports);
    }
    for (const fileName of chunks.keys())
      if (!reached.has(fileName))
        throw new Error(`unaccounted JavaScript chunk in ${label}: ${fileName}`);
  };
}

function enforceWindowBoundary(): Plugin {
  return {
    name: "neutron-window-boundary",
    generateBundle: enforceModuleBoundary(
      "window build",
      (id) => hasFileName(id, ["main.tsx"]),
      (id) =>
        workerOnlyPackages.some((segment) => id.includes(segment)) ||
        hasFileName(id, workerOnlyFiles),
      // The window references the worker script by URL; it does not import it.
      // Checked before the rule above, whose file-name match would otherwise
      // reject this reference. Matched by name for the same reason as the rest:
      // a directory-anchored predicate here would turn the window's own
      // legitimate reference into a forbidden module the moment the worker moved.
      (id) => hasFileName(id, ["vault-worker-entry.ts"]) && id.endsWith("?worker&url"),
    ),
  };
}

function enforceVaultWorkerBoundary(): Plugin {
  return {
    name: "neutron-vault-worker-boundary",
    generateBundle: enforceModuleBoundary(
      "vault worker build",
      (id) => hasFileName(id, ["vault-worker-entry.ts"]) && !id.includes("?"),
      (id) =>
        windowOnlyPackages.some((segment) => id.includes(segment)) ||
        hasFileName(id, windowOnlyFiles),
    ),
  };
}

export default defineConfig({
  plugins: [react(), enforceWindowBoundary()],
  // Plugins declared above do not apply to worker builds; the vault worker
  // boundary must be registered here or it never executes.
  worker: { plugins: () => [enforceVaultWorkerBoundary()] },
  build: {
    assetsInlineLimit: 0,
    manifest: true,
    sourcemap: false,
    target: "es2022",
  },
});
