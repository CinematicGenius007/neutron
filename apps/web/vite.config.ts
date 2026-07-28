import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

function enforceWindowBoundary(): Plugin {
  const forbidden = [
    "/packages/crypto/",
    "/src/indexeddb-repository.ts",
    "/src/local-vault.ts",
    "/src/vault-worker-entry.ts",
    "/src/vault-worker-runtime.ts",
  ];
  return {
    name: "neutron-window-boundary",
    generateBundle(_options, bundle) {
      const chunks = new Map(
        Object.values(bundle)
          .filter((output) => output.type === "chunk")
          .map((chunk) => [chunk.fileName, chunk]),
      );
      const main = [...chunks.values()].find((chunk) =>
        Object.keys(chunk.modules).some((id) => id.endsWith("/src/main.tsx")),
      );
      if (main !== undefined) {
        const pending = [main.fileName];
        const reached = new Set<string>();
        while (pending.length > 0) {
          const fileName = pending.pop();
          if (fileName === undefined || reached.has(fileName)) continue;
          const chunk = chunks.get(fileName);
          if (chunk === undefined) throw new Error(`window imports missing chunk: ${fileName}`);
          reached.add(fileName);
          for (const id of Object.keys(chunk.modules)) {
            if (id.endsWith("/src/vault-worker-entry.ts?worker&url")) continue;
            if (forbidden.some((segment) => id.includes(segment)))
              throw new Error(`window bundle contains worker-only module: ${id}`);
          }
          pending.push(...chunk.imports, ...chunk.dynamicImports);
        }
        for (const fileName of chunks.keys())
          if (!reached.has(fileName))
            throw new Error(`unaccounted JavaScript chunk in window build: ${fileName}`);
      }

      const worker = [...chunks.values()].find((chunk) =>
        Object.keys(chunk.modules).some((id) => id.endsWith("/src/vault-worker-entry.ts")),
      );
      if (worker !== undefined) {
        const pending = [worker.fileName];
        const reached = new Set<string>();
        while (pending.length > 0) {
          const fileName = pending.pop();
          if (fileName === undefined || reached.has(fileName)) continue;
          const chunk = chunks.get(fileName);
          if (chunk === undefined)
            throw new Error(`vault worker imports missing chunk: ${fileName}`);
          reached.add(fileName);
          for (const id of Object.keys(chunk.modules))
            if (
              id.includes("/react/") ||
              id.includes("/react-dom/") ||
              id.endsWith("/src/app.tsx") ||
              id.endsWith("/src/main.tsx")
            )
              throw new Error(`vault worker contains window UI module: ${id}`);
          pending.push(...chunk.imports, ...chunk.dynamicImports);
        }
        for (const fileName of chunks.keys())
          if (!reached.has(fileName))
            throw new Error(`unaccounted JavaScript chunk in vault worker build: ${fileName}`);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), enforceWindowBoundary()],
  build: {
    assetsInlineLimit: 0,
    manifest: true,
    sourcemap: false,
    target: "es2022",
  },
});
