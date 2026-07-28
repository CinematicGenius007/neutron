import { parseUnauthenticatedEnvelopeHeader } from "@neutron/protocol";

export type EncryptedRecordFailureCode =
  | "conflict"
  | "corrupt-record"
  | "invalid-identity"
  | "invalid-record"
  | "limit"
  | "storage";

export class EncryptedRecordFailure extends Error {
  readonly code: EncryptedRecordFailureCode;

  constructor(code: EncryptedRecordFailureCode) {
    super(code);
    this.name = "EncryptedRecordFailure";
    this.code = code;
  }
}

export type EncryptedRecordIdentity = string & {
  readonly __encryptedRecordIdentity: unique symbol;
};

export type EncryptedRecordIdentityPrefix = string & {
  readonly __encryptedRecordIdentityPrefix: unique symbol;
};

export interface EncryptedRecord {
  readonly envelope: Uint8Array;
  readonly identity: EncryptedRecordIdentity;
}

export type EncryptedRecordRead =
  | Readonly<{ status: "valid"; record: EncryptedRecord }>
  | Readonly<{ status: "corrupt"; identity?: EncryptedRecordIdentity }>;

export type EncryptedRecordMutation =
  | Readonly<{ type: "put"; envelope: Uint8Array }>
  | Readonly<{ type: "delete"; identity: EncryptedRecordIdentity }>;

export interface EncryptedRecordRepository {
  applyBatch(mutations: readonly EncryptedRecordMutation[]): Promise<void>;
  applyConditionalBatch(
    requiredPresent: readonly EncryptedRecord[],
    requiredAbsent: readonly EncryptedRecordIdentity[],
    requiredAbsentPrefixes: readonly EncryptedRecordIdentityPrefix[],
    requiredAccountId: string | undefined,
    maximumRecordCount: number,
    mutations: readonly EncryptedRecordMutation[],
  ): Promise<void>;
  close(): void;
  delete(identity: EncryptedRecordIdentity): Promise<boolean>;
  get(identity: EncryptedRecordIdentity): Promise<EncryptedRecordRead | undefined>;
  initializeIfEmpty(envelopes: readonly Uint8Array[]): Promise<readonly EncryptedRecord[]>;
  listIdentities(maximum: number): Promise<readonly EncryptedRecordIdentity[]>;
  list(): Promise<readonly EncryptedRecordRead[]>;
  put(envelope: Uint8Array): Promise<EncryptedRecord>;
}

const identityPattern = /^v1:[0-9a-f]{2}:[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]{8}:[0-9a-f]{16}$/;
const identityPrefixPattern = /^v1:[0-9a-f]{2}:[0-9a-f]{32}:[0-9a-f]{32}:$/;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const intrinsicBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, "buffer")?.get as (
  this: Uint8Array,
) => ArrayBufferLike;
const intrinsicByteLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteLength")
  ?.get as (this: Uint8Array) => number;
const intrinsicByteOffset = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteOffset")
  ?.get as (this: Uint8Array) => number;

function hex(value: Uint8Array): string {
  let output = "";
  const length = intrinsicByteLength.call(value);
  for (let index = 0; index < length; index += 1)
    output += (value[index] as number).toString(16).padStart(2, "0");
  return output;
}

function copyBytes(value: unknown): Uint8Array {
  try {
    if (!(value instanceof Uint8Array)) throw new Error("bytes");
    const bytes = value as Uint8Array;
    const buffer = intrinsicBuffer.call(bytes);
    const byteLength = intrinsicByteLength.call(bytes);
    const byteOffset = intrinsicByteOffset.call(bytes);
    if (typeof SharedArrayBuffer !== "undefined" && buffer instanceof SharedArrayBuffer)
      throw new Error("shared bytes");
    return new Uint8Array(new Uint8Array(buffer, byteOffset, byteLength));
  } catch {
    throw new EncryptedRecordFailure("invalid-record");
  }
}

function strictRecordDescriptors(candidate: unknown): Readonly<{
  envelope: PropertyDescriptor;
  identity: PropertyDescriptor;
}> {
  try {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate))
      throw new Error("record");
    const prototype = Object.getPrototypeOf(candidate) as unknown;
    if (prototype !== Object.prototype && prototype !== null) throw new Error("record prototype");
    const descriptors = Object.getOwnPropertyDescriptors(candidate);
    const keys = Reflect.ownKeys(candidate);
    if (
      keys.length !== 2 ||
      keys[0] === undefined ||
      keys[1] === undefined ||
      !(Object.hasOwn(descriptors, "identity") && Object.hasOwn(descriptors, "envelope"))
    )
      throw new Error("record shape");
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (typeof key !== "string") throw new Error("record key");
      const descriptor = descriptors[key];
      if (
        descriptor === undefined ||
        descriptor.enumerable !== true ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined ||
        !(key === "identity" || key === "envelope")
      )
        throw new Error("record descriptor");
    }
    return {
      envelope: descriptors.envelope as PropertyDescriptor,
      identity: descriptors.identity as PropertyDescriptor,
    };
  } catch (error) {
    if (error instanceof EncryptedRecordFailure) throw error;
    throw new EncryptedRecordFailure("invalid-record");
  }
}

export function parseEncryptedRecordIdentity(value: unknown): EncryptedRecordIdentity {
  if (typeof value !== "string" || !identityPattern.test(value))
    throw new EncryptedRecordFailure("invalid-identity");
  return value as EncryptedRecordIdentity;
}

export function parseEncryptedRecordIdentityPrefix(value: unknown): EncryptedRecordIdentityPrefix {
  if (typeof value !== "string" || !identityPrefixPattern.test(value))
    throw new EncryptedRecordFailure("invalid-identity");
  return value as EncryptedRecordIdentityPrefix;
}

export function createEncryptedRecord(envelope: unknown): EncryptedRecord {
  const owned = copyBytes(envelope);
  let header: ReturnType<typeof parseUnauthenticatedEnvelopeHeader>;
  try {
    header = parseUnauthenticatedEnvelopeHeader(owned);
  } catch {
    throw new EncryptedRecordFailure("invalid-record");
  }
  const identity = parseEncryptedRecordIdentity(
    `v1:${header.kind.toString(16).padStart(2, "0")}:${hex(header.accountId)}:${hex(header.objectId)}:${header.keyVersion.toString(16).padStart(8, "0")}:${header.generation.toString(16).padStart(16, "0")}`,
  );
  return { envelope: owned, identity };
}

export function cloneEncryptedRecord(record: EncryptedRecord): EncryptedRecord {
  return {
    envelope: copyBytes(record.envelope),
    identity: parseEncryptedRecordIdentity(record.identity),
  };
}

export function validateEncryptedRecordCandidate(candidate: unknown): EncryptedRecord {
  const descriptors = strictRecordDescriptors(candidate);
  const record = createEncryptedRecord(descriptors.envelope.value);
  if (parseEncryptedRecordIdentity(descriptors.identity.value) !== record.identity)
    throw new EncryptedRecordFailure("invalid-record");
  return record;
}
