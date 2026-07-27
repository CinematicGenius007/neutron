/**
 * Test-only candidate generator. It is never imported by the verifier runner
 * and may only be used to prepare reviewed fixture candidates.
 */
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { argon2id } from "@noble/hashes/argon2.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

function fromHex(value: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})*$/.test(value)) throw new Error("invalid synthetic hex");
  return Uint8Array.from(value.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));
}

function toHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const textEncoder = new TextEncoder();
const aadPrefix = textEncoder.encode("neutron/aead-ad/v1\0");
const derivePrefix = textEncoder.encode("neutron/derive/v1\0");

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

interface HeaderFields {
  readonly kind: EnvelopeKind | number;
  readonly accountId: Uint8Array;
  readonly objectId: Uint8Array;
  readonly keyVersion: number;
  readonly generation: bigint;
  readonly ciphertextLength: number;
  readonly flags?: number;
  readonly passwordKdf?: boolean;
}

interface EnvelopeKeySource {
  readonly source: "parent" | "password";
  readonly material: Uint8Array;
}

interface GeneratedEnvelope {
  readonly envelope: Uint8Array;
  readonly header: Uint8Array;
  readonly key: Uint8Array;
  readonly nonce: Uint8Array;
  readonly plaintext: Uint8Array;
  readonly salt: Uint8Array;
}

interface GeneratedEnvelopeVector {
  readonly id: string;
  readonly originatingRequirementId: string;
  readonly operation: "envelope";
  readonly input: Readonly<{
    envelope: string;
    keySource:
      | Readonly<{ source: "parent"; parentKey: string }>
      | Readonly<{ source: "password"; password: string }>;
  }>;
  readonly parameters: Readonly<Record<string, never>>;
  readonly expect:
    | Readonly<{ outcome: "success"; output: string }>
    | Readonly<{
        outcome: "reject";
        error:
          | "authentication"
          | "bounds"
          | "kdf-policy"
          | "padding"
          | "structure"
          | "unknown-critical-field"
          | "unsupported-suite"
          | "unsupported-version";
      }>;
}

function concat(...values: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(values.reduce((total, value) => total + value.length, 0));
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

function header(fields: HeaderFields): Uint8Array {
  if (fields.accountId.length !== 16 || fields.objectId.length !== 16)
    throw new Error("invalid synthetic identifier length");
  const output = new Uint8Array(72);
  output.set(textEncoder.encode("NTRN"), 0);
  output[4] = 0x01;
  output[5] = fields.kind;
  output[6] = 0x01;
  output[7] = fields.flags ?? (fields.kind >= 0x10 ? 0x01 : 0x00);
  output.set(fields.accountId, 8);
  output.set(fields.objectId, 24);
  output.set(uint32be(fields.keyVersion), 40);
  output.set(uint64be(fields.generation), 44);
  output.set(uint32be(fields.ciphertextLength), 52);
  if (fields.passwordKdf) {
    output[56] = 0x01;
    output[57] = 0x13;
    output[58] = 0x01;
    output.set(uint32be(65_536), 60);
    output.set(uint32be(3), 64);
    output[68] = 16;
  }
  output[69] = 24;
  return output;
}

function deriveEnvelopeKey(
  kind: EnvelopeKind,
  fields: HeaderFields,
  source: EnvelopeKeySource,
  salt: Uint8Array,
): Uint8Array {
  if (kind === 0x01) {
    if (source.source !== "password") throw new Error("password source required");
    return argon2id(source.material, salt, { t: 3, m: 65536, p: 1, dkLen: 32 });
  }
  if (source.source !== "parent") throw new Error("parent source required");
  const label = labels[kind];
  const info = concat(
    derivePrefix,
    textEncoder.encode(label),
    Uint8Array.of(0),
    fields.objectId,
    uint32be(fields.keyVersion),
  );
  return hkdf(sha256, source.material, fields.accountId, info, 32);
}

function encryptEnvelope(input: {
  readonly fields: Omit<HeaderFields, "ciphertextLength">;
  readonly keySource: EnvelopeKeySource;
  readonly nonce: Uint8Array;
  readonly plaintext: Uint8Array;
  readonly salt?: Uint8Array;
}): GeneratedEnvelope {
  const salt = input.salt ?? new Uint8Array();
  if (input.nonce.length !== 24) throw new Error("invalid synthetic nonce");
  const fields = { ...input.fields, ciphertextLength: input.plaintext.length + 16 };
  const fixedHeader = header(fields);
  const key = deriveEnvelopeKey(fields.kind as EnvelopeKind, fields, input.keySource, salt);
  const aad = concat(aadPrefix, fixedHeader, salt, input.nonce);
  const ciphertext = xchacha20poly1305(key, input.nonce, aad).encrypt(input.plaintext);
  return {
    envelope: concat(fixedHeader, salt, input.nonce, ciphertext),
    header: fixedHeader,
    key,
    nonce: input.nonce,
    plaintext: input.plaintext,
    salt,
  };
}

function canonicalWrapper(type: number, material: Uint8Array, fixedChild = false): Uint8Array {
  const prefix = concat(Uint8Array.of(type), Uint8Array.of(0, material.length), material);
  if (!fixedChild) return prefix;
  return concat(prefix, new Uint8Array(128 - material.length));
}

function canonicalPayload(plaintext: Uint8Array): Uint8Array {
  const paddedLength = Math.ceil((plaintext.length + 1) / 4096) * 4096;
  const output = new Uint8Array(paddedLength);
  output.set(plaintext);
  output[plaintext.length] = 0x80;
  return output;
}

function sequence(start: number, length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (start + index) & 0xff);
}

