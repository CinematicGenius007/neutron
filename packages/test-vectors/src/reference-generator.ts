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
