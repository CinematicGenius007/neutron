import {
  cloneEncryptedRecord,
  createEncryptedRecord,
  type EncryptedRecord,
  EncryptedRecordFailure,
  type EncryptedRecordIdentity,
  type EncryptedRecordIdentityPrefix,
  type EncryptedRecordMutation,
  type EncryptedRecordRead,
  type EncryptedRecordRepository,
  parseEncryptedRecordIdentity,
  prepareConditionalBatch,
  prepareEncryptedRecordMutations,
  prepareEncryptedRecords,
} from "@neutron/vault-domain";

const databaseVersion = 1;
const storeName = "encrypted-records";
const productionDatabaseName = "neutron-vault-v1";

interface StoredRecordV1 {
  readonly envelope: ArrayBuffer;
  readonly storageVersion: 1;
}

function storageFailure(): EncryptedRecordFailure {
  return new EncryptedRecordFailure("storage");
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(storageFailure());
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(storageFailure());
    transaction.onerror = () => reject(storageFailure());
  });
}

function storedValue(record: EncryptedRecord): StoredRecordV1 {
  const bytes = record.envelope.slice();
  return { envelope: bytes.buffer as ArrayBuffer, storageVersion: 1 };
}

function identityMatchesAccount(identity: EncryptedRecordIdentity, accountId: string): boolean {
  for (let index = 0; index < 32; index += 1)
    if (identity[index + 6] !== accountId[index]) return false;
  return true;
}

function readStoredValue(value: unknown, key: unknown): EncryptedRecordRead {
  let identity: EncryptedRecordIdentity | undefined;
  try {
    identity = parseEncryptedRecordIdentity(key);
  } catch {
    return { status: "corrupt" };
  }
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      throw new EncryptedRecordFailure("corrupt-record");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== 2 ||
      (keys[0] !== "storageVersion" && keys[1] !== "storageVersion") ||
      (keys[0] !== "envelope" && keys[1] !== "envelope")
    )
      throw new EncryptedRecordFailure("corrupt-record");
    for (let index = 0; index < keys.length; index += 1) {
      const entry = keys[index];
      if (
        typeof entry !== "string" ||
        descriptors[entry]?.enumerable !== true ||
        descriptors[entry]?.get !== undefined ||
        descriptors[entry]?.set !== undefined
      )
        throw new EncryptedRecordFailure("corrupt-record");
    }
    const stored = value as Partial<StoredRecordV1>;
    if (stored.storageVersion !== 1 || !(stored.envelope instanceof ArrayBuffer))
      throw new EncryptedRecordFailure("corrupt-record");
    const record = createEncryptedRecord(new Uint8Array(stored.envelope.slice(0)));
    if (record.identity !== identity) throw new EncryptedRecordFailure("corrupt-record");
    return { record, status: "valid" };
  } catch {
    return { identity, status: "corrupt" };
  }
}

