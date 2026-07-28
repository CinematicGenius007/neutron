import { parseUnauthenticatedEnvelopeHeader } from "@neutron/protocol";

export type EncryptedRecordFailureCode =
  | "conflict"
  | "corrupt-record"
  | "invalid-identity"
  | "invalid-record"
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
  close(): void;
  delete(identity: EncryptedRecordIdentity): Promise<boolean>;
  get(identity: EncryptedRecordIdentity): Promise<EncryptedRecordRead | undefined>;
  initializeIfEmpty(envelopes: readonly Uint8Array[]): Promise<readonly EncryptedRecord[]>;
  list(): Promise<readonly EncryptedRecordRead[]>;
  put(envelope: Uint8Array): Promise<EncryptedRecord>;
}

const identityPattern = /^v1:[0-9a-f]{2}:[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]{8}:[0-9a-f]{16}$/;

function hex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function copyBytes(value: Uint8Array): Uint8Array {
  return new Uint8Array(value);
}

export function parseEncryptedRecordIdentity(value: unknown): EncryptedRecordIdentity {
  if (typeof value !== "string" || !identityPattern.test(value))
    throw new EncryptedRecordFailure("invalid-identity");
  return value as EncryptedRecordIdentity;
}

export function createEncryptedRecord(envelope: unknown): EncryptedRecord {
  if (
    !(envelope instanceof Uint8Array) ||
    (typeof SharedArrayBuffer !== "undefined" && envelope.buffer instanceof SharedArrayBuffer)
  )
    throw new EncryptedRecordFailure("invalid-record");
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
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate))
    throw new EncryptedRecordFailure("invalid-record");
  const descriptors = Object.getOwnPropertyDescriptors(candidate);
  const keys = Reflect.ownKeys(candidate);
  if (
    keys.length !== 2 ||
    !keys.includes("identity") ||
    !keys.includes("envelope") ||
    keys.some(
      (key) =>
        typeof key !== "string" ||
        descriptors[key]?.enumerable !== true ||
        descriptors[key]?.get !== undefined ||
        descriptors[key]?.set !== undefined,
    )
  )
    throw new EncryptedRecordFailure("invalid-record");
  const value = candidate as { envelope?: unknown; identity?: unknown };
  const record = createEncryptedRecord(value.envelope);
  if (parseEncryptedRecordIdentity(value.identity) !== record.identity)
    throw new EncryptedRecordFailure("invalid-record");
  return record;
}
