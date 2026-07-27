export const ARGON2ID_V1 = Object.freeze({
  algorithm: "argon2id13" as const,
  iterations: 3,
  keyLength: 32,
  memoryKiB: 65_536,
  parallelism: 1,
  saltLength: 16,
});

export const XCHACHA20_POLY1305 = Object.freeze({ keyLength: 32, nonceLength: 24, tagLength: 16 });

export interface AeadEncryptInput {
  readonly aad: Uint8Array;
  readonly key: Uint8Array;
  readonly nonce: Uint8Array;
  readonly plaintext: Uint8Array;
}

export interface AeadDecryptInput {
  readonly aad: Uint8Array;
  readonly ciphertext: Uint8Array;
  readonly key: Uint8Array;
  readonly nonce: Uint8Array;
}

export interface HkdfSha256Input {
  readonly ikm: Uint8Array;
  readonly info: Uint8Array;
  readonly length: number;
  readonly salt: Uint8Array;
}

export interface CryptoProvider {
  readonly name: "libsodium-wasm";
  readonly sodiumVersion: string;
  clear(bytes: Uint8Array): void;
  decryptXChaCha20Poly1305(input: AeadDecryptInput): Uint8Array;
  deriveArgon2idKey(password: Uint8Array, salt: Uint8Array): Uint8Array;
  deriveHkdfSha256(input: HkdfSha256Input): Uint8Array;
  encryptXChaCha20Poly1305(input: AeadEncryptInput): Uint8Array;
  randomBytes(length: number): Uint8Array;
}
