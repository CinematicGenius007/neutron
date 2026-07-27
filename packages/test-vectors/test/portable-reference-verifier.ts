import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { argon2id } from "@noble/hashes/argon2.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

import type {
  EnvelopeRequest,
  FullRotationRequest,
  MinimumMigrationRequest,
  StateGenerationRequest,
  VectorError,
  VectorObservation,
  VectorRequest,
  VectorVerifier,
} from "../src/index.js";

const textEncoder = new TextEncoder();
const aadPrefix = textEncoder.encode("neutron/aead-ad/v1\0");
const derivePrefix = textEncoder.encode("neutron/derive/v1\0");
const maxUint64 = 0xffff_ffff_ffff_ffffn;
const maxBlobGeneration = 16_777_215n;

const labels = {
  2: "recovery/ark-wrap",
  3: "ark/child-key-wrap",
  4: "vault/item-key-wrap",
  5: "item/attachment-key-wrap",
  16: "item/payload-aead",
  17: "attachment/chunk-aead",
  18: "vault/index-shard-aead",
} as const;

type LabelledKind = keyof typeof labels;
type EnvelopeKind = 0x01 | LabelledKind;

interface ParsedHeader {
  readonly accountId: Uint8Array;
  readonly ciphertextLength: number;
  readonly fixedHeader: Uint8Array;
  readonly generation: bigint;
  readonly keyVersion: number;
  readonly kind: EnvelopeKind;
  readonly nonce: Uint8Array;
  readonly objectId: Uint8Array;
  readonly salt: Uint8Array;
}

interface OpenedEnvelope {
  readonly header: ParsedHeader;
  readonly plaintext: Uint8Array;
  readonly output: Uint8Array;
}

class VerificationFailure extends Error {
  readonly code: VectorError;

  constructor(code: VectorError) {
    super(code);
    this.code = code;
  }
}

function reject(code: VectorError): never {
  throw new VerificationFailure(code);
}

function fromHex(value: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})*$/.test(value)) reject("structure");
  return Uint8Array.from(value.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));
}

function toHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function concat(...values: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(values.reduce((sum, value) => sum + value.length, 0));
  let offset = 0;
  for (const value of values) {
    output.set(value, offset);
    offset += value.length;
  }
  return output;
}

function uint32be(value: number): Uint8Array {
  const output = new Uint8Array(4);
  new DataView(output.buffer).setUint32(0, value, false);
  return output;
}

function uint64be(value: bigint): Uint8Array {
  const output = new Uint8Array(8);
  new DataView(output.buffer).setBigUint64(0, value, false);
  return output;
}

function readUint32(value: Uint8Array, offset: number): number {
  return new DataView(value.buffer, value.byteOffset, value.byteLength).getUint32(offset, false);
}

function readUint64(value: Uint8Array, offset: number): bigint {
  return new DataView(value.buffer, value.byteOffset, value.byteLength).getBigUint64(offset, false);
}

function allZero(value: Uint8Array): boolean {
  return value.every((byte) => byte === 0);
}

function isKnownKind(value: number): value is EnvelopeKind {
  return value === 0x01 || Object.hasOwn(labels, value);
}

function ciphertextBounds(kind: EnvelopeKind): readonly [number, number] {
  switch (kind) {
    case 0x01:
    case 0x02:
    case 0x04:
    case 0x05:
      return [51, 51];
    case 0x03:
      return [147, 147];
    case 0x10:
      return [4_112, 16_777_232];
    case 0x11:
      return [4_112, 1_048_592];
    case 0x12:
      return [4_112, 65_552];
  }
}

