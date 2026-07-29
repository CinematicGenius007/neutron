import type { CryptoProvider } from "@neutron/crypto";

export const PASSWORD_CHARACTER_SETS = Object.freeze({
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.?",
});

export const PASSWORD_GLOBAL_ALPHABET =
  PASSWORD_CHARACTER_SETS.lowercase +
  PASSWORD_CHARACTER_SETS.uppercase +
  PASSWORD_CHARACTER_SETS.digits +
  PASSWORD_CHARACTER_SETS.symbols;

export interface PasswordGeneratorOptionsV1 {
  readonly length: number;
  readonly lowercase: boolean;
  readonly uppercase: boolean;
  readonly digits: boolean;
  readonly symbols: boolean;
}

export const DEFAULT_PASSWORD_GENERATOR_OPTIONS: PasswordGeneratorOptionsV1 = Object.freeze({
  length: 20,
  lowercase: true,
  uppercase: true,
  digits: true,
  symbols: true,
});

const optionKeys = Object.freeze(["length", "lowercase", "uppercase", "digits", "symbols"]);
const minimumSearchSpace = 1n << 80n;

export class PasswordGeneratorFailure extends Error {
  constructor() {
    super("password generation failed");
    this.name = "PasswordGeneratorFailure";
  }
}

function fail(): never {
  throw new PasswordGeneratorFailure();
}

export function parsePasswordGeneratorOptions(candidate: unknown): PasswordGeneratorOptionsV1 {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) fail();
  const prototype = Object.getPrototypeOf(candidate) as unknown;
  if (prototype !== Object.prototype && prototype !== null) fail();
  const descriptors = Object.getOwnPropertyDescriptors(candidate);
  const keys = Reflect.ownKeys(candidate);
  if (keys.length !== optionKeys.length) fail();
  for (let index = 0; index < optionKeys.length; index += 1) {
    const key = optionKeys[index];
    if (key === undefined || !Object.hasOwn(candidate, key)) fail();
  }
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof key !== "string" || !optionKeys.includes(key)) fail();
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    )
      fail();
  }
  const value = candidate as Record<string, unknown>;
  if (
    !Number.isInteger(value.length) ||
    (value.length as number) < 16 ||
    (value.length as number) > 128
  )
    fail();
  for (const key of ["lowercase", "uppercase", "digits", "symbols"] as const)
    if (typeof value[key] !== "boolean") fail();
  const parsed = Object.freeze({
    length: value.length as number,
    lowercase: value.lowercase as boolean,
    uppercase: value.uppercase as boolean,
    digits: value.digits as boolean,
    symbols: value.symbols as boolean,
  });
  const alphabet = passwordAlphabet(parsed);
  if (
    alphabet.length === 0 ||
    BigInt(alphabet.length) ** BigInt(parsed.length) < minimumSearchSpace
  )
    fail();
  return parsed;
}

export function passwordAlphabet(options: PasswordGeneratorOptionsV1): string {
  return (
    (options.lowercase ? PASSWORD_CHARACTER_SETS.lowercase : "") +
    (options.uppercase ? PASSWORD_CHARACTER_SETS.uppercase : "") +
    (options.digits ? PASSWORD_CHARACTER_SETS.digits : "") +
    (options.symbols ? PASSWORD_CHARACTER_SETS.symbols : "")
  );
}

export function parseGlobalGeneratedPassword(candidate: unknown): string {
  if (typeof candidate !== "string" || candidate.length < 16 || candidate.length > 128) fail();
  for (let index = 0; index < candidate.length; index += 1)
    if (!PASSWORD_GLOBAL_ALPHABET.includes(candidate[index] as string)) fail();
  return candidate;
}

export function validateGeneratedPassword(candidate: unknown, optionsCandidate: unknown): string {
  const options = parsePasswordGeneratorOptions(optionsCandidate);
  const password = parseGlobalGeneratedPassword(candidate);
  const alphabet = passwordAlphabet(options);
  if (password.length !== options.length) fail();
  for (let index = 0; index < password.length; index += 1)
    if (!alphabet.includes(password[index] as string)) fail();
  return password;
}

export function passwordByteIndex(value: number, alphabetLength: number): number | undefined {
  if (!Number.isInteger(value) || value < 0 || value > 255) fail();
  if (!Number.isInteger(alphabetLength) || alphabetLength < 1 || alphabetLength > 256) fail();
  const cutoff = Math.floor(256 / alphabetLength) * alphabetLength;
  return value < cutoff ? value % alphabetLength : undefined;
}

function clear(provider: Pick<CryptoProvider, "clear">, bytes: Uint8Array): void {
  try {
    provider.clear(bytes);
  } catch {
    // Clearing is best effort; generation validity never depends on a clearer throwing.
  }
}

export function generatePassword(
  provider: Pick<CryptoProvider, "clear" | "randomBytes">,
  optionsCandidate: unknown,
): string {
  const options = parsePasswordGeneratorOptions(optionsCandidate);
  const alphabet = passwordAlphabet(options);
  const maximumRandomBytes = options.length * 16;
  const output = new Uint8Array(options.length);
  let outputOffset = 0;
  let requested = 0;
  try {
    while (outputOffset < output.length && requested < maximumRandomBytes) {
      const requestLength = Math.min(256, maximumRandomBytes - requested);
      requested += requestLength;
      let random: unknown;
      try {
        random = provider.randomBytes(requestLength);
        if (!(random instanceof Uint8Array) || random.length !== requestLength) fail();
        for (let index = 0; index < random.length && outputOffset < output.length; index += 1) {
          const value = random[index];
          if (value === undefined) continue;
          const alphabetIndex = passwordByteIndex(value, alphabet.length);
          if (alphabetIndex === undefined) continue;
          output[outputOffset] = alphabet.charCodeAt(alphabetIndex);
          outputOffset += 1;
        }
      } finally {
        if (random instanceof Uint8Array) clear(provider, random);
      }
    }
    if (outputOffset !== output.length) fail();
    const password = String.fromCharCode(...output);
    return validateGeneratedPassword(password, options);
  } finally {
    clear(provider, output);
  }
}
