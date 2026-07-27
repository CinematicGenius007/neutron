import { createLibsodiumProvider } from "@neutron/crypto";
import {
  encodePasswordScalars,
  encodePasswordUtf16Be,
  incrementGeneration,
  openEnvelope,
  validateGeneration,
} from "@neutron/protocol";
import {
  type EnvelopeSealInput,
  encodeEnvelopeBundle,
  sealEnvelopeWithEntropy,
} from "../../protocol/src/envelope.js";
import { minimumArkRewrapWithNonces } from "../../protocol/src/migration.js";

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

function fromHex(value: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})*$/.test(value)) throw new Error("invalid catalog hex");
  return Uint8Array.from(value.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));
}

function toHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function password(request: Extract<VectorRequest, { operation: "password-encoding" }>): Uint8Array {
  if ("utf16be" in request.input) return encodePasswordUtf16Be(fromHex(request.input.utf16be));
  if ("scalars" in request.input) return encodePasswordScalars(request.input.scalars);
  return encodePasswordScalars(
    Array.from({ length: request.input.repeatCount }, () => request.input.repeatScalar),
  );
}

function generation(request: StateGenerationRequest): VectorObservation {
  const value =
    request.input.action === "validate"
      ? validateGeneration(request.input.kind, request.input.candidateGeneration)
      : incrementGeneration(request.input.kind, request.input.currentGeneration);
  return { outcome: "success", state: { generation: value } };
}

async function envelope(request: EnvelopeRequest): Promise<VectorObservation> {
  const provider = await createLibsodiumProvider();
  const source =
    request.input.keySource.source === "password"
      ? { password: fromHex(request.input.keySource.password), source: "password" as const }
      : { parentKey: fromHex(request.input.keySource.parentKey), source: "parent" as const };
  const opened = openEnvelope(provider, fromHex(request.input.envelope), source);
  return {
    outcome: "success",
    output: toHex(
      opened.content.type === "payload" ? opened.content.plaintext : opened.content.material,
    ),
  };
}

async function minimumMigration(request: MinimumMigrationRequest): Promise<VectorObservation> {
  const provider = await createLibsodiumProvider();
  const replacements = minimumArkRewrapWithNonces(
    provider,
    {
      children: request.input.children.map(({ oldEnvelope }) => ({
        oldEnvelope: fromHex(oldEnvelope),
      })),
      newArk: fromHex(request.input.newArk),
      oldArk: fromHex(request.input.oldArk),
    },
    request.input.children.map(({ newNonce }) => fromHex(newNonce)),
  );
  return { outcome: "success", output: toHex(encodeEnvelopeBundle(replacements)) };
}

function rotationSealInputs(request: FullRotationRequest): readonly {
  readonly input: EnvelopeSealInput;
  readonly nonce: Uint8Array;
}[] {
  const value = request.input;
  const accountId = fromHex(value.accountId);
  const ark = fromHex(value.newArk);
  const vault = fromHex(value.materials.vaultKey);
  const item = fromHex(value.materials.itemKey);
  const attachment = fromHex(value.materials.attachmentKey);
  const version = value.newKeyVersion;
  const entry = (
    kind: EnvelopeSealInput["kind"],
    objectId: string,
    parentKey: Uint8Array,
    nonce: string,
    content: EnvelopeSealInput["content"],
    generation: bigint,
  ) => ({
    input: {
      accountId,
      content,
      generation,
      keySource: { parentKey, source: "parent" as const },
      keyVersion: version,
      kind,
      objectId: fromHex(objectId),
    },
    nonce: fromHex(nonce),
  });
  return [
    entry(
      0x03,
      value.objectIds.mutation,
      ark,
      value.nonces.mutationChild,
      { material: fromHex(value.materials.mutation), materialType: 0x02, type: "key-material" },
      0n,
    ),
    entry(
      0x03,
      value.objectIds.vault,
      ark,
      value.nonces.vaultChild,
      { material: vault, materialType: 0x03, type: "key-material" },
      0n,
    ),
    entry(
      0x04,
      value.objectIds.item,
      vault,
      value.nonces.itemWrapper,
      { material: item, materialType: 0x04, type: "key-material" },
      0n,
    ),
    entry(
      0x05,
      value.objectIds.attachment,
      item,
      value.nonces.attachmentWrapper,
      { material: attachment, materialType: 0x05, type: "key-material" },
      0n,
    ),
    entry(
      0x10,
      value.objectIds.item,
      item,
      value.nonces.itemPayload,
      { plaintext: fromHex(value.materials.itemPlaintext), type: "payload" },
      1n,
    ),
    entry(
      0x11,
      value.objectIds.attachment,
      attachment,
      value.nonces.blobPayload,
      { plaintext: fromHex(value.materials.blobPlaintext), type: "payload" },
      0n,
    ),
    entry(
      0x12,
      value.objectIds.index,
      vault,
      value.nonces.indexPayload,
      { plaintext: fromHex(value.materials.indexPlaintext), type: "payload" },
      1n,
    ),
  ];
}

async function fullRotation(request: FullRotationRequest): Promise<VectorObservation> {
  const provider = await createLibsodiumProvider();
  const envelopes = rotationSealInputs(request).map(({ input, nonce }) =>
    sealEnvelopeWithEntropy(provider, input, nonce),
  );
  return { outcome: "success", output: toHex(encodeEnvelopeBundle(envelopes)) };
}

async function verify(request: VectorRequest): Promise<VectorObservation> {
  try {
    switch (request.operation) {
      case "hkdf-sha256": {
        const provider = await createLibsodiumProvider();
        return {
          outcome: "success",
          output: toHex(
            provider.deriveHkdfSha256({
              ikm: fromHex(request.input.ikm),
              info: fromHex(request.input.info),
              length: request.parameters.length,
              salt: fromHex(request.input.salt),
            }),
          ),
        };
      }
      case "argon2id": {
        const provider = await createLibsodiumProvider();
        return {
          outcome: "success",
          output: toHex(
            provider.deriveArgon2idKey(
              fromHex(request.input.password),
              fromHex(request.input.salt),
            ),
          ),
        };
      }
      case "password-encoding":
        return { outcome: "success", output: toHex(password(request)) };
      case "state-generation":
        return generation(request);
      case "envelope":
        return await envelope(request);
      case "migration":
        return request.input.action === "minimum-child-rewrap"
          ? await minimumMigration(request)
          : await fullRotation(request);
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "EnvelopeFailure" &&
      "code" in error &&
      typeof error.code === "string"
    )
      return { error: error.code as VectorError, outcome: "reject" };
    throw error;
  }
}

export const productionCodecVerifier: VectorVerifier = { verify };