async function openDatabase(name: string): Promise<IDBDatabase> {
  if (typeof name !== "string" || name.length < 1 || name.length > 128) throw storageFailure();
  const request = indexedDB.open(name, databaseVersion);
  return new Promise((resolve, reject) => {
    request.onupgradeneeded = (event) => {
      if (event.oldVersion !== 0) {
        request.transaction?.abort();
        return;
      }
      request.result.createObjectStore(storeName);
    };
    request.onsuccess = () => {
      const database = request.result;
      if (
        database.version !== databaseVersion ||
        database.objectStoreNames.length !== 1 ||
        !database.objectStoreNames.contains(storeName)
      ) {
        database.close();
        reject(storageFailure());
        return;
      }
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(storageFailure());
    request.onblocked = () => reject(storageFailure());
  });
}

export class IndexedDbEncryptedRecordRepository implements EncryptedRecordRepository {
  readonly #database: IDBDatabase;
  #closed = false;

  constructor(database: IDBDatabase) {
    this.#database = database;
  }

  #assertOpen(): void {
    if (this.#closed) throw storageFailure();
  }

  async applyBatch(mutations: readonly EncryptedRecordMutation[]): Promise<void> {
    this.#assertOpen();
    const prepared = prepareEncryptedRecordMutations(mutations);
    const transaction = this.#database.transaction(storeName, "readwrite", {
      durability: "strict",
    });
    const done = transactionDone(transaction);
    const store = transaction.objectStore(storeName);
    for (const mutation of prepared) {
      if (mutation.type === "put")
        store.put(storedValue(mutation.record), mutation.record.identity);
      else store.delete(mutation.identity);
    }
    await done;
  }

  async applyConditionalBatch(
    requiredPresent: readonly EncryptedRecord[],
    requiredAbsent: readonly EncryptedRecordIdentity[],
    requiredAbsentPrefixes: readonly EncryptedRecordIdentityPrefix[],
    requiredAccountId: string | undefined,
    maximumRecordCount: number,
    mutations: readonly EncryptedRecordMutation[],
  ): Promise<void> {
    this.#assertOpen();
    const prepared = prepareConditionalBatch(
      requiredPresent,
      requiredAbsent,
      requiredAbsentPrefixes,
      requiredAccountId,
      maximumRecordCount,
      mutations,
    );
    const transaction = this.#database.transaction(storeName, "readwrite", {
      durability: "strict",
    });
    const done = transactionDone(transaction);
    const store = transaction.objectStore(storeName);
    const presentRequests: Promise<unknown>[] = [];
    const absentRequests: Promise<IDBValidKey | undefined>[] = [];
    const prefixRequests: Promise<number>[] = [];
    for (let index = 0; index < prepared.requiredPresent.length; index += 1) {
      const expected = prepared.requiredPresent[index];
      if (expected === undefined) throw storageFailure();
      presentRequests[index] = requestResult(store.get(expected.identity));
    }
    for (let index = 0; index < prepared.requiredAbsent.length; index += 1) {
      const identity = prepared.requiredAbsent[index];
      if (identity === undefined) throw storageFailure();
      absentRequests[index] = requestResult(store.getKey(identity));
    }
    for (let index = 0; index < prepared.requiredAbsentPrefixes.length; index += 1) {
      const prefix = prepared.requiredAbsentPrefixes[index];
      if (prefix === undefined) throw storageFailure();
      prefixRequests[index] = requestResult(
        store.count(IDBKeyRange.bound(prefix, `${prefix}\uffff`)),
      );
    }
    const accountKeysRequest =
      prepared.requiredAccountId === undefined
        ? undefined
        : requestResult(store.getAllKeys(undefined, prepared.maximumRecordCount + 1));
    const present: unknown[] = [];
    const absent: (IDBValidKey | undefined)[] = [];
    const prefixCounts: number[] = [];
    let accountKeys: readonly IDBValidKey[] = [];
    try {
      for (let index = 0; index < presentRequests.length; index += 1)
        present[index] = await (presentRequests[index] as Promise<unknown>);
      for (let index = 0; index < absentRequests.length; index += 1)
        absent[index] = await (absentRequests[index] as Promise<IDBValidKey | undefined>);
      for (let index = 0; index < prefixRequests.length; index += 1)
        prefixCounts[index] = await (prefixRequests[index] as Promise<number>);
      if (accountKeysRequest !== undefined) accountKeys = await accountKeysRequest;
    } catch {
      await done.catch(() => undefined);
      throw storageFailure();
    }
    let conflict = false;
    for (let index = 0; index < present.length; index += 1) {
      const value = present[index];
      const expected = prepared.requiredPresent[index];
      if (expected === undefined || value === undefined) {
        conflict = true;
        break;
      }
      const read = readStoredValue(value, expected.identity);
      if (read.status !== "valid" || read.record.envelope.length !== expected.envelope.length) {
        conflict = true;
        break;
      }
      let difference = 0;
      for (let byte = 0; byte < expected.envelope.length; byte += 1)
        difference |= (read.record.envelope[byte] as number) ^ (expected.envelope[byte] as number);
      if (difference !== 0) {
        conflict = true;
        break;
      }
    }
    for (let index = 0; !conflict && index < absent.length; index += 1)
      conflict = absent[index] !== undefined;
    for (let index = 0; !conflict && index < prefixCounts.length; index += 1)
      conflict = prefixCounts[index] !== 0;
    if (accountKeys.length > prepared.maximumRecordCount) conflict = true;
    for (let index = 0; !conflict && index < accountKeys.length; index += 1) {
      let identity: EncryptedRecordIdentity;
      try {
        identity = parseEncryptedRecordIdentity(accountKeys[index]);
      } catch {
        conflict = true;
        break;
      }
      const accountId = prepared.requiredAccountId;
      conflict = accountId === undefined || !identityMatchesAccount(identity, accountId);
    }
    if (conflict) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new EncryptedRecordFailure("conflict");
    }
    for (let index = 0; index < prepared.mutations.length; index += 1) {
      const mutation = prepared.mutations[index];
      if (mutation === undefined) throw storageFailure();
      if (mutation.type === "put")
        store.put(storedValue(mutation.record), mutation.record.identity);
      else store.delete(mutation.identity);
    }
    let finalCount: number;
    try {
      finalCount = await requestResult(store.count());
    } catch {
      await done.catch(() => undefined);
      throw storageFailure();
    }
    if (finalCount > prepared.maximumRecordCount) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new EncryptedRecordFailure("limit");
    }
    await done;
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#database.close();
  }

  async delete(identity: EncryptedRecordIdentity): Promise<boolean> {
    this.#assertOpen();
    const key = parseEncryptedRecordIdentity(identity);
    const transaction = this.#database.transaction(storeName, "readwrite", {
      durability: "strict",
    });
    const done = transactionDone(transaction);
    const store = transaction.objectStore(storeName);
    const existed = (await requestResult(store.getKey(key))) !== undefined;
    store.delete(key);
    await done;
    return existed;
  }

  async get(identity: EncryptedRecordIdentity): Promise<EncryptedRecordRead | undefined> {
    this.#assertOpen();
    const key = parseEncryptedRecordIdentity(identity);
    const transaction = this.#database.transaction(storeName, "readonly");
    const done = transactionDone(transaction);
    const value = await requestResult(transaction.objectStore(storeName).get(key));
    await done;
    return value === undefined ? undefined : readStoredValue(value, key);
  }

  async initializeIfEmpty(envelopes: readonly Uint8Array[]): Promise<readonly EncryptedRecord[]> {
    this.#assertOpen();
    const records = prepareEncryptedRecords(envelopes);
    const transaction = this.#database.transaction(storeName, "readwrite", {
      durability: "strict",
    });
    const done = transactionDone(transaction);
    const store = transaction.objectStore(storeName);
    let count: number;
    try {
      count = await requestResult(store.count());
    } catch {
      await done.catch(() => undefined);
      throw storageFailure();
    }
    if (count !== 0) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new EncryptedRecordFailure("conflict");
    }
    for (const record of records) store.add(storedValue(record), record.identity);
    await done;
    return records.map(cloneEncryptedRecord);
  }

  async list(): Promise<readonly EncryptedRecordRead[]> {
    this.#assertOpen();
    const transaction = this.#database.transaction(storeName, "readonly");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(storeName);
    const output: EncryptedRecordRead[] = [];
    await new Promise<void>((resolve, reject) => {
      const request = store.openCursor();
      request.onerror = () => reject(storageFailure());
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor === null) {
          resolve();
          return;
        }
        output[output.length] = readStoredValue(cursor.value as unknown, cursor.key);
        cursor.continue();
      };
    });
    await done;
    return output;
  }

  async listIdentities(maximum: number): Promise<readonly EncryptedRecordIdentity[]> {
    this.#assertOpen();
    if (!Number.isSafeInteger(maximum) || maximum < 0) throw new EncryptedRecordFailure("limit");
    const transaction = this.#database.transaction(storeName, "readonly");
    const done = transactionDone(transaction);
    const output: EncryptedRecordIdentity[] = [];
    try {
      await new Promise<void>((resolve, reject) => {
        const request = transaction.objectStore(storeName).openKeyCursor();
        request.onerror = () => reject(storageFailure());
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor === null || output.length > maximum) {
            resolve();
            return;
          }
          try {
            output[output.length] = parseEncryptedRecordIdentity(cursor.key);
          } catch {
            reject(new EncryptedRecordFailure("corrupt-record"));
            return;
          }
          cursor.continue();
        };
      });
    } catch (error) {
      await done.catch(() => undefined);
      throw error;
    }
    await done;
    if (output.length > maximum) throw new EncryptedRecordFailure("limit");
    return output;
  }

  async put(envelope: Uint8Array): Promise<EncryptedRecord> {
    this.#assertOpen();
    const record = createEncryptedRecord(envelope);
    const transaction = this.#database.transaction(storeName, "readwrite", {
      durability: "strict",
    });
    const done = transactionDone(transaction);
    transaction.objectStore(storeName).put(storedValue(record), record.identity);
    await done;
    return cloneEncryptedRecord(record);
  }
}

export async function openIndexedDbEncryptedRecordRepository(): Promise<IndexedDbEncryptedRecordRepository> {
  return new IndexedDbEncryptedRecordRepository(await openDatabase(productionDatabaseName));
}

export async function openIndexedDbEncryptedRecordRepositoryForTesting(
  databaseName: string,
): Promise<IndexedDbEncryptedRecordRepository> {
  return new IndexedDbEncryptedRecordRepository(await openDatabase(databaseName));
}

export const indexedDbStorageInternals = Object.freeze({ databaseVersion, storeName });
