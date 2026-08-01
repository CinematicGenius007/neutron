import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applicationModuleClass,
  assertApplicationSourceInventory,
  isWindowModuleAllowed,
  isWorkerModuleAllowed,
} from "../vite.config.js";

const sourceRoot = "/workspace/apps/web/src/";
const packageRoot = "/workspace/packages/";
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url)).replaceAll("\\", "/");
const currentSourceFiles = [
  "app.tsx",
  "browser-support.ts",
  "index.ts",
  "indexeddb-repository.ts",
  "item-editor.tsx",
  "local-vault.ts",
  "main.tsx",
  "passphrase-generator.ts",
  "passphrase-wordlist.ts",
  "password-generator.ts",
  "styles.css",
  "totp.ts",
  "vault-worker-client.ts",
  "vault-worker-entry.ts",
  "vault-worker-protocol.ts",
  "vault-worker-runtime.ts",
  "vite-env.d.ts",
];

describe("closed bundle-boundary classification", () => {
  it("classifies every current application source path exactly", () => {
    expect(() => assertApplicationSourceInventory(currentSourceFiles)).not.toThrow();
    expect(applicationModuleClass(`${sourceRoot}app.tsx`)).toBe("window");
    expect(applicationModuleClass(`${sourceRoot}local-vault.ts`)).toBe("worker");
    expect(applicationModuleClass(`${sourceRoot}vault-worker-protocol.ts`)).toBe("shared");
    expect(applicationModuleClass(`${sourceRoot}index.ts`)).toBe("non-bundle");
  });

  it("fails closed when a sensitive module is renamed, moved, split, or omitted", () => {
    for (const unknown of ["vault-core.ts", "worker/local-vault.ts", "local-vault-session.ts"])
      expect(() => assertApplicationSourceInventory([...currentSourceFiles, unknown])).toThrow(
        /classification is incomplete/,
      );
    expect(() =>
      assertApplicationSourceInventory(
        currentSourceFiles.filter((path) => path !== "local-vault.ts"),
      ),
    ).toThrow(/classification is incomplete/);
    expect(isWindowModuleAllowed(`${sourceRoot}vault-core.ts`)).toBe(false);
    expect(isWorkerModuleAllowed(`${sourceRoot}worker/local-vault.ts`)).toBe(false);
    expect(isWindowModuleAllowed(`${repositoryRoot}apps/web/vault-core.ts`)).toBe(false);
    expect(isWorkerModuleAllowed(`${repositoryRoot}shared/vault-core.ts`)).toBe(false);
  });

  it("allows only the declared application side and shared modules", () => {
    expect(isWindowModuleAllowed(`${sourceRoot}app.tsx`)).toBe(true);
    expect(isWindowModuleAllowed(`${repositoryRoot}apps/web/index.html`)).toBe(true);
    expect(isWindowModuleAllowed(`${sourceRoot}vault-worker-protocol.ts`)).toBe(true);
    expect(isWindowModuleAllowed(`${sourceRoot}local-vault.ts`)).toBe(false);
    expect(isWindowModuleAllowed(`${sourceRoot}index.ts`)).toBe(false);

    expect(isWorkerModuleAllowed(`${sourceRoot}local-vault.ts`)).toBe(true);
    expect(isWorkerModuleAllowed(`${sourceRoot}vault-worker-protocol.ts`)).toBe(true);
    expect(isWorkerModuleAllowed(`${sourceRoot}app.tsx`)).toBe(false);
    expect(isWorkerModuleAllowed(`${sourceRoot}index.ts`)).toBe(false);
  });

  it("keeps the worker URL exception exact", () => {
    const entry = `${sourceRoot}vault-worker-entry.ts`;
    expect(isWindowModuleAllowed(`${entry}?worker&url`)).toBe(true);
    expect(isWindowModuleAllowed(`${entry}?worker`)).toBe(false);
    expect(isWindowModuleAllowed(`${entry}?worker&url&extra`)).toBe(false);
    expect(isWindowModuleAllowed(`${sourceRoot}vault-core.ts?worker&url`)).toBe(false);
  });

  it("closes workspace package access by build", () => {
    expect(isWindowModuleAllowed(`${packageRoot}vault-domain/src/items.ts`)).toBe(true);
    expect(isWindowModuleAllowed(`${packageRoot}vault-domain/dist/items.js`)).toBe(true);
    expect(isWindowModuleAllowed(`${packageRoot}vault-domain/src/encrypted-records.ts`)).toBe(
      false,
    );
    expect(isWindowModuleAllowed(`${packageRoot}crypto/src/index.ts`)).toBe(false);

    expect(isWorkerModuleAllowed(`${packageRoot}crypto/src/index.ts`)).toBe(true);
    expect(isWorkerModuleAllowed(`${packageRoot}protocol/src/envelope.ts`)).toBe(true);
    expect(isWorkerModuleAllowed(`${packageRoot}vault-domain/src/encrypted-records.ts`)).toBe(true);
    expect(isWorkerModuleAllowed(`${packageRoot}import-export/src/index.ts`)).toBe(false);
  });

  it("continues to reject window frameworks from the worker", () => {
    expect(isWorkerModuleAllowed("/workspace/node_modules/react/index.js")).toBe(false);
    expect(isWorkerModuleAllowed("/workspace/node_modules/react-dom/client.js")).toBe(false);
    expect(isWorkerModuleAllowed("/workspace/node_modules/libsodium-wrappers-sumo/dist.js")).toBe(
      true,
    );
  });
});
