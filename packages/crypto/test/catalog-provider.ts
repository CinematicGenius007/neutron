import Ajv2020 from "ajv/dist/2020.js";
import fixtureText from "../../test-vectors/fixtures/crypto-envelope-v1.json?raw";
import digestText from "../../test-vectors/fixtures/crypto-envelope-v1.sha256?raw";
import schemaText from "../../test-vectors/schema/crypto-envelope-v1.schema.json?raw";
import {
  loadValidatedCatalog,
  type VectorCase,
  type VectorObservation,
  type VectorRequest,
  type VectorVerifier,
} from "../../test-vectors/src/index.js";
import type { CryptoProvider, HkdfSha256Input } from "../src/index.js";

function fromHex(value: string): Uint8Array {
  return Uint8Array.from(value.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));
}

function toHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(new Uint8Array(digest));
}

export async function loadPrimitiveCases(): Promise<readonly VectorCase[]> {
  if ((await sha256Hex(fixtureText)) !== digestText.trim()) {
    throw new Error("immutable vector catalog digest mismatch");
  }
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
    JSON.parse(schemaText) as object,
  );
  const catalog = loadValidatedCatalog(JSON.parse(fixtureText) as unknown, validate);
  const cases = catalog.catalog.cases.filter(
    ({ operation }) => operation === "argon2id" || operation === "hkdf-sha256",
  );
  if (cases.length !== 2) throw new Error(`unexpected primitive vector count: ${cases.length}`);
  return cases;
}

export function createProviderVerifier(provider: CryptoProvider): VectorVerifier {
  return {
    verify(request: VectorRequest): VectorObservation {
      if (request.operation === "argon2id") {
        return {
          outcome: "success",
          output: toHex(
            provider.deriveArgon2idKey(
              fromHex(request.input.password),
              fromHex(request.input.salt),
            ),
          ),
        };
      }
      if (request.operation === "hkdf-sha256") {
        const input: HkdfSha256Input = {
          ikm: fromHex(request.input.ikm),
          info: fromHex(request.input.info),
          length: request.parameters.length,
          salt: fromHex(request.input.salt),
        };
        return { outcome: "success", output: toHex(provider.deriveHkdfSha256(input)) };
      }
      throw new Error(`unsupported provider operation: ${request.operation}`);
    },
  };
}

function requestOf(vector: VectorCase): VectorRequest {
  const { expect: _expect, originatingRequirementId: _requirement, ...request } = vector;
  return request;
}

export async function verifyPrimitiveCases(provider: CryptoProvider): Promise<void> {
  const verifier = createProviderVerifier(provider);
  for (const vector of await loadPrimitiveCases()) {
    const observed = await verifier.verify(requestOf(vector));
    if (
      vector.expect.outcome !== "success" ||
      !("output" in vector.expect) ||
      typeof vector.expect.output !== "string" ||
      typeof observed !== "object" ||
      observed === null ||
      !("output" in observed) ||
      observed.output !== vector.expect.output
    ) {
      throw new Error(`production provider failed immutable vector: ${vector.id}`);
    }
  }
}