function keySourceJson(source: EnvelopeKeySource): GeneratedEnvelopeVector["input"]["keySource"] {
  return source.source === "password"
    ? { source: "password", password: toHex(source.material) }
    : { source: "parent", parentKey: toHex(source.material) };
}

function successVector(
  id: string,
  generated: GeneratedEnvelope,
  keySource: EnvelopeKeySource,
  output: Uint8Array,
): GeneratedEnvelopeVector {
  return {
    id,
    originatingRequirementId: id,
    operation: "envelope",
    input: { envelope: toHex(generated.envelope), keySource: keySourceJson(keySource) },
    parameters: {},
    expect: { outcome: "success", output: toHex(output) },
  };
}

function rejectionVector(
  id: string,
  envelope: Uint8Array,
  keySource: EnvelopeKeySource,
  error: Extract<GeneratedEnvelopeVector["expect"], { outcome: "reject" }>["error"],
): GeneratedEnvelopeVector {
  return {
    id,
    originatingRequirementId: id,
    operation: "envelope",
    input: { envelope: toHex(envelope), keySource: keySourceJson(keySource) },
    parameters: {},
    expect: { outcome: "reject", error },
  };
}

function mutated(value: Uint8Array, offset: number, replacement?: number): Uint8Array {
  const output = value.slice();
  output[offset] = replacement ?? (output[offset] ?? 0) ^ 0x01;
  return output;
}

