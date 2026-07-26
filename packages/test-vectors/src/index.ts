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

export interface VectorExpectation {
  readonly assertions?: readonly string[];
  readonly error?: VectorError;
  readonly outcome: "reject" | "success";
  readonly output?: string;
}

export interface VectorRequest {
  readonly id: string;
  readonly input: Readonly<Record<string, boolean | number | string>>;
  readonly operation: VectorOperation;
  readonly parameters: Readonly<Record<string, boolean | number | string>>;
}

export interface VectorCase extends VectorRequest {
  readonly expect: VectorExpectation;
}

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

export interface VectorObservation {
  readonly assertions?: readonly string[];
  readonly error?: VectorError;
  readonly outcome: "reject" | "success";
  readonly output?: string;
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
const assertion = /^[a-z0-9][a-z0-9-]{2,79}$/;

function isObservation(value: unknown): value is VectorObservation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  if (keys.some((key) => !["assertions", "error", "outcome", "output"].includes(key))) return false;
  if (candidate.outcome !== "success" && candidate.outcome !== "reject") return false;
  if (
    candidate.outcome === "success" &&
    (typeof candidate.output !== "string" || candidate.error !== undefined)
  )
    return false;
  if (
    candidate.outcome === "reject" &&
    (typeof candidate.error !== "string" || candidate.output !== undefined)
  )
    return false;
  const output = candidate.output;
  if (output !== undefined && (typeof output !== "string" || !hex.test(output))) return false;
  if (
    candidate.assertions !== undefined &&
    (!Array.isArray(candidate.assertions) ||
      candidate.assertions.some((item) => typeof item !== "string" || !assertion.test(item)) ||
      new Set(candidate.assertions).size !== candidate.assertions.length)
  )
    return false;
  return true;
}

function sameAssertions(
  expected: readonly string[] | undefined,
  observed: readonly string[] | undefined,
): boolean {
  if ((expected?.length ?? 0) !== (observed?.length ?? 0)) return false;
  return (expected ?? []).every((item, index) => item === observed?.[index]);
}

function compare(vector: VectorCase, value: unknown): VerificationResult {
  if (!isObservation(value)) return { id: vector.id, passed: false, reason: "invalid-observation" };
  const { expect } = vector;
  if (expect.outcome !== value.outcome) return { id: vector.id, passed: false, reason: "outcome" };
  if (expect.error !== value.error) return { id: vector.id, passed: false, reason: "error" };
  if (expect.output !== value.output) return { id: vector.id, passed: false, reason: "output" };
  if (!sameAssertions(expect.assertions, value.assertions))
    return { id: vector.id, passed: false, reason: "assertions" };
  return { id: vector.id, passed: true };
}

function requestOf(vector: VectorCase): VectorRequest {
  const { expect: _expect, ...request } = vector;
  return deepFreeze(structuredClone(request));
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
