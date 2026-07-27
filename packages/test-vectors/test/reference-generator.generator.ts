import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  generateSyntheticArgon2idCandidate,
  generateSyntheticEnvelopeCandidates,
  generateSyntheticHkdfCandidate,
  generateSyntheticMigrationCandidates,
  generateSyntheticXChaChaCandidate,
} from "../src/reference-generator.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("reference candidate generator", () => {
  it("matches independently anchored primitive outputs", () => {
    expect(
      generateSyntheticHkdfCandidate({
        ikm: "0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b",
        salt: "000102030405060708090a0b0c",
        info: "f0f1f2f3f4f5f6f7f8f9",
        length: 42,
      }),
    ).toBe("3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865");
    expect(
      generateSyntheticArgon2idCandidate({
        password: "70617373776f7264",
        salt: "000102030405060708090a0b0c0d0e0f",
      }),
    ).toBe("def6fd068289b9a0cf1114f8e978a2c4dab6faef377d895b9c2d59fc93fc5653");
    expect(
      generateSyntheticXChaChaCandidate({
        aad: "00",
        key: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
        nonce: "000102030405060708090a0b0c0d0e0f1011121314151617",
        plaintext: "0102",
      }).ciphertext,
    ).toBe("9fc0987ca27cb41d99d50175381d6a312c38");
    expect(
      generateSyntheticHkdfCandidate({
        ikm: "c0c1c2c3c4c5c6c7c8c9cacbcccdcecfd0d1d2d3d4d5d6d7d8d9dadbdcdddedf",
        salt: "0102030405060708090a0b0c0d0e0f10",
        info: Buffer.concat([
          Buffer.from("neutron/derive/v1\0", "ascii"),
          Buffer.from("recovery/ark-wrap\0", "ascii"),
          Buffer.alloc(16),
          Buffer.from([0, 0, 0, 1]),
        ]).toString("hex"),
        length: 32,
      }),
    ).toBe("9c0961120fa40b44541fba38ed32bbb199d7ca991ab56680fe52ec4eecacae43");
  });

  it("reproduces committed envelope candidates and fixed binary anchors", async () => {
    const fixture = JSON.parse(
      await readFile(join(packageRoot, "fixtures/crypto-envelope-v1.json"), "utf8"),
    ) as { cases: Array<{ operation: string }> };
    const generated = generateSyntheticEnvelopeCandidates();
    expect(generated).toHaveLength(58);
    expect(fixture.cases.filter(({ operation }) => operation === "envelope")).toEqual(generated);

    const recovery = generated.find(({ id }) => id === "envelope-recovery-root-wrapper");
    if (recovery === undefined) throw new Error("recovery vector missing");
    const envelope = Buffer.from(recovery.input.envelope, "hex");
    expect(envelope.subarray(0, 4).toString("ascii")).toBe("NTRN");
    expect([...envelope.subarray(4, 8)]).toEqual([1, 2, 1, 0]);
    expect(envelope.readUInt32BE(52)).toBe(51);
    expect(envelope.length).toBe(72 + 24 + 51);
    expect(createHash("sha256").update(envelope).digest("hex")).toBe(
      "3fd672c74fddf734d9c1532b986130673eafd46c9c7ab4fb930d0506c5166db3",
    );

    const fixedChildren = generated.filter(({ id }) => id.includes("child-fixed-padding"));
    expect(fixedChildren).toHaveLength(2);
    for (const child of fixedChildren) {
      const bytes = Buffer.from(child.input.envelope, "hex");
      expect(bytes.readUInt32BE(52)).toBe(147);
      expect(bytes.length).toBe(72 + 24 + 147);
    }
  });

  it("reproduces concrete crypto-only migration candidates", async () => {
    const fixture = JSON.parse(
      await readFile(join(packageRoot, "fixtures/crypto-envelope-v1.json"), "utf8"),
    ) as { cases: Array<{ operation: string }> };
    const generated = generateSyntheticMigrationCandidates();
    expect(generated).toHaveLength(4);
    expect(fixture.cases.filter(({ operation }) => operation === "migration")).toEqual(generated);

    const minimum = generated.find(({ id }) => id === "migration-minimum-ark-rewrap-success");
    const full = generated.find(({ id }) => id === "migration-full-rotation-is-distinct");
    if (minimum?.expect.outcome !== "success" || full?.expect.outcome !== "success")
      throw new Error("migration successes missing");
    expect(minimum.expect.output).not.toBe(full.expect.output);
    expect(Buffer.from(full.expect.output, "hex").length).toBeGreaterThan(
      Buffer.from(minimum.expect.output, "hex").length,
    );
  });
});
