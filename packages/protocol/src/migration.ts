import type { CryptoProvider } from "@neutron/crypto";
import {
  copyProviderOutput,
  ENVELOPE_KIND,
  type EnvelopeSealInput,
  openEnvelopeInternal,
  sealEnvelopeWithEntropy,
} from "./envelope.js";
import { EnvelopeFailure } from "./errors.js";

export interface ArkChildToRewrap {
  readonly oldEnvelope: Uint8Array;
}

export interface MinimumArkRewrapInput {
  readonly children: readonly ArkChildToRewrap[];
  readonly newArk: Uint8Array;
  readonly oldArk: Uint8Array;
}

interface ValidatedChild {
  readonly canonicalPlaintext: Uint8Array;
  readonly input: EnvelopeSealInput;
  readonly material: Uint8Array;
}

function validateArk(value: unknown): asserts value is Uint8Array {
  if (
    !(value instanceof Uint8Array) ||
    (typeof SharedArrayBuffer !== "undefined" && value.buffer instanceof SharedArrayBuffer) ||
    value.length !== 32
  )
    throw new EnvelopeFailure("structure");
}

function validateAllChildren(
  provider: CryptoProvider,
  input: MinimumArkRewrapInput,
): ValidatedChild[] {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    throw new EnvelopeFailure("structure");
  validateArk(input.oldArk);
  validateArk(input.newArk);
  if (!Array.isArray(input.children) || input.children.length === 0)
    throw new EnvelopeFailure("structure");
  const validated: ValidatedChild[] = [];
  try {
    for (const child of input.children) {
      if (!(child.oldEnvelope instanceof Uint8Array)) throw new EnvelopeFailure("structure");
      const opened = openEnvelopeInternal(provider, child.oldEnvelope, {
        source: "parent",
        parentKey: input.oldArk,
      });
      if (opened.header.kind !== ENVELOPE_KIND.ARK_CHILD) {
        provider.clear(opened.canonicalPlaintext);
        throw new EnvelopeFailure("structure");
      }
      if (opened.content.type !== "key-material") {
        provider.clear(opened.canonicalPlaintext);
        throw new EnvelopeFailure("structure");
      }
      const materialType = opened.content.materialType;
      validated.push({
        canonicalPlaintext: opened.canonicalPlaintext,
        input: {
          accountId: opened.header.accountId,
          content: { material: opened.content.material, materialType, type: "key-material" },
          generation: 0n,
          keySource: { parentKey: input.newArk, source: "parent" },
          keyVersion: opened.header.keyVersion,
          kind: ENVELOPE_KIND.ARK_CHILD,
          objectId: opened.header.objectId,
        },
        material: opened.content.material,
      });
    }
    return validated;
  } catch (error) {
    for (const child of validated) {
      provider.clear(child.canonicalPlaintext);
      provider.clear(child.material);
    }
    throw error;
  }
}

export function minimumArkRewrapWithNonces(
  provider: CryptoProvider,
  input: MinimumArkRewrapInput,
  nonces: readonly Uint8Array[],
): readonly Uint8Array[] {
  const validated = validateAllChildren(provider, input);
  try {
    if (nonces.length !== validated.length) throw new EnvelopeFailure("structure");
    return validated.map((child, index) => {
      const nonce = nonces[index];
      if (nonce === undefined) throw new EnvelopeFailure("structure");
      return sealEnvelopeWithEntropy(provider, child.input, nonce);
    });
  } finally {
    for (const child of validated) {
      provider.clear(child.canonicalPlaintext);
      provider.clear(child.material);
    }
  }
}

export function minimumArkRewrap(
  provider: CryptoProvider,
  input: MinimumArkRewrapInput,
): readonly Uint8Array[] {
  const validated = validateAllChildren(provider, input);
  const nonces: Uint8Array[] = [];
  try {
    const protectedInputs = [
      input.oldArk,
      input.newArk,
      ...input.children.map((child) => child.oldEnvelope),
      ...validated.flatMap((child) => [child.canonicalPlaintext, child.material]),
    ];
    for (let index = 0; index < validated.length; index += 1) {
      nonces.push(copyProviderOutput(provider, provider.randomBytes(24), 24, protectedInputs));
    }
    return validated.map((child, index) => {
      const nonce = nonces[index];
      if (nonce === undefined) throw new EnvelopeFailure("structure");
      return sealEnvelopeWithEntropy(provider, child.input, nonce);
    });
  } finally {
    for (const nonce of nonces) provider.clear(nonce);
    for (const child of validated) {
      provider.clear(child.canonicalPlaintext);
      provider.clear(child.material);
    }
  }
}
