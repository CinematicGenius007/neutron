import {
  cloneEncryptedRecord,
  createEncryptedRecord,
  type EncryptedRecord,
  EncryptedRecordFailure,
  type EncryptedRecordIdentity,
  type EncryptedRecordMutation,
  type EncryptedRecordRead,
  type EncryptedRecordRepository,
  parseEncryptedRecordIdentity,
  prepareEncryptedRecordMutations,
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
      !keys.includes("storageVersion") ||
      !keys.includes("envelope") ||
      keys.some(
        (entry) =>
          typeof entry !== "string" ||
          descriptors[entry]?.enumerable !== true ||
          descriptors[entry]?.get !== undefined ||
          descriptors[entry]?.set !== undefined,
      )
    )
      throw new EncryptedRecordFailure("corrupt-record");
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
        output.push(readStoredValue(cursor.value as unknown, cursor.key));
        cursor.continue();
      };
    });
    await done;
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
