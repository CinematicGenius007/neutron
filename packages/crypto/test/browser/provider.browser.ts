import { describe, expect, it } from "vitest";

import { createLibsodiumProvider } from "../../src/index.js";
import { verifyPrimitiveCases } from "../catalog-provider.js";

function hex(value: string): Uint8Array {
  return Uint8Array.from(value.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));
}

function toHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("libsodium provider in a real browser", () => {
  it("executes the fixed primitive vectors with browser CSPRNG access", async () => {
    expect(globalThis.window).toBeDefined();
    const provider = await createLibsodiumProvider();
    expect(provider.randomBytes(32)).toHaveLength(32);
    await verifyPrimitiveCases(provider);

    const ciphertext = provider.encryptXChaCha20Poly1305({
      aad: hex("00"),
      key: hex("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"),
      nonce: hex("000102030405060708090a0b0c0d0e0f1011121314151617"),
      plaintext: hex("0102"),
    });
    expect(toHex(ciphertext)).toBe("9fc0987ca27cb41d99d50175381d6a312c38");
  }, 30_000);
});
