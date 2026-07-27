import { describe, expect, it } from "vitest";

import { createLibsodiumProvider } from "../../../../packages/crypto/src/index.js";
import { ENVELOPE_KIND, sealEnvelope } from "../../../../packages/protocol/src/index.js";
import { encodeVaultItem, type VaultItem } from "../../../../packages/vault-domain/src/index.js";
import {
  indexedDbStorageInternals,
  openIndexedDbEncryptedRecordRepositoryForTesting,
} from "../../src/indexeddb-repository.js";

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
});
