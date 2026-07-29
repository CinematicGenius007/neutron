import { describe, expect, it } from "vitest";
import {
  computeTotp,
  decodeCanonicalBase32,
  decodeTotpSecret,
  isTotpResultFresh,
  type TotpItem,
} from "../src/totp.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
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

function item(
  secret: string,
  algorithm: TotpItem["algorithm"] = "SHA1",
  digits: TotpItem["digits"] = 8,
  period = 30,
): TotpItem {
  return {
    schemaVersion: 1,
    type: "totp",
    title: "Synthetic TOTP",
    tags: [],
    secretBase32: secret,
    algorithm,
    digits,
    period,
  };
}

const rfc6238Expected = [
  [59, "94287082", "46119246", "90693936"],
  [1_111_111_109, "07081804", "68084774", "25091201"],
  [1_111_111_111, "14050471", "67062674", "99943326"],
  [1_234_567_890, "89005924", "91819424", "93441116"],
  [2_000_000_000, "69279037", "90698825", "38618901"],
  [20_000_000_000, "65353130", "77737706", "47863826"],
] as const;

describe("RFC 6238 TOTP", () => {
  it("matches all 18 corrected RFC 6238 Appendix B vectors", async () => {
    const algorithms = ["SHA1", "SHA256", "SHA512"] as const;
    const secretLengths = [20, 32, 64] as const;
    for (const row of rfc6238Expected) {
      for (let index = 0; index < algorithms.length; index += 1) {
        const length = secretLengths[index] as number;
        const secret = base32(
          encoder.encode("1234567890123456789012345678901234567890".repeat(2).slice(0, length)),
        );
        const result = await computeTotp(
          crypto.subtle,
          item(secret, algorithms[index]),
          row[0] * 1_000,
        );
        expect(result.code).toBe(row[index + 1]);
      }
    }
  });

  it("matches all ten RFC 4226 Appendix D values through equivalent counters", async () => {
    const secret = base32(encoder.encode("12345678901234567890"));
    const expected = [
      "755224",
      "287082",
      "359152",
      "969429",
      "338314",
      "254676",
      "287922",
      "162583",
      "399871",
      "520489",
    ];
    for (let counter = 0; counter < expected.length; counter += 1) {
      const result = await computeTotp(crypto.subtle, item(secret, "SHA1", 6), counter * 30_000);
      expect(result.code).toBe(expected[counter]);
    }
  });

  it("decodes RFC 4648 Base32 values and rejects noncanonical encodings", () => {
    const vectors = [
      ["", ""],
      ["MY", "f"],
      ["MZXQ", "fo"],
      ["MZXW6", "foo"],
      ["MZXW6YQ", "foob"],
      ["MZXW6YTB", "fooba"],
      ["MZXW6YTBOI", "foobar"],
    ] as const;
    for (const [encoded, plain] of vectors)
      expect(decoder.decode(decodeCanonicalBase32(encoded))).toBe(plain);
    for (const encoded of ["A", "AAA", "AAAAAA", "my", "MY=", "M Y", "M-Y", "0A"])
      expect(() => decodeCanonicalBase32(encoded)).toThrow();
    for (const [length, unusedBits] of [
      [2, 2],
      [4, 4],
      [5, 1],
      [7, 3],
    ] as const) {
      for (let final = 0; final < alphabet.length; final += 1) {
        const encoded = `${"A".repeat(length - 1)}${alphabet[final]}`;
        const canonical = (final & ((1 << unusedBits) - 1)) === 0;
        if (canonical) expect(() => decodeCanonicalBase32(encoded)).not.toThrow();
        else expect(() => decodeCanonicalBase32(encoded)).toThrow();
      }
    }
    expect(() => decodeTotpSecret("MY")).toThrow();
  });

  it("uses exact inclusive-start and exclusive-expiry boundaries", async () => {
    const secret = base32(encoder.encode("12345678901234567890"));
    for (const period of [15, 300]) {
      const before = await computeTotp(crypto.subtle, item(secret, "SHA1", 8, period), 29_999);
      const at = await computeTotp(crypto.subtle, item(secret, "SHA1", 8, period), 30_000);
      const after = await computeTotp(crypto.subtle, item(secret, "SHA1", 8, period), 30_001);
      expect(before.validFromUnixSeconds).toBe(
        (BigInt(Math.floor(29 / period)) * BigInt(period)).toString(),
      );
      expect(at.validFromUnixSeconds).toBe(
        (BigInt(Math.floor(30 / period)) * BigInt(period)).toString(),
      );
      expect(after).toEqual(at);
      expect(isTotpResultFresh(at, 30_000)).toBe(true);
      expect(isTotpResultFresh(at, Number(at.expiresAtUnixSeconds) * 1_000)).toBe(false);
    }
  });

  it("rejects invalid clocks and policy values", async () => {
    const secret = base32(encoder.encode("12345678901234567890"));
    for (const clock of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])
      await expect(computeTotp(crypto.subtle, item(secret), clock)).rejects.toThrow();
    for (const period of [14, 301, 30.5])
      await expect(
        computeTotp(crypto.subtle, item(secret, "SHA1", 8, period), 0),
      ).rejects.toThrow();
  });

  it("encodes the counter big-endian and clears owned buffers on success", async () => {
    let capturedSecret: Uint8Array | undefined;
    let capturedCounter: Uint8Array | undefined;
    let capturedSignature: Uint8Array | undefined;
    const subtle: Pick<SubtleCrypto, "importKey" | "sign"> = {
      async importKey(...args: Parameters<SubtleCrypto["importKey"]>) {
        capturedSecret = args[1] as Uint8Array;
        return crypto.subtle.importKey(...args);
      },
      async sign(...args: Parameters<SubtleCrypto["sign"]>) {
        capturedCounter = args[2] as Uint8Array;
        const result = await crypto.subtle.sign(...args);
        capturedSignature = new Uint8Array(result);
        return result;
      },
    };
    const secret = base32(encoder.encode("12345678901234567890"));
    await computeTotp(subtle, item(secret), 59_000);
    expect(capturedSecret).toEqual(new Uint8Array(20));
    expect(capturedCounter).toEqual(new Uint8Array(8));
    expect(capturedSignature?.every((value) => value === 0)).toBe(true);
  });

  it("clears the decoded secret and counter when Web Crypto fails", async () => {
    let capturedSecret: Uint8Array | undefined;
    let capturedCounter: Uint8Array | undefined;
    const secret = base32(encoder.encode("12345678901234567890"));
    const importFailure = {
      async importKey(...args: Parameters<SubtleCrypto["importKey"]>) {
        capturedSecret = args[1] as Uint8Array;
        throw new Error("synthetic import failure");
      },
      sign: crypto.subtle.sign.bind(crypto.subtle),
    } as Pick<SubtleCrypto, "importKey" | "sign">;
    await expect(computeTotp(importFailure, item(secret), 59_000)).rejects.toThrow();
    expect(capturedSecret?.every((value) => value === 0)).toBe(true);

    const signFailure = {
      importKey: crypto.subtle.importKey.bind(crypto.subtle),
      async sign(...args: Parameters<SubtleCrypto["sign"]>) {
        capturedCounter = args[2] as Uint8Array;
        throw new Error("synthetic sign failure");
      },
    } as Pick<SubtleCrypto, "importKey" | "sign">;
    await expect(computeTotp(signFailure, item(secret), 59_000)).rejects.toThrow();
    expect(capturedCounter?.every((value) => value === 0)).toBe(true);
  });
});