/** Generates the exact Task-0005 Stage-1 envelope candidates from synthetic inputs. */
export function generateSyntheticEnvelopeCandidates(): readonly GeneratedEnvelopeVector[] {
  const accountId = sequence(1, 16);
  const rootObjectId = new Uint8Array(16);
  const mutationObjectId = sequence(0x11, 16);
  const vaultObjectId = sequence(0x21, 16);
  const itemObjectId = sequence(0x31, 16);
  const attachmentObjectId = sequence(0x41, 16);
  const indexObjectId = sequence(0x51, 16);
  const ark = sequence(0xa0, 32);
  const recoverySecret = sequence(0xc0, 32);
  const vaultKey = sequence(0x20, 32);
  const itemKey = sequence(0x40, 32);
  const attachmentKey = sequence(0x60, 32);
  const mutationMaterial = sequence(0x80, 64);
  const password = textEncoder.encode("synthetic neutron password");
  const passwordSource = { source: "password", material: password } as const;
  const recoverySource = { source: "parent", material: recoverySecret } as const;
  const arkSource = { source: "parent", material: ark } as const;
  const vaultSource = { source: "parent", material: vaultKey } as const;
  const itemSource = { source: "parent", material: itemKey } as const;
  const attachmentSource = { source: "parent", material: attachmentKey } as const;

  let nonceIndex = 0;
  const nextNonce = () => sequence(nonceIndex++, 24);
  const baseFields = { accountId, keyVersion: 1 } as const;
  const passwordRoot = encryptEnvelope({
    fields: {
      ...baseFields,
      kind: 0x01,
      objectId: rootObjectId,
      generation: 1n,
      passwordKdf: true,
    },
    keySource: passwordSource,
    salt: sequence(0xd0, 16),
    nonce: nextNonce(),
    plaintext: canonicalWrapper(0x01, ark),
  });
  const recoveryRoot = encryptEnvelope({
    fields: { ...baseFields, kind: 0x02, objectId: rootObjectId, generation: 1n },
    keySource: recoverySource,
    nonce: nextNonce(),
    plaintext: canonicalWrapper(0x01, ark),
  });
  const mutationChild = encryptEnvelope({
    fields: { ...baseFields, kind: 0x03, objectId: mutationObjectId, generation: 0n },
    keySource: arkSource,
    nonce: nextNonce(),
    plaintext: canonicalWrapper(0x02, mutationMaterial, true),
  });
  const vaultChild = encryptEnvelope({
    fields: { ...baseFields, kind: 0x03, objectId: vaultObjectId, generation: 0n },
    keySource: arkSource,
    nonce: nextNonce(),
    plaintext: canonicalWrapper(0x03, vaultKey, true),
  });
  const itemWrapper = encryptEnvelope({
    fields: { ...baseFields, kind: 0x04, objectId: itemObjectId, generation: 0n },
    keySource: vaultSource,
    nonce: nextNonce(),
    plaintext: canonicalWrapper(0x04, itemKey),
  });
  const attachmentWrapper = encryptEnvelope({
    fields: { ...baseFields, kind: 0x05, objectId: attachmentObjectId, generation: 0n },
    keySource: itemSource,
    nonce: nextNonce(),
    plaintext: canonicalWrapper(0x05, attachmentKey),
  });
  const itemPlaintext = textEncoder.encode("synthetic item payload");
  const blobPlaintext = sequence(0, 255);
  const indexPlaintext = textEncoder.encode("synthetic index shard");
  const itemPayload = encryptEnvelope({
    fields: { ...baseFields, kind: 0x10, objectId: itemObjectId, generation: 1n },
    keySource: itemSource,
    nonce: nextNonce(),
    plaintext: canonicalPayload(itemPlaintext),
  });
  const blobPayload = encryptEnvelope({
    fields: { ...baseFields, kind: 0x11, objectId: attachmentObjectId, generation: 0n },
    keySource: attachmentSource,
    nonce: nextNonce(),
    plaintext: canonicalPayload(blobPlaintext),
  });
  const indexPayload = encryptEnvelope({
    fields: { ...baseFields, kind: 0x12, objectId: indexObjectId, generation: 1n },
    keySource: vaultSource,
    nonce: nextNonce(),
    plaintext: canonicalPayload(indexPlaintext),
  });

  const noncanonicalChildPlaintext = canonicalWrapper(0x03, vaultKey, true);
  noncanonicalChildPlaintext[130] = 1;
  const noncanonicalChild = encryptEnvelope({
    fields: { ...baseFields, kind: 0x03, objectId: vaultObjectId, generation: 0n },
    keySource: arkSource,
    nonce: nextNonce(),
    plaintext: noncanonicalChildPlaintext,
  });
  const missingMarkerPayload = encryptEnvelope({
    fields: { ...baseFields, kind: 0x10, objectId: itemObjectId, generation: 1n },
    keySource: itemSource,
    nonce: nextNonce(),
    plaintext: new Uint8Array(4096),
  });

  const wrongKeySource = { source: "parent", material: sequence(0xe0, 32) } as const;
  const oversizedHeader = header({
    ...baseFields,
    kind: 0x10,
    objectId: itemObjectId,
    generation: 1n,
    ciphertextLength: 16_777_233,
  });
  const wrongPolicy = mutated(passwordRoot.envelope, 63, 0xff);
  const malformedLength = passwordRoot.envelope.slice();
  malformedLength.set(uint32be(52), 52);

  const zeroAccount = recoveryRoot.envelope.slice();
  zeroAccount.fill(0, 8, 24);
  const zeroNonRootObject = itemWrapper.envelope.slice();
  zeroNonRootObject.fill(0, 24, 40);
  const nonzeroRootObject = recoveryRoot.envelope.slice();
  nonzeroRootObject[39] = 1;
  const zeroKeyVersion = recoveryRoot.envelope.slice();
  zeroKeyVersion.fill(0, 40, 44);
  const zeroRootGeneration = recoveryRoot.envelope.slice();
  zeroRootGeneration.fill(0, 44, 52);
  const nonzeroChildGeneration = vaultChild.envelope.slice();
  nonzeroChildGeneration[51] = 1;
  const zeroItemGeneration = itemPayload.envelope.slice();
  zeroItemGeneration.fill(0, 44, 52);
  const zeroIndexGeneration = indexPayload.envelope.slice();
  zeroIndexGeneration.fill(0, 44, 52);
  const blobGenerationOverMaximum = blobPayload.envelope.slice();
  blobGenerationOverMaximum.set(uint64be(16_777_216n), 44);

  const authenticatedInvalidChildren = (
    id: string,
    plaintext: Uint8Array,
    error: "structure" | "unknown-critical-field",
  ) =>
    rejectionVector(
      id,
      encryptEnvelope({
        fields: { ...baseFields, kind: 0x03, objectId: vaultObjectId, generation: 0n },
        keySource: arkSource,
        nonce: nextNonce(),
        plaintext,
      }).envelope,
      arkSource,
      error,
    );
  const typeLengthMismatch = canonicalWrapper(0x03, sequence(0, 31), true);
  const zeroLengthChild = new Uint8Array(131);
  zeroLengthChild[0] = 0x02;
  const overLengthChild = new Uint8Array(131);
  overLengthChild.set([0x02, 0x00, 0x81]);
  const wrongChildCiphertextLength = vaultChild.envelope.slice(0, -1);
  wrongChildCiphertextLength.set(uint32be(146), 52);

  const oversizedBlobHeader = header({
    ...baseFields,
    kind: 0x11,
    objectId: attachmentObjectId,
    generation: 0n,
    ciphertextLength: 1_048_593,
  });
  const oversizedIndexHeader = header({
    ...baseFields,
    kind: 0x12,
    objectId: indexObjectId,
    generation: 1n,
    ciphertextLength: 65_553,
  });
  const nonMultiplePayloadHeader = header({
    ...baseFields,
    kind: 0x10,
    objectId: itemObjectId,
    generation: 1n,
    ciphertextLength: 4_113,
  });
  const belowMinimumPayloadHeader = header({
    ...baseFields,
    kind: 0x10,
    objectId: itemObjectId,
    generation: 1n,
    ciphertextLength: 4_111,
  });

  const hardeningVectors: GeneratedEnvelopeVector[] = [
    rejectionVector(
      "hardening-reject-bad-magic",
      mutated(recoveryRoot.envelope, 0, 0),
      recoverySource,
      "structure",
    ),
    rejectionVector("hardening-reject-zero-account-id", zeroAccount, recoverySource, "structure"),
    rejectionVector(
      "hardening-reject-nonroot-zero-object-id",
      zeroNonRootObject,
      vaultSource,
      "structure",
    ),
    rejectionVector(
      "hardening-reject-root-nonzero-object-id",
      nonzeroRootObject,
      recoverySource,
      "structure",
    ),
    rejectionVector("hardening-reject-zero-key-version", zeroKeyVersion, recoverySource, "bounds"),
    rejectionVector(
      "hardening-reject-zero-root-generation",
      zeroRootGeneration,
      recoverySource,
      "bounds",
    ),
    rejectionVector(
      "hardening-reject-nonzero-child-generation",
      nonzeroChildGeneration,
      arkSource,
      "bounds",
    ),
    rejectionVector(
      "hardening-reject-zero-item-generation",
      zeroItemGeneration,
      itemSource,
      "bounds",
    ),
    rejectionVector(
      "hardening-reject-zero-index-generation",
      zeroIndexGeneration,
      vaultSource,
      "bounds",
    ),
    rejectionVector(
      "hardening-reject-blob-generation-over-maximum",
      blobGenerationOverMaximum,
      attachmentSource,
      "bounds",
    ),
    rejectionVector(
      "hardening-reject-wrong-nonce-length",
      mutated(recoveryRoot.envelope, 69, 23),
      recoverySource,
      "structure",
    ),
    rejectionVector(
      "hardening-reject-nonpassword-kdf-field",
      mutated(recoveryRoot.envelope, 56, 1),
      recoverySource,
      "unknown-critical-field",
    ),
    authenticatedInvalidChildren(
      "hardening-reject-unknown-child-material-type",
      canonicalWrapper(0xff, vaultKey, true),
      "unknown-critical-field",
    ),
    authenticatedInvalidChildren(
      "hardening-reject-child-type-length-mismatch",
      typeLengthMismatch,
      "structure",
    ),
    authenticatedInvalidChildren(
      "hardening-reject-child-zero-material-length",
      zeroLengthChild,
      "structure",
    ),
    authenticatedInvalidChildren(
      "hardening-reject-child-over-material-length",
      overLengthChild,
      "structure",
    ),
    rejectionVector(
      "hardening-reject-child-ciphertext-length",
      wrongChildCiphertextLength,
      arkSource,
      "bounds",
    ),
    rejectionVector(
      "hardening-reject-wrapper-purpose-substitution",
      mutated(itemWrapper.envelope, 5, 0x05),
      vaultSource,
      "authentication",
    ),
    rejectionVector(
      "hardening-reject-wrapper-flags",
      mutated(recoveryRoot.envelope, 7, 1),
      recoverySource,
      "unknown-critical-field",
    ),
    rejectionVector(
      "hardening-reject-payload-flags",
      mutated(itemPayload.envelope, 7, 0),
      itemSource,
      "unknown-critical-field",
    ),
    rejectionVector(
      "hardening-reject-reserved-b",
      mutated(recoveryRoot.envelope, 70, 1),
      recoverySource,
      "unknown-critical-field",
    ),
    rejectionVector(
      "hardening-reject-kdf-id",
      mutated(passwordRoot.envelope, 56, 2),
      passwordSource,
      "kdf-policy",
    ),
    rejectionVector(
      "hardening-reject-kdf-version",
      mutated(passwordRoot.envelope, 57, 0x12),
      passwordSource,
      "kdf-policy",
    ),
    rejectionVector(
      "hardening-reject-kdf-parallelism",
      mutated(passwordRoot.envelope, 58, 2),
      passwordSource,
      "kdf-policy",
    ),
    rejectionVector(
      "hardening-reject-kdf-iterations",
      mutated(passwordRoot.envelope, 67, 2),
      passwordSource,
      "kdf-policy",
    ),
    rejectionVector(
      "hardening-reject-kdf-salt-length",
      mutated(passwordRoot.envelope, 68, 15),
      passwordSource,
      "kdf-policy",
    ),
    rejectionVector(
      "hardening-reject-object-aad-substitution",
      mutated(itemPayload.envelope, 24),
      itemSource,
      "authentication",
    ),
    rejectionVector(
      "hardening-reject-key-version-aad-substitution",
      mutated(itemPayload.envelope, 43, 2),
      itemSource,
      "authentication",
    ),
    rejectionVector(
      "hardening-reject-generation-aad-substitution",
      mutated(itemPayload.envelope, 51, 2),
      itemSource,
      "authentication",
    ),
    rejectionVector(
      "hardening-reject-ciphertext-byte-mutation",
      mutated(recoveryRoot.envelope, 96),
      recoverySource,
      "authentication",
    ),
    rejectionVector(
      "hardening-reject-short-fixed-header",
      recoveryRoot.envelope.slice(0, 71),
      recoverySource,
      "structure",
    ),
    rejectionVector(
      "hardening-reject-oversized-blob",
      concat(oversizedBlobHeader, sequence(0, 24)),
      attachmentSource,
      "bounds",
    ),
    rejectionVector(
      "hardening-reject-oversized-index",
      concat(oversizedIndexHeader, sequence(0, 24)),
      vaultSource,
      "bounds",
    ),
    rejectionVector(
      "hardening-reject-payload-nonmultiple-length",
      concat(nonMultiplePayloadHeader, sequence(0xb0, 24), new Uint8Array(4_113)),
      itemSource,
      "bounds",
    ),
    rejectionVector(
      "hardening-reject-payload-below-minimum",
      concat(belowMinimumPayloadHeader, sequence(0xc8, 24), new Uint8Array(4_111)),
      itemSource,
      "bounds",
    ),
  ];

  return [
    successVector("envelope-password-root-wrapper", passwordRoot, passwordSource, ark),
    successVector("envelope-recovery-root-wrapper", recoveryRoot, recoverySource, ark),
    successVector(
      "envelope-ark-mutation-child-fixed-padding",
      mutationChild,
      arkSource,
      mutationMaterial,
    ),
    successVector("envelope-ark-vault-child-fixed-padding", vaultChild, arkSource, vaultKey),
    successVector("envelope-vault-item-wrapper", itemWrapper, vaultSource, itemKey),
    successVector("envelope-item-attachment-wrapper", attachmentWrapper, itemSource, attachmentKey),
    successVector(
      "envelope-item-payload-canonical-padding",
      itemPayload,
      itemSource,
      itemPlaintext,
    ),
    successVector(
      "envelope-blob-payload-canonical-padding",
      blobPayload,
      attachmentSource,
      blobPlaintext,
    ),
    successVector(
      "envelope-index-payload-canonical-padding",
      indexPayload,
      vaultSource,
      indexPlaintext,
    ),
    rejectionVector(
      "reject-unknown-envelope-version",
      mutated(recoveryRoot.envelope, 4, 2),
      recoverySource,
      "unsupported-version",
    ),
    rejectionVector(
      "reject-unknown-envelope-suite",
      mutated(recoveryRoot.envelope, 6, 2),
      recoverySource,
      "unsupported-suite",
    ),
    rejectionVector(
      "reject-wrong-envelope-kind",
      mutated(recoveryRoot.envelope, 5, 0xff),
      recoverySource,
      "unknown-critical-field",
    ),
    rejectionVector(
      "reject-flags-and-reserved-fields",
      mutated(recoveryRoot.envelope, 59, 1),
      recoverySource,
      "unknown-critical-field",
    ),
    rejectionVector("reject-wrong-argon2id-policy", wrongPolicy, passwordSource, "kdf-policy"),
    rejectionVector(
      "reject-ark-child-nonzero-padding",
      noncanonicalChild.envelope,
      arkSource,
      "padding",
    ),
    rejectionVector(
      "reject-payload-missing-padding-marker",
      missingMarkerPayload.envelope,
      itemSource,
      "padding",
    ),
    rejectionVector(
      "reject-wrong-key-authentication",
      recoveryRoot.envelope,
      wrongKeySource,
      "authentication",
    ),
    rejectionVector(
      "reject-wrong-aad-authentication",
      mutated(recoveryRoot.envelope, 8),
      recoverySource,
      "authentication",
    ),
    rejectionVector(
      "reject-mutated-ciphertext-authentication",
      mutated(recoveryRoot.envelope, recoveryRoot.envelope.length - 1),
      recoverySource,
      "authentication",
    ),
    rejectionVector(
      "reject-truncated-envelope",
      recoveryRoot.envelope.slice(0, -1),
      recoverySource,
      "structure",
    ),
    rejectionVector(
      "reject-extended-envelope",
      concat(recoveryRoot.envelope, Uint8Array.of(0)),
      recoverySource,
      "structure",
    ),
    rejectionVector(
      "reject-malformed-ciphertext-length",
      malformedLength,
      passwordSource,
      "structure",
    ),
    rejectionVector(
      "reject-oversized-envelope",
      concat(oversizedHeader, sequence(0, 24)),
      itemSource,
      "bounds",
    ),
    ...hardeningVectors,
  ];
}

