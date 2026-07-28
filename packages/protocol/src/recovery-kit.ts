import { decodeBech32m, encodeBech32m } from "./bech32m.js";

export class RecoveryKitFailure extends Error {
  readonly code = "invalid-recovery-kit" as const;

  constructor() {
    super("invalid-recovery-kit");
    this.name = "RecoveryKitFailure";
  }
}

export interface RecoveryKitV1 {
  readonly accountId: Uint8Array;
  readonly recoverySecret: Uint8Array;
  readonly version: 1;
}

const hrp = "ntrk";
const encodedLength = 90;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const intrinsicBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, "buffer")?.get as (
  this: Uint8Array,
) => ArrayBufferLike;
const intrinsicByteLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteLength")
  ?.get as (this: Uint8Array) => number;
const intrinsicByteOffset = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteOffset")
  ?.get as (this: Uint8Array) => number;

function fail(): never {
  throw new RecoveryKitFailure();
}

function ownedBytes(value: unknown, length: number): Uint8Array {
  try {
    if (
      typeof value !== "object" ||
      value === null ||
      Object.getPrototypeOf(value) !== Uint8Array.prototype
    )
      fail();
    const bytes = value as Uint8Array;
    const buffer = intrinsicBuffer.call(bytes);
    const byteLength = intrinsicByteLength.call(bytes);
    const byteOffset = intrinsicByteOffset.call(bytes);
    if (
      (typeof SharedArrayBuffer !== "undefined" && buffer instanceof SharedArrayBuffer) ||
      byteLength !== length
    )
      fail();
    return new Uint8Array(new Uint8Array(buffer, byteOffset, byteLength));
  } catch {
    fail();
  }
}

function allZero(value: Uint8Array): boolean {
  let aggregate = 0;
  for (const byte of value) aggregate |= byte;
  return aggregate === 0;
}

export function encodeRecoveryKitV1(accountIdInput: unknown, recoverySecretInput: unknown): string {
  const accountId = ownedBytes(accountIdInput, 16);
  const recoverySecret = ownedBytes(recoverySecretInput, 32);
  if (allZero(accountId)) fail();
  const payload = new Uint8Array(49);
  payload[0] = 1;
  payload.set(accountId, 1);
  payload.set(recoverySecret, 17);
  return encodeBech32m(hrp, payload);
}

export function decodeRecoveryKitV1(value: unknown): RecoveryKitV1 {
  if (typeof value !== "string" || value.length !== encodedLength || !/^[a-z0-9]+$/.test(value))
    fail();
  try {
    const decoded = decodeBech32m(value);
    if (decoded.hrp !== hrp || decoded.bytes.length !== 49 || decoded.bytes[0] !== 1) fail();
    const accountId = decoded.bytes.slice(1, 17);
    if (allZero(accountId)) fail();
    return Object.freeze({
      accountId,
      recoverySecret: decoded.bytes.slice(17),
      version: 1 as const,
    });
  } catch {
    fail();
  }
}
