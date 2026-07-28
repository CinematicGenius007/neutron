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
} from "./encrypted-records.js";

type PreparedMutation =
  | Readonly<{ type: "put"; record: EncryptedRecord }>
  | Readonly<{ type: "delete"; identity: EncryptedRecordIdentity }>;

function strictMutation(candidate: unknown): PreparedMutation {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate))
    throw new EncryptedRecordFailure("invalid-record");
  const value = candidate as Record<string, unknown>;
  const keys = Reflect.ownKeys(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    keys.some(
      (key) =>
        typeof key !== "string" ||
        descriptors[key]?.enumerable !== true ||
        descriptors[key]?.get !== undefined ||
        descriptors[key]?.set !== undefined,
    )
  )
    throw new EncryptedRecordFailure("invalid-record");
  if (value.type === "put" && keys.length === 2 && keys.includes("envelope"))
    return { record: createEncryptedRecord(value.envelope), type: "put" };
  if (value.type === "delete" && keys.length === 2 && keys.includes("identity"))
    return { identity: parseEncryptedRecordIdentity(value.identity), type: "delete" };
  throw new EncryptedRecordFailure("invalid-record");
}

export function prepareEncryptedRecordMutations(
  mutations: readonly EncryptedRecordMutation[],
): readonly PreparedMutation[] {
  if (!Array.isArray(mutations) || Object.getPrototypeOf(mutations) !== Array.prototype)
    throw new EncryptedRecordFailure("invalid-record");
  const descriptors = Object.getOwnPropertyDescriptors(mutations);
  const prepared: PreparedMutation[] = [];
  const identities: EncryptedRecordIdentity[] = [];
  for (let index = 0; index < mutations.length; index += 1) {
    const descriptor = descriptors[index.toString()];
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    )
      throw new EncryptedRecordFailure("invalid-record");
    const mutation = strictMutation(mutations[index]);
    prepared.push(mutation);
    identities.push(mutation.type === "put" ? mutation.record.identity : mutation.identity);
  }
  if (
    Reflect.ownKeys(mutations).some(
      (key) =>
        key !== "length" &&
        (typeof key !== "string" ||
          !/^(?:0|[1-9][0-9]*)$/.test(key) ||
          Number(key) >= mutations.length),
    )
  )
    throw new EncryptedRecordFailure("invalid-record");
  if (new Set(identities).size !== identities.length) throw new EncryptedRecordFailure("conflict");
  return prepared;
}

export function prepareEncryptedRecords(
  envelopes: readonly Uint8Array[],
): readonly EncryptedRecord[] {
  if (!Array.isArray(envelopes) || Object.getPrototypeOf(envelopes) !== Array.prototype)
    throw new EncryptedRecordFailure("invalid-record");
  const descriptors = Object.getOwnPropertyDescriptors(envelopes);
  const records: EncryptedRecord[] = [];
  for (let index = 0; index < envelopes.length; index += 1) {
    const descriptor = descriptors[index.toString()];
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    )
      throw new EncryptedRecordFailure("invalid-record");
    records.push(createEncryptedRecord(envelopes[index]));
  }
  if (
    records.length < 1 ||
    Reflect.ownKeys(envelopes).some(
      (key) =>
        key !== "length" &&
        (typeof key !== "string" ||
          !/^(?:0|[1-9][0-9]*)$/.test(key) ||
          Number(key) >= envelopes.length),
    )
  )
    throw new EncryptedRecordFailure("invalid-record");
  const identities = records.map((record) => record.identity);
  if (new Set(identities).size !== identities.length) throw new EncryptedRecordFailure("conflict");
  return records;
}

export class MemoryEncryptedRecordRepository implements EncryptedRecordRepository {
  readonly #records = new Map<EncryptedRecordIdentity, EncryptedRecord>();
  #closed = false;

  #assertOpen(): void {
    if (this.#closed) throw new EncryptedRecordFailure("conflict");
  }

  async applyBatch(mutations: readonly EncryptedRecordMutation[]): Promise<void> {
    this.#assertOpen();
    const prepared = prepareEncryptedRecordMutations(mutations);
    const next = new Map(this.#records);
    for (const mutation of prepared) {
      if (mutation.type === "put")
        next.set(mutation.record.identity, cloneEncryptedRecord(mutation.record));
      else next.delete(mutation.identity);
    }
    this.#records.clear();
    for (const [identity, record] of next) this.#records.set(identity, record);
  }

  close(): void {
    this.#closed = true;
    this.#records.clear();
  }

  async delete(identity: EncryptedRecordIdentity): Promise<boolean> {
    this.#assertOpen();
    return this.#records.delete(parseEncryptedRecordIdentity(identity));
  }

  async get(identity: EncryptedRecordIdentity): Promise<EncryptedRecordRead | undefined> {
    this.#assertOpen();
    const record = this.#records.get(parseEncryptedRecordIdentity(identity));
    return record === undefined
      ? undefined
      : { record: cloneEncryptedRecord(record), status: "valid" };
  }

  async initializeIfEmpty(envelopes: readonly Uint8Array[]): Promise<readonly EncryptedRecord[]> {
    this.#assertOpen();
    const records = prepareEncryptedRecords(envelopes);
    if (this.#records.size !== 0) throw new EncryptedRecordFailure("conflict");
    for (const record of records) this.#records.set(record.identity, cloneEncryptedRecord(record));
    return records.map(cloneEncryptedRecord);
  }

  async list(): Promise<readonly EncryptedRecordRead[]> {
    this.#assertOpen();
    return Array.from(this.#records.values(), (record) => ({
      record: cloneEncryptedRecord(record),
      status: "valid" as const,
    })).sort((left, right) => left.record.identity.localeCompare(right.record.identity));
  }

  async put(envelope: Uint8Array): Promise<EncryptedRecord> {
    this.#assertOpen();
    const record = createEncryptedRecord(envelope);
    this.#records.set(record.identity, cloneEncryptedRecord(record));
    return cloneEncryptedRecord(record);
  }
}
