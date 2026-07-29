import { describe, expect, it } from "vitest";
import { computeTotp, type TotpItem } from "../../src/totp.js";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32(bytes: Uint8Array): string {
  let output = "";
  let accumulator = 0;
  let availableBits = 0;
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    availableBits += 8;
    while (availableBits >= 5) {
      availableBits -= 5;
      output += alphabet[(accumulator >>> availableBits) & 31];
      accumulator &= (1 << availableBits) - 1;
    }
  }
  if (availableBits > 0) output += alphabet[(accumulator << (5 - availableBits)) & 31];
  return output;
}

describe("real-browser Web Crypto TOTP matrix", () => {
  it("matches RFC 6238 SHA-1, SHA-256, and SHA-512 at 59 seconds", async () => {
    const algorithms = ["SHA1", "SHA256", "SHA512"] as const;
    const lengths = [20, 32, 64] as const;
    const expected = ["94287082", "46119246", "90693936"] as const;
    const source = "1234567890123456789012345678901234567890".repeat(2);
    for (let index = 0; index < algorithms.length; index += 1) {
      const item: TotpItem = {
        schemaVersion: 1,
        type: "totp",
        title: "Browser vector",
        tags: [],
        secretBase32: base32(new TextEncoder().encode(source.slice(0, lengths[index]))),
        algorithm: algorithms[index],
        digits: 8,
        period: 30,
      };
      await expect(computeTotp(crypto.subtle, item, 59_000)).resolves.toMatchObject({
        code: expected[index],
      });
    }
  });
});
