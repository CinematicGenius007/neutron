import { hkdfSync } from "node:crypto";

import sodium from "libsodium-wrappers-sumo";
import { describe, expect, it, vi } from "vitest";

import { CryptoFailure, createLibsodiumProvider } from "../src/index.js";
import { verifyPrimitiveCases } from "./catalog-provider.js";

function hex(value: string): Uint8Array {
  return Uint8Array.from(value.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));
}

function toHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("libsodium crypto provider", () => {
  it("initializes once and reports its provider identity", async () => {
    const first = createLibsodiumProvider();
    expect(createLibsodiumProvider()).toBe(first);
    const provider = await first;
    expect(provider.name).toBe("libsodium-wasm");
    expect(provider.sodiumVersion).toMatch(/^1\.0\./);
  });

  it("matches the immutable HKDF and Argon2id known answers", async () => {
    const provider = await createLibsodiumProvider();
    await verifyPrimitiveCases(provider);
    expect(
      toHex(
        provider.deriveHkdfSha256({
          ikm: hex("0b".repeat(22)),
          salt: hex("000102030405060708090a0b0c"),
          info: hex("f0f1f2f3f4f5f6f7f8f9"),
          length: 42,
        }),
      ),
    ).toBe("3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865");
    expect(
      toHex(
        provider.deriveArgon2idKey(
          hex("70617373776f7264"),
          hex("000102030405060708090a0b0c0d0e0f"),
        ),
      ),
    ).toBe("def6fd068289b9a0cf1114f8e978a2c4dab6faef377d895b9c2d59fc93fc5653");

    const emptySaltInput = {
      ikm: hex("0102030405060708090a0b0c0d0e0f10"),
      salt: new Uint8Array(),
      info: hex("a0a1a2a3"),
      length: 96,
    };
    expect(provider.deriveHkdfSha256(emptySaltInput)).toEqual(
      new Uint8Array(
        hkdfSync(
          "sha256",
          emptySaltInput.ikm,
          emptySaltInput.salt,
          emptySaltInput.info,
          emptySaltInput.length,
        ),
      ),
    );
  }, 30_000);

  it("matches XChaCha20-Poly1305 and fails closed on authentication", async () => {
    const provider = await createLibsodiumProvider();
    const input = {
      aad: hex("00"),
      key: hex("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"),
      nonce: hex("000102030405060708090a0b0c0d0e0f1011121314151617"),
      plaintext: hex("0102"),
    };
    const ciphertext = provider.encryptXChaCha20Poly1305(input);
    expect(toHex(ciphertext)).toBe("9fc0987ca27cb41d99d50175381d6a312c38");
    expect(
      provider.decryptXChaCha20Poly1305({
        aad: input.aad,
        key: input.key,
        nonce: input.nonce,
        ciphertext,
      }),
    ).toEqual(input.plaintext);
    ciphertext[ciphertext.length - 1] ^= 1;
    expect(() =>
      provider.decryptXChaCha20Poly1305({
        aad: input.aad,
        key: input.key,
        nonce: input.nonce,
        ciphertext,
      }),
    ).toThrowError(expect.objectContaining({ code: "authentication" }));
  });

  it("rejects invalid boundaries before provider operations", async () => {
    const provider = await createLibsodiumProvider();
    const failures = [
      () => provider.randomBytes(0),
      () => provider.deriveArgon2idKey(new Uint8Array(), new Uint8Array(16)),
      () => provider.deriveArgon2idKey(Uint8Array.of(1), new Uint8Array(15)),
      () =>
        provider.deriveHkdfSha256({
          ikm: new Uint8Array(),
          salt: new Uint8Array(),
          info: new Uint8Array(),
          length: 32,
        }),
      () =>
        provider.deriveHkdfSha256({
          ikm: Uint8Array.of(1),
          salt: new Uint8Array(),
          info: new Uint8Array(),
          length: 8_161,
        }),
      () =>
        provider.deriveHkdfSha256({
          ikm: new Uint8Array(4_097),
          salt: new Uint8Array(),
          info: new Uint8Array(),
          length: 32,
        }),
      () =>
        provider.encryptXChaCha20Poly1305({
          aad: new Uint8Array(),
          key: new Uint8Array(31),
          nonce: new Uint8Array(24),
          plaintext: new Uint8Array(),
        }),
      () =>
        provider.decryptXChaCha20Poly1305({
          aad: new Uint8Array(),
          key: new Uint8Array(32),
          nonce: new Uint8Array(23),
          ciphertext: new Uint8Array(16),
        }),
    ];
    for (const failure of failures) {
      expect(failure).toThrowError(CryptoFailure);
      try {
        failure();
      } catch (error) {
        expect(error).toMatchObject({ code: "invalid-input" });
      }
    }
  });

  it("rejects malformed and over-bound inputs before invoking libsodium", async () => {
    const provider = await createLibsodiumProvider();
    const hmac = vi.spyOn(sodium, "crypto_auth_hmacsha256_init");
    const encrypt = vi.spyOn(sodium, "crypto_aead_xchacha20poly1305_ietf_encrypt");
    const decrypt = vi.spyOn(sodium, "crypto_aead_xchacha20poly1305_ietf_decrypt");
    const random = vi.spyOn(sodium, "randombytes_buf");
    const invalidCalls = [
      () => provider.deriveHkdfSha256(undefined as never),
      () =>
        provider.deriveHkdfSha256({
          ikm: new Uint8Array(4_097),
          salt: new Uint8Array(),
          info: new Uint8Array(),
          length: 32,
        }),
      () =>
        provider.deriveHkdfSha256({
          ikm: Uint8Array.of(1),
          salt: new Uint8Array(4_097),
          info: new Uint8Array(),
          length: 32,
        }),
      () =>
        provider.deriveHkdfSha256({
          ikm: Uint8Array.of(1),
          salt: new Uint8Array(),
          info: new Uint8Array(4_097),
          length: 32,
        }),
      () =>
        provider.deriveHkdfSha256({
          ikm: Uint8Array.of(1),
          salt: new Uint8Array(),
          info: new Uint8Array(),
          length: 8_161,
        }),
      () => provider.encryptXChaCha20Poly1305(undefined as never),
      () =>
        provider.encryptXChaCha20Poly1305({
          aad: new Uint8Array(4_097),
          key: new Uint8Array(32),
          nonce: new Uint8Array(24),
          plaintext: new Uint8Array(),
        }),
      () =>
        provider.encryptXChaCha20Poly1305({
          aad: new Uint8Array(),
          key: new Uint8Array(32),
          nonce: new Uint8Array(24),
          plaintext: new Uint8Array(16_777_217),
        }),
      () => provider.decryptXChaCha20Poly1305(undefined as never),
      () =>
        provider.decryptXChaCha20Poly1305({
          aad: new Uint8Array(),
          key: new Uint8Array(32),
          nonce: new Uint8Array(24),
          ciphertext: new Uint8Array(16_777_233),
        }),
      () => provider.randomBytes(16_777_217),
    ];
    for (const call of invalidCalls) {
      expect(call).toThrowError(expect.objectContaining({ code: "invalid-input" }));
    }
    expect(hmac).not.toHaveBeenCalled();
    expect(encrypt).not.toHaveBeenCalled();
    expect(decrypt).not.toHaveBeenCalled();
    expect(random).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("accepts exact upper bounds and rejects wrong associated data", async () => {
    const provider = await createLibsodiumProvider();
    expect(
      provider.deriveHkdfSha256({
        ikm: new Uint8Array(4_096),
        salt: new Uint8Array(4_096),
        info: new Uint8Array(4_096),
        length: 8_160,
      }),
    ).toHaveLength(8_160);
    expect(provider.randomBytes(16_777_216)).toHaveLength(16_777_216);

    const key = new Uint8Array(32);
    const nonce = new Uint8Array(24);
    const ciphertext = provider.encryptXChaCha20Poly1305({
      aad: new Uint8Array(4_096),
      key,
      nonce,
      plaintext: new Uint8Array(16_777_216),
    });
    expect(ciphertext).toHaveLength(16_777_232);
    expect(() =>
      provider.decryptXChaCha20Poly1305({
        aad: Uint8Array.of(1),
        ciphertext,
        key,
        nonce,
      }),
    ).toThrowError(expect.objectContaining({ code: "authentication" }));
  }, 30_000);

  it("uses the CSPRNG and clears mutable key buffers", async () => {
    const provider = await createLibsodiumProvider();
    const first = provider.randomBytes(32);
    const second = provider.randomBytes(32);
    expect(first).toHaveLength(32);
    expect(second).toHaveLength(32);
    expect(first).not.toEqual(second);
    provider.clear(first);
    expect(first).toEqual(new Uint8Array(32));
  });
});
