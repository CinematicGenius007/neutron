import { CryptoFailure, type CryptoProvider } from "@neutron/crypto";

import { EnvelopeFailure } from "./errors.js";

const encoder = new TextEncoder();
const magic = encoder.encode("NTRN");
const aadPrefix = encoder.encode("neutron/aead-ad/v1\0");
const derivePrefix = encoder.encode("neutron/derive/v1\0");
const maxBlobGeneration = 16_777_215n;

export const ENVELOPE_KIND = Object.freeze({
  PASSWORD_ARK: 0x01,
  RECOVERY_ARK: 0x02,
  ARK_CHILD: 0x03,
  VAULT_ITEM: 0x04,
  ITEM_ATTACHMENT: 0x05,
  ITEM_PAYLOAD: 0x10,
  BLOB_PAYLOAD: 0x11,
  INDEX_PAYLOAD: 0x12,
} as const);

export type EnvelopeKind = (typeof ENVELOPE_KIND)[keyof typeof ENVELOPE_KIND];
export type LabelledEnvelopeKind = Exclude<EnvelopeKind, 0x01>;
export type KeyMaterialType = 0x01 | 0x02 | 0x03 | 0x04 | 0x05;

const labels: Readonly<Record<LabelledEnvelopeKind, string>> = Object.freeze({
  2: "recovery/ark-wrap",
  3: "ark/child-key-wrap",
  4: "vault/item-key-wrap",
  5: "item/attachment-key-wrap",
  16: "item/payload-aead",
  17: "attachment/chunk-aead",
  18: "vault/index-shard-aead",
});

