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
  parseEncryptedRecordIdentityPrefix,
  validateEncryptedRecordCandidate,
} from "./encrypted-records.js";

type PreparedMutation =
  | Readonly<{ type: "put"; record: EncryptedRecord }>
  | Readonly<{ type: "delete"; identity: EncryptedRecordIdentity }>;

const maximumRepositoryRecords = 1_000_000;
const accountIdPattern = /^[0-9a-f]{32}$/;

function plainRecordDescriptors(candidate: unknown): Record<PropertyKey, PropertyDescriptor> {
  try {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate))
      throw new Error("record");
    const prototype = Object.getPrototypeOf(candidate) as unknown;
    if (prototype !== Object.prototype && prototype !== null) throw new Error("record prototype");
    return Object.getOwnPropertyDescriptors(candidate);
  } catch {
    throw new EncryptedRecordFailure("invalid-record");
  }
}

function exactDescriptorKeys(
  descriptors: Record<PropertyKey, PropertyDescriptor>,
  expected: readonly string[],
): boolean {
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== expected.length) return false;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof key !== "string") return false;
    let known = false;
    for (let expectedIndex = 0; expectedIndex < expected.length; expectedIndex += 1)
      if (key === expected[expectedIndex]) known = true;
    if (!known) return false;
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    )
      return false;
  }
  return true;
}

function strictMutation(candidate: unknown): PreparedMutation {
  const descriptors = plainRecordDescriptors(candidate);
  const type = descriptors.type?.value;
  if (type === "put" && exactDescriptorKeys(descriptors, ["type", "envelope"]))
    return { record: createEncryptedRecord(descriptors.envelope?.value), type: "put" };
  if (type === "delete" && exactDescriptorKeys(descriptors, ["type", "identity"]))
    return {
      identity: parseEncryptedRecordIdentity(descriptors.identity?.value),
      type: "delete",
    };
  throw new EncryptedRecordFailure("invalid-record");
}

export function prepareEncryptedRecordMutations(
  mutations: readonly EncryptedRecordMutation[],
): readonly PreparedMutation[] {
  const source = strictArrayDescriptors(mutations);
  const prepared = new Array<PreparedMutation>(source.length);
  const identities = new Array<EncryptedRecordIdentity>(source.length);
  for (let index = 0; index < source.length; index += 1) {
    const descriptor = source.descriptors[index.toString()];
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    )
      throw new EncryptedRecordFailure("invalid-record");
    const mutation = strictMutation(descriptor.value);
    prepared[index] = mutation;
    identities[index] = mutation.type === "put" ? mutation.record.identity : mutation.identity;
  }
  const uniqueIdentities = new Set<EncryptedRecordIdentity>();
  for (let index = 0; index < identities.length; index += 1) {
    const identity = identities[index] as EncryptedRecordIdentity;
    if (uniqueIdentities.has(identity)) throw new EncryptedRecordFailure("conflict");
    uniqueIdentities.add(identity);
  }
  return prepared;
}

function strictArrayDescriptors(values: readonly unknown[]): Readonly<{
  descriptors: Record<string, PropertyDescriptor | undefined>;
  length: number;
}> {
  try {
    if (!Array.isArray(values) || Object.getPrototypeOf(values) !== Array.prototype)
      throw new Error("array");
    const descriptors = Object.getOwnPropertyDescriptors(values) as unknown as Record<
      string,
      PropertyDescriptor | undefined
    >;
    const length = descriptors.length?.value as unknown;
    if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0)
      throw new Error("array length");
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[index.toString()];
      if (
        descriptor === undefined ||
        descriptor.enumerable !== true ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined
      )
        throw new Error("array descriptor");
    }
    const keys = Reflect.ownKeys(values);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (
        key !== "length" &&
        (typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(key) || Number(key) >= length)
      )
        throw new Error("array key");
    }
    return {
      descriptors,
      length,
    };
  } catch {
    throw new EncryptedRecordFailure("invalid-record");
  }
}

function strictIdentityArray(
  values: readonly EncryptedRecordIdentity[],
): EncryptedRecordIdentity[] {
  const source = strictArrayDescriptors(values);
  const output = new Array<EncryptedRecordIdentity>(source.length);
  for (let index = 0; index < source.length; index += 1)
    output[index] = parseEncryptedRecordIdentity(source.descriptors[index.toString()]?.value);
  return output;
}

function strictRecordArray(values: readonly EncryptedRecord[]): EncryptedRecord[] {
  const source = strictArrayDescriptors(values);
  const output = new Array<EncryptedRecord>(source.length);
  for (let index = 0; index < source.length; index += 1)
    output[index] = validateEncryptedRecordCandidate(source.descriptors[index.toString()]?.value);
  return output;
}

function strictPrefixArray(
  values: readonly EncryptedRecordIdentityPrefix[],
): EncryptedRecordIdentityPrefix[] {
  const source = strictArrayDescriptors(values);
  const output = new Array<EncryptedRecordIdentityPrefix>(source.length);
  for (let index = 0; index < source.length; index += 1)
    output[index] = parseEncryptedRecordIdentityPrefix(source.descriptors[index.toString()]?.value);
  return output;
}

