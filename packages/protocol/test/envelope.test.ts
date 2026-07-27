import { readFileSync } from "node:fs";

import { type CryptoProvider, createLibsodiumProvider } from "@neutron/crypto";
import { describe, expect, it } from "vitest";
import { sealEnvelopeWithEntropy } from "../src/envelope.js";
import {
  ENVELOPE_KIND,
  EnvelopeFailure,
  encodePasswordString,
  minimumArkRewrap,
  openEnvelope,
  sealEnvelope,
} from "../src/index.js";

function countingProvider(provider: CryptoProvider, fastArgon = false) {
  const calls = { aead: 0, argon: 0, hkdf: 0, random: 0 };
  const wrapped: CryptoProvider = {
    name: provider.name,
    sodiumVersion: provider.sodiumVersion,
    clear: (value) => provider.clear(value),
    decryptXChaCha20Poly1305: (input) => {
      calls.aead += 1;
      return provider.decryptXChaCha20Poly1305(input);
    },
    deriveArgon2idKey: (password, salt) => {
      calls.argon += 1;
      if (fastArgon) return new Uint8Array(32);
      return provider.deriveArgon2idKey(password, salt);
    },
    deriveHkdfSha256: (input) => {
      calls.hkdf += 1;
      return provider.deriveHkdfSha256(input);
    },
    encryptXChaCha20Poly1305: (input) => {
      calls.aead += 1;
      return provider.encryptXChaCha20Poly1305(input);
    },
    randomBytes: (length) => {
      calls.random += 1;
      return provider.randomBytes(length);
    },
  };
  return { calls, provider: wrapped };
}

function overrideProvider(
  provider: CryptoProvider,
  overrides: Partial<CryptoProvider>,
): CryptoProvider {
  return {
    name: provider.name,
    sodiumVersion: provider.sodiumVersion,
    clear: overrides.clear ?? ((value) => provider.clear(value)),
    decryptXChaCha20Poly1305:
      overrides.decryptXChaCha20Poly1305 ?? ((input) => provider.decryptXChaCha20Poly1305(input)),
    deriveArgon2idKey:
      overrides.deriveArgon2idKey ??
      ((password, salt) => provider.deriveArgon2idKey(password, salt)),
    deriveHkdfSha256: overrides.deriveHkdfSha256 ?? ((input) => provider.deriveHkdfSha256(input)),
    encryptXChaCha20Poly1305:
      overrides.encryptXChaCha20Poly1305 ?? ((input) => provider.encryptXChaCha20Poly1305(input)),
    randomBytes: overrides.randomBytes ?? ((length) => provider.randomBytes(length)),
  };
}

function fromHex(value: string): Uint8Array {
  return Uint8Array.from(value.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));
}

const preCryptoRejections = new Set([
  "reject-unknown-envelope-version",
  "reject-unknown-envelope-suite",
  "reject-wrong-envelope-kind",
  "reject-flags-and-reserved-fields",
  "reject-wrong-argon2id-policy",
  "reject-truncated-envelope",
  "reject-extended-envelope",
  "reject-malformed-ciphertext-length",
  "reject-oversized-envelope",
  "hardening-reject-bad-magic",
  "hardening-reject-zero-account-id",
  "hardening-reject-nonroot-zero-object-id",
  "hardening-reject-root-nonzero-object-id",
  "hardening-reject-zero-key-version",
  "hardening-reject-zero-root-generation",
  "hardening-reject-nonzero-child-generation",
  "hardening-reject-zero-item-generation",
  "hardening-reject-zero-index-generation",
  "hardening-reject-blob-generation-over-maximum",
  "hardening-reject-wrong-nonce-length",
  "hardening-reject-nonpassword-kdf-field",
  "hardening-reject-child-ciphertext-length",
  "hardening-reject-wrapper-flags",
  "hardening-reject-payload-flags",
  "hardening-reject-reserved-b",
  "hardening-reject-kdf-id",
  "hardening-reject-kdf-version",
  "hardening-reject-kdf-parallelism",
  "hardening-reject-kdf-iterations",
  "hardening-reject-kdf-salt-length",
  "hardening-reject-oversized-blob",
  "hardening-reject-oversized-index",
  "hardening-reject-payload-nonmultiple-length",
  "hardening-reject-payload-below-minimum",
]);

