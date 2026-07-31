import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const workerOnlyModules = [
  "/packages/crypto/",
  "/src/indexeddb-repository.ts",
  "/src/local-vault.ts",
  "/src/vault-worker-entry.ts",
  "/src/vault-worker-runtime.ts",
];

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
    if (entry === undefined) throw new Error(`${label} entry chunk is absent`);
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
      (id) => id.endsWith("/src/main.tsx"),
      (id) => workerOnlyModules.some((segment) => id.includes(segment)),
      // The window references the worker script by URL; it does not import it.
      (id) => id.endsWith("/src/vault-worker-entry.ts?worker&url"),
    ),
  };
}

function enforceVaultWorkerBoundary(): Plugin {
  return {
    name: "neutron-vault-worker-boundary",
    generateBundle: enforceModuleBoundary(
      "vault worker build",
      (id) => id.endsWith("/src/vault-worker-entry.ts"),
      (id) =>
        id.includes("/react/") ||
        id.includes("/react-dom/") ||
        id.endsWith("/src/app.tsx") ||
        id.endsWith("/src/main.tsx"),
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
