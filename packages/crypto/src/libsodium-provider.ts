import sodium from "libsodium-wrappers-sumo";

import { CryptoFailure } from "./errors.js";
import {
  type AeadDecryptInput,
  type AeadEncryptInput,
  ARGON2ID_V1,
  type CryptoProvider,
  type HkdfSha256Input,
  XCHACHA20_POLY1305,
} from "./provider.js";

const maxAeadPlaintext = 16_777_216;
const maxAeadCiphertext = maxAeadPlaintext + XCHACHA20_POLY1305.tagLength;
const maxAadLength = 4_096;
const maxRandomLength = 16_777_216;
const maxHkdfLength = 255 * 32;

function invalid(condition: boolean, message: string): void {
  if (condition) throw new CryptoFailure("invalid-input", message);
}

function bytes(value: unknown, name: string): asserts value is Uint8Array {
  invalid(!(value instanceof Uint8Array), `${name} must be bytes`);
}

function record(value: unknown, name: string): asserts value is Record<string, unknown> {
  invalid(
    typeof value !== "object" || value === null || Array.isArray(value),
    `${name} must be an object`,
  );
}

function validateAeadCommon(input: {
  readonly aad: Uint8Array;
  readonly key: Uint8Array;
  readonly nonce: Uint8Array;
}): void {
  record(input, "input");
  bytes(input.key, "key");
  bytes(input.nonce, "nonce");
  bytes(input.aad, "aad");
  invalid(input.key.length !== XCHACHA20_POLY1305.keyLength, "key must be 32 bytes");
  invalid(input.nonce.length !== XCHACHA20_POLY1305.nonceLength, "nonce must be 24 bytes");
  invalid(input.aad.length > maxAadLength, "aad exceeds provider bound");
}

class LibsodiumCryptoProvider implements CryptoProvider {
  readonly name = "libsodium-wasm" as const;
  readonly sodiumVersion = sodium.sodium_version_string();

  clear(value: Uint8Array): void {
    bytes(value, "value");
    sodium.memzero(value);
  }

  randomBytes(length: number): Uint8Array {
    invalid(
      !Number.isSafeInteger(length) || length < 1 || length > maxRandomLength,
      "invalid random length",
    );
    return sodium.randombytes_buf(length);
  }

  deriveArgon2idKey(password: Uint8Array, salt: Uint8Array): Uint8Array {
    bytes(password, "password");
    bytes(salt, "salt");
    invalid(password.length < 1 || password.length > 1_024, "password must be 1..1024 bytes");
    invalid(salt.length !== ARGON2ID_V1.saltLength, "salt must be 16 bytes");
    try {
      return sodium.crypto_pwhash(
        ARGON2ID_V1.keyLength,
        password,
        salt,
        ARGON2ID_V1.iterations,
        ARGON2ID_V1.memoryKiB * 1_024,
        sodium.crypto_pwhash_ALG_ARGON2ID13,
      );
    } catch (cause) {
      throw new CryptoFailure("provider", "Argon2id derivation failed", { cause });
    }
  }

  deriveHkdfSha256(input: HkdfSha256Input): Uint8Array {
    record(input, "input");
    bytes(input.ikm, "ikm");
    bytes(input.salt, "salt");
    bytes(input.info, "info");
    invalid(input.ikm.length < 1, "ikm must not be empty");
    invalid(
      input.ikm.length > 4_096 || input.salt.length > 4_096 || input.info.length > 4_096,
      "HKDF input exceeds provider bound",
    );
    invalid(
      !Number.isSafeInteger(input.length) || input.length < 1 || input.length > maxHkdfLength,
      "invalid HKDF length",
    );

    const effectiveSalt = input.salt.length === 0 ? new Uint8Array(32) : input.salt;
    const extract = sodium.crypto_auth_hmacsha256_init(effectiveSalt);
    sodium.crypto_auth_hmacsha256_update(extract, input.ikm);
    const prk = sodium.crypto_auth_hmacsha256_final(extract);
    const output = new Uint8Array(input.length);
    let previous: Uint8Array<ArrayBufferLike> = new Uint8Array();
    let offset = 0;
    try {
      for (let counter = 1; offset < output.length; counter += 1) {
        const expand = sodium.crypto_auth_hmacsha256_init(prk);
        if (previous.length > 0) sodium.crypto_auth_hmacsha256_update(expand, previous);
        sodium.crypto_auth_hmacsha256_update(expand, input.info);
        sodium.crypto_auth_hmacsha256_update(expand, Uint8Array.of(counter));
        const block = sodium.crypto_auth_hmacsha256_final(expand);
        if (previous.length > 0) sodium.memzero(previous);
        previous = block;
        const copied = Math.min(block.length, output.length - offset);
        output.set(block.subarray(0, copied), offset);
        offset += copied;
      }
      return output;
    } finally {
      sodium.memzero(prk);
      if (previous.length > 0) sodium.memzero(previous);
      if (effectiveSalt !== input.salt) sodium.memzero(effectiveSalt);
    }
  }

  encryptXChaCha20Poly1305(input: AeadEncryptInput): Uint8Array {
    record(input, "input");
    validateAeadCommon(input);
    bytes(input.plaintext, "plaintext");
    invalid(input.plaintext.length > maxAeadPlaintext, "plaintext exceeds provider bound");
    return sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      input.plaintext,
      input.aad,
      null,
      input.nonce,
      input.key,
    );
  }

  decryptXChaCha20Poly1305(input: AeadDecryptInput): Uint8Array {
    record(input, "input");
    validateAeadCommon(input);
    bytes(input.ciphertext, "ciphertext");
    invalid(
      input.ciphertext.length < XCHACHA20_POLY1305.tagLength ||
        input.ciphertext.length > maxAeadCiphertext,
      "ciphertext exceeds provider bounds",
    );
    try {
      return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        input.ciphertext,
        input.aad,
        input.nonce,
        input.key,
      );
    } catch (cause) {
      throw new CryptoFailure("authentication", "authenticated decryption failed", { cause });
    }
  }
}

let initialization: Promise<CryptoProvider> | undefined;

export function createLibsodiumProvider(): Promise<CryptoProvider> {
  initialization ??= sodium.ready
    .then(() => new LibsodiumCryptoProvider())
    .catch((cause: unknown) => {
      initialization = undefined;
      throw new CryptoFailure("provider", "libsodium initialization failed", { cause });
    });
  return initialization;
}