function parseHeader(envelope: Uint8Array): ParsedHeader {
  if (envelope.length < 72) reject("structure");
  if (envelope[0] !== 0x4e || envelope[1] !== 0x54 || envelope[2] !== 0x52 || envelope[3] !== 0x4e)
    reject("structure");
  if (envelope[4] !== 0x01) reject("unsupported-version");

  const kindByte = envelope[5] as number;
  if (!isKnownKind(kindByte)) reject("unknown-critical-field");
  const kind = kindByte;
  if (envelope[6] !== 0x01) reject("unsupported-suite");
  const expectedFlags = kind >= 0x10 ? 0x01 : 0x00;
  if (
    envelope[7] !== expectedFlags ||
    envelope[59] !== 0 ||
    envelope[70] !== 0 ||
    envelope[71] !== 0
  )
    reject("unknown-critical-field");

  const accountId = envelope.slice(8, 24);
  const objectId = envelope.slice(24, 40);
  if (allZero(accountId)) reject("structure");
  if ((kind === 0x01 || kind === 0x02) !== allZero(objectId)) reject("structure");

  const keyVersion = readUint32(envelope, 40);
  const generation = readUint64(envelope, 44);
  const ciphertextLength = readUint32(envelope, 52);
  if (keyVersion === 0) reject("bounds");
  const [minimumCiphertext, maximumCiphertext] = ciphertextBounds(kind);
  if (
    kind >= 0x10 &&
    (ciphertextLength < minimumCiphertext || ciphertextLength > maximumCiphertext)
  )
    reject("bounds");

  const passwordKind = kind === 0x01;
  const saltLength = envelope[68] as number;
  if (passwordKind) {
    if (
      envelope[56] !== 0x01 ||
      envelope[57] !== 0x13 ||
      envelope[58] !== 0x01 ||
      readUint32(envelope, 60) !== 65_536 ||
      readUint32(envelope, 64) !== 3 ||
      saltLength !== 16
    )
      reject("kdf-policy");
  } else if (
    envelope[56] !== 0 ||
    envelope[57] !== 0 ||
    envelope[58] !== 0 ||
    readUint32(envelope, 60) !== 0 ||
    readUint32(envelope, 64) !== 0 ||
    saltLength !== 0
  ) {
    reject("unknown-critical-field");
  }
  if (envelope[69] !== 24) reject("structure");

  const exactLength = 72 + saltLength + 24 + ciphertextLength;
  if (envelope.length !== exactLength) reject("structure");
  if (kind < 0x10 && (ciphertextLength < minimumCiphertext || ciphertextLength > maximumCiphertext))
    reject("bounds");

  if (kind === 0x01 || kind === 0x02) {
    if (generation === 0n) reject("bounds");
  } else if (kind < 0x10) {
    if (generation !== 0n) reject("bounds");
  } else {
    const paddedLength = ciphertextLength - 16;
    if (paddedLength === 0 || paddedLength % 4096 !== 0) reject("bounds");
    if ((kind === 0x10 || kind === 0x12) && generation === 0n) reject("bounds");
    if (kind === 0x11 && generation > maxBlobGeneration) reject("bounds");
  }

  const fixedHeader = envelope.slice(0, 72);
  const salt = envelope.slice(72, 72 + saltLength);
  const nonce = envelope.slice(72 + saltLength, 96 + saltLength);
  return {
    accountId,
    ciphertextLength,
    fixedHeader,
    generation,
    keyVersion,
    kind,
    nonce,
    objectId,
    salt,
  };
}

function deriveKey(
  header: ParsedHeader,
  keySource: EnvelopeRequest["input"]["keySource"],
): Uint8Array {
  if (header.kind === 0x01) {
    if (keySource.source !== "password") reject("structure");
    const password = fromHex(keySource.password);
    if (password.length < 1 || password.length > 1024) reject("password-length");
    return argon2id(password, header.salt, {
      t: 3,
      m: 65_536,
      p: 1,
      dkLen: 32,
    });
  }
  if (keySource.source !== "parent") reject("structure");
  const label = labels[header.kind];
  const info = concat(
    derivePrefix,
    textEncoder.encode(label),
    Uint8Array.of(0),
    header.objectId,
    uint32be(header.keyVersion),
  );
  return hkdf(sha256, fromHex(keySource.parentKey), header.accountId, info, 32);
}

function decryptEnvelope(
  envelope: Uint8Array,
  keySource: EnvelopeRequest["input"]["keySource"],
): OpenedEnvelope {
  const header = parseHeader(envelope);
  const key = deriveKey(header, keySource);
  const ciphertextOffset = 96 + header.salt.length;
  const aad = concat(aadPrefix, header.fixedHeader, header.salt, header.nonce);
  let plaintext: Uint8Array;
  try {
    plaintext = xchacha20poly1305(key, header.nonce, aad).decrypt(envelope.slice(ciphertextOffset));
  } catch {
    reject("authentication");
  }
  return { header, plaintext, output: decodePlaintext(header.kind, plaintext) };
}

