import { describe, expect, it } from "vitest";
import {
  DEFAULT_PASSWORD_GENERATOR_OPTIONS,
  generatePassword,
  type PasswordGeneratorOptionsV1,
  parseGlobalGeneratedPassword,
  parsePasswordGeneratorOptions,
  passwordAlphabet,
  passwordByteIndex,
  validateGeneratedPassword,
} from "../src/password-generator.js";

const setFlags = ["lowercase", "uppercase", "digits", "symbols"] as const;
const minimumLengths = new Map([
  [10, 25],
  [23, 18],
  [26, 18],
  [33, 16],
  [36, 16],
  [49, 16],
  [52, 16],
  [59, 16],
  [62, 16],
  [75, 16],
  [85, 16],
]);

function options(mask: number, length?: number): PasswordGeneratorOptionsV1 {
  const candidate = {
    length: 16,
    lowercase: (mask & 1) !== 0,
    uppercase: (mask & 2) !== 0,
    digits: (mask & 4) !== 0,
    symbols: (mask & 8) !== 0,
  };
  candidate.length = length ?? (minimumLengths.get(passwordAlphabet(candidate).length) as number);
  return candidate;
}

function providerFrom(factory: (length: number) => unknown) {
  const requests: number[] = [];
  const cleared: Uint8Array[] = [];
  return {
    requests,
    cleared,
    randomBytes(length: number) {
      requests.push(length);
      return factory(length) as Uint8Array;
    },
    clear(bytes: Uint8Array) {
      cleared.push(bytes);
      bytes.fill(0);
    },
  };
}

describe("password generation policy", () => {
  it("accepts all 15 nonempty set combinations at their exact entropy boundary", () => {
    for (let mask = 1; mask < 16; mask += 1) {
      const boundary = options(mask);
      expect(parsePasswordGeneratorOptions(boundary)).toEqual(boundary);
      if (boundary.length > 16)
        expect(() =>
          parsePasswordGeneratorOptions({ ...boundary, length: boundary.length - 1 }),
        ).toThrow();
      const provider = providerFrom((length) => new Uint8Array(length));
      const password = generatePassword(provider, boundary);
      expect(password).toBe(passwordAlphabet(boundary)[0]?.repeat(boundary.length));
      expect(validateGeneratedPassword(password, boundary)).toBe(password);
      expect(provider.requests.every((length) => length > 0 && length <= 256)).toBe(true);
      expect(provider.cleared.every((bytes) => bytes.every((value) => value === 0))).toBe(true);
    }
  });

  it("rejects invalid bounds, flags, fields, and prototypes", () => {
    for (const length of [15, 129, 16.5, Number.NaN, Number.POSITIVE_INFINITY])
      expect(() =>
        parsePasswordGeneratorOptions({ ...DEFAULT_PASSWORD_GENERATOR_OPTIONS, length }),
      ).toThrow();
    expect(() => parsePasswordGeneratorOptions(options(0, 128))).toThrow();
    expect(() =>
      parsePasswordGeneratorOptions({ ...DEFAULT_PASSWORD_GENERATOR_OPTIONS, lowercase: 1 }),
    ).toThrow();
    expect(() =>
      parsePasswordGeneratorOptions({ ...DEFAULT_PASSWORD_GENERATOR_OPTIONS, extra: true }),
    ).toThrow();
    expect(() =>
      parsePasswordGeneratorOptions(Object.create({ ...DEFAULT_PASSWORD_GENERATOR_OPTIONS })),
    ).toThrow();
    let invoked = false;
    const accessor = Object.create(Object.prototype, {
      ...Object.fromEntries(setFlags.map((key) => [key, { enumerable: true, value: true }])),
      length: {
        enumerable: true,
        get() {
          invoked = true;
          return 20;
        },
      },
    });
    expect(() => parsePasswordGeneratorOptions(accessor)).toThrow();
    expect(invoked).toBe(false);
  });

  it("does not call the provider for invalid options", () => {
    const provider = providerFrom((length) => new Uint8Array(length));
    expect(() => generatePassword(provider, options(4, 24))).toThrow();
    expect(provider.requests).toEqual([]);
    expect(provider.cleared).toEqual([]);
  });

  it("maps every byte uniformly for every reachable alphabet size", () => {
    const sizes = new Set<number>();
    for (let mask = 1; mask < 16; mask += 1) sizes.add(passwordAlphabet(options(mask)).length);
    for (const size of sizes) {
      const counts = Array.from({ length: size }, () => 0);
      let rejected = 0;
      for (let value = 0; value < 256; value += 1) {
        const index = passwordByteIndex(value, size);
        if (index === undefined) rejected += 1;
        else counts[index] = (counts[index] as number) + 1;
      }
      expect(new Set(counts).size).toBe(1);
      expect(rejected).toBe(256 % size);
      expect(passwordByteIndex(255, size)).toBe(size === 256 ? 255 : undefined);
    }
  });

  it("uses the exact byte budget and clears rejected chunks and partial output", () => {
    const provider = providerFrom((length) => new Uint8Array(length).fill(255));
    expect(() => generatePassword(provider, DEFAULT_PASSWORD_GENERATOR_OPTIONS)).toThrow();
    expect(provider.requests).toEqual([256, 64]);
    expect(provider.requests.reduce((total, length) => total + length, 0)).toBe(20 * 16);
    expect(provider.cleared).toHaveLength(3);
    expect(provider.cleared.every((bytes) => bytes.every((value) => value === 0))).toBe(true);
  });

  it("fails closed and clears short and overlong provider buffers", () => {
    for (const delta of [-1, 1]) {
      const returned: Uint8Array[] = [];
      const provider = providerFrom((length) => {
        const bytes = new Uint8Array(length + delta).fill(7);
        returned.push(bytes);
        return bytes;
      });
      expect(() => generatePassword(provider, DEFAULT_PASSWORD_GENERATOR_OPTIONS)).toThrow();
      expect(provider.requests).toEqual([256]);
      expect(returned[0]?.every((value) => value === 0)).toBe(true);
      expect(provider.cleared).toHaveLength(2);
    }
    const malformed = providerFrom(() => ({ length: 256 }));
    expect(() => generatePassword(malformed, DEFAULT_PASSWORD_GENERATOR_OPTIONS)).toThrow();
    expect(malformed.cleared).toHaveLength(1);
  });

  it("validates standalone and request-specific generated results", () => {
    expect(parseGlobalGeneratedPassword("a".repeat(16))).toBe("a".repeat(16));
    for (const candidate of ["a".repeat(15), "a".repeat(129), `${"a".repeat(15)} `])
      expect(() => parseGlobalGeneratedPassword(candidate)).toThrow();
    const digits = options(4);
    expect(validateGeneratedPassword("0".repeat(25), digits)).toBe("0".repeat(25));
    expect(() => validateGeneratedPassword("a".repeat(25), digits)).toThrow();
    expect(() => validateGeneratedPassword("0".repeat(24), digits)).toThrow();
  });
});
