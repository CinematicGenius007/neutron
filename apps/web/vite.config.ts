import { readdirSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

export type ApplicationModuleClass = "non-bundle" | "shared" | "window" | "worker";

const applicationSourceRoot = fileURLToPath(new URL("./src/", import.meta.url));
const repositoryRoot = normalizedPath(resolve(applicationSourceRoot, "../../.."));
const normalizedApplicationSourceRoot = normalizedPath(resolve(applicationSourceRoot));
const packagesRoot = `${repositoryRoot}/packages`;
const workerUrlModuleId = `${normalizedApplicationSourceRoot}/vault-worker-entry.ts?worker&url`;
const applicationModules = Object.freeze({
  "app.tsx": "window",
  "browser-support.ts": "window",
  "index.ts": "non-bundle",
  "indexeddb-repository.ts": "worker",
  "item-editor.tsx": "window",
  "local-vault.ts": "worker",
  "main.tsx": "window",
  "passphrase-generator.ts": "shared",
  "passphrase-wordlist.ts": "shared",
  "password-generator.ts": "shared",
  "styles.css": "window",
  "totp.ts": "shared",
  "vault-worker-client.ts": "window",
  "vault-worker-entry.ts": "worker",
  "vault-worker-protocol.ts": "shared",
  "vault-worker-runtime.ts": "worker",
  "vite-env.d.ts": "non-bundle",
} satisfies Readonly<Record<string, ApplicationModuleClass>>);

const windowOnlyPackages = ["/react/", "/react-dom/"];
const windowRepositoryModules = new Set(["apps/web/index.html"]);
const windowWorkspaceModules = new Set(["vault-domain/dist/items.js", "vault-domain/src/items.ts"]);
const workerWorkspacePackages = new Set(["crypto", "protocol", "vault-domain"]);

function normalizedPath(value: string): string {
  return value.replaceAll("\\", "/");
}

function pathWithoutQuery(id: string): string {
  return normalizedPath(id.split("?")[0] ?? id);
}

function applicationSourcePath(id: string): string | undefined {
  const path = pathWithoutQuery(id);
  const prefix = `${normalizedApplicationSourceRoot}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : undefined;
}

function workspaceSourcePath(id: string): string | undefined {
  const path = pathWithoutQuery(id);
  const prefix = `${packagesRoot}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : undefined;
}

function repositoryPath(id: string): string | undefined {
  const path = pathWithoutQuery(id);
  const prefix = `${repositoryRoot}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : undefined;
}

export function applicationModuleClass(id: string): ApplicationModuleClass | undefined {
  const sourcePath = applicationSourcePath(id);
  return sourcePath === undefined
    ? undefined
    : applicationModules[sourcePath as keyof typeof applicationModules];
}

export function isWindowModuleAllowed(id: string): boolean {
  const sourcePath = applicationSourcePath(id);
  if (normalizedPath(id) === workerUrlModuleId) return true;
  if (sourcePath !== undefined) {
    const moduleClass = applicationModuleClass(id);
    return moduleClass === "window" || moduleClass === "shared";
  }
  const workspacePath = workspaceSourcePath(id);
  if (workspacePath !== undefined) return windowWorkspaceModules.has(workspacePath);
  const localPath = repositoryPath(id);
  return (
    localPath === undefined ||
    localPath.startsWith("node_modules/") ||
    windowRepositoryModules.has(localPath)
  );
}

export function isWorkerModuleAllowed(id: string): boolean {
  const sourcePath = applicationSourcePath(id);
  if (sourcePath !== undefined) {
    const moduleClass = applicationModuleClass(id);
    return moduleClass === "worker" || moduleClass === "shared";
  }
  const workspacePath = workspaceSourcePath(id);
  if (workspacePath !== undefined)
    return workerWorkspacePackages.has(workspacePath.split("/")[0] ?? "");
  const localPath = repositoryPath(id);
  if (localPath !== undefined && !localPath.startsWith("node_modules/")) return false;
  return !windowOnlyPackages.some((segment) => pathWithoutQuery(id).includes(segment));
}

function sourceFilesBelow(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFilesBelow(absolute));
    else if (entry.isFile()) {
      if (/\.(?:[cm]?[jt]sx?|css|json)$/.test(entry.name))
        files.push(relative(applicationSourceRoot, absolute).split(sep).join("/"));
    } else throw new Error(`unsupported apps/web/src entry: ${absolute}`);
  }
  return files;
}

export function assertApplicationSourceInventory(sourceFiles: readonly string[]): void {
  const declared = Object.keys(applicationModules).sort();
  const actual = [...sourceFiles].sort();
  if (JSON.stringify(actual) !== JSON.stringify(declared))
    throw new Error(
      `apps/web/src classification is incomplete: expected ${declared.join(", ")}; found ${actual.join(", ")}`,
    );
}

assertApplicationSourceInventory(sourceFilesBelow(applicationSourceRoot));

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
      (id) => applicationSourcePath(id) === "main.tsx" && !id.includes("?"),
      (id) => !isWindowModuleAllowed(id),
    ),
  };
}

function enforceVaultWorkerBoundary(): Plugin {
  return {
    name: "neutron-vault-worker-boundary",
    generateBundle: enforceModuleBoundary(
      "vault worker build",
      (id) => applicationSourcePath(id) === "vault-worker-entry.ts" && !id.includes("?"),
      (id) => !isWorkerModuleAllowed(id),
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