describe("canonical v1 envelope", () => {
  it("rejects structure before any KDF or AEAD call", async () => {
    const counted = countingProvider(await createLibsodiumProvider());
    expect(() =>
      openEnvelope(counted.provider, new Uint8Array(71), {
        parentKey: new Uint8Array(32),
        source: "parent",
      }),
    ).toThrowError(expect.objectContaining({ code: "structure" }));
    expect(counted.calls).toEqual({ aead: 0, argon: 0, hkdf: 0, random: 0 });
  });

  it("rejects every catalogued pre-auth mutation before primitive calls", async () => {
    const catalog = JSON.parse(
      readFileSync(
        new URL("../../test-vectors/fixtures/crypto-envelope-v1.json", import.meta.url),
        "utf8",
      ),
    ) as {
      cases: Array<{
        id: string;
        input: {
          envelope: string;
          keySource:
            | { source: "parent"; parentKey: string }
            | { source: "password"; password: string };
        };
      }>;
    };
    const cases = catalog.cases.filter(({ id }) => preCryptoRejections.has(id));
    expect(cases).toHaveLength(preCryptoRejections.size);
    const base = await createLibsodiumProvider();
    for (const vector of cases) {
      const counted = countingProvider(base);
      const source =
        vector.input.keySource.source === "password"
          ? {
              password: fromHex(vector.input.keySource.password),
              source: "password" as const,
            }
          : {
              parentKey: fromHex(vector.input.keySource.parentKey),
              source: "parent" as const,
            };
      expect(
        () => openEnvelope(counted.provider, fromHex(vector.input.envelope), source),
        vector.id,
      ).toThrowError(EnvelopeFailure);
      expect(counted.calls, vector.id).toEqual({ aead: 0, argon: 0, hkdf: 0, random: 0 });
    }
  });

  it("uses provider entropy for both password salt and nonce and round-trips", async () => {
    const counted = countingProvider(await createLibsodiumProvider(), true);
    const password = encodePasswordString("correct horse battery staple");
    const ark = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    const envelope = sealEnvelope(counted.provider, {
      accountId: Uint8Array.from({ length: 16 }, (_, index) => index + 1),
      content: { material: ark, materialType: 0x01, type: "key-material" },
      generation: 1n,
      keySource: { password, source: "password" },
      keyVersion: 1,
      kind: ENVELOPE_KIND.PASSWORD_ARK,
      objectId: new Uint8Array(16),
    });
    expect(counted.calls.random).toBe(2);
    const opened = openEnvelope(counted.provider, envelope, { password, source: "password" });
    expect(opened.content).toEqual({ material: ark, materialType: 0x01, type: "key-material" });
  }, 30_000);

  it("rejects unpaired UTF-16 surrogates without replacement", () => {
    expect(() => encodePasswordString("before\ud800after")).toThrowError(
      expect.objectContaining({ code: "invalid-password-encoding" }),
    );
  });

  it("validates every old child before drawing migration entropy", async () => {
    const base = await createLibsodiumProvider();
    const oldArk = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    const newArk = Uint8Array.from({ length: 32 }, (_, index) => 255 - index);
    const valid = sealEnvelopeWithEntropy(
      base,
      {
        accountId: Uint8Array.from({ length: 16 }, (_, index) => index + 1),
        content: {
          material: Uint8Array.from({ length: 32 }, (_, index) => index + 33),
          materialType: 0x03,
          type: "key-material",
        },
        generation: 0n,
        keySource: { parentKey: oldArk, source: "parent" },
        keyVersion: 1,
        kind: ENVELOPE_KIND.ARK_CHILD,
        objectId: Uint8Array.from({ length: 16 }, (_, index) => index + 17),
      },
      new Uint8Array(24),
    );
    const invalid = valid.slice();
    invalid[invalid.length - 1] ^= 1;
    const counted = countingProvider(base);
    expect(() =>
      minimumArkRewrap(counted.provider, {
        children: [{ oldEnvelope: valid }, { oldEnvelope: invalid }],
        newArk,
        oldArk,
      }),
    ).toThrowError(EnvelopeFailure);
    expect(counted.calls.random).toBe(0);
  });

  it("does not clear caller keys when migration entropy aliases them", async () => {
    const base = await createLibsodiumProvider();
    const oldArk = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    const originalOldArk = oldArk.slice();
    const newArk = Uint8Array.from({ length: 32 }, (_, index) => 255 - index);
    const child = sealEnvelopeWithEntropy(
      base,
      {
        accountId: Uint8Array.from({ length: 16 }, (_, index) => index + 1),
        content: {
          material: Uint8Array.from({ length: 32 }, (_, index) => index + 33),
          materialType: 0x03,
          type: "key-material",
        },
        generation: 0n,
        keySource: { parentKey: oldArk, source: "parent" },
        keyVersion: 1,
        kind: ENVELOPE_KIND.ARK_CHILD,
        objectId: Uint8Array.from({ length: 16 }, (_, index) => index + 17),
      },
      new Uint8Array(24),
    );
    const aliasingEntropy = overrideProvider(base, {
      randomBytes: () => oldArk.subarray(0, 24),
    });
    expect(
      minimumArkRewrap(aliasingEntropy, {
        children: [{ oldEnvelope: child }],
        newArk,
        oldArk,
      }),
    ).toHaveLength(1);
    expect(oldArk).toEqual(originalOldArk);
  });

  it("rejects faulty provider outputs without mutating caller-owned keys", async () => {
    const base = await createLibsodiumProvider();
    const parentKey = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    const originalParent = parentKey.slice();
    const input = {
      accountId: Uint8Array.from({ length: 16 }, (_, index) => index + 1),
      content: { plaintext: Uint8Array.of(1, 2, 3), type: "payload" as const },
      generation: 1n,
      keySource: { parentKey, source: "parent" as const },
      keyVersion: 1,
      kind: ENVELOPE_KIND.ITEM_PAYLOAD,
      objectId: Uint8Array.from({ length: 16 }, (_, index) => index + 17),
    };
    const valid = sealEnvelopeWithEntropy(base, input, new Uint8Array(24));

    const shortDecrypt = overrideProvider(base, {
      decryptXChaCha20Poly1305: () => Uint8Array.of(0x80),
    });
    expect(() => openEnvelope(shortDecrypt, valid, { parentKey, source: "parent" })).toThrowError(
      expect.objectContaining({ code: "provider" }),
    );

    const aliasedDerivation = overrideProvider(base, {
      deriveHkdfSha256: ({ ikm }) => ikm,
    });
    expect(() =>
      sealEnvelopeWithEntropy(aliasedDerivation, input, new Uint8Array(24)),
    ).not.toThrow();
    expect(parentKey).toEqual(originalParent);

    const shortEncrypt = overrideProvider(base, {
      encryptXChaCha20Poly1305: () => Uint8Array.of(1),
    });
    expect(() => sealEnvelopeWithEntropy(shortEncrypt, input, new Uint8Array(24))).toThrowError(
      expect.objectContaining({ code: "provider" }),
    );
  });
});