interface GeneratedMigrationVector {
  readonly id: string;
  readonly originatingRequirementId: string;
  readonly operation: "migration";
  readonly input: Readonly<Record<string, unknown>>;
  readonly parameters: Readonly<Record<string, never>>;
  readonly expect:
    | Readonly<{ outcome: "success"; output: string }>
    | Readonly<{ outcome: "reject"; error: "authentication" | "padding" }>;
}

function envelopeBundle(envelopes: readonly Uint8Array[]): Uint8Array {
  return concat(...envelopes.flatMap((envelope) => [uint32be(envelope.length), envelope]));
}

/** Generates crypto-only ARK migration candidates; account-state activation is intentionally absent. */
export function generateSyntheticMigrationCandidates(): readonly GeneratedMigrationVector[] {
  const accountId = sequence(1, 16);
  const mutationObjectId = sequence(0x11, 16);
  const vaultObjectId = sequence(0x21, 16);
  const itemObjectId = sequence(0x31, 16);
  const attachmentObjectId = sequence(0x41, 16);
  const indexObjectId = sequence(0x51, 16);
  const oldArk = sequence(0xa0, 32);
  const newArk = sequence(0x01, 32);
  const wrongOldArk = sequence(0xe0, 32);
  const mutationMaterial = sequence(0x80, 64);
  const vaultKey = sequence(0x20, 32);
  const oldArkSource = { source: "parent", material: oldArk } as const;
  const newArkSource = { source: "parent", material: newArk } as const;
  const common = { accountId, keyVersion: 1 } as const;

  const oldMutation = encryptEnvelope({
    fields: { ...common, kind: 0x03, objectId: mutationObjectId, generation: 0n },
    keySource: oldArkSource,
    nonce: sequence(0x20, 24),
    plaintext: canonicalWrapper(0x02, mutationMaterial, true),
  });
  const oldVault = encryptEnvelope({
    fields: { ...common, kind: 0x03, objectId: vaultObjectId, generation: 0n },
    keySource: oldArkSource,
    nonce: sequence(0x40, 24),
    plaintext: canonicalWrapper(0x03, vaultKey, true),
  });
  const newMutationNonce = sequence(0x60, 24);
  const newVaultNonce = sequence(0x80, 24);
  const newMutation = encryptEnvelope({
    fields: { ...common, kind: 0x03, objectId: mutationObjectId, generation: 0n },
    keySource: newArkSource,
    nonce: newMutationNonce,
    plaintext: canonicalWrapper(0x02, mutationMaterial, true),
  });
  const newVault = encryptEnvelope({
    fields: { ...common, kind: 0x03, objectId: vaultObjectId, generation: 0n },
    keySource: newArkSource,
    nonce: newVaultNonce,
    plaintext: canonicalWrapper(0x03, vaultKey, true),
  });
  const minimumInput = {
    action: "minimum-child-rewrap",
    oldArk: toHex(oldArk),
    newArk: toHex(newArk),
    children: [
      { oldEnvelope: toHex(oldMutation.envelope), newNonce: toHex(newMutationNonce) },
      { oldEnvelope: toHex(oldVault.envelope), newNonce: toHex(newVaultNonce) },
    ],
  } as const;

  const malformedPlaintext = canonicalWrapper(0x03, vaultKey, true);
  malformedPlaintext[130] = 1;
  const malformedChild = encryptEnvelope({
    fields: { ...common, kind: 0x03, objectId: vaultObjectId, generation: 0n },
    keySource: oldArkSource,
    nonce: sequence(0xa0, 24),
    plaintext: malformedPlaintext,
  });

  const rotatedMutation = sequence(0x90, 64);
  const rotatedVaultKey = sequence(0x30, 32);
  const rotatedItemKey = sequence(0x50, 32);
  const rotatedAttachmentKey = sequence(0x70, 32);
  const itemPlaintext = textEncoder.encode("fully rotated synthetic item");
  const blobPlaintext = sequence(0x10, 257);
  const indexPlaintext = textEncoder.encode("fully rotated synthetic index");
  const rotationNonces = {
    mutationChild: sequence(0x01, 24),
    vaultChild: sequence(0x19, 24),
    itemWrapper: sequence(0x31, 24),
    attachmentWrapper: sequence(0x49, 24),
    itemPayload: sequence(0x61, 24),
    blobPayload: sequence(0x79, 24),
    indexPayload: sequence(0x91, 24),
  } as const;
  const version = 2;
  const rotatedArkSource = { source: "parent", material: newArk } as const;
  const rotatedVaultSource = { source: "parent", material: rotatedVaultKey } as const;
  const rotatedItemSource = { source: "parent", material: rotatedItemKey } as const;
  const rotatedAttachmentSource = {
    source: "parent",
    material: rotatedAttachmentKey,
  } as const;
  const rotationFields = { accountId, keyVersion: version } as const;
  const rotatedEnvelopes = [
    encryptEnvelope({
      fields: {
        ...rotationFields,
        kind: 0x03,
        objectId: mutationObjectId,
        generation: 0n,
      },
      keySource: rotatedArkSource,
      nonce: rotationNonces.mutationChild,
      plaintext: canonicalWrapper(0x02, rotatedMutation, true),
    }).envelope,
    encryptEnvelope({
      fields: { ...rotationFields, kind: 0x03, objectId: vaultObjectId, generation: 0n },
      keySource: rotatedArkSource,
      nonce: rotationNonces.vaultChild,
      plaintext: canonicalWrapper(0x03, rotatedVaultKey, true),
    }).envelope,
    encryptEnvelope({
      fields: { ...rotationFields, kind: 0x04, objectId: itemObjectId, generation: 0n },
      keySource: rotatedVaultSource,
      nonce: rotationNonces.itemWrapper,
      plaintext: canonicalWrapper(0x04, rotatedItemKey),
    }).envelope,
    encryptEnvelope({
      fields: { ...rotationFields, kind: 0x05, objectId: attachmentObjectId, generation: 0n },
      keySource: rotatedItemSource,
      nonce: rotationNonces.attachmentWrapper,
      plaintext: canonicalWrapper(0x05, rotatedAttachmentKey),
    }).envelope,
    encryptEnvelope({
      fields: { ...rotationFields, kind: 0x10, objectId: itemObjectId, generation: 1n },
      keySource: rotatedItemSource,
      nonce: rotationNonces.itemPayload,
      plaintext: canonicalPayload(itemPlaintext),
    }).envelope,
    encryptEnvelope({
      fields: { ...rotationFields, kind: 0x11, objectId: attachmentObjectId, generation: 0n },
      keySource: rotatedAttachmentSource,
      nonce: rotationNonces.blobPayload,
      plaintext: canonicalPayload(blobPlaintext),
    }).envelope,
    encryptEnvelope({
      fields: { ...rotationFields, kind: 0x12, objectId: indexObjectId, generation: 1n },
      keySource: rotatedVaultSource,
      nonce: rotationNonces.indexPayload,
      plaintext: canonicalPayload(indexPlaintext),
    }).envelope,
  ];
  const fullRotationInput = {
    action: "full-descendant-rotation",
    accountId: toHex(accountId),
    newArk: toHex(newArk),
    newKeyVersion: version,
    objectIds: {
      mutation: toHex(mutationObjectId),
      vault: toHex(vaultObjectId),
      item: toHex(itemObjectId),
      attachment: toHex(attachmentObjectId),
      index: toHex(indexObjectId),
    },
    materials: {
      mutation: toHex(rotatedMutation),
      vaultKey: toHex(rotatedVaultKey),
      itemKey: toHex(rotatedItemKey),
      attachmentKey: toHex(rotatedAttachmentKey),
      itemPlaintext: toHex(itemPlaintext),
      blobPlaintext: toHex(blobPlaintext),
      indexPlaintext: toHex(indexPlaintext),
    },
    nonces: Object.fromEntries(
      Object.entries(rotationNonces).map(([name, nonce]) => [name, toHex(nonce)]),
    ),
  } as const;

  return [
    {
      id: "migration-minimum-ark-rewrap-success",
      originatingRequirementId: "migration-minimum-ark-rewrap-success",
      operation: "migration",
      input: minimumInput,
      parameters: {},
      expect: {
        outcome: "success",
        output: toHex(envelopeBundle([newMutation.envelope, newVault.envelope])),
      },
    },
    {
      id: "migration-reject-malformed-child",
      originatingRequirementId: "migration-reject-malformed-child",
      operation: "migration",
      input: {
        ...minimumInput,
        children: [
          minimumInput.children[0],
          { oldEnvelope: toHex(malformedChild.envelope), newNonce: toHex(newVaultNonce) },
        ],
      },
      parameters: {},
      expect: { outcome: "reject", error: "padding" },
    },
    {
      id: "migration-reject-wrong-old-ark",
      originatingRequirementId: "migration-reject-wrong-old-ark",
      operation: "migration",
      input: { ...minimumInput, oldArk: toHex(wrongOldArk) },
      parameters: {},
      expect: { outcome: "reject", error: "authentication" },
    },
    {
      id: "migration-full-rotation-is-distinct",
      originatingRequirementId: "migration-full-rotation-is-distinct",
      operation: "migration",
      input: fullRotationInput,
      parameters: {},
      expect: { outcome: "success", output: toHex(envelopeBundle(rotatedEnvelopes)) },
    },
  ];
}

export function generateSyntheticXChaChaCandidate(input: {
  readonly aad: string;
  readonly key: string;
  readonly nonce: string;
  readonly plaintext: string;
}): { readonly ciphertext: string; readonly decrypted: string } {
  const cipher = xchacha20poly1305(fromHex(input.key), fromHex(input.nonce), fromHex(input.aad));
  const ciphertext = cipher.encrypt(fromHex(input.plaintext));
  return { ciphertext: toHex(ciphertext), decrypted: toHex(cipher.decrypt(ciphertext)) };
}

export function generateSyntheticHkdfCandidate(input: {
  readonly ikm: string;
  readonly info: string;
  readonly length: number;
  readonly salt: string;
}): string {
  return toHex(
    hkdf(sha256, fromHex(input.ikm), fromHex(input.salt), fromHex(input.info), input.length),
  );
}

export function generateSyntheticArgon2idCandidate(input: {
  readonly password: string;
  readonly salt: string;
}): string {
  return toHex(
    argon2id(fromHex(input.password), fromHex(input.salt), { t: 3, m: 65536, p: 1, dkLen: 32 }),
  );
}
