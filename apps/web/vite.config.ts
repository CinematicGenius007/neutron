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
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        const moduleIds = Object.keys(output.modules);
        if (!moduleIds.some((id) => id.endsWith("/src/main.tsx"))) continue;
        for (const id of moduleIds) {
          if (id.endsWith("/src/vault-worker-entry.ts?worker&url")) continue;
          if (forbidden.some((segment) => id.includes(segment)))
            throw new Error(`window bundle contains worker-only module: ${id}`);
        }
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