function validateMaximum(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > maximumRepositoryRecords
  )
    throw new EncryptedRecordFailure("invalid-record");
  return value;
}

function validateAccountId(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !accountIdPattern.test(value))
    throw new EncryptedRecordFailure("invalid-record");
  return value;
}

function belongsToAccount(
  identity: EncryptedRecordIdentity | EncryptedRecordIdentityPrefix,
  accountId: string,
): boolean {
  const accountOffset = 6;
  if (identity.length < accountOffset + accountId.length + 1) return false;
  for (let index = 0; index < accountId.length; index += 1)
    if (identity[accountOffset + index] !== accountId[index]) return false;
  return identity[accountOffset + accountId.length] === ":";
}

function hasPrefix(
  identity: EncryptedRecordIdentity,
  prefix: EncryptedRecordIdentityPrefix,
): boolean {
  if (identity.length < prefix.length) return false;
  for (let index = 0; index < prefix.length; index += 1)
    if (identity[index] !== prefix[index]) return false;
  return true;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1)
    difference |= (left[index] as number) ^ (right[index] as number);
  return difference === 0;
}

export function prepareConditionalBatch(
  requiredPresent: readonly EncryptedRecord[],
  requiredAbsent: readonly EncryptedRecordIdentity[],
  requiredAbsentPrefixes: readonly EncryptedRecordIdentityPrefix[],
  requiredAccountId: string | undefined,
  maximumRecordCount: number,
  mutations: readonly EncryptedRecordMutation[],
): Readonly<{
  maximumRecordCount: number;
  mutations: readonly PreparedMutation[];
  requiredAccountId: string | undefined;
  requiredAbsent: readonly EncryptedRecordIdentity[];
  requiredAbsentPrefixes: readonly EncryptedRecordIdentityPrefix[];
  requiredPresent: readonly EncryptedRecord[];
}> {
  const present = strictRecordArray(requiredPresent);
  const absent = strictIdentityArray(requiredAbsent);
  const prefixes = strictPrefixArray(requiredAbsentPrefixes);
  const accountId = validateAccountId(requiredAccountId);
  const maximum = validateMaximum(maximumRecordCount);
  const exactConditions = new Set<EncryptedRecordIdentity>();
  for (let index = 0; index < present.length; index += 1) {
    const identity = (present[index] as EncryptedRecord).identity;
    if (exactConditions.has(identity)) throw new EncryptedRecordFailure("conflict");
    exactConditions.add(identity);
  }
  for (let index = 0; index < absent.length; index += 1) {
    const identity = absent[index] as EncryptedRecordIdentity;
    if (exactConditions.has(identity)) throw new EncryptedRecordFailure("conflict");
    exactConditions.add(identity);
  }
  const uniquePrefixes = new Set<EncryptedRecordIdentityPrefix>();
  for (let index = 0; index < prefixes.length; index += 1) {
    const prefix = prefixes[index] as EncryptedRecordIdentityPrefix;
    if (uniquePrefixes.has(prefix)) throw new EncryptedRecordFailure("conflict");
    uniquePrefixes.add(prefix);
    for (let presentIndex = 0; presentIndex < present.length; presentIndex += 1)
      if (hasPrefix((present[presentIndex] as EncryptedRecord).identity, prefix))
        throw new EncryptedRecordFailure("conflict");
    for (let absentIndex = 0; absentIndex < absent.length; absentIndex += 1)
      if (hasPrefix(absent[absentIndex] as EncryptedRecordIdentity, prefix))
        throw new EncryptedRecordFailure("conflict");
  }
  const prepared = prepareEncryptedRecordMutations(mutations);
  if (prepared.length < 1) throw new EncryptedRecordFailure("invalid-record");
  if (accountId !== undefined) {
    for (let index = 0; index < present.length; index += 1)
      if (!belongsToAccount((present[index] as EncryptedRecord).identity, accountId))
        throw new EncryptedRecordFailure("conflict");
    for (let index = 0; index < absent.length; index += 1)
      if (!belongsToAccount(absent[index] as EncryptedRecordIdentity, accountId))
        throw new EncryptedRecordFailure("conflict");
    for (let index = 0; index < prefixes.length; index += 1)
      if (!belongsToAccount(prefixes[index] as EncryptedRecordIdentityPrefix, accountId))
        throw new EncryptedRecordFailure("conflict");
    for (let index = 0; index < prepared.length; index += 1) {
      const mutation = prepared[index] as PreparedMutation;
      const identity = mutation.type === "put" ? mutation.record.identity : mutation.identity;
      if (!belongsToAccount(identity, accountId)) throw new EncryptedRecordFailure("conflict");
    }
  }
  return {
    maximumRecordCount: maximum,
    mutations: prepared,
    requiredAccountId: accountId,
    requiredAbsent: absent,
    requiredAbsentPrefixes: prefixes,
    requiredPresent: present,
  };
}

