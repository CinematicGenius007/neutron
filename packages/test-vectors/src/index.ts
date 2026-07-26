export type VectorOperation =
  | "argon2id"
  | "envelope"
  | "hkdf-sha256"
  | "migration"
  | "password-encoding"
  | "state-generation";

export type VectorError =
  | "authentication"
  | "bounds"
  | "invalid-password-encoding"
  | "kdf-policy"
  | "non-atomic-migration"
  | "padding"
  | "password-length"
  | "structure"
  | "unknown-critical-field"
  | "unsupported-suite"
  | "unsupported-version";

type Hex = string;
type Uint64 = string;

export interface HkdfRequest {
  readonly id: string;
  readonly operation: "hkdf-sha256";
  readonly input: Readonly<{ ikm: Hex; salt: Hex; info: Hex }>;
  readonly parameters: Readonly<{ length: number }>;
}

export interface Argon2idRequest {
  readonly id: string;
  readonly operation: "argon2id";
  readonly input: Readonly<{ password: Hex; salt: Hex }>;
  readonly parameters: Readonly<{
    version: 19;
    memoryKiB: 65536;
    iterations: 3;
    parallelism: 1;
    length: 32;
    provider: "libsodium-crypto-pwhash-argon2id13";
  }>;
}

export interface PasswordUtf8Request {
  readonly id: string;
  readonly operation: "password-encoding";
  readonly input: Readonly<{ utf8: Hex }>;
  readonly parameters: Readonly<{ encoding: "utf8"; normalization: "none" }>;
}

export interface PasswordUtf16BeRequest {
  readonly id: string;
  readonly operation: "password-encoding";
  readonly input: Readonly<{ utf16be: Hex }>;
  readonly parameters: Readonly<{
    encoding: "utf16be";
    adapter: "reject-unpaired-surrogates";
  }>;
}

export interface EnvelopeRequest {
  readonly id: string;
  readonly operation: "envelope";
  readonly input: Readonly<{
    envelope: Hex;
    header: Hex;
    key: Hex;
    nonce: Hex;
    salt: Hex;
  }>;
  readonly parameters: Readonly<{ accountId: Hex; objectId: Hex }>;
}

export interface StateGenerationRequest {
  readonly id: string;
  readonly operation: "state-generation";
  readonly input: Readonly<{ kind: number; generation: Uint64 }>;
  readonly parameters: Readonly<{ previousGeneration: Uint64 }>;
}

export interface MigrationRequest {
  readonly id: string;
  readonly operation: "migration";
  readonly input: Readonly<{ oldState: Hex; oldArk: Hex; newArk: Hex }>;
  readonly parameters: Readonly<{ newArkEpoch: Uint64 }>;
}

export type VectorRequest =
  | Argon2idRequest
  | EnvelopeRequest
  | HkdfRequest
  | MigrationRequest
  | PasswordUtf8Request
  | PasswordUtf16BeRequest
  | StateGenerationRequest;

export interface ByteOutputSuccess {
  readonly outcome: "success";
  readonly output: Hex;
}

export interface CanonicalStateResult {
  readonly generation?: Uint64;
  readonly activeArkEpoch?: Uint64;
}

export interface StateResultSuccess {
  readonly outcome: "success";
  readonly state: CanonicalStateResult;
}

export interface VectorRejection {
  readonly outcome: "reject";
  readonly error: VectorError;
}

export type VectorExpectation = ByteOutputSuccess | StateResultSuccess | VectorRejection;
export type VectorObservation = VectorExpectation;

export type VectorCase = VectorRequest & { readonly expect: VectorExpectation };

export interface VectorCatalog {
  readonly cases: readonly VectorCase[];
  readonly catalogVersion: 1;
  readonly format: "neutron-crypto-vectors/v1";
}

const validatedCatalogBrand: unique symbol = Symbol("validatedCatalog");
const validatedCatalogs = new WeakSet<object>();

export interface ValidatedCatalog {
  readonly [validatedCatalogBrand]: true;
  readonly catalog: VectorCatalog;
}

export interface VectorVerifier {
  verify(request: VectorRequest): Promise<unknown> | unknown;
}

export interface VerificationResult {
  readonly id: string;
  readonly passed: boolean;
  readonly reason?: string;
}

