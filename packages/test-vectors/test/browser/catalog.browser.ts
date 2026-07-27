import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import fixtureText from "../../fixtures/crypto-envelope-v1.json?raw";
import digestText from "../../fixtures/crypto-envelope-v1.sha256?raw";
import schemaText from "../../schema/crypto-envelope-v1.schema.json?raw";
import { loadValidatedCatalog, verifyCatalog } from "../../src/index.js";
import { portableReferenceVerifier } from "../portable-reference-verifier.js";

function toHex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("crypto-envelope catalog in a real browser", () => {
  it("validates, hashes, and verifies the exact committed catalog", async () => {
    expect(globalThis.window).toBeDefined();
    expect(globalThis.document).toBeDefined();

    const fixture = JSON.parse(fixtureText) as unknown;
    const schema = JSON.parse(schemaText) as object;
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
    const catalog = loadValidatedCatalog(fixture, validate);
    expect(catalog.catalog.cases).toHaveLength(83);

    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(fixtureText));
    expect(toHex(digest)).toBe(digestText.trim());

    const results = await verifyCatalog(catalog, portableReferenceVerifier);
    expect(results).toHaveLength(catalog.catalog.cases.length);
    expect(results.filter(({ passed }) => !passed)).toEqual([]);
  }, 30_000);
});
