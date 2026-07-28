import { type CryptoProvider, createLibsodiumProvider } from "@neutron/crypto";
import { decodeRecoveryKitV1, ENVELOPE_KIND, sealEnvelope } from "@neutron/protocol";
import {
  createEncryptedRecord,
  encodeVaultItem,
  parseEncryptedRecordIdentityPrefix,
  type VaultItem,
} from "@neutron/vault-domain";
import { describe, expect, it } from "vitest";
import {
  indexedDbStorageInternals,
  openIndexedDbEncryptedRecordRepositoryForTesting,
} from "../../src/indexeddb-repository.js";
import { beginOfflineEnrollment, unlockOfflineVault } from "../../src/local-vault.js";

const sentinels = [
  "Primary login",
  "alice@example.invalid",
  "synthetic-password-sentinel",
  "https://vault-fixture.invalid/login",
  "synthetic secure note sentinel",
  "JBSWY3DPEHPK3PXP",
  "fixture-code-0001",
  "fixture-json-sentinel",
  "personal",
  "login",
  "secure-note",
  "totp",
  "backup-code",
  "json",
  "秘密-न्यूट्रॉन-🔐",
];

const items: readonly VaultItem[] = [
  {
    schemaVersion: 1,
    type: "login",
    title: sentinels[0] as string,
    tags: [sentinels[8] as string],
    username: sentinels[1] as string,
    password: sentinels[2] as string,
    url: sentinels[3] as string,
  },
  {
    schemaVersion: 1,
    type: "secure-note",
    title: "Synthetic note",
    tags: [],
    body: `${sentinels[4]} ${sentinels[14]}`,
  },
  {
    schemaVersion: 1,
    type: "totp",
    title: "Synthetic OTP",
    tags: [],
    secretBase32: sentinels[5] as string,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  },
  {
    schemaVersion: 1,
    type: "backup-code",
    title: "Synthetic codes",
    tags: [],
    codes: [sentinels[6] as string],
  },
  {
    schemaVersion: 1,
    type: "json",
    title: "Synthetic JSON",
    tags: [],
    value: { marker: sentinels[7] as string },
  },
];

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

async function rawRows(
  databaseName: string,
): Promise<readonly { key: IDBValidKey; value: unknown }[]> {
  const database = await requestResult(indexedDB.open(databaseName, 1));
  const transaction = database.transaction(indexedDbStorageInternals.storeName, "readonly");
  const store = transaction.objectStore(indexedDbStorageInternals.storeName);
  const [keys, values] = await Promise.all([
    requestResult(store.getAllKeys()),
    requestResult(store.getAll()),
  ]);
  database.close();
  return keys.map((key, index) => ({ key, value: values[index] }));
}

function collectBytes(value: unknown, strings: string[], bytes: Uint8Array[]): void {
  if (typeof value === "string") {
    strings.push(value);
    return;
  }
  if (value instanceof ArrayBuffer) {
    bytes.push(new Uint8Array(value));
    return;
  }
  if (ArrayBuffer.isView(value)) {
    bytes.push(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === "string") strings.push(key);
      collectBytes((value as Record<PropertyKey, unknown>)[key], strings, bytes);
    }
  }
}

function contains(haystack: Uint8Array, needle: Uint8Array): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  outer: for (let offset = 0; offset <= haystack.length - needle.length; offset += 1) {
    for (let index = 0; index < needle.length; index += 1) {
      if (haystack[offset + index] !== needle[index]) continue outer;
    }
    return true;
  }
  return false;
}

function utf16(value: string, littleEndian: boolean): Uint8Array {
  const output = new Uint8Array(value.length * 2);
  const view = new DataView(output.buffer);
  for (let index = 0; index < value.length; index += 1)
    view.setUint16(index * 2, value.charCodeAt(index), littleEndian);
  return output;
}

async function deleteDatabase(name: string): Promise<void> {
  await requestResult(indexedDB.deleteDatabase(name));
}

