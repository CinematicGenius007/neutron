import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import {
  canonicalStatesEqual,
  isUint64,
  loadValidatedCatalog,
  loadValidatedPendingManifest,
  type StateGenerationRequest,
  uint64DecimalPattern,
  type ValidatedCatalog,
  type VectorCatalog,
  type VectorObservation,
  type VectorVerifier,
  verifyCatalog,
} from "../src/index.js";
import * as isolatedIndex from "../src/index.js?isolated";
import { portableReferenceVerifier } from "./portable-reference-verifier.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = join(packageRoot, "fixtures/crypto-envelope-v1.json");
const schemaPath = join(packageRoot, "schema/crypto-envelope-v1.schema.json");
const pendingPath = join(packageRoot, "requirements/crypto-envelope-v1.pending.json");
const pendingSchemaPath = join(packageRoot, "schema/crypto-envelope-v1.pending.schema.json");
const digestPath = join(packageRoot, "fixtures/crypto-envelope-v1.sha256");
const repositoryRoot = join(packageRoot, "..", "..");
const maxUint64 = 0xffff_ffff_ffff_ffffn;
const maxBlobGeneration = 16_777_215n;

function executeStateGeneration(request: StateGenerationRequest): VectorObservation {
  if (request.input.action === "validate") {
    const candidate = BigInt(request.input.candidateGeneration);
    const minimum = request.input.kind === "blob" ? 0n : 1n;
    const maximum = request.input.kind === "blob" ? maxBlobGeneration : maxUint64;
    return candidate < minimum || candidate > maximum
      ? { outcome: "reject", error: "bounds" }
      : { outcome: "success", state: { generation: candidate.toString() } };
  }
  const current = BigInt(request.input.currentGeneration);
  if (current === maxUint64) return { outcome: "reject", error: "bounds" };
  const successor = current + 1n;
  return request.input.kind === "blob" && successor > maxBlobGeneration
    ? { outcome: "reject", error: "bounds" }
    : { outcome: "success", state: { generation: successor.toString() } };
}

async function loadJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function validator(schemaPathname: string) {
  const schema = await loadJson(schemaPathname);
  return new Ajv2020({ allErrors: true, strict: true }).compile(schema);
}

async function loadCatalog(candidate?: unknown): Promise<ValidatedCatalog> {
  const [validate, raw] = await Promise.all([validator(schemaPath), loadJson(fixturePath)]);
  return loadValidatedCatalog(candidate ?? raw, validate);
}

async function validatedSubset(
  catalog: VectorCatalog,
  cases: readonly VectorCatalog["cases"][number][],
): Promise<ValidatedCatalog> {
  return loadValidatedCatalog({ ...catalog, cases }, await validator(schemaPath));
}

function firstCase(raw: unknown): Record<string, unknown> {
  const catalog = raw as { cases: unknown[] };
  const candidate = catalog.cases[0];
  if (typeof candidate !== "object" || candidate === null) throw new Error("fixture has no case");
  return candidate as Record<string, unknown>;
}

