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

export interface VectorCase {
  readonly expect: VectorExpectation;
  readonly id: string;
  readonly input: Readonly<Record<string, boolean | number | string>>;
  readonly operation: VectorOperation;
  readonly parameters: Readonly<Record<string, boolean | number | string>>;
}

export interface VectorCatalog {
  readonly cases: readonly VectorCase[];
  readonly catalogVersion: 1;
  readonly format: "neutron-crypto-vectors/v1";
}

export interface VectorObservation {
  readonly assertions?: readonly string[];
  readonly error?: VectorError;
  readonly outcome: "reject" | "success";
  readonly output?: string;
}

/**
 * Implementations supply this adapter. It intentionally has no generator API:
 * expected values come only from the immutable catalog, never from a verifier.
 */
export interface VectorVerifier {
  verify(vector: VectorCase): Promise<VectorObservation> | VectorObservation;
}

export interface VerificationResult {
  readonly id: string;
  readonly passed: boolean;
  readonly reason?: string;
}

function sameAssertions(
  expected: readonly string[] | undefined,
  observed: readonly string[] | undefined,
): boolean {
  return (
    [...(expected ?? [])].sort().join("\u0000") === [...(observed ?? [])].sort().join("\u0000")
  );
}

function compare(vector: VectorCase, observed: VectorObservation): VerificationResult {
  const expected = vector.expect;
  if (expected.outcome !== observed.outcome) {
    return { id: vector.id, passed: false, reason: "outcome" };
  }
  if (expected.error !== observed.error) {
    return { id: vector.id, passed: false, reason: "error" };
  }
  if (expected.output !== observed.output) {
    return { id: vector.id, passed: false, reason: "output" };
  }
  if (!sameAssertions(expected.assertions, observed.assertions)) {
    return { id: vector.id, passed: false, reason: "assertions" };
  }
  return { id: vector.id, passed: true };
}

export async function verifyCatalog(
  catalog: VectorCatalog,
  verifier: VectorVerifier,
): Promise<readonly VerificationResult[]> {
  return Promise.all(
    catalog.cases.map(async (vector) => compare(vector, await verifier.verify(vector))),
  );
}