export function prepareEncryptedRecords(
  envelopes: readonly Uint8Array[],
): readonly EncryptedRecord[] {
  const source = strictArrayDescriptors(envelopes);
  const records = new Array<EncryptedRecord>(source.length);
  for (let index = 0; index < source.length; index += 1) {
    const descriptor = source.descriptors[index.toString()];
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    )
      throw new EncryptedRecordFailure("invalid-record");
    records[index] = createEncryptedRecord(descriptor.value);
  }
  if (records.length < 1) throw new EncryptedRecordFailure("invalid-record");
  const identities = new Set<EncryptedRecordIdentity>();
  for (let index = 0; index < records.length; index += 1) {
    const identity = (records[index] as EncryptedRecord).identity;
    if (identities.has(identity)) throw new EncryptedRecordFailure("conflict");
    identities.add(identity);
  }
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
    for (let index = 0; index < prepared.length; index += 1) {
      const mutation = prepared[index] as PreparedMutation;
      if (mutation.type === "put")
        next.set(mutation.record.identity, cloneEncryptedRecord(mutation.record));
      else next.delete(mutation.identity);
    }
    this.#records.clear();
    for (const [identity, record] of next) this.#records.set(identity, record);
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
    for (let index = 0; index < prepared.requiredPresent.length; index += 1) {
      const expected = prepared.requiredPresent[index] as EncryptedRecord;
      const actual = this.#records.get(expected.identity);
      if (actual === undefined || !sameBytes(actual.envelope, expected.envelope))
        throw new EncryptedRecordFailure("conflict");
    }
    for (let index = 0; index < prepared.requiredAbsent.length; index += 1)
      if (this.#records.has(prepared.requiredAbsent[index] as EncryptedRecordIdentity))
        throw new EncryptedRecordFailure("conflict");
    for (let index = 0; index < prepared.requiredAbsentPrefixes.length; index += 1) {
      const prefix = prepared.requiredAbsentPrefixes[index] as EncryptedRecordIdentityPrefix;
      for (const identity of this.#records.keys())
        if (hasPrefix(identity, prefix)) throw new EncryptedRecordFailure("conflict");
    }
    if (prepared.requiredAccountId !== undefined)
      for (const identity of this.#records.keys())
        if (!belongsToAccount(identity, prepared.requiredAccountId))
          throw new EncryptedRecordFailure("conflict");
    const next = new Map(this.#records);
    for (let index = 0; index < prepared.mutations.length; index += 1) {
      const mutation = prepared.mutations[index] as PreparedMutation;
      if (mutation.type === "put")
        next.set(mutation.record.identity, cloneEncryptedRecord(mutation.record));
      else next.delete(mutation.identity);
    }
    if (next.size > prepared.maximumRecordCount) throw new EncryptedRecordFailure("limit");
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
    const output = new Array<EncryptedRecord>(records.length);
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index] as EncryptedRecord;
      this.#records.set(record.identity, cloneEncryptedRecord(record));
      output[index] = cloneEncryptedRecord(record);
    }
    return output;
  }

  async list(): Promise<readonly EncryptedRecordRead[]> {
    this.#assertOpen();
    const output = new Array<EncryptedRecordRead>(this.#records.size);
    let outputIndex = 0;
    for (const record of this.#records.values()) {
      output[outputIndex] = { record: cloneEncryptedRecord(record), status: "valid" };
      outputIndex += 1;
    }
    for (let index = 1; index < output.length; index += 1) {
      const entry = output[index] as EncryptedRecordRead;
      let position = index;
      while (
        position > 0 &&
        (output[position - 1] as EncryptedRecordRead).status === "valid" &&
        entry.status === "valid" &&
        (output[position - 1] as { status: "valid"; record: EncryptedRecord }).record.identity >
          entry.record.identity
      ) {
        output[position] = output[position - 1] as EncryptedRecordRead;
        position -= 1;
      }
      output[position] = entry;
    }
    return output;
  }

  async listIdentities(maximum: number): Promise<readonly EncryptedRecordIdentity[]> {
    this.#assertOpen();
    const limit = validateMaximum(maximum);
    if (this.#records.size > limit) throw new EncryptedRecordFailure("limit");
    const output = new Array<EncryptedRecordIdentity>(this.#records.size);
    let outputIndex = 0;
    for (const identity of this.#records.keys()) {
      output[outputIndex] = identity;
      outputIndex += 1;
    }
    for (let index = 1; index < output.length; index += 1) {
      const identity = output[index] as EncryptedRecordIdentity;
      let position = index;
      while (position > 0 && (output[position - 1] as EncryptedRecordIdentity) > identity) {
        output[position] = output[position - 1] as EncryptedRecordIdentity;
        position -= 1;
      }
      output[position] = identity;
    }
    return output;
  }

  async put(envelope: Uint8Array): Promise<EncryptedRecord> {
    this.#assertOpen();
    const record = createEncryptedRecord(envelope);
    this.#records.set(record.identity, cloneEncryptedRecord(record));
    return cloneEncryptedRecord(record);
  }
}
