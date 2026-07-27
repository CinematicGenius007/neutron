export type TotpAlgorithm = "SHA1" | "SHA256" | "SHA512";

interface CommonItem {
  readonly schemaVersion: 1;
  readonly tags: readonly string[];
  readonly title: string;
}

export interface LoginItem extends CommonItem {
  readonly type: "login";
  readonly username: string;
  readonly password: string;
  readonly url?: string;
  readonly notes?: string;
}

export interface SecureNoteItem extends CommonItem {
  readonly type: "secure-note";
  readonly body: string;
}

export interface TotpItem extends CommonItem {
  readonly type: "totp";
  readonly accountName?: string;
  readonly algorithm: TotpAlgorithm;
  readonly digits: 6 | 8;
  readonly issuer?: string;
  readonly period: number;
  readonly secretBase32: string;
}

export interface BackupCodeItem extends CommonItem {
  readonly type: "backup-code";
  readonly codes: readonly string[];
  readonly notes?: string;
}

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface JsonItem extends CommonItem {
  readonly type: "json";
  readonly value: JsonValue;
}

export type VaultItem = LoginItem | SecureNoteItem | TotpItem | BackupCodeItem | JsonItem;

export type VaultItemFailureCode = "bounds" | "invalid-item" | "unsupported-version";

export class VaultItemFailure extends Error {
  readonly code: VaultItemFailureCode;

  constructor(code: VaultItemFailureCode) {
    super(code);
    this.name = "VaultItemFailure";
    this.code = code;
  }
}

const encoder = new TextEncoder();
const dangerousKeys = new Set(["__proto__", "constructor", "prototype"]);

function fail(code: VaultItemFailureCode): never {
  throw new VaultItemFailure(code);
}

function plainRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail("invalid-item");
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) fail("invalid-item");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).some(
      (key) =>
        typeof key !== "string" ||
        descriptors[key]?.enumerable !== true ||
        descriptors[key]?.get !== undefined ||
        descriptors[key]?.set !== undefined,
    )
  )
    fail("invalid-item");
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional]);
  const keys = Reflect.ownKeys(value);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    keys.some((key) => typeof key !== "string" || !allowed.has(key))
  )
    fail("invalid-item");
}

function strictArray(value: unknown, maximum: number): readonly unknown[] {
  if (!Array.isArray(value)) fail("invalid-item");
  if (Object.getPrototypeOf(value) !== Array.prototype) fail("invalid-item");
  if (value.length > maximum) fail("bounds");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[index.toString()];
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    )
      fail("invalid-item");
  }
  if (
    Reflect.ownKeys(value).some(
      (key) =>
        key !== "length" &&
        (typeof key !== "string" ||
          !/^(?:0|[1-9][0-9]*)$/.test(key) ||
          Number(key) >= value.length),
    )
  )
    fail("invalid-item");
  return value;
}

function boundedString(value: unknown, minimum: number, maximum: number): string {
  if (typeof value !== "string") fail("invalid-item");
  const length = encoder.encode(value).length;
  if (length < minimum || length > maximum) fail("bounds");
  return value;
}

function optionalString(value: Record<string, unknown>, key: string, maximum: number): string {
  return boundedString(value[key], 0, maximum);
}

function mapStrictArray<T>(value: readonly unknown[], transform: (entry: unknown) => T): T[] {
  const output: T[] = [];
  for (let index = 0; index < value.length; index += 1) output.push(transform(value[index]));
  return output;
}

function common(value: Record<string, unknown>): CommonItem {
  if (value.schemaVersion !== 1) fail("unsupported-version");
  const title = boundedString(value.title, 1, 256);
  const tags = mapStrictArray(strictArray(value.tags, 64), (tag) => boundedString(tag, 1, 128));
  if (new Set(tags).size !== tags.length) fail("invalid-item");
  return { schemaVersion: 1, tags: Object.freeze(tags), title };
}

function login(value: Record<string, unknown>): LoginItem {
  exactKeys(
    value,
    ["schemaVersion", "type", "title", "tags", "username", "password"],
    ["url", "notes"],
  );
  return Object.freeze({
    ...common(value),
    type: "login" as const,
    username: boundedString(value.username, 0, 2_048),
    password: boundedString(value.password, 0, 4_096),
    ...(Object.hasOwn(value, "url") ? { url: optionalString(value, "url", 2_048) } : {}),
    ...(Object.hasOwn(value, "notes") ? { notes: optionalString(value, "notes", 65_536) } : {}),
  });
}

function secureNote(value: Record<string, unknown>): SecureNoteItem {
  exactKeys(value, ["schemaVersion", "type", "title", "tags", "body"]);
  return Object.freeze({
    ...common(value),
    body: boundedString(value.body, 0, 65_536),
    type: "secure-note" as const,
  });
}

