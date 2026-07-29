import type { VaultItem } from "@neutron/vault-domain/items";

export type TotpItem = Extract<VaultItem, { type: "totp" }>;
export type TotpAlgorithm = TotpItem["algorithm"];

export interface TotpComputation {
  readonly algorithm: TotpAlgorithm;
  readonly code: string;
  readonly digits: 6 | 8;
  readonly expiresAtUnixSeconds: string;
  readonly period: number;
  readonly validFromUnixSeconds: string;
}

export class TotpFailure extends Error {
  constructor() {
    super("TOTP computation failed");
    this.name = "TotpFailure";
  }
}

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const uint64Maximum = 18_446_744_073_709_551_615n;

function fail(): never {
  throw new TotpFailure();
}

function clear(bytes: Uint8Array): void {
  try {
    bytes.fill(0);
  } catch {
    // JavaScript memory erasure is best effort.
  }
}

export function decodeCanonicalBase32(value: unknown): Uint8Array<ArrayBuffer> {
  if (
    typeof value !== "string" ||
    value.length > 512 ||
    (value.length > 0 && !/^[A-Z2-7]+$/.test(value))
  )
    fail();
  const remainder = value.length % 8;
  const unusedBits = new Map([
    [0, 0],
    [2, 2],
    [4, 4],
    [5, 1],
    [7, 3],
  ]).get(remainder);
  if (unusedBits === undefined) fail();
  if (value.length > 0) {
    const finalValue = base32Alphabet.indexOf(value[value.length - 1] as string);
    if (finalValue < 0 || (unusedBits > 0 && (finalValue & ((1 << unusedBits) - 1)) !== 0)) fail();
  }
  const output = new Uint8Array(Math.floor((value.length * 5) / 8));
  let accumulator = 0;
  let availableBits = 0;
  let outputOffset = 0;
  for (let index = 0; index < value.length; index += 1) {
    const digit = base32Alphabet.indexOf(value[index] as string);
    if (digit < 0) fail();
    accumulator = (accumulator << 5) | digit;
    availableBits += 5;
    if (availableBits >= 8) {
      availableBits -= 8;
      output[outputOffset] = (accumulator >>> availableBits) & 0xff;
      outputOffset += 1;
      accumulator &= (1 << availableBits) - 1;
    }
  }
  if (outputOffset !== output.length || accumulator !== 0) {
    clear(output);
    fail();
  }
  return output;
}

export function decodeTotpSecret(value: unknown): Uint8Array<ArrayBuffer> {
  if (typeof value !== "string" || value.length < 16) fail();
  return decodeCanonicalBase32(value);
}

function hashName(algorithm: TotpAlgorithm): "SHA-1" | "SHA-256" | "SHA-512" {
  switch (algorithm) {
    case "SHA1":
      return "SHA-1";
    case "SHA256":
      return "SHA-256";
    case "SHA512":
      return "SHA-512";
  }
}

function validatePolicy(item: TotpItem): void {
  if (item.algorithm !== "SHA1" && item.algorithm !== "SHA256" && item.algorithm !== "SHA512")
    fail();
  if (item.digits !== 6 && item.digits !== 8) fail();
  if (!Number.isInteger(item.period) || item.period < 15 || item.period > 300) fail();
}

function encodeCounter(counter: bigint): Uint8Array<ArrayBuffer> {
  if (counter < 0n || counter > uint64Maximum) fail();
  const bytes = new Uint8Array(8);
  let remaining = counter;
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
}

export async function computeTotp(
  subtle: Pick<SubtleCrypto, "importKey" | "sign">,
  item: TotpItem,
  nowMilliseconds: unknown,
): Promise<TotpComputation> {
  validatePolicy(item);
  if (
    typeof nowMilliseconds !== "number" ||
    !Number.isSafeInteger(nowMilliseconds) ||
    nowMilliseconds < 0
  )
    fail();
  const unixSeconds = BigInt(Math.floor(nowMilliseconds / 1_000));
  const period = BigInt(item.period);
  const counterValue = unixSeconds / period;
  const validFrom = counterValue * period;
  const expiresAt = validFrom + period;
  if (expiresAt > uint64Maximum) fail();

  const secret = decodeTotpSecret(item.secretBase32);
  const counter = encodeCounter(counterValue);
  let signature: Uint8Array<ArrayBuffer> | undefined;
  try {
    const key = await subtle.importKey(
      "raw",
      secret,
      { name: "HMAC", hash: hashName(item.algorithm) },
      false,
      ["sign"],
    );
    const signatureBuffer = await subtle.sign("HMAC", key, counter);
    signature = new Uint8Array(signatureBuffer);
    const finalByte = signature[signature.length - 1];
    if (finalByte === undefined) fail();
    const offset = finalByte & 0x0f;
    if (offset + 4 > signature.length) fail();
    const first = signature[offset];
    const second = signature[offset + 1];
    const third = signature[offset + 2];
    const fourth = signature[offset + 3];
    if (first === undefined || second === undefined || third === undefined || fourth === undefined)
      fail();
    const binary = (((first & 0x7f) << 24) | (second << 16) | (third << 8) | fourth) >>> 0;
    const code = (binary % 10 ** item.digits).toString().padStart(item.digits, "0");
    return Object.freeze({
      algorithm: item.algorithm,
      code,
      digits: item.digits,
      expiresAtUnixSeconds: expiresAt.toString(),
      period: item.period,
      validFromUnixSeconds: validFrom.toString(),
    });
  } catch (error) {
    if (error instanceof TotpFailure) throw error;
    return fail();
  } finally {
    clear(secret);
    clear(counter);
    if (signature !== undefined) clear(signature);
  }
}

export function isTotpResultFresh(
  result: Pick<TotpComputation, "expiresAtUnixSeconds" | "validFromUnixSeconds">,
  nowMilliseconds: unknown,
): boolean {
  if (
    typeof nowMilliseconds !== "number" ||
    !Number.isSafeInteger(nowMilliseconds) ||
    nowMilliseconds < 0
  )
    fail();
  let validFrom: bigint;
  let expiresAt: bigint;
  try {
    validFrom = BigInt(result.validFromUnixSeconds);
    expiresAt = BigInt(result.expiresAtUnixSeconds);
  } catch {
    fail();
  }
  const now = BigInt(Math.floor(nowMilliseconds / 1_000));
  return now >= validFrom && now < expiresAt;
}

export function validateTotpComputation(result: TotpComputation, item: TotpItem): TotpComputation {
  validatePolicy(item);
  if (
    result.algorithm !== item.algorithm ||
    result.digits !== item.digits ||
    result.period !== item.period ||
    !new RegExp(`^[0-9]{${item.digits}}$`).test(result.code) ||
    !/^(0|[1-9][0-9]{0,19})$/.test(result.validFromUnixSeconds) ||
    !/^(0|[1-9][0-9]{0,19})$/.test(result.expiresAtUnixSeconds)
  )
    fail();
  const validFrom = BigInt(result.validFromUnixSeconds);
  const expiresAt = BigInt(result.expiresAtUnixSeconds);
  if (
    validFrom > uint64Maximum ||
    expiresAt > uint64Maximum ||
    validFrom % BigInt(item.period) !== 0n ||
    expiresAt !== validFrom + BigInt(item.period)
  )
    fail();
  return result;
}