export interface CatalogValidator {
  (candidate: unknown): boolean;
  errors?: unknown;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function loadValidatedCatalog(
  candidate: unknown,
  validate: CatalogValidator,
): ValidatedCatalog {
  if (!validate(candidate))
    throw new Error(`invalid vector catalog: ${JSON.stringify(validate.errors)}`);
  const catalog = structuredClone(candidate) as VectorCatalog;
  const ids = new Set<string>();
  for (const vector of catalog.cases) {
    if (ids.has(vector.id)) throw new Error(`duplicate vector id: ${vector.id}`);
    ids.add(vector.id);
  }
  const validated = deepFreeze({ [validatedCatalogBrand]: true as const, catalog });
  validatedCatalogs.add(validated);
  return validated;
}

const hex = /^(?:[0-9a-f]{2})*$/;
const uint64 =
  /^(?:0|[1-9][0-9]{0,18}|1[0-7][0-9]{18}|18[0-3][0-9]{17}|184[0-3][0-9]{16}|1844[0-5][0-9]{15}|18446[0-6][0-9]{14}|184467[0-3][0-9]{13}|1844674[0-3][0-9]{12}|18446744[0-6][0-9]{11}|184467440[0-6][0-9]{10}|1844674407[0-2][0-9]{9}|18446744073[0-6][0-9]{8}|184467440737[0-8][0-9]{7}|1844674407370[0-8][0-9]{6}|18446744073709[0-4][0-9]{5}|184467440737095[0-4][0-9]{4}|1844674407370955[0-0][0-9]{3}|18446744073709551[0-5][0-9]{2}|184467440737095516[0-0][0-9]|1844674407370955161[0-5])$/;
const errors = new Set<VectorError>([
  "authentication",
  "bounds",
  "invalid-password-encoding",
  "kdf-policy",
  "non-atomic-migration",
  "padding",
  "password-length",
  "structure",
  "unknown-critical-field",
  "unsupported-suite",
  "unsupported-version",
]);

function isCanonicalState(value: unknown): value is CanonicalStateResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  if (keys.length === 0 || keys.some((key) => key !== "generation" && key !== "activeArkEpoch"))
    return false;
  return Object.values(candidate).every((item) => typeof item === "string" && uint64.test(item));
}

function isObservation(value: unknown): value is VectorObservation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.outcome === "success") {
    const keys = Object.keys(candidate);
    if (
      keys.length !== 2 ||
      (!Object.hasOwn(candidate, "output") && !Object.hasOwn(candidate, "state"))
    )
      return false;
    return (
      (typeof candidate.output === "string" && hex.test(candidate.output)) ||
      isCanonicalState(candidate.state)
    );
  }
  return (
    candidate.outcome === "reject" &&
    Object.keys(candidate).length === 2 &&
    typeof candidate.error === "string" &&
    errors.has(candidate.error as VectorError)
  );
}

function compare(vector: VectorCase, value: unknown): VerificationResult {
  if (!isObservation(value)) return { id: vector.id, passed: false, reason: "invalid-observation" };
  const expected = vector.expect;
  if (expected.outcome !== value.outcome)
    return { id: vector.id, passed: false, reason: "outcome" };
  if (expected.outcome === "reject" && value.outcome === "reject")
    return expected.error === value.error
      ? { id: vector.id, passed: true }
      : { id: vector.id, passed: false, reason: "error" };
  if (expected.outcome === "success" && value.outcome === "success") {
    if ("output" in expected && "output" in value)
      return expected.output === value.output
        ? { id: vector.id, passed: true }
        : { id: vector.id, passed: false, reason: "output" };
    if ("state" in expected && "state" in value)
      return JSON.stringify(expected.state) === JSON.stringify(value.state)
        ? { id: vector.id, passed: true }
        : { id: vector.id, passed: false, reason: "state" };
  }
  return { id: vector.id, passed: false, reason: "result-kind" };
}

function requestOf(vector: VectorCase): VectorRequest {
  const { expect: _expect, ...request } = vector;
  return deepFreeze(structuredClone(request) as VectorRequest);
}

export async function verifyCatalog(
  validated: ValidatedCatalog,
  verifier: VectorVerifier,
): Promise<readonly VerificationResult[]> {
  if (!validatedCatalogs.has(validated)) {
    throw new Error("catalog was not produced by loadValidatedCatalog");
  }
  return Promise.all(
    validated.catalog.cases.map(async (vector) =>
      compare(vector, await verifier.verify(requestOf(vector))),
    ),
  );
}
