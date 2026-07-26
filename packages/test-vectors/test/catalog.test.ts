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

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = join(packageRoot, "fixtures/crypto-envelope-v1.json");
const schemaPath = join(packageRoot, "schema/crypto-envelope-v1.schema.json");
const digestPath = join(packageRoot, "fixtures/crypto-envelope-v1.sha256");

async function loadJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function loadCatalog(): Promise<ValidatedCatalog> {
  const [schema, candidate] = await Promise.all([loadJson(schemaPath), loadJson(fixturePath)]);
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  return loadValidatedCatalog(candidate, validate);
}

async function validatedSubset(
  catalog: VectorCatalog,
  cases: readonly VectorCatalog["cases"][number][],
): Promise<ValidatedCatalog> {
  const schema = await loadJson(schemaPath);
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  return loadValidatedCatalog({ ...catalog, cases }, validate);
}

describe("crypto-envelope v1 catalog", () => {
  it("is validated by a real Draft 2020-12 JSON Schema validator", async () => {
    const [schema, rawCatalog] = await Promise.all([loadJson(schemaPath), loadJson(fixturePath)]);
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

    expect(validate(rawCatalog), JSON.stringify(validate.errors)).toBe(true);

    const malformed = structuredClone(rawCatalog) as { cases: Array<{ expect: object }> };
    const firstMalformedCase = malformed.cases[0];
    if (firstMalformedCase === undefined) {
      throw new Error("fixture has no cases");
    }
    firstMalformedCase.expect = { outcome: "reject" };
    expect(validate(malformed)).toBe(false);

    const duplicate = structuredClone(rawCatalog) as { cases: unknown[] };
    const duplicateCase = duplicate.cases[0];
    if (duplicateCase === undefined) throw new Error("fixture has no cases");
    duplicate.cases.push(duplicateCase);
    expect(() => loadValidatedCatalog(duplicate, validate)).toThrow("duplicate vector id");
  });

  it("matches the recorded immutable catalog digest", async () => {
    const [fixture, expectedDigest] = await Promise.all([
      readFile(fixturePath),
      readFile(digestPath, "utf8"),
    ]);
    const actualDigest = createHash("sha256").update(fixture).digest("hex");

    expect(expectedDigest.trim()).toBe(actualDigest);
  });

  it("represents every protocol boundary with explicit rejection expectations", async () => {
    const catalog = await loadCatalog();
    const ids = new Set(catalog.catalog.cases.map((vector) => vector.id));
    const kinds = new Set(
      catalog.catalog.cases
        .filter((vector) => vector.operation === "envelope")
        .map((vector) => vector.input.kind),
    );
    const labels = new Set(
      catalog.catalog.cases
        .filter((vector) => typeof vector.input.label === "string")
        .map((vector) => vector.input.label),
    );

    expect(kinds).toEqual(new Set([1, 2, 3, 4, 5, 16, 17, 18, undefined]));
    expect(labels).toEqual(
      new Set([
        "recovery/ark-wrap",
        "ark/child-key-wrap",
        "vault/item-key-wrap",
        "item/attachment-key-wrap",
        "item/payload-aead",
        "attachment/chunk-aead",
        "vault/index-shard-aead",
      ]),
    );
    for (const id of [
      "reject-wrong-key-authentication",
      "reject-wrong-aad-authentication",
      "reject-wrong-envelope-kind",
      "reject-unknown-envelope-suite",
      "reject-unknown-envelope-version",
      "reject-flags-and-reserved-fields",
      "reject-mutated-ciphertext-authentication",
      "reject-truncated-envelope",
      "reject-extended-envelope",
      "reject-malformed-ciphertext-length",
      "reject-oversized-envelope",
      "migration-minimum-ark-rewrap-success",
      "migration-reject-missing-child",
      "migration-reject-malformed-child",
      "migration-reject-wrong-old-ark",
      "migration-reject-partial-successor",
      "migration-full-rotation-is-distinct",
    ]) {
      expect(ids.has(id)).toBe(true);
    }
    for (const vector of catalog.catalog.cases.filter(
      (candidate) => candidate.expect.outcome === "reject",
    )) {
      expect(vector.expect.error).toBeDefined();
    }
  });

  it("compares adapter observations without generating expected values", async () => {
    const catalog = await loadCatalog();
    const observations: Readonly<Record<string, VectorObservation>> = {
      "rfc5869-sha256-case-1": {
        outcome: "success",
        output:
          "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865",
      },
      "reject-unknown-envelope-version": {
        outcome: "reject",
        error: "unsupported-version",
        assertions: ["no-plaintext-returned"],
      },
    };
    const verifier: VectorVerifier = {
      verify(vector) {
        return observations[vector.id] ?? { outcome: "reject", error: "structure" };
      },
    };
    const selected = await validatedSubset(
      catalog.catalog,
      catalog.catalog.cases.filter((vector) => vector.id in observations),
    );

    const results = await verifyCatalog(selected, verifier);
    expect(results).toEqual([
      { id: "rfc5869-sha256-case-1", passed: true },
      { id: "reject-unknown-envelope-version", passed: true },
    ]);
  });

  it("fails a verifier result that does not exactly match a vector", async () => {
    const catalog = await loadCatalog();
    const firstCase = catalog.catalog.cases[0];
    if (firstCase === undefined) {
      throw new Error("fixture has no cases");
    }
    const selected = await validatedSubset(catalog.catalog, [firstCase]);
    const verifier: VectorVerifier = {
      verify: () => ({ outcome: "success", output: "00" }),
    };

    await expect(verifyCatalog(selected, verifier)).resolves.toEqual([
      { id: "rfc5869-sha256-case-1", passed: false, reason: "output" },
    ]);
  });

  it("never passes expectations to an adapter and rejects malformed observations", async () => {
    const catalog = await loadCatalog();
    const firstCase = catalog.catalog.cases[0];
    if (firstCase === undefined) throw new Error("fixture has no cases");
    const selected = await validatedSubset(catalog.catalog, [firstCase]);
    const echoingVerifier: VectorVerifier = {
      verify(request) {
        expect("expect" in request).toBe(false);
        return { outcome: "success", output: "00", error: "authentication" };
      },
    };
    const nulCollisionVerifier: VectorVerifier = {
      verify: () => ({
        outcome: "success",
        output: firstCase.expect.output,
        assertions: ["aaa\u0000bbb"],
      }),
    };
    const withAssertions = await validatedSubset(catalog.catalog, [
      {
        ...firstCase,
        expect: {
          outcome: "success",
          output: firstCase.expect.output,
          assertions: ["aaa", "bbb"],
        },
      },
    ]);
    await expect(verifyCatalog(selected, echoingVerifier)).resolves.toEqual([
      { id: firstCase.id, passed: false, reason: "invalid-observation" },
    ]);
    await expect(verifyCatalog(withAssertions, nulCollisionVerifier)).resolves.toEqual([
      { id: firstCase.id, passed: false, reason: "invalid-observation" },
    ]);
  });
});
