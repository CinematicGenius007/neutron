import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  createEncryptedRecord,
  EncryptedRecordFailure,
  MemoryEncryptedRecordRepository,
  parseEncryptedRecordIdentity,
} from "../src/index.js";

const catalog = JSON.parse(
  readFileSync(
    new URL("../../test-vectors/fixtures/crypto-envelope-v1.json", import.meta.url),
    "utf8",
  ),
) as { cases: Array<{ id: string; input?: { envelope?: string } }> };

function envelope(id: string): Uint8Array {
  const value = catalog.cases.find((entry) => entry.id === id)?.input?.envelope;
  if (value === undefined) throw new Error(`missing fixture ${id}`);
  return Uint8Array.from(value.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));
}

describe("encrypted record repository", () => {
  it("derives canonical identity and clones input/output", async () => {
    const source = envelope("envelope-item-payload-canonical-padding");
    const original = source.slice();
    const repository = new MemoryEncryptedRecordRepository();
    const stored = await repository.put(source);
    source.fill(0);
    expect(stored.envelope).toEqual(original);
    stored.envelope.fill(0);
    const read = await repository.get(stored.identity);
    expect(read?.status).toBe("valid");
    if (read?.status !== "valid") throw new Error("expected valid record");
    expect(read.record.envelope).toEqual(original);
    read.record.envelope.fill(0);
    const second = await repository.get(stored.identity);
    expect(second?.status === "valid" ? second.record.envelope : undefined).toEqual(original);
  });

  it("supports list, delete, and atomic duplicate-free batches", async () => {
    const repository = new MemoryEncryptedRecordRepository();
    const first = createEncryptedRecord(envelope("envelope-item-payload-canonical-padding"));
    const second = createEncryptedRecord(envelope("envelope-index-payload-canonical-padding"));
    await repository.applyBatch([
      { envelope: first.envelope, type: "put" },
      { envelope: second.envelope, type: "put" },
    ]);
    expect(await repository.list()).toHaveLength(2);
    await expect(
      repository.applyBatch([
        { envelope: first.envelope, type: "put" },
        { identity: first.identity, type: "delete" },
      ]),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(await repository.list()).toHaveLength(2);
    expect(await repository.delete(first.identity)).toBe(true);
    expect(await repository.delete(first.identity)).toBe(false);
    expect(await repository.list()).toHaveLength(1);
  });

  it("rejects malformed envelopes, identities, mutations, and shared memory", async () => {
    const repository = new MemoryEncryptedRecordRepository();
    await expect(repository.put(Uint8Array.of(1, 2, 3))).rejects.toBeInstanceOf(
      EncryptedRecordFailure,
    );
    expect(() => parseEncryptedRecordIdentity("title:my-secret-item")).toThrowError(
      EncryptedRecordFailure,
    );
    await expect(
      repository.applyBatch([{ type: "put", envelope: envelope("hardening-reject-bad-magic") }]),
    ).rejects.toBeInstanceOf(EncryptedRecordFailure);
    if (typeof SharedArrayBuffer !== "undefined") {
      await expect(
        repository.put(new Uint8Array(new SharedArrayBuffer(128))),
      ).rejects.toBeInstanceOf(EncryptedRecordFailure);
    }
  });

  it("normalizes typed-array subclasses without invoking overridden slice", async () => {
    class AliasingBytes extends Uint8Array {
      override slice(): Uint8Array {
        return this;
      }
    }
    const original = envelope("envelope-item-payload-canonical-padding");
    const hostile = new AliasingBytes(original);
    const repository = new MemoryEncryptedRecordRepository();
    const stored = await repository.put(hostile);
    hostile.fill(0);
    expect(stored.envelope).toEqual(original);

    const batchHostile = new AliasingBytes(original);
    await repository.applyBatch([{ envelope: batchHostile, type: "put" }]);
    batchHostile.fill(0);
    const read = await repository.get(stored.identity);
    expect(read?.status === "valid" ? read.record.envelope : undefined).toEqual(original);
  });

  it("rejects hostile mutation arrays before executing a batch", async () => {
    class HostileMutations extends Array<{ envelope: Uint8Array; type: "put" }> {
      override map(): never[] {
        return [];
      }
    }
    const repository = new MemoryEncryptedRecordRepository();
    const mutations = new HostileMutations({
      envelope: envelope("envelope-item-payload-canonical-padding"),
      type: "put",
    });
    await expect(repository.applyBatch(mutations)).rejects.toMatchObject({
      code: "invalid-record",
    });
    expect(await repository.list()).toEqual([]);
  });
});
