import Ajv2020 from "ajv/dist/2020.js";

import fixtureText from "../fixtures/crypto-envelope-v1.json?raw";
import digestText from "../fixtures/crypto-envelope-v1.sha256?raw";
import schemaText from "../schema/crypto-envelope-v1.schema.json?raw";
import { loadValidatedCatalog, type ValidatedCatalog } from "../src/index.js";

function toHex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function loadProductionCatalog(): Promise<ValidatedCatalog> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(fixtureText));
  if (toHex(digest) !== digestText.trim()) throw new Error("immutable catalog digest mismatch");
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
    JSON.parse(schemaText) as object,
  );
  return loadValidatedCatalog(JSON.parse(fixtureText) as unknown, validate);
}
