import type { VaultItem } from "@neutron/vault-domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_PASSPHRASE_GENERATOR_OPTIONS } from "../../src/passphrase-generator.js";
import { DEFAULT_PASSWORD_GENERATOR_OPTIONS } from "../../src/password-generator.js";
import { createVaultWorkerClient, type VaultWorkerClient } from "../../src/vault-worker-client.js";

const databaseName = "neutron-vault-v1";
const password = "synthetic browser worker password";
const sentinels = [
  "browser-worker-login-password",
  "browser-worker-note-body",
  "JBSWY3DPEHPK3PXP",
  "browser-worker-backup-code",
  "browser-worker-json-value",
] as const;

const items: readonly VaultItem[] = [
  {
    schemaVersion: 1,
    type: "login",
    title: "Worker login",
    tags: [],
    username: "browser@example.invalid",
    password: sentinels[0],
  },
  { schemaVersion: 1, type: "secure-note", title: "Worker note", tags: [], body: sentinels[1] },
  {
    schemaVersion: 1,
    type: "totp",
    title: "Worker TOTP",
    tags: [],
    secretBase32: sentinels[2],
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  },
  {
    schemaVersion: 1,
    type: "backup-code",
    title: "Worker backup",
    tags: [],
    codes: [sentinels[3]],
  },
  {
    schemaVersion: 1,
    type: "json",
    title: "Worker JSON",
    tags: [],
    value: { sentinel: sentinels[4] },
  },
];

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("IndexedDB deletion failed"));
    request.onblocked = () => reject(new Error("IndexedDB deletion blocked"));
  });
}

function client(): VaultWorkerClient {
  return createVaultWorkerClient();
}

async function rawDatabaseText(): Promise<string> {
  const request = indexedDB.open(databaseName, 1);
  const rows = await new Promise<unknown[]>((resolve, reject) => {
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("encrypted-records", "readonly");
      const all = transaction.objectStore("encrypted-records").getAll();
      all.onsuccess = () => {
        database.close();
        resolve(all.result);
      };
      all.onerror = () => reject(all.error ?? new Error("IndexedDB read failed"));
    };
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
  return JSON.stringify(rows);
}

describe("production vault module worker", () => {
  beforeEach(async () => {
    await deleteDatabase();
  });

  afterEach(async () => {
    await deleteDatabase();
  });

  it("owns enrollment, all item operations, reload unlock, and lock", async () => {
    let stage = "create client";
    try {
      const first = client();
      stage = "begin enrollment";
      const kit = await first.beginEnrollment(password);
      stage = "confirm enrollment";
      const metadata = await first.confirmEnrollment(kit);
      const vaultId = metadata.vaults[0]?.id as string;
      stage = "generate password";
      const generated = await first.generatePassword(DEFAULT_PASSWORD_GENERATOR_OPTIONS);
      expect(generated).toHaveLength(20);
      expect(await rawDatabaseText()).not.toContain(generated);
      stage = "generate passphrase";
      const generatedPassphrase = await first.generatePassphrase(
        DEFAULT_PASSPHRASE_GENERATOR_OPTIONS,
      );
      expect(generatedPassphrase).toMatch(/^(?:[a-z-]+\.){7}[a-z-]+$/);
      expect(await rawDatabaseText()).not.toContain(generatedPassphrase);
      const generatedItems = [
        { ...(items[0] as VaultItem & { type: "login" }), password: generated },
        ...items.slice(1),
      ] as const;
      const revisions = [];
      stage = "create items";
      for (let index = 0; index < generatedItems.length; index += 1) {
        stage = `create item ${index}`;
        const item = generatedItems[index];
        if (item !== undefined) revisions[index] = await first.createItem(vaultId, item);
      }
      stage = "compute TOTP";
      const totpRevision = revisions[2];
      expect(totpRevision).toBeDefined();
      const totpCode = await first.computeTotp(vaultId, {
        ...(totpRevision as { generation: string; id: string; keyVersion: number }),
        item: generatedItems[2] as VaultItem,
      });
      expect(totpCode).toMatchObject({ algorithm: "SHA1", digits: 6, period: 30 });
      expect(totpCode.code).toMatch(/^[0-9]{6}$/);
      expect(await rawDatabaseText()).not.toContain(totpCode.code);
      stage = "list summaries";
      const summaries = await first.listItemSummaries(vaultId, 10);
      expect(summaries.items).toHaveLength(5);
      for (const sentinel of sentinels) expect(JSON.stringify(summaries)).not.toContain(sentinel);
      const firstRevision = revisions[0];
      expect(firstRevision).toBeDefined();
      stage = "point read";
      expect((await first.getItem(vaultId, firstRevision?.id as string))?.item).toEqual(
        generatedItems[0],
      );
      stage = "first lock";
      await first.lock();
      expect(first.isClosed).toBe(true);
      await expect(first.state()).rejects.toMatchObject({ code: "closed" });

      stage = "fresh unlock";
      const second = client();
      await expect(second.unlock("wrong synthetic password")).rejects.toMatchObject({
        code: "unlock-failed",
      });
      const unlocked = await second.unlock(password);
      expect(unlocked.accountId).toBe(metadata.accountId);
      const updated = await second.updateItem(
        vaultId,
        firstRevision?.id as string,
        firstRevision?.generation as string,
        firstRevision?.keyVersion as number,
        { ...(items[0] as VaultItem & { type: "login" }), title: "Updated worker login" },
      );
      expect(updated.generation).toBe("2");
      await second.deleteItem(vaultId, updated.id, updated.generation, updated.keyVersion);
      expect(await second.getItem(vaultId, updated.id)).toBeUndefined();
      await second.lock();
      expect(second.isClosed).toBe(true);
      await expect(second.getItem(vaultId, updated.id)).rejects.toMatchObject({ code: "closed" });

      const raw = await rawDatabaseText();
      expect(raw).not.toContain(generated);
      expect(raw).not.toContain(totpCode.code);
      expect(raw).not.toContain(password);
      expect(raw).not.toContain(kit);
      for (const sentinel of sentinels) expect(raw).not.toContain(sentinel);
    } catch (error) {
      throw new Error(`vault worker browser stage failed: ${stage}`, { cause: error });
    }
  });
});
