import type { CryptoProvider } from "@neutron/crypto";
import {
  isPassphraseWord,
  PASSPHRASE_WORDLIST,
  PASSPHRASE_WORDLIST_COUNT,
} from "./passphrase-wordlist.js";

export interface PassphraseGeneratorOptionsV1 {
  readonly words: number;
}

export const DEFAULT_PASSPHRASE_GENERATOR_OPTIONS: PassphraseGeneratorOptionsV1 = Object.freeze({
  words: 8,
});

const optionKeys = Object.freeze(["words"]);
const minimumSearchSpace = 1n << 80n;
const selectionCutoff = 62_208;

export class PassphraseGeneratorFailure extends Error {
  constructor() {
    super("passphrase generation failed");
    this.name = "PassphraseGeneratorFailure";
  }
}

function fail(): never {
  throw new PassphraseGeneratorFailure();
}

export function parsePassphraseGeneratorOptions(candidate: unknown): PassphraseGeneratorOptionsV1 {
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
  const words = (candidate as Record<string, unknown>).words;
  if (!Number.isInteger(words) || (words as number) < 7 || (words as number) > 24) fail();
  if (BigInt(PASSPHRASE_WORDLIST_COUNT) ** BigInt(words as number) < minimumSearchSpace) fail();
  return Object.freeze({ words: words as number });
}

export function parseGlobalGeneratedPassphrase(candidate: unknown): string {
  if (typeof candidate !== "string" || candidate.length < 27 || candidate.length > 239) fail();
  const tokens = candidate.split(".");
  if (tokens.length < 7 || tokens.length > 24) fail();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined || !isPassphraseWord(token)) fail();
  }
  return candidate;
}

export function validateGeneratedPassphrase(candidate: unknown, optionsCandidate: unknown): string {
  const options = parsePassphraseGeneratorOptions(optionsCandidate);
  const passphrase = parseGlobalGeneratedPassphrase(candidate);
  if (passphrase.split(".").length !== options.words) fail();
  return passphrase;
}

export function passphraseUint16Index(value: number): number | undefined {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) fail();
  return value < selectionCutoff ? value % PASSPHRASE_WORDLIST_COUNT : undefined;
}

function clear(provider: Pick<CryptoProvider, "clear">, bytes: Uint8Array): void {
  try {
    provider.clear(bytes);
  } catch {
    // Clearing is best effort; generation validity never depends on a clearer throwing.
  }
}

export function generatePassphrase(
  provider: Pick<CryptoProvider, "clear" | "randomBytes">,
  optionsCandidate: unknown,
): string {
  const options = parsePassphraseGeneratorOptions(optionsCandidate);
  const maximumRandomBytes = options.words * 32;
  let output = "";
  let outputWords = 0;
  let requested = 0;
  while (outputWords < options.words && requested < maximumRandomBytes) {
    const requestLength = Math.min(256, maximumRandomBytes - requested);
    if (requestLength < 1 || requestLength % 2 !== 0) fail();
    requested += requestLength;
    let random: unknown;
    try {
      random = provider.randomBytes(requestLength);
      if (!(random instanceof Uint8Array) || random.length !== requestLength) fail();
      for (let offset = 0; offset < random.length && outputWords < options.words; offset += 2) {
        const high = random[offset];
        const low = random[offset + 1];
        if (high === undefined || low === undefined) fail();
        let selected = passphraseUint16Index((high << 8) | low);
        if (selected === undefined) continue;
        if (PASSPHRASE_WORDLIST[selected] === undefined) fail();
        output += `${outputWords === 0 ? "" : "."}${PASSPHRASE_WORDLIST[selected] as string}`;
        selected = -1;
        outputWords += 1;
      }
    } finally {
      if (random instanceof Uint8Array) clear(provider, random);
    }
  }
  if (outputWords !== options.words) fail();
  return validateGeneratedPassphrase(output, options);
}