describe("encrypted IndexedDB repository", () => {
  it("enforces exact, prefix, prototype-hostile, and atomic-count conditions", async () => {
    const databaseName = `neutron-cas-${crypto.randomUUID()}`;
    const provider = await createLibsodiumProvider();
    const accountId = Uint8Array.from({ length: 16 }, (_, index) => index + 1);
    const parentKey = Uint8Array.from({ length: 32 }, (_, index) => index + 33);
    const envelope = (objectOffset: number, generation: bigint) =>
      sealEnvelope(provider, {
        accountId,
        content: { plaintext: Uint8Array.of(objectOffset), type: "payload" },
        generation,
        keySource: { parentKey, source: "parent" },
        keyVersion: 1,
        kind: ENVELOPE_KIND.ITEM_PAYLOAD,
        objectId: Uint8Array.from({ length: 16 }, (_, index) => objectOffset + index),
      });
    const first = createEncryptedRecord(envelope(1, 1n));
    const overwritten = createEncryptedRecord(envelope(1, 1n));
    const second = createEncryptedRecord(envelope(33, 1n));
    const third = createEncryptedRecord(envelope(65, 1n));
    const repository = await openIndexedDbEncryptedRecordRepositoryForTesting(databaseName);
    await repository.put(first.envelope);
    await repository.put(overwritten.envelope);

    const originalSome = Array.prototype.some;
    const originalMap = Array.prototype.map;
    const originalPush = Array.prototype.push;
    let staleFailure: unknown;
    try {
      Array.prototype.some = () => false;
      Array.prototype.map = () => {
        throw new Error("inherited map invoked");
      };
      Array.prototype.push = function (...values: unknown[]): number {
        if (values[0] instanceof Promise) return this.length;
        return Reflect.apply(originalPush, this, values) as number;
      };
      try {
        await repository.applyConditionalBatch([first], [], [], undefined, 10, [
          { identity: first.identity, type: "delete" },
        ]);
      } catch (error) {
        staleFailure = error;
      }
    } finally {
      Array.prototype.some = originalSome;
      Array.prototype.map = originalMap;
      Array.prototype.push = originalPush;
    }
    expect(staleFailure).toMatchObject({ code: "conflict" });
    expect(await repository.get(first.identity)).toMatchObject({ status: "valid" });

    const foreign = createEncryptedRecord(
      sealEnvelope(provider, {
        accountId: Uint8Array.from({ length: 16 }, (_, index) => index + 101),
        content: { plaintext: Uint8Array.of(99), type: "payload" },
        generation: 1n,
        keySource: { parentKey, source: "parent" },
        keyVersion: 1,
        kind: ENVELOPE_KIND.ITEM_PAYLOAD,
        objectId: Uint8Array.from({ length: 16 }, (_, index) => index + 81),
      }),
    );
    await repository.put(foreign.envelope);
    await expect(
      repository.applyConditionalBatch(
        [],
        [second.identity],
        [],
        first.identity.split(":")[2],
        10,
        [{ envelope: second.envelope, type: "put" }],
      ),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(await repository.get(second.identity)).toBeUndefined();
    await repository.delete(foreign.identity);

    const prefix = parseEncryptedRecordIdentityPrefix(
      `v1:10:${first.identity.split(":")[2]}:${first.identity.split(":")[3]}:`,
    );
    await expect(
      repository.applyConditionalBatch([], [], [prefix], undefined, 10, [
        { envelope: second.envelope, type: "put" },
      ]),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(await repository.get(second.identity)).toBeUndefined();

    const other = await openIndexedDbEncryptedRecordRepositoryForTesting(databaseName);
    const outcomes = await Promise.allSettled([
      repository.applyConditionalBatch([], [second.identity], [], undefined, 2, [
        { envelope: second.envelope, type: "put" },
      ]),
      other.applyConditionalBatch([], [third.identity], [], undefined, 2, [
        { envelope: third.envelope, type: "put" },
      ]),
    ]);
    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect(await repository.listIdentities(2)).toHaveLength(2);
    repository.close();
    other.close();
    await deleteDatabase(databaseName);
  }, 30_000);

  it("persists only envelopes, survives reopen, and isolates corruption", async () => {
    const databaseName = `neutron-test-${crypto.randomUUID()}`;
    const provider = await createLibsodiumProvider();
    const accountId = Uint8Array.from({ length: 16 }, (_, index) => index + 1);
    const itemKey = Uint8Array.from({ length: 32 }, (_, index) => index + 33);
    const envelopes = items.map((item, index) =>
      sealEnvelope(provider, {
        accountId,
        content: { plaintext: encodeVaultItem(item), type: "payload" },
        generation: 1n,
        keySource: { parentKey: itemKey, source: "parent" },
        keyVersion: 1,
        kind: ENVELOPE_KIND.ITEM_PAYLOAD,
        objectId: Uint8Array.from({ length: 16 }, (_, byte) => index * 16 + byte + 17),
      }),
    );
    const originalEnvelopes = envelopes.map((envelope) => envelope.slice());

    let repository = await openIndexedDbEncryptedRecordRepositoryForTesting(databaseName);
    const records = [];
    for (const envelope of envelopes) records.push(await repository.put(envelope));
    envelopes[0]?.fill(0);
    records[0]?.envelope.fill(0);
    await expect(
      repository.put({ title: "plaintext", envelope: envelopes[0] } as never),
    ).rejects.toBeDefined();
    repository.close();

    repository = await openIndexedDbEncryptedRecordRepositoryForTesting(databaseName);
    const reopened = await repository.list();
    expect(reopened.filter(({ status }) => status === "valid")).toHaveLength(items.length);
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      if (record === undefined) throw new Error("missing record");
      const read = await repository.get(record.identity);
      expect(read?.status === "valid" ? read.record.envelope : undefined).toEqual(
        originalEnvelopes[index],
      );
    }
    const second = records[1];
    if (second === undefined) throw new Error("missing second record");
    await expect(
      repository.applyBatch([
        { envelope: originalEnvelopes[1] as Uint8Array, type: "put" },
        { identity: second.identity, type: "delete" },
      ]),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(await repository.list()).toHaveLength(items.length);
    repository.close();

    const raw = await rawRows(databaseName);
    const strings: string[] = [];
    const bytes: Uint8Array[] = [];
    collectBytes(raw, strings, bytes);
    for (const sentinel of sentinels) {
      expect(
        strings.some((value) => value.includes(sentinel)),
        sentinel,
      ).toBe(false);
      const encodings = [
        new TextEncoder().encode(sentinel),
        utf16(sentinel, true),
        utf16(sentinel, false),
      ];
      expect(
        bytes.some((value) => encodings.some((encoding) => contains(value, encoding))),
        sentinel,
      ).toBe(false);
    }

    const rawDatabase = await requestResult(indexedDB.open(databaseName, 1));
    const transaction = rawDatabase.transaction(indexedDbStorageInternals.storeName, "readwrite");
    transaction
      .objectStore(indexedDbStorageInternals.storeName)
      .put(
        { envelope: "synthetic secure note sentinel", storageVersion: 1, title: "plaintext" },
        records[0]?.identity,
      );
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("transaction failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("transaction aborted"));
    });
    rawDatabase.close();

    repository = await openIndexedDbEncryptedRecordRepositoryForTesting(databaseName);
    const withCorruption = await repository.list();
    expect(withCorruption.filter(({ status }) => status === "corrupt")).toHaveLength(1);
    expect(withCorruption.filter(({ status }) => status === "valid")).toHaveLength(
      items.length - 1,
    );
    repository.close();
    await deleteDatabase(databaseName);
  }, 30_000);

  it("allows exactly one complete concurrent initialization", async () => {
    const databaseName = `neutron-init-${crypto.randomUUID()}`;
    const provider = await createLibsodiumProvider();
    const itemKey = Uint8Array.from({ length: 32 }, (_, index) => index + 51);
    const makeSet = (accountOffset: number) => {
      const accountId = Uint8Array.from({ length: 16 }, (_, index) => accountOffset + index + 1);
      return [0, 1].map((index) =>
        sealEnvelope(provider, {
          accountId,
          content: { plaintext: encodeVaultItem(items[index]), type: "payload" },
          generation: 1n,
          keySource: { parentKey: itemKey, source: "parent" },
          keyVersion: 1,
          kind: ENVELOPE_KIND.ITEM_PAYLOAD,
          objectId: Uint8Array.from(
            { length: 16 },
            (_, byte) => accountOffset + 64 + index * 16 + byte,
          ),
        }),
      );
    };
    const firstSet = makeSet(1);
    const secondSet = makeSet(101);
    const first = await openIndexedDbEncryptedRecordRepositoryForTesting(databaseName);
    const second = await openIndexedDbEncryptedRecordRepositoryForTesting(databaseName);
    const outcomes = await Promise.allSettled([
      first.initializeIfEmpty(firstSet),
      second.initializeIfEmpty(secondSet),
    ]);
    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const stored = await first.list();
    expect(stored).toHaveLength(2);
    const storedAccounts = new Set(
      stored.map((entry) =>
        entry.status === "valid" ? entry.record.identity.split(":")[2] : "corrupt",
      ),
    );
    expect(storedAccounts.size).toBe(1);
    expect(storedAccounts.has("corrupt")).toBe(false);
    first.close();
    second.close();
    await deleteDatabase(databaseName);
  }, 30_000);

  it("enrolls, reloads, unlocks, locks, and persists no enrollment secrets", async () => {
    const databaseName = `neutron-enrollment-${crypto.randomUUID()}`;
    const baseProvider = await createLibsodiumProvider();
    const randomOutputs: Uint8Array[] = [];
    const provider: CryptoProvider = {
      name: baseProvider.name,
      sodiumVersion: baseProvider.sodiumVersion,
      clear: (value) => baseProvider.clear(value),
      decryptXChaCha20Poly1305: (input) => baseProvider.decryptXChaCha20Poly1305(input),
      deriveArgon2idKey: (password, salt) => baseProvider.deriveArgon2idKey(password, salt),
      deriveHkdfSha256: (input) => baseProvider.deriveHkdfSha256(input),
      encryptXChaCha20Poly1305: (input) => baseProvider.encryptXChaCha20Poly1305(input),
      randomBytes: (length) => {
        const value = baseProvider.randomBytes(length);
        randomOutputs.push(value.slice());
        return value;
      },
    };
    const password = "browser-only synthetic password 秘密";
    let repository = await openIndexedDbEncryptedRecordRepositoryForTesting(databaseName);
    const pending = await beginOfflineEnrollment(provider, repository, password);
    const kit = pending.recoveryKit;
    const parsedKit = decodeRecoveryKitV1(kit);
    expect(await repository.list()).toEqual([]);
    const session = await pending.confirm(kit);
    expect(await repository.list()).toHaveLength(3);
    session.lock();
    repository.close();

    repository = await openIndexedDbEncryptedRecordRepositoryForTesting(databaseName);
    await expect(unlockOfflineVault(provider, repository, `${password}!`)).rejects.toMatchObject({
      code: "unlock-failed",
    });
    const unlocked = await unlockOfflineVault(provider, repository, password);
    expect(unlocked.isLocked).toBe(false);
    const vaultId = unlocked.metadata.vaults[0]?.id;
    if (vaultId === undefined) throw new Error("missing vault");
    const created = [];
    for (const item of items) created.push(await unlocked.createItem(vaultId, item));
    expect((await unlocked.listItems(vaultId)).items).toHaveLength(5);

    const secondRepository = await openIndexedDbEncryptedRecordRepositoryForTesting(databaseName);
    const secondSession = await unlockOfflineVault(provider, secondRepository, password);
    const target = created[0];
    if (target === undefined) throw new Error("missing item");
    const race = await Promise.allSettled([
      unlocked.updateItem(vaultId, target.id, 1n, 1, {
        ...items[0],
        title: "First race title",
      }),
      secondSession.updateItem(vaultId, target.id, 1n, 1, {
        ...items[0],
        title: "Second race title",
      }),
    ]);
    expect(race.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(race.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const deleted = created[1];
    if (deleted === undefined) throw new Error("missing item");
    await unlocked.deleteItem(vaultId, deleted.id, 1n, 1);

    const corruptTarget = created[2];
    if (corruptTarget === undefined) throw new Error("missing item");
    const payload = (await repository.list()).find(
      (read) =>
        read.status === "valid" &&
        read.record.identity.split(":")[1] === "10" &&
        read.record.identity.split(":")[3] === corruptTarget.id,
    );
    if (payload?.status !== "valid") throw new Error("missing payload");
    const tampered = payload.record.envelope.slice();
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] as number) ^ 1;
    await repository.put(tampered);
    const isolated = await unlocked.listItems(vaultId);
    expect(isolated.items).toHaveLength(3);
    expect(isolated.issues).toEqual([{ code: "corrupt-item", id: corruptTarget.id }]);

    const raw = await rawRows(databaseName);
    const strings: string[] = [];
    const bytes: Uint8Array[] = [];
    collectBytes(raw, strings, bytes);
    expect(strings.some((value) => value.includes(password) || value.includes(kit))).toBe(false);
    const enrollmentSecrets = [
      new TextEncoder().encode(password),
      parsedKit.recoverySecret,
      ...randomOutputs.filter(({ length }) => length === 32).slice(0, 3),
    ];
    for (const secret of enrollmentSecrets)
      expect(bytes.some((value) => contains(value, secret))).toBe(false);
    for (const plaintext of [
      ...sentinels,
      "Synthetic note",
      "Synthetic OTP",
      "Synthetic codes",
      "Synthetic JSON",
      "First race title",
      "Second race title",
    ]) {
      expect(strings.some((value) => value.includes(plaintext))).toBe(false);
      const encodings = [
        new TextEncoder().encode(plaintext),
        utf16(plaintext, true),
        utf16(plaintext, false),
      ];
      expect(bytes.some((value) => encodings.some((encoding) => contains(value, encoding)))).toBe(
        false,
      );
    }
    parsedKit.accountId.fill(0);
    parsedKit.recoverySecret.fill(0);
    unlocked.lock();
    secondSession.lock();
    expect(unlocked.isLocked).toBe(true);
    repository.close();
    secondRepository.close();
    const finalRepository = await openIndexedDbEncryptedRecordRepositoryForTesting(databaseName);
    const finalSession = await unlockOfflineVault(provider, finalRepository, password);
    const afterReload = await finalSession.listItems(vaultId);
    expect(afterReload.items).toHaveLength(3);
    expect(afterReload.issues).toEqual([{ code: "corrupt-item", id: corruptTarget.id }]);
    finalSession.lock();
    finalRepository.close();
    await deleteDatabase(databaseName);
  }, 30_000);
});
