import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PASSPHRASE_GENERATOR_OPTIONS,
  generatePassphrase,
  parseGlobalGeneratedPassphrase,
  parsePassphraseGeneratorOptions,
  passphraseUint16Index,
  validateGeneratedPassphrase,
} from "../src/passphrase-generator.js";
import {
  PASSPHRASE_WORDLIST,
  PASSPHRASE_WORDLIST_COUNT,
  PASSPHRASE_WORDLIST_SHA256,
} from "../src/passphrase-wordlist.js";

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

describe("passphrase generation policy", () => {
  it("pins every canonical wordlist invariant", () => {
    expect(PASSPHRASE_WORDLIST).toHaveLength(PASSPHRASE_WORDLIST_COUNT);
    expect(PASSPHRASE_WORDLIST_COUNT).toBe(7_776);
    expect(PASSPHRASE_WORDLIST[0]).toBe("abacus");
    expect(PASSPHRASE_WORDLIST.at(-1)).toBe("zoom");
    expect(Object.isFrozen(PASSPHRASE_WORDLIST)).toBe(true);
    expect(createHash("sha256").update(PASSPHRASE_WORDLIST.join("\n")).digest("hex")).toBe(
      PASSPHRASE_WORDLIST_SHA256,
    );
    for (let index = 0; index < PASSPHRASE_WORDLIST.length; index += 1) {
      const word = PASSPHRASE_WORDLIST[index] as string;
      expect(word).toMatch(/^[a-z-]{3,9}$/);
      expect(word).not.toContain(".");
      if (index > 0) expect((PASSPHRASE_WORDLIST[index - 1] as string) < word).toBe(true);
    }
  });

  it("accepts exact word-count boundaries and rejects hostile option shapes", () => {
    for (const words of [7, 8, 24])
      expect(parsePassphraseGeneratorOptions({ words })).toEqual({ words });
    for (const words of [6, 25, 7.5, Number.NaN, Number.POSITIVE_INFINITY])
      expect(() => parsePassphraseGeneratorOptions({ words })).toThrow();
    for (const candidate of [{}, { words: 8, extra: true }, Object.create({ words: 8 })])
      expect(() => parsePassphraseGeneratorOptions(candidate)).toThrow();
    let invoked = false;
    const accessor = Object.create(Object.prototype, {
      words: {
        enumerable: true,
        get() {
          invoked = true;
          return 8;
        },
      },
    });
    expect(() => parsePassphraseGeneratorOptions(accessor)).toThrow();
    expect(invoked).toBe(false);
  });

  it("maps the complete uint16 domain uniformly with the exact rejection tail", () => {
    const counts = Array.from({ length: PASSPHRASE_WORDLIST_COUNT }, () => 0);
    let rejected = 0;
    for (let value = 0; value <= 0xffff; value += 1) {
      const selected = passphraseUint16Index(value);
      if (selected === undefined) rejected += 1;
      else counts[selected] = (counts[selected] as number) + 1;
    }
    expect(rejected).toBe(3_328);
    expect(new Set(counts)).toEqual(new Set([8]));
    for (const invalid of [-1, 65_536, 1.5, Number.NaN])
      expect(() => passphraseUint16Index(invalid)).toThrow();
  });

  it("uses disjoint big-endian pairs and permits independent repeated words", () => {
    const bytes = Uint8Array.from([0, 0, 0, 1, 0, 1, 0, 2, 0, 3, 0, 4, 0, 5, 0, 6]);
    const provider = providerFrom((length) => {
      const result = new Uint8Array(length);
      result.set(bytes);
      return result;
    });
    const passphrase = generatePassphrase(provider, DEFAULT_PASSPHRASE_GENERATOR_OPTIONS);
    expect(passphrase).toBe(
      ["abacus", "abdomen", "abdomen", "abdominal", "abide", "abiding", "ability", "ablaze"].join(
        ".",
      ),
    );
    expect(provider.requests).toEqual([256]);
    expect(provider.cleared).toHaveLength(1);
    expect(provider.cleared[0]?.every((value) => value === 0)).toBe(true);
  });

  it("enforces the exact byte budget and clears every rejected buffer", () => {
    for (const words of [7, 8, 24]) {
      const provider = providerFrom((length) => new Uint8Array(length).fill(0xff));
      expect(() => generatePassphrase(provider, { words })).toThrow();
      expect(provider.requests.reduce((sum, value) => sum + value, 0)).toBe(words * 32);
      expect(provider.requests.every((value) => value > 0 && value <= 256 && value % 2 === 0)).toBe(
        true,
      );
      expect(provider.cleared).toHaveLength(provider.requests.length);
      expect(provider.cleared.every((bytes) => bytes.every((value) => value === 0))).toBe(true);
    }
  });

  it("does not call the provider for invalid input and fails closed on malformed returns", () => {
    const untouched = providerFrom((length) => new Uint8Array(length));
    expect(() => generatePassphrase(untouched, { words: 6 })).toThrow();
    expect(untouched.requests).toEqual([]);
    for (const delta of [-1, 1]) {
      const provider = providerFrom((length) => new Uint8Array(length + delta).fill(7));
      expect(() => generatePassphrase(provider, DEFAULT_PASSPHRASE_GENERATOR_OPTIONS)).toThrow();
      expect(provider.cleared).toHaveLength(1);
      expect(provider.cleared[0]?.every((value) => value === 0)).toBe(true);
    }
    const malformed = providerFrom(() => ({ length: 256 }));
    expect(() => generatePassphrase(malformed, DEFAULT_PASSPHRASE_GENERATOR_OPTIONS)).toThrow();
    expect(malformed.cleared).toHaveLength(0);
  });

  it("validates global and request-specific results without normalizing separators", () => {
    const valid = PASSPHRASE_WORDLIST.slice(0, 8).join(".");
    expect(parseGlobalGeneratedPassphrase(valid)).toBe(valid);
    expect(validateGeneratedPassphrase(valid, { words: 8 })).toBe(valid);
    for (const candidate of [
      PASSPHRASE_WORDLIST.slice(0, 6).join("."),
      PASSPHRASE_WORDLIST.slice(0, 25).join("."),
      `${PASSPHRASE_WORDLIST.slice(0, 7).join(".")}.not-in-list`,
      valid.replace(".", ".."),
      `.${valid}`,
      `${valid}.`,
      valid.replaceAll(".", "-"),
    ])
      expect(() => parseGlobalGeneratedPassphrase(candidate)).toThrow();
    expect(() => validateGeneratedPassphrase(valid, { words: 7 })).toThrow();
  });
});
