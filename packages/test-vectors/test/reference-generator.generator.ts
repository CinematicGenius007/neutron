import { describe, expect, it } from "vitest";

import {
  generateSyntheticArgon2idCandidate,
  generateSyntheticHkdfCandidate,
  generateSyntheticXChaChaCandidate,
} from "../src/reference-generator.js";

describe("reference candidate generator", () => {
  it("matches independently anchored primitive outputs", () => {
    expect(
      generateSyntheticHkdfCandidate({
        ikm: "0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b",
        salt: "000102030405060708090a0b0c",
        info: "f0f1f2f3f4f5f6f7f8f9",
        length: 42,
      }),
    ).toBe("3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865");
    expect(
      generateSyntheticArgon2idCandidate({
        password: "70617373776f7264",
        salt: "000102030405060708090a0b0c0d0e0f",
      }),
    ).toBe("def6fd068289b9a0cf1114f8e978a2c4dab6faef377d895b9c2d59fc93fc5653");
    expect(
      generateSyntheticXChaChaCandidate({
        aad: "00",
        key: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
        nonce: "000102030405060708090a0b0c0d0e0f1011121314151617",
        plaintext: "0102",
      }).ciphertext,
    ).toBe("9fc0987ca27cb41d99d50175381d6a312c38");
  });
});