function decodePlaintext(kind: EnvelopeKind, plaintext: Uint8Array): Uint8Array {
  if (kind >= 0x10) return unpadPayload(plaintext);
  if (kind === 0x03) return decodeFixedChild(plaintext);

  if (plaintext.length < 3) reject("structure");
  const materialType = plaintext[0] as number;
  const materialLength = ((plaintext[1] as number) << 8) | (plaintext[2] as number);
  const expectedType = kind === 0x01 || kind === 0x02 ? 0x01 : kind;
  if (materialType !== expectedType) reject("unknown-critical-field");
  if (materialLength !== 32 || plaintext.length !== 35) reject("structure");
  return plaintext.slice(3);
}

function decodeFixedChild(plaintext: Uint8Array): Uint8Array {
  if (plaintext.length !== 131) reject("structure");
  const materialType = plaintext[0] as number;
  const materialLength = ((plaintext[1] as number) << 8) | (plaintext[2] as number);
  if (materialType !== 0x02 && materialType !== 0x03) reject("unknown-critical-field");
  if (materialLength < 1 || materialLength > 128) reject("structure");
  if (materialType === 0x03 && materialLength !== 32) reject("structure");
  if (!allZero(plaintext.slice(3 + materialLength))) reject("padding");
  return plaintext.slice(3, 3 + materialLength);
}

function unpadPayload(plaintext: Uint8Array): Uint8Array {
  let marker = plaintext.length - 1;
  while (marker >= 0 && plaintext[marker] === 0) marker -= 1;
  if (marker < 0 || plaintext[marker] !== 0x80) reject("padding");
  return plaintext.slice(0, marker);
}

function canonicalWrapper(type: number, material: Uint8Array, fixedChild: boolean): Uint8Array {
  if (material.length > 0xffff || (fixedChild && material.length > 128)) reject("bounds");
  const prefix = concat(
    Uint8Array.of(type, (material.length >>> 8) & 0xff, material.length & 0xff),
    material,
  );
  return fixedChild ? concat(prefix, new Uint8Array(128 - material.length)) : prefix;
}

function canonicalPayload(plaintext: Uint8Array): Uint8Array {
  const paddedLength = Math.ceil((plaintext.length + 1) / 4096) * 4096;
  const output = new Uint8Array(paddedLength);
  output.set(plaintext);
  output[plaintext.length] = 0x80;
  return output;
}

function encodeHeader(input: {
  readonly accountId: Uint8Array;
  readonly ciphertextLength: number;
  readonly generation: bigint;
  readonly keyVersion: number;
  readonly kind: EnvelopeKind;
  readonly objectId: Uint8Array;
}): Uint8Array {
  const output = new Uint8Array(72);
  output.set(textEncoder.encode("NTRN"), 0);
  output[4] = 0x01;
  output[5] = input.kind;
  output[6] = 0x01;
  output[7] = input.kind >= 0x10 ? 0x01 : 0x00;
  output.set(input.accountId, 8);
  output.set(input.objectId, 24);
  output.set(uint32be(input.keyVersion), 40);
  output.set(uint64be(input.generation), 44);
  output.set(uint32be(input.ciphertextLength), 52);
  output[69] = 24;
  return output;
}

function encryptWithParent(input: {
  readonly accountId: Uint8Array;
  readonly generation: bigint;
  readonly keyVersion: number;
  readonly kind: LabelledKind;
  readonly nonce: Uint8Array;
  readonly objectId: Uint8Array;
  readonly parentKey: Uint8Array;
  readonly plaintext: Uint8Array;
}): Uint8Array {
  const fixedHeader = encodeHeader({
    accountId: input.accountId,
    ciphertextLength: input.plaintext.length + 16,
    generation: input.generation,
    keyVersion: input.keyVersion,
    kind: input.kind,
    objectId: input.objectId,
  });
  const parsed = parseHeader(
    concat(fixedHeader, input.nonce, new Uint8Array(input.plaintext.length + 16)),
  );
  const key = deriveKey(parsed, {
    source: "parent",
    parentKey: toHex(input.parentKey),
  });
  const aad = concat(aadPrefix, fixedHeader, input.nonce);
  const ciphertext = xchacha20poly1305(key, input.nonce, aad).encrypt(input.plaintext);
  return concat(fixedHeader, input.nonce, ciphertext);
}

function envelopeBundle(envelopes: readonly Uint8Array[]): Uint8Array {
  return concat(...envelopes.flatMap((envelope) => [uint32be(envelope.length), envelope]));
}