function totp(value: Record<string, unknown>): TotpItem {
  exactKeys(
    value,
    ["schemaVersion", "type", "title", "tags", "secretBase32", "algorithm", "digits", "period"],
    ["issuer", "accountName"],
  );
  const secretBase32 = boundedString(value.secretBase32, 16, 512);
  if (!/^[A-Z2-7]+$/.test(secretBase32)) fail("invalid-item");
  const remainder = secretBase32.length % 8;
  const unusedBits = new Map([
    [0, 0],
    [2, 2],
    [4, 4],
    [5, 1],
    [7, 3],
  ]).get(remainder);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const finalValue = alphabet.indexOf(secretBase32.at(-1) as string);
  if (unusedBits === undefined || (unusedBits > 0 && (finalValue & ((1 << unusedBits) - 1)) !== 0))
    fail("invalid-item");
  if (value.algorithm !== "SHA1" && value.algorithm !== "SHA256" && value.algorithm !== "SHA512")
    fail("invalid-item");
  if (value.digits !== 6 && value.digits !== 8) fail("invalid-item");
  if (
    !Number.isInteger(value.period) ||
    (value.period as number) < 15 ||
    (value.period as number) > 300
  )
    fail("bounds");
  return Object.freeze({
    ...common(value),
    type: "totp" as const,
    secretBase32,
    algorithm: value.algorithm,
    digits: value.digits,
    period: value.period as number,
    ...(Object.hasOwn(value, "issuer") ? { issuer: optionalString(value, "issuer", 256) } : {}),
    ...(Object.hasOwn(value, "accountName")
      ? { accountName: optionalString(value, "accountName", 256) }
      : {}),
  });
}

function backupCode(value: Record<string, unknown>): BackupCodeItem {
  exactKeys(value, ["schemaVersion", "type", "title", "tags", "codes"], ["notes"]);
  const codeValues = strictArray(value.codes, 256);
  if (codeValues.length < 1) fail("bounds");
  const codes = mapStrictArray(codeValues, (code) => boundedString(code, 1, 1_024));
  if (new Set(codes).size !== codes.length) fail("invalid-item");
  return Object.freeze({
    ...common(value),
    codes: Object.freeze(codes),
    type: "backup-code" as const,
    ...(Object.hasOwn(value, "notes") ? { notes: optionalString(value, "notes", 65_536) } : {}),
  });
}

function jsonValue(value: unknown, depth: number, state: { nodes: number }): JsonValue {
  state.nodes += 1;
  if (state.nodes > 10_000 || depth > 32) fail("bounds");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) fail("invalid-item");
    return value;
  }
  if (typeof value === "string") return boundedString(value, 0, 65_536);
  if (Array.isArray(value))
    return Object.freeze(
      mapStrictArray(strictArray(value, 10_000), (entry) => jsonValue(entry, depth + 1, state)),
    );
  const source = plainRecord(value);
  if (Object.keys(source).length > 1_024) fail("bounds");
  const result: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
  for (const key of Object.keys(source).sort()) {
    if (dangerousKeys.has(key)) fail("invalid-item");
    boundedString(key, 1, 256);
    result[key] = jsonValue(source[key], depth + 1, state);
  }
  return Object.freeze(result);
}

function jsonItem(value: Record<string, unknown>): JsonItem {
  exactKeys(value, ["schemaVersion", "type", "title", "tags", "value"]);
  const parsed = jsonValue(value.value, 0, { nodes: 0 });
  if (encoder.encode(JSON.stringify(parsed)).length > 1_048_576) fail("bounds");
  return Object.freeze({ ...common(value), type: "json" as const, value: parsed });
}

export function parseVaultItem(candidate: unknown): VaultItem {
  const value = plainRecord(candidate);
  switch (value.type) {
    case "login":
      return login(value);
    case "secure-note":
      return secureNote(value);
    case "totp":
      return totp(value);
    case "backup-code":
      return backupCode(value);
    case "json":
      return jsonItem(value);
    default:
      fail("invalid-item");
  }
}

function canonicalize(value: JsonValue | VaultItem): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalize((value as Record<string, JsonValue>)[key] as JsonValue)}`,
    )
    .join(",")}}`;
}

export function encodeVaultItem(item: unknown): Uint8Array {
  const encoded = encoder.encode(canonicalize(parseVaultItem(item)));
  if (encoded.length > 1_048_576) fail("bounds");
  return encoded;
}

export function decodeVaultItem(bytes: Uint8Array): VaultItem {
  if (
    !(bytes instanceof Uint8Array) ||
    (typeof SharedArrayBuffer !== "undefined" && bytes.buffer instanceof SharedArrayBuffer) ||
    bytes.length < 1 ||
    bytes.length > 1_048_576
  )
    fail("bounds");
  const owned = new Uint8Array(bytes);
  let candidate: unknown;
  try {
    candidate = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(owned)) as unknown;
  } catch {
    fail("invalid-item");
  }
  const item = parseVaultItem(candidate);
  const canonical = encodeVaultItem(item);
  if (canonical.length !== owned.length) fail("invalid-item");
  for (let index = 0; index < owned.length; index += 1)
    if (canonical[index] !== owned[index]) fail("invalid-item");
  return item;
}
