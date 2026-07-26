import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import {
  loadValidatedCatalog,
  type ValidatedCatalog,
  type VectorCatalog,
  type VectorObservation,
  type VectorVerifier,
  verifyCatalog,
} from "../src/index.js";
import * as isolatedIndex from "../src/index.js?isolated";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = join(packageRoot, "fixtures/crypto-envelope-v1.json");
const schemaPath = join(packageRoot, "schema/crypto-envelope-v1.schema.json");
const pendingPath = join(packageRoot, "requirements/crypto-envelope-v1.pending.json");
const pendingSchemaPath = join(packageRoot, "schema/crypto-envelope-v1.pending.schema.json");
const digestPath = join(packageRoot, "fixtures/crypto-envelope-v1.sha256");

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
  it("validates the executable catalog and separate pending manifest", async () => {
    const [catalog, pending, validateCatalog, validatePending] = await Promise.all([
      loadJson(fixturePath),
      loadJson(pendingPath),
      validator(schemaPath),
      validator(pendingSchemaPath),
    ]);
    expect(validateCatalog(catalog), JSON.stringify(validateCatalog.errors)).toBe(true);
    expect(validatePending(pending), JSON.stringify(validatePending.errors)).toBe(true);
    expect((catalog as { cases: unknown[] }).cases).toHaveLength(6);
    expect((pending as { requirements: unknown[] }).requirements).toHaveLength(36);
    expect(JSON.stringify(pending)).not.toContain('"expect"');
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
          candidate.input = { kind: 16, generation: 9007199254740992 };
          candidate.parameters = { previousGeneration: "0" };
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
      operation: "envelope",
      input: {
        envelope: "00",
        header: "00".repeat(72),
        key: "00".repeat(32),
        nonce: "00".repeat(24),
        salt: "",
      },
      parameters: { accountId: "11".repeat(16), objectId: "22".repeat(16) },
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
      ["wrong envelope key", (value: typeof base) => (value.input.key = "00")],
      ["wrong envelope nonce", (value: typeof base) => (value.input.nonce = "00")],
      ["wrong envelope salt", (value: typeof base) => (value.input.salt = "00")],
      ["wrong envelope header", (value: typeof base) => (value.input.header = "00")],
      ["wrong account ID", (value: typeof base) => (value.parameters.accountId = "00")],
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