export interface EnvelopeHeader {
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

export type EnvelopeKeySource =
  | Readonly<{ source: "parent"; parentKey: Uint8Array }>
  | Readonly<{ source: "password"; password: Uint8Array }>;

export type EnvelopeContent =
  | Readonly<{ type: "key-material"; materialType: KeyMaterialType; material: Uint8Array }>
  | Readonly<{ type: "payload"; plaintext: Uint8Array }>;

export type DecodedEnvelopeContent =
  | Readonly<{ type: "key-material"; materialType: KeyMaterialType; material: Uint8Array }>
  | Readonly<{ type: "payload"; plaintext: Uint8Array }>;

export interface EnvelopeSealInput {
  readonly accountId: Uint8Array;
  readonly content: EnvelopeContent;
  readonly generation: bigint;
  readonly keySource: EnvelopeKeySource;
  readonly keyVersion: number;
  readonly kind: EnvelopeKind;
  readonly objectId: Uint8Array;
}

export interface OpenedEnvelope {
  readonly content: DecodedEnvelopeContent;
  readonly header: EnvelopeHeader;
}

export interface OpenedEnvelopeInternal extends OpenedEnvelope {
  readonly canonicalPlaintext: Uint8Array;
}

function fail(code: ConstructorParameters<typeof EnvelopeFailure>[0]): never {
  throw new EnvelopeFailure(code);
}

function record(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail("structure");
}

function bytes(value: unknown, length?: number): asserts value is Uint8Array {
  if (
    !(value instanceof Uint8Array) ||
    (typeof SharedArrayBuffer !== "undefined" && value.buffer instanceof SharedArrayBuffer) ||
    (length !== undefined && value.length !== length)
  )
    fail("structure");
}

function overlaps(left: Uint8Array, right: Uint8Array): boolean {
  if (left.buffer !== right.buffer) return false;
  const leftEnd = left.byteOffset + left.byteLength;
  const rightEnd = right.byteOffset + right.byteLength;
  return left.byteOffset < rightEnd && right.byteOffset < leftEnd;
}

export function copyProviderOutput(
  provider: CryptoProvider,
  value: unknown,
  length: number,
  inputs: readonly Uint8Array[],
): Uint8Array {
  if (
    !(value instanceof Uint8Array) ||
    (typeof SharedArrayBuffer !== "undefined" && value.buffer instanceof SharedArrayBuffer) ||
    value.length !== length
  ) {
    if (value instanceof Uint8Array && !inputs.some((input) => overlaps(value, input)))
      provider.clear(value);
    throw new CryptoFailure("provider", "crypto provider returned invalid bytes");
  }
  const owned = value.slice();
  if (!inputs.some((input) => overlaps(value, input))) provider.clear(value);
  return owned;
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

function view(value: Uint8Array): DataView {
  return new DataView(value.buffer, value.byteOffset, value.byteLength);
}

function allZero(value: Uint8Array): boolean {
  return value.every((byte) => byte === 0);
}

function knownKind(value: number): value is EnvelopeKind {
  return (
    value === 0x01 ||
    value === 0x02 ||
    value === 0x03 ||
    value === 0x04 ||
    value === 0x05 ||
    value === 0x10 ||
    value === 0x11 ||
    value === 0x12
  );
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

export function parseEnvelopeHeader(envelope: Uint8Array): EnvelopeHeader {
  bytes(envelope);
  if (envelope.length < 72) fail("structure");
  if (
    envelope[0] !== magic[0] ||
    envelope[1] !== magic[1] ||
    envelope[2] !== magic[2] ||
    envelope[3] !== magic[3]
  )
    fail("structure");
  if (envelope[4] !== 0x01) fail("unsupported-version");
  const kindByte = envelope[5] as number;
  if (!knownKind(kindByte)) fail("unknown-critical-field");
  const kind = kindByte;
  if (envelope[6] !== 0x01) fail("unsupported-suite");
  const expectedFlags = kind >= 0x10 ? 0x01 : 0x00;
  if (
    envelope[7] !== expectedFlags ||
    envelope[59] !== 0 ||
    envelope[70] !== 0 ||
    envelope[71] !== 0
  )
    fail("unknown-critical-field");

  const accountId = envelope.slice(8, 24);
  const objectId = envelope.slice(24, 40);
  if (allZero(accountId)) fail("structure");
  if ((kind === 0x01 || kind === 0x02) !== allZero(objectId)) fail("structure");

  const data = view(envelope);
  const keyVersion = data.getUint32(40, false);
  const generation = data.getBigUint64(44, false);
  const ciphertextLength = data.getUint32(52, false);
  if (keyVersion === 0) fail("bounds");
  const [minimumCiphertext, maximumCiphertext] = ciphertextBounds(kind);
  if (
    kind >= 0x10 &&
    (ciphertextLength < minimumCiphertext || ciphertextLength > maximumCiphertext)
  )
    fail("bounds");

  const saltLength = envelope[68] as number;
  if (kind === 0x01) {
    if (
      envelope[56] !== 0x01 ||
      envelope[57] !== 0x13 ||
      envelope[58] !== 0x01 ||
      data.getUint32(60, false) !== 65_536 ||
      data.getUint32(64, false) !== 3 ||
      saltLength !== 16
    )
      fail("kdf-policy");
  } else if (
    envelope[56] !== 0 ||
    envelope[57] !== 0 ||
    envelope[58] !== 0 ||
    data.getUint32(60, false) !== 0 ||
    data.getUint32(64, false) !== 0 ||
    saltLength !== 0
  ) {
    fail("unknown-critical-field");
  }
  if (envelope[69] !== 24) fail("structure");
  if (envelope.length !== 72 + saltLength + 24 + ciphertextLength) fail("structure");
  if (kind < 0x10 && (ciphertextLength < minimumCiphertext || ciphertextLength > maximumCiphertext))
    fail("bounds");

  if (kind === 0x01 || kind === 0x02) {
    if (generation === 0n) fail("bounds");
  } else if (kind < 0x10) {
    if (generation !== 0n) fail("bounds");
  } else {
    const paddedLength = ciphertextLength - 16;
    if (paddedLength === 0 || paddedLength % 4_096 !== 0) fail("bounds");
    if ((kind === 0x10 || kind === 0x12) && generation === 0n) fail("bounds");
    if (kind === 0x11 && generation > maxBlobGeneration) fail("bounds");
  }

  return Object.freeze({
    accountId,
    ciphertextLength,
    fixedHeader: envelope.slice(0, 72),
    generation,
    keyVersion,
    kind,
    nonce: envelope.slice(72 + saltLength, 96 + saltLength),
    objectId,
    salt: envelope.slice(72, 72 + saltLength),
  });
}

function derivedKey(
  provider: CryptoProvider,
  header: EnvelopeHeader,
  keySource: EnvelopeKeySource,
): Uint8Array {
  record(keySource);
  if (header.kind === 0x01) {
    if (keySource.source !== "password") fail("structure");
    bytes(keySource.password);
    if (keySource.password.length < 1 || keySource.password.length > 1_024) fail("password-length");
    return copyProviderOutput(
      provider,
      provider.deriveArgon2idKey(keySource.password, header.salt),
      32,
      [keySource.password, header.salt],
    );
  }
  if (keySource.source !== "parent") fail("structure");
  bytes(keySource.parentKey, 32);
  const label = labels[header.kind];
  const info = concat(
    derivePrefix,
    encoder.encode(label),
    Uint8Array.of(0),
    header.objectId,
    uint32be(header.keyVersion),
  );
  return copyProviderOutput(
    provider,
    provider.deriveHkdfSha256({
      ikm: keySource.parentKey,
      info,
      length: 32,
      salt: header.accountId,
    }),
    32,
    [keySource.parentKey, info, header.accountId],
  );
}

function unpadPayload(plaintext: Uint8Array): Uint8Array {
  let marker = plaintext.length - 1;
  while (marker >= 0 && plaintext[marker] === 0) marker -= 1;
  if (marker < 0 || plaintext[marker] !== 0x80) fail("padding");
  return plaintext.slice(0, marker);
}

function decodePlaintext(kind: EnvelopeKind, plaintext: Uint8Array): DecodedEnvelopeContent {
  if (kind >= 0x10) return { plaintext: unpadPayload(plaintext), type: "payload" };
  if (kind === 0x03) {
    if (plaintext.length !== 131) fail("structure");
    const materialType = plaintext[0] as number;
    const materialLength = ((plaintext[1] as number) << 8) | (plaintext[2] as number);
    if (materialType !== 0x02 && materialType !== 0x03) fail("unknown-critical-field");
    if (materialLength < 1 || materialLength > 128) fail("structure");
    if (materialType === 0x03 && materialLength !== 32) fail("structure");
    if (!allZero(plaintext.subarray(3 + materialLength))) fail("padding");
    return {
      material: plaintext.slice(3, 3 + materialLength),
      materialType,
      type: "key-material",
    };
  }
  if (plaintext.length < 3) fail("structure");
  const materialType = plaintext[0] as number;
  const materialLength = ((plaintext[1] as number) << 8) | (plaintext[2] as number);
  const expectedType = kind === 0x01 || kind === 0x02 ? 0x01 : kind;
  if (materialType !== expectedType) fail("unknown-critical-field");
  if (materialLength !== 32 || plaintext.length !== 35) fail("structure");
  return {
    material: plaintext.slice(3),
    materialType: materialType as KeyMaterialType,
    type: "key-material",
  };
}

export function openEnvelopeInternal(
  provider: CryptoProvider,
  envelope: Uint8Array,
  keySource: EnvelopeKeySource,
): OpenedEnvelopeInternal {
  record(keySource);
  const header = parseEnvelopeHeader(envelope);
  const key = derivedKey(provider, header, keySource);
  const ciphertextOffset = 96 + header.salt.length;
  const aad = concat(aadPrefix, header.fixedHeader, header.salt, header.nonce);
  let plaintext: Uint8Array;
  try {
    const ciphertext = envelope.subarray(ciphertextOffset);
    plaintext = copyProviderOutput(
      provider,
      provider.decryptXChaCha20Poly1305({ aad, ciphertext, key, nonce: header.nonce }),
      header.ciphertextLength - 16,
      [aad, ciphertext, key, header.nonce],
    );
  } catch (error) {
    if (error instanceof CryptoFailure && error.code === "authentication") fail("authentication");
    throw error;
  } finally {
    provider.clear(key);
  }
  try {
    return {
      canonicalPlaintext: plaintext,
      content: decodePlaintext(header.kind, plaintext),
      header,
    };
  } catch (error) {
    provider.clear(plaintext);
    throw error;
  }
}

export function openEnvelope(
  provider: CryptoProvider,
  envelope: Uint8Array,
  keySource: EnvelopeKeySource,
): OpenedEnvelope {
  const opened = openEnvelopeInternal(provider, envelope, keySource);
  const result = { content: opened.content, header: opened.header };
  provider.clear(opened.canonicalPlaintext);
  return result;
}

function canonicalWrapper(
  kind: EnvelopeKind,
  materialType: KeyMaterialType,
  material: Uint8Array,
): Uint8Array {
  bytes(material);
  const valid =
    ((kind === 0x01 || kind === 0x02) && materialType === 0x01 && material.length === 32) ||
    (kind === 0x03 &&
      ((materialType === 0x02 && material.length >= 1 && material.length <= 128) ||
        (materialType === 0x03 && material.length === 32))) ||
    (kind === 0x04 && materialType === 0x04 && material.length === 32) ||
    (kind === 0x05 && materialType === 0x05 && material.length === 32);
  if (!valid) fail("structure");
  const prefix = concat(
    Uint8Array.of(materialType, (material.length >>> 8) & 0xff, material.length & 0xff),
    material,
  );
  return kind === 0x03 ? concat(prefix, new Uint8Array(128 - material.length)) : prefix;
}

function canonicalPayload(kind: EnvelopeKind, plaintext: Uint8Array): Uint8Array {
  if (kind < 0x10) fail("structure");
  bytes(plaintext);
  const limit = kind === 0x10 ? 16_777_215 : kind === 0x11 ? 1_048_575 : 65_535;
  if (plaintext.length > limit) fail("bounds");
  const paddedLength = Math.ceil((plaintext.length + 1) / 4_096) * 4_096;
  const output = new Uint8Array(paddedLength);
  output.set(plaintext);
  output[plaintext.length] = 0x80;
  return output;
}

function canonicalPlaintext(input: EnvelopeSealInput): Uint8Array {
  record(input.content);
  if (input.content.type === "payload")
    return canonicalPayload(input.kind, input.content.plaintext);
  if (input.kind >= 0x10) fail("structure");
  return canonicalWrapper(input.kind, input.content.materialType, input.content.material);
}

function fixedHeader(
  input: EnvelopeSealInput,
  ciphertextLength: number,
  saltLength: number,
): Uint8Array {
  record(input);
  if (!knownKind(input.kind)) fail("unknown-critical-field");
  bytes(input.accountId, 16);
  bytes(input.objectId, 16);
  if (allZero(input.accountId)) fail("structure");
  if ((input.kind === 0x01 || input.kind === 0x02) !== allZero(input.objectId)) fail("structure");
  if (!Number.isInteger(input.keyVersion) || input.keyVersion < 1 || input.keyVersion > 0xffff_ffff)
    fail("bounds");
  if (
    typeof input.generation !== "bigint" ||
    input.generation < 0n ||
    input.generation > 0xffff_ffff_ffff_ffffn
  )
    fail("bounds");
  if (input.kind === 0x01 || input.kind === 0x02) {
    if (input.generation === 0n) fail("bounds");
  } else if (input.kind < 0x10) {
    if (input.generation !== 0n) fail("bounds");
  } else if (
    ((input.kind === 0x10 || input.kind === 0x12) && input.generation === 0n) ||
    (input.kind === 0x11 && input.generation > maxBlobGeneration)
  ) {
    fail("bounds");
  }
  const [minimum, maximum] = ciphertextBounds(input.kind);
  if (ciphertextLength < minimum || ciphertextLength > maximum) fail("bounds");

  const output = new Uint8Array(72);
  output.set(magic, 0);
  output[4] = 0x01;
  output[5] = input.kind;
  output[6] = 0x01;
  output[7] = input.kind >= 0x10 ? 0x01 : 0x00;
  output.set(input.accountId, 8);
  output.set(input.objectId, 24);
  output.set(uint32be(input.keyVersion), 40);
  output.set(uint64be(input.generation), 44);
  output.set(uint32be(ciphertextLength), 52);
  if (input.kind === 0x01) {
    output[56] = 0x01;
    output[57] = 0x13;
    output[58] = 0x01;
    output.set(uint32be(65_536), 60);
    output.set(uint32be(3), 64);
    output[68] = 16;
  } else if (saltLength !== 0) {
    fail("structure");
  }
  output[69] = 24;
  return output;
}

export function sealEnvelopeWithEntropy(
  provider: CryptoProvider,
  input: EnvelopeSealInput,
  nonce: Uint8Array,
  salt: Uint8Array<ArrayBufferLike> = new Uint8Array(),
): Uint8Array {
  record(input);
  record(input.keySource);
  if (!knownKind(input.kind)) fail("unknown-critical-field");
  bytes(nonce, 24);
  bytes(salt, input.kind === 0x01 ? 16 : 0);
  if ((input.kind === 0x01) !== (input.keySource.source === "password")) fail("structure");
  const plaintext = canonicalPlaintext(input);
  const header = fixedHeader(input, plaintext.length + 16, salt.length);
  const parsedHeader: EnvelopeHeader = Object.freeze({
    accountId: input.accountId.slice(),
    ciphertextLength: plaintext.length + 16,
    fixedHeader: header,
    generation: input.generation,
    keyVersion: input.keyVersion,
    kind: input.kind,
    nonce: nonce.slice(),
    objectId: input.objectId.slice(),
    salt: salt.slice(),
  });
  const key = derivedKey(provider, parsedHeader, input.keySource);
  const aad = concat(aadPrefix, header, salt, nonce);
  try {
    const ciphertext = copyProviderOutput(
      provider,
      provider.encryptXChaCha20Poly1305({ aad, key, nonce, plaintext }),
      plaintext.length + 16,
      [aad, key, nonce, plaintext],
    );
    return concat(header, salt, nonce, ciphertext);
  } finally {
    provider.clear(key);
    provider.clear(plaintext);
  }
}

export function sealEnvelope(provider: CryptoProvider, input: EnvelopeSealInput): Uint8Array {
  record(input);
  if (!knownKind(input.kind)) fail("unknown-critical-field");
  const nonce = copyProviderOutput(provider, provider.randomBytes(24), 24, []);
  const salt =
    input.kind === 0x01
      ? copyProviderOutput(provider, provider.randomBytes(16), 16, [])
      : new Uint8Array();
  try {
    return sealEnvelopeWithEntropy(provider, input, nonce, salt);
  } finally {
    provider.clear(nonce);
    if (salt.length > 0) provider.clear(salt);
  }
}

export function encodeEnvelopeBundle(envelopes: readonly Uint8Array[]): Uint8Array {
  return concat(...envelopes.flatMap((envelope) => [uint32be(envelope.length), envelope]));
}