function observeError(error: unknown): VectorObservation {
  if (error instanceof VerificationFailure) return { outcome: "reject", error: error.code };
  throw error;
}

function encodeScalar(scalar: number): Uint8Array {
  if (
    !Number.isInteger(scalar) ||
    scalar < 0 ||
    scalar > 0x10ffff ||
    (scalar >= 0xd800 && scalar <= 0xdfff)
  )
    reject("invalid-password-encoding");
  if (scalar <= 0x7f) return Uint8Array.of(scalar);
  if (scalar <= 0x7ff) return Uint8Array.of(0xc0 | (scalar >>> 6), 0x80 | (scalar & 0x3f));
  if (scalar <= 0xffff)
    return Uint8Array.of(
      0xe0 | (scalar >>> 12),
      0x80 | ((scalar >>> 6) & 0x3f),
      0x80 | (scalar & 0x3f),
    );
  return Uint8Array.of(
    0xf0 | (scalar >>> 18),
    0x80 | ((scalar >>> 12) & 0x3f),
    0x80 | ((scalar >>> 6) & 0x3f),
    0x80 | (scalar & 0x3f),
  );
}

function enforcePasswordLength(encoded: Uint8Array): Uint8Array {
  if (encoded.length < 1 || encoded.length > 1024) reject("password-length");
  return encoded;
}

function encodePassword(
  request: Extract<VectorRequest, { operation: "password-encoding" }>,
): Uint8Array {
  if ("utf16be" in request.input) {
    const bytes = fromHex(request.input.utf16be);
    if (bytes.length % 2 !== 0) reject("invalid-password-encoding");
    const scalars: number[] = [];
    for (let offset = 0; offset < bytes.length; offset += 2) {
      const unit = ((bytes[offset] as number) << 8) | (bytes[offset + 1] as number);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        if (offset + 3 >= bytes.length) reject("invalid-password-encoding");
        const trailing = ((bytes[offset + 2] as number) << 8) | (bytes[offset + 3] as number);
        if (trailing < 0xdc00 || trailing > 0xdfff) reject("invalid-password-encoding");
        scalars.push(0x10000 + ((unit - 0xd800) << 10) + (trailing - 0xdc00));
        offset += 2;
      } else {
        if (unit >= 0xdc00 && unit <= 0xdfff) reject("invalid-password-encoding");
        scalars.push(unit);
      }
    }
    return enforcePasswordLength(concat(...scalars.map(encodeScalar)));
  }

  let scalars: readonly number[];
  if ("scalars" in request.input) {
    scalars = request.input.scalars;
  } else if ("repeatScalar" in request.input) {
    const scalar = request.input.repeatScalar;
    scalars = Array.from({ length: request.input.repeatCount }, () => scalar);
  } else {
    reject("invalid-password-encoding");
  }
  return enforcePasswordLength(concat(...scalars.map(encodeScalar)));
}

function verifyGeneration(request: StateGenerationRequest): VectorObservation {
  const value = BigInt(
    request.input.action === "validate"
      ? request.input.candidateGeneration
      : request.input.currentGeneration,
  );
  const validCurrent = request.input.kind === "blob" ? value <= maxBlobGeneration : value >= 1n;
  if (!validCurrent || value > maxUint64) reject("bounds");
  if (request.input.action === "validate")
    return { outcome: "success", state: { generation: value.toString() } };
  const next = value + 1n;
  if (next > maxUint64 || (request.input.kind === "blob" && next > maxBlobGeneration))
    reject("bounds");
  return { outcome: "success", state: { generation: next.toString() } };
}

function verifyEnvelope(request: EnvelopeRequest): VectorObservation {
  const opened = decryptEnvelope(fromHex(request.input.envelope), request.input.keySource);
  return { outcome: "success", output: toHex(opened.output) };
}

function minimumChildRewrap(request: MinimumMigrationRequest): VectorObservation {
  const oldArk = fromHex(request.input.oldArk);
  const newArk = fromHex(request.input.newArk);
  const replacements = request.input.children.map((child) => {
    const opened = decryptEnvelope(fromHex(child.oldEnvelope), {
      source: "parent",
      parentKey: toHex(oldArk),
    });
    if (opened.header.kind !== 0x03) reject("structure");
    return encryptWithParent({
      accountId: opened.header.accountId,
      generation: 0n,
      keyVersion: opened.header.keyVersion,
      kind: 0x03,
      nonce: fromHex(child.newNonce),
      objectId: opened.header.objectId,
      parentKey: newArk,
      plaintext: opened.plaintext,
    });
  });
  return { outcome: "success", output: toHex(envelopeBundle(replacements)) };
}