describe("crypto-envelope v1 executable catalog", () => {
  it("verifies every executable vector through the independent portable adapter", async () => {
    const catalog = await loadCatalog();
    const results = await verifyCatalog(catalog, portableReferenceVerifier);
    expect(results).toHaveLength(83);
    expect(results.filter(({ passed }) => !passed)).toEqual([]);
  }, 30_000);

  it("validates the executable catalog and separate pending manifest", async () => {
    const [catalog, pending, validateCatalog, validatePending] = await Promise.all([
      loadJson(fixturePath),
      loadJson(pendingPath),
      validator(schemaPath),
      validator(pendingSchemaPath),
    ]);
    expect(validateCatalog(catalog), JSON.stringify(validateCatalog.errors)).toBe(true);
    expect(validatePending(pending), JSON.stringify(validatePending.errors)).toBe(true);
    const executable = catalog as {
      cases: Array<{
        id: string;
        operation: string;
        originatingRequirementId: string;
        expect: { outcome: string };
      }>;
    };
    const requirements = pending as {
      requirements: Array<{
        id: string;
        operation: string;
        originatingRequirementId: string;
        ownerTask: string;
        blockingStage: string;
        dependency: string | null;
        requiredOutcome: string;
      }>;
    };
    expect(executable.cases).toHaveLength(83);
    expect(requirements.requirements).toHaveLength(5);
    expect(requirements.requirements.filter(({ ownerTask }) => ownerTask === "0005")).toHaveLength(
      0,
    );
    expect(requirements.requirements.filter(({ ownerTask }) => ownerTask === "0010")).toHaveLength(
      5,
    );
    for (const requirement of requirements.requirements) {
      if (requirement.ownerTask === "0005") {
        expect({ stage: requirement.blockingStage, dependency: requirement.dependency }).toEqual({
          stage: "stage-1",
          dependency: null,
        });
      } else {
        expect({ stage: requirement.blockingStage, dependency: requirement.dependency }).toEqual({
          stage: "stage-3",
          dependency: "0004",
        });
      }
    }
    expect(() =>
      loadValidatedPendingManifest(
        pending,
        validatePending,
        executable.cases.map(({ id }) => id),
      ),
    ).not.toThrow();
    expect(
      new Set(
        [...executable.cases, ...requirements.requirements].map(
          ({ originatingRequirementId }) => originatingRequirementId,
        ),
      ).size,
    ).toBe(77);
    expect(executable.cases.filter(({ operation }) => operation === "hkdf-sha256")).toHaveLength(1);
    expect(executable.cases.filter(({ operation }) => operation === "argon2id")).toHaveLength(1);
    expect(
      executable.cases.filter(({ operation }) => operation === "password-encoding"),
    ).toHaveLength(6);
    expect(
      requirements.requirements.filter(({ requiredOutcome }) => requiredOutcome === "success"),
    ).toHaveLength(2);
    expect(
      requirements.requirements.filter(({ requiredOutcome }) => requiredOutcome === "reject"),
    ).toHaveLength(3);
    const countByOperationAndOutcome = <T extends { operation: string }>(
      entries: readonly (T & { outcome?: string; requiredOutcome?: string })[],
    ) =>
      Object.fromEntries(
        Object.entries(Object.groupBy(entries, ({ operation }) => operation)).map(
          ([operation, values]) => [
            operation,
            {
              success:
                values?.filter((entry) => (entry.outcome ?? entry.requiredOutcome) === "success")
                  .length ?? 0,
              reject:
                values?.filter((entry) => (entry.outcome ?? entry.requiredOutcome) === "reject")
                  .length ?? 0,
            },
          ],
        ),
      );
    expect(
      countByOperationAndOutcome(
        executable.cases.map(({ operation, expect }) => ({ operation, outcome: expect.outcome })),
      ),
    ).toEqual({
      "hkdf-sha256": { success: 1, reject: 0 },
      argon2id: { success: 1, reject: 0 },
      "password-encoding": { success: 3, reject: 3 },
      "state-generation": { success: 8, reject: 5 },
      envelope: { success: 9, reject: 49 },
      migration: { success: 2, reject: 2 },
    });
    expect(countByOperationAndOutcome(requirements.requirements)).toEqual({
      "state-generation": { success: 0, reject: 1 },
      migration: { success: 2, reject: 2 },
    });
    expect(JSON.stringify(pending)).not.toContain('"expect"');
  });

  it("enforces pending IDs and disjoint executable coverage", async () => {
    const [catalog, pending, validatePending] = await Promise.all([
      loadJson(fixturePath),
      loadJson(pendingPath),
      validator(pendingSchemaPath),
    ]);
    const executableIds = (catalog as { cases: Array<{ id: string }> }).cases.map(({ id }) => id);
    const duplicate = structuredClone(pending) as { requirements: Array<{ id: string }> };
    const firstRequirement = duplicate.requirements[0];
    const firstExecutableId = executableIds[0];
    if (firstRequirement === undefined || firstExecutableId === undefined)
      throw new Error("fixture IDs missing");
    duplicate.requirements.push(firstRequirement);
    expect(() => loadValidatedPendingManifest(duplicate, validatePending, executableIds)).toThrow(
      "duplicate pending requirement id",
    );
    const overlap = structuredClone(pending) as { requirements: Array<{ id: string }> };
    const overlappingRequirement = overlap.requirements[0];
    if (overlappingRequirement === undefined) throw new Error("pending requirement missing");
    overlappingRequirement.id = firstExecutableId;
    expect(() => loadValidatedPendingManifest(overlap, validatePending, executableIds)).toThrow(
      "pending requirement overlaps executable vector",
    );
    const missingOutcome = structuredClone(pending) as {
      requirements: Array<Record<string, unknown>>;
    };
    delete missingOutcome.requirements[0]?.requiredOutcome;
    expect(validatePending(missingOutcome)).toBe(false);
    const invalidOutcome = structuredClone(pending) as {
      requirements: Array<{ requiredOutcome: string }>;
    };
    const firstInvalidOutcome = invalidOutcome.requirements[0];
    if (firstInvalidOutcome === undefined) throw new Error("pending requirement missing");
    firstInvalidOutcome.requiredOutcome = "unknown";
    expect(validatePending(invalidOutcome)).toBe(false);
    const wrongStage = structuredClone(pending) as {
      requirements: Array<{
        ownerTask: string;
        blockingStage: string;
        dependency: string | null;
      }>;
    };
    const firstWrongStage = wrongStage.requirements[0];
    if (firstWrongStage === undefined) throw new Error("pending requirement missing");
    firstWrongStage.blockingStage = "stage-1";
    firstWrongStage.dependency = null;
    expect(validatePending(wrongStage)).toBe(false);
  });

  it("resolves every structured pending reference to an exact Markdown heading", async () => {
    const pending = (await loadJson(pendingPath)) as {
      requirements: Array<{ references: Array<{ document: string; section: string }> }>;
    };
    const documents = new Map<string, string>();
    for (const { document, section } of pending.requirements.flatMap(
      ({ references }) => references,
    )) {
      const contents =
        documents.get(document) ?? (await readFile(join(repositoryRoot, document), "utf8"));
      documents.set(document, contents);
      expect(contents).toContain(`## ${section}`);
    }
  });

  it("keeps schema and runtime uint64 checks synchronized at the full boundary", async () => {
    const schema = (await loadJson(schemaPath)) as { $defs: { uint64: { pattern: string } } };
    const validate = await validator(schemaPath);
    expect(schema.$defs.uint64.pattern).toBe(uint64DecimalPattern);
    const accepted = ["0", "1", "18446744073709551614", "18446744073709551615"];
    const rejected: unknown[] = [
      "00",
      "01",
      "-1",
      "+1",
      "1.0",
      "1e3",
      "18446744073709551616",
      "18446744073709551999",
      "99999999999999999999",
      1,
      Number.MAX_SAFE_INTEGER + 1,
    ];
    for (const value of accepted) {
      expect(isUint64(value)).toBe(true);
      const candidate = {
        format: "neutron-crypto-vectors/v1",
        catalogVersion: 1,
        cases: [
          {
            id: "state-uint64-boundary",
            originatingRequirementId: "generation-root-initial",
            operation: "state-generation",
            input: {
              action: "validate",
              candidateGeneration: value,
              kind: "root",
            },
            parameters: {},
            expect: { outcome: "reject", error: "bounds" },
          },
        ],
      };
      expect(validate(candidate), JSON.stringify(validate.errors)).toBe(true);
    }
    for (const value of rejected) {
      expect(isUint64(value)).toBe(false);
      const candidate = {
        format: "neutron-crypto-vectors/v1",
        catalogVersion: 1,
        cases: [
          {
            id: "state-uint64-boundary",
            originatingRequirementId: "generation-root-initial",
            operation: "state-generation",
            input: {
              action: "validate",
              candidateGeneration: value,
              kind: "root",
            },
            parameters: {},
            expect: { outcome: "reject", error: "bounds" },
          },
        ],
      };
      expect(validate(candidate), JSON.stringify(validate.errors)).toBe(false);
    }
  });

  it("matches the executable-only digest", async () => {
    const [fixture, expectedDigest] = await Promise.all([
      readFile(fixturePath),
      readFile(digestPath, "utf8"),
    ]);
    expect(createHash("sha256").update(fixture).digest("hex")).toBe(expectedDigest.trim());
  });

  it("rejects aliases, cross-operation fields, malformed material, and unsafe uint64 JSON numbers", async () => {
    const validate = await validator(schemaPath);
    const raw = await loadJson(fixturePath);
    const cases: Array<[string, (candidate: Record<string, unknown>) => void]> = [
      ["input/expect alias", (candidate) => (candidate.input = candidate.expect)],
      [
        "outcome in input",
        (candidate) => ((candidate.input as Record<string, unknown>).outcome = "success"),
      ],
      [
        "output in input",
        (candidate) => ((candidate.input as Record<string, unknown>).output = "00"),
      ],
      [
        "error in input",
        (candidate) => ((candidate.input as Record<string, unknown>).error = "bounds"),
      ],
      [
        "expect in input",
        (candidate) => ((candidate.input as Record<string, unknown>).expect = {}),
      ],
      ["HKDF banana", (candidate) => ((candidate.input as Record<string, unknown>).banana = "00")],
      [
        "HKDF potato parameter",
        (candidate) => ((candidate.parameters as Record<string, unknown>).potato = 1),
      ],
      ["odd-length hex", (candidate) => ((candidate.input as Record<string, unknown>).ikm = "0")],
      ["uppercase hex", (candidate) => ((candidate.input as Record<string, unknown>).ikm = "AA")],
      ["empty HKDF IKM", (candidate) => ((candidate.input as Record<string, unknown>).ikm = "")],
      [
        "unsafe uint64 JSON number",
        (candidate) => {
          candidate.operation = "state-generation";
          candidate.originatingRequirementId = "generation-root-initial";
          candidate.input = {
            action: "validate",
            candidateGeneration: 9007199254740992,
            kind: "root",
          };
          candidate.parameters = {};
          candidate.expect = { outcome: "reject", error: "bounds" };
        },
      ],
    ];
    for (const [name, mutate] of cases) {
      const candidate = structuredClone(raw) as Record<string, unknown>;
      mutate(firstCase(candidate));
      expect(validate(candidate), `${name}: ${JSON.stringify(validate.errors)}`).toBe(false);
    }
    const wrongArgon = structuredClone(raw) as { cases: Array<Record<string, unknown>> };
    const argon = wrongArgon.cases.find((candidate) => candidate.operation === "argon2id");
    if (argon === undefined) throw new Error("fixture has no Argon2id case");
    (argon.input as Record<string, unknown>).salt = "00";
    expect(validate(wrongArgon), JSON.stringify(validate.errors)).toBe(false);
  });

  it("strictly validates every future operation branch", async () => {
    const validate = await validator(schemaPath);
    const base = {
      id: "future-envelope-rejection",
      originatingRequirementId: "future-envelope-rejection",
      operation: "envelope",
      input: {
        envelope: "00",
        keySource: { source: "parent", parentKey: "00".repeat(32) },
      },
      parameters: {},
      expect: { outcome: "reject", error: "structure" },
    };
    const candidateCatalog = (vector: typeof base) => ({
      format: "neutron-crypto-vectors/v1",
      catalogVersion: 1,
      cases: [vector],
    });
    expect(validate(candidateCatalog(base)), JSON.stringify(validate.errors)).toBe(true);
    for (const [name, mutate] of [
      ["empty envelope", (value: typeof base) => (value.input.envelope = "")],
      ["wrong parent key", (value: typeof base) => (value.input.keySource.parentKey = "00")],
      [
        "unknown key-source field",
        (value: typeof base) => ((value.input.keySource as Record<string, string>).extra = "00"),
      ],
      [
        "unknown envelope field",
        (value: typeof base) => ((value.input as Record<string, string>).extra = "00"),
      ],
      ["success without output", (value: typeof base) => (value.expect = { outcome: "success" })],
      [
        "success plus error",
        (value: typeof base) =>
          (value.expect = { outcome: "success", output: "00", error: "bounds" }),
      ],
      [
        "rejection plus output",
        (value: typeof base) =>
          (value.expect = { outcome: "reject", error: "bounds", output: "00" }),
      ],
    ] as const) {
      const candidate = structuredClone(base);
      mutate(candidate);
      expect(
        validate(candidateCatalog(candidate)),
        `${name}: ${JSON.stringify(validate.errors)}`,
      ).toBe(false);
    }

    const repeatedEnvelopeOutput = structuredClone(base) as typeof base & {
      expect: { outcome: string; output?: unknown; error?: string };
    };
    repeatedEnvelopeOutput.expect = {
      outcome: "success",
      output: { repeatByte: "00", repeatCount: 1 },
    };
    expect(validate(candidateCatalog(repeatedEnvelopeOutput))).toBe(false);

    for (const password of ["", "61".repeat(1025)]) {
      const passwordEnvelope = structuredClone(base) as typeof base;
      passwordEnvelope.input.keySource = {
        source: "password",
        password,
      } as unknown as typeof passwordEnvelope.input.keySource;
      expect(validate(candidateCatalog(passwordEnvelope))).toBe(false);
    }
  });

  it("requires Unicode scalar conversion and rejects dishonest echo adapters", async () => {
    const catalog = await loadCatalog();
    const executablePasswords = catalog.catalog.cases.filter(
      (vector) => vector.operation === "password-encoding" && vector.expect.outcome === "success",
    );
    expect(executablePasswords).toHaveLength(3);
    for (const vector of executablePasswords) {
      expect("scalars" in vector.input || "repeatScalar" in vector.input).toBe(true);
      expect("utf8" in vector.input).toBe(false);
    }
    const firstPassword = executablePasswords[0];
    if (firstPassword === undefined) throw new Error("password vector missing");
    const selected = await validatedSubset(catalog.catalog, [firstPassword]);
    await expect(
      verifyCatalog(selected, {
        verify: (request) => ({
          outcome: "success",
          output: (request.input as { scalars: readonly number[] }).scalars.join(""),
        }),
      }),
    ).resolves.toEqual([{ id: "password-utf8-multibyte-nul", passed: false, reason: "output" }]);

    const validate = await validator(schemaPath);
    const raw = await loadJson(fixturePath);
    const password = (raw as { cases: Array<Record<string, unknown>> }).cases.find(
      ({ id }) => id === "password-utf8-multibyte-nul",
    );
    if (password === undefined) throw new Error("password vector missing");
    for (const invalidScalar of [55296, 57343, 1114112]) {
      const candidate = structuredClone(raw) as { cases: Array<Record<string, unknown>> };
      const target = candidate.cases.find(({ id }) => id === "password-utf8-multibyte-nul");
      if (target === undefined) throw new Error("password vector missing");
      (target.input as { scalars: number[] }).scalars.push(invalidScalar);
      expect(validate(candidate), JSON.stringify(validate.errors)).toBe(false);
    }
  });

  it("verifies password byte boundaries and envelope-local generation actions", async () => {
    const catalog = await loadCatalog();
    const passwordBoundary = catalog.catalog.cases.filter(
      ({ id }) =>
        id === "password-accept-1024-utf8-bytes" || id === "password-reject-1025-utf8-bytes",
    );
    const generations = catalog.catalog.cases.filter(
      ({ operation }) => operation === "state-generation",
    );
    expect(passwordBoundary).toHaveLength(2);
    expect(generations).toHaveLength(13);
    const selected = await validatedSubset(catalog.catalog, passwordBoundary);
    await expect(
      verifyCatalog(selected, {
        verify: (request) =>
          request.id === "password-accept-1024-utf8-bytes"
            ? { outcome: "success", output: "61".repeat(1024) }
            : { outcome: "reject", error: "password-length" },
      }),
    ).resolves.toEqual([
      { id: "password-accept-1024-utf8-bytes", passed: true },
      { id: "password-reject-1025-utf8-bytes", passed: true },
    ]);
    const generationCatalog = await validatedSubset(catalog.catalog, generations);
    await expect(
      verifyCatalog(generationCatalog, {
        verify: (request) => {
          if (request.operation !== "state-generation") throw new Error("unexpected operation");
          return executeStateGeneration(request);
        },
      }),
    ).resolves.toEqual(generations.map(({ id }) => ({ id, passed: true })));
    expect(generations.map(({ id }) => id)).toContain("generation-root-successor");
    expect(generations.map(({ id }) => id)).toContain("generation-reject-zero-root");
  });

  it("rejects ambiguous state-generation action inputs", async () => {
    const raw = (await loadJson(fixturePath)) as { cases: Array<Record<string, unknown>> };
    const validate = await validator(schemaPath);
    const rootInitial = raw.cases.find(({ id }) => id === "generation-root-initial");
    const rootSuccessor = raw.cases.find(({ id }) => id === "generation-root-successor");
    if (rootInitial === undefined || rootSuccessor === undefined)
      throw new Error("generation vectors missing");

    const validationWithCurrent = structuredClone(raw);
    const validationTarget = validationWithCurrent.cases.find(
      ({ id }) => id === "generation-root-initial",
    );
    if (validationTarget === undefined) throw new Error("generation vector missing");
    (validationTarget.input as Record<string, unknown>).currentGeneration = "0";
    expect(validate(validationWithCurrent), JSON.stringify(validate.errors)).toBe(false);

    const incrementWithCandidate = structuredClone(raw);
    const incrementTarget = incrementWithCandidate.cases.find(
      ({ id }) => id === "generation-root-successor",
    );
    if (incrementTarget === undefined) throw new Error("generation vector missing");
    (incrementTarget.input as Record<string, unknown>).candidateGeneration = "2";
    expect(validate(incrementWithCandidate), JSON.stringify(validate.errors)).toBe(false);
  });

  it("compares the closed generation state and rejects mismatches", () => {
    expect(canonicalStatesEqual({ generation: "1" }, { generation: "1" })).toBe(true);
    expect(
      canonicalStatesEqual({ generation: "1", activeArkEpoch: "2" }, { generation: "1" }),
    ).toBe(false);
    expect(canonicalStatesEqual({ generation: "1" }, { generation: "1", extra: "2" })).toBe(false);
    expect(canonicalStatesEqual({ generation: "1" }, { generation: "2" })).toBe(false);
    expect(
      canonicalStatesEqual(
        { generation: "18446744073709551616" },
        { generation: "18446744073709551616" },
      ),
    ).toBe(false);
  });

  it("rejects invalid uint64 state observations at runtime", async () => {
    const catalog = await loadCatalog({
      format: "neutron-crypto-vectors/v1",
      catalogVersion: 1,
      cases: [
        {
          id: "state-runtime-uint64",
          originatingRequirementId: "generation-root-initial",
          operation: "state-generation",
          input: {
            action: "validate",
            candidateGeneration: "1",
            kind: "root",
          },
          parameters: {},
          expect: { outcome: "success", state: { generation: "1" } },
        },
      ],
    });
    await expect(
      verifyCatalog(catalog, {
        verify: () => ({ outcome: "success", state: { generation: "18446744073709551616" } }),
      }),
    ).resolves.toEqual([
      { id: "state-runtime-uint64", passed: false, reason: "invalid-observation" },
    ]);
  });

  it("never invokes an adapter for an invalid catalog", async () => {
    const raw = await loadJson(fixturePath);
    firstCase(raw).input = { ikm: "00", salt: "", info: "", expect: {} };
    const verifier: VectorVerifier = {
      verify: () => {
        throw new Error("must not run");
      },
    };
    await expect(async () => verifyCatalog(await loadCatalog(raw), verifier)).rejects.toThrow(
      "invalid vector catalog",
    );
  });

  it("projects frozen requests and preserves loaded values against source and request mutation", async () => {
    const raw = await loadJson(fixturePath);
    const loaded = await loadCatalog(raw);
    (firstCase(raw).input as Record<string, unknown>).ikm = "00";
    const first = loaded.catalog.cases[0];
    if (first === undefined) throw new Error("catalog has no HKDF case");
    const selected = await validatedSubset(loaded.catalog, [first]);
    const verifier: VectorVerifier = {
      verify(request) {
        expect(Object.isFrozen(request)).toBe(true);
        expect(Object.isFrozen(request.input)).toBe(true);
        expect("expect" in request).toBe(false);
        expect((request.input as { ikm: string }).ikm).toBe("0b".repeat(22));
        expect(() => ((request.input as { ikm: string }).ikm = "00")).toThrow();
        return {
          outcome: "success",
          output:
            "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865",
        };
      },
    };
    await expect(verifyCatalog(selected, verifier)).resolves.toEqual([
      { id: "rfc5869-sha256-case-1", passed: true },
    ]);
  });

  it("rejects forged, spread, cloned, prototype-derived, and second-module wrappers before adapter invocation", async () => {
    const loaded = await loadCatalog();
    const verifier: VectorVerifier = {
      verify: () => {
        throw new Error("must not run");
      },
    };
    const attempts: ValidatedCatalog[] = [
      { catalog: loaded.catalog } as ValidatedCatalog,
      { ...loaded },
      structuredClone(loaded),
      Object.create(loaded) as ValidatedCatalog,
    ];
    attempts.push(isolatedIndex.loadValidatedCatalog(loaded.catalog, await validator(schemaPath)));
    for (const attempt of attempts) {
      await expect(verifyCatalog(attempt, verifier)).rejects.toThrow(
        "catalog was not produced by loadValidatedCatalog",
      );
    }
  });

  it("compares exact output and rejection observations and rejects malformed results", async () => {
    const catalog = await loadCatalog();
    const hkdf = catalog.catalog.cases[0];
    const invalidUtf16 = catalog.catalog.cases[3];
    if (hkdf === undefined || invalidUtf16 === undefined) throw new Error("catalog cases missing");
    const selected = await validatedSubset(catalog.catalog, [hkdf, invalidUtf16]);
    const observations: Record<string, VectorObservation> = {
      "rfc5869-sha256-case-1": {
        outcome: "success",
        output:
          "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865",
      },
      "password-utf16be-reject-unpaired-surrogate": {
        outcome: "reject",
        error: "invalid-password-encoding",
      },
    };
    await expect(
      verifyCatalog(selected, {
        verify: (request) => {
          const observation = observations[request.id];
          if (observation === undefined) throw new Error(`missing observation: ${request.id}`);
          return observation;
        },
      }),
    ).resolves.toEqual([
      { id: "rfc5869-sha256-case-1", passed: true },
      { id: "password-utf16be-reject-unpaired-surrogate", passed: true },
    ]);
    await expect(
      verifyCatalog(selected, { verify: () => ({ outcome: "success", error: "bounds" }) }),
    ).resolves.toEqual([
      { id: "rfc5869-sha256-case-1", passed: false, reason: "invalid-observation" },
      {
        id: "password-utf16be-reject-unpaired-surrogate",
        passed: false,
        reason: "invalid-observation",
      },
    ]);
  });
});