function fullDescendantRotation(request: FullRotationRequest): VectorObservation {
  const { input } = request;
  const accountId = fromHex(input.accountId);
  const newArk = fromHex(input.newArk);
  const objectIds = Object.fromEntries(
    Object.entries(input.objectIds).map(([name, value]) => [name, fromHex(value)]),
  ) as Record<keyof typeof input.objectIds, Uint8Array>;
  const mutation = fromHex(input.materials.mutation);
  const vaultKey = fromHex(input.materials.vaultKey);
  const itemKey = fromHex(input.materials.itemKey);
  const attachmentKey = fromHex(input.materials.attachmentKey);
  const nonces = Object.fromEntries(
    Object.entries(input.nonces).map(([name, value]) => [name, fromHex(value)]),
  ) as Record<keyof typeof input.nonces, Uint8Array>;
  const version = input.newKeyVersion;

  const make = (
    kind: LabelledKind,
    objectId: Uint8Array,
    parentKey: Uint8Array,
    nonce: Uint8Array,
    plaintext: Uint8Array,
    generation: bigint,
  ) =>
    encryptWithParent({
      accountId,
      generation,
      keyVersion: version,
      kind,
      nonce,
      objectId,
      parentKey,
      plaintext,
    });

  const envelopes = [
    make(
      0x03,
      objectIds.mutation,
      newArk,
      nonces.mutationChild,
      canonicalWrapper(0x02, mutation, true),
      0n,
    ),
    make(
      0x03,
      objectIds.vault,
      newArk,
      nonces.vaultChild,
      canonicalWrapper(0x03, vaultKey, true),
      0n,
    ),
    make(
      0x04,
      objectIds.item,
      vaultKey,
      nonces.itemWrapper,
      canonicalWrapper(0x04, itemKey, false),
      0n,
    ),
    make(
      0x05,
      objectIds.attachment,
      itemKey,
      nonces.attachmentWrapper,
      canonicalWrapper(0x05, attachmentKey, false),
      0n,
    ),
    make(
      0x10,
      objectIds.item,
      itemKey,
      nonces.itemPayload,
      canonicalPayload(fromHex(input.materials.itemPlaintext)),
      1n,
    ),
    make(
      0x11,
      objectIds.attachment,
      attachmentKey,
      nonces.blobPayload,
      canonicalPayload(fromHex(input.materials.blobPlaintext)),
      0n,
    ),
    make(
      0x12,
      objectIds.index,
      vaultKey,
      nonces.indexPayload,
      canonicalPayload(fromHex(input.materials.indexPlaintext)),
      1n,
    ),
  ];
  return { outcome: "success", output: toHex(envelopeBundle(envelopes)) };
}

function verifyMigration(
  request: MinimumMigrationRequest | FullRotationRequest,
): VectorObservation {
  return request.input.action === "minimum-child-rewrap"
    ? minimumChildRewrap(request as MinimumMigrationRequest)
    : fullDescendantRotation(request as FullRotationRequest);
}

function verify(request: VectorRequest): VectorObservation {
  try {
    switch (request.operation) {
      case "hkdf-sha256":
        return {
          outcome: "success",
          output: toHex(
            hkdf(
              sha256,
              fromHex(request.input.ikm),
              fromHex(request.input.salt),
              fromHex(request.input.info),
              request.parameters.length,
            ),
          ),
        };
      case "argon2id":
        return {
          outcome: "success",
          output: toHex(
            argon2id(fromHex(request.input.password), fromHex(request.input.salt), {
              t: request.parameters.iterations,
              m: request.parameters.memoryKiB,
              p: request.parameters.parallelism,
              dkLen: request.parameters.length,
            }),
          ),
        };
      case "password-encoding":
        return { outcome: "success", output: toHex(encodePassword(request)) };
      case "state-generation":
        return verifyGeneration(request);
      case "envelope":
        return verifyEnvelope(request);
      case "migration":
        return verifyMigration(request);
    }
  } catch (error) {
    return observeError(error);
  }
}

export const portableReferenceVerifier: VectorVerifier = { verify };
