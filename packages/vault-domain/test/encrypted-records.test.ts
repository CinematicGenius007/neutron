import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  createEncryptedRecord,
  EncryptedRecordFailure,
  MemoryEncryptedRecordRepository,
  parseEncryptedRecordIdentity,
  parseEncryptedRecordIdentityPrefix,
  validateEncryptedRecordCandidate,
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

  it("compares exact expected bytes and applies conditional batches atomically", async () => {
    const repository = new MemoryEncryptedRecordRepository();
    const firstBytes = envelope("envelope-item-payload-canonical-padding");
    const secondBytes = envelope("envelope-index-payload-canonical-padding");
    const expected = createEncryptedRecord(firstBytes);
    await repository.put(firstBytes);

    const overwrittenBytes = firstBytes.slice();
    overwrittenBytes[overwrittenBytes.length - 1] =
      (overwrittenBytes[overwrittenBytes.length - 1] as number) ^ 1;
    const overwritten = await repository.put(overwrittenBytes);
    expect(overwritten.identity).toBe(expected.identity);
    await expect(
      repository.applyConditionalBatch([expected], [], [], undefined, 10, [
        { identity: expected.identity, type: "delete" },
      ]),
    ).rejects.toMatchObject({ code: "conflict" });
    const afterConflict = await repository.get(expected.identity);
    expect(afterConflict?.status === "valid" ? afterConflict.record.envelope : undefined).toEqual(
      overwrittenBytes,
    );

    const second = createEncryptedRecord(secondBytes);
    await repository.applyConditionalBatch([overwritten], [second.identity], [], undefined, 10, [
      { identity: overwritten.identity, type: "delete" },
      { envelope: second.envelope, type: "put" },
    ]);
    expect(await repository.get(overwritten.identity)).toBeUndefined();
    expect(await repository.get(second.identity)).toMatchObject({ status: "valid" });
  });

  it("enforces absent identity prefixes without adjacent-object collisions", async () => {
    const repository = new MemoryEncryptedRecordRepository();
    const source = envelope("envelope-item-payload-canonical-padding");
    const record = await repository.put(source);
    const parts = record.identity.split(":");
    const prefix = parseEncryptedRecordIdentityPrefix(
      `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}:`,
    );
    await expect(
      repository.applyConditionalBatch([], [], [prefix], undefined, 10, [
        { envelope: envelope("envelope-index-payload-canonical-padding"), type: "put" },
      ]),
    ).rejects.toMatchObject({ code: "conflict" });

    const adjacent = source.slice();
    adjacent[39] = ((adjacent[39] as number) + 1) & 0xff;
    const adjacentRecord = createEncryptedRecord(adjacent);
    const adjacentParts = adjacentRecord.identity.split(":");
    const adjacentPrefix = parseEncryptedRecordIdentityPrefix(
      `${adjacentParts[0]}:${adjacentParts[1]}:${adjacentParts[2]}:${adjacentParts[3]}:`,
    );
    await repository.applyConditionalBatch([], [], [adjacentPrefix], undefined, 10, [
      { envelope: envelope("envelope-index-payload-canonical-padding"), type: "put" },
    ]);
    expect(await repository.listIdentities(10)).toHaveLength(2);

    const empty = new MemoryEncryptedRecordRepository();
    await empty.applyConditionalBatch([], [], [prefix], undefined, 1, [
      { envelope: record.envelope, type: "put" },
    ]);
    expect(await empty.listIdentities(1)).toEqual([record.identity]);
  });

  it("bounds key-only listing and the final conditional record count atomically", async () => {
    const repository = new MemoryEncryptedRecordRepository();
    const first = await repository.put(envelope("envelope-item-payload-canonical-padding"));
    const second = createEncryptedRecord(envelope("envelope-index-payload-canonical-padding"));
    await expect(repository.listIdentities(0)).rejects.toMatchObject({ code: "limit" });
    expect(await repository.listIdentities(1)).toEqual([first.identity]);
    await expect(
      repository.applyConditionalBatch([first], [second.identity], [], undefined, 1, [
        { envelope: second.envelope, type: "put" },
      ]),
    ).rejects.toMatchObject({ code: "limit" });
    expect(await repository.listIdentities(1)).toEqual([first.identity]);

    await repository.applyConditionalBatch([first], [second.identity], [], undefined, 1, [
      { identity: first.identity, type: "delete" },
      { envelope: second.envelope, type: "put" },
    ]);
    expect(await repository.listIdentities(1)).toEqual([second.identity]);
    await expect(repository.listIdentities(-1)).rejects.toMatchObject({ code: "invalid-record" });
  });

  it("rejects inherited condition and mutation authority", async () => {
    const repository = new MemoryEncryptedRecordRepository();
    const record = createEncryptedRecord(envelope("envelope-item-payload-canonical-padding"));
    const inheritedMutation = Object.assign(Object.create({ type: "put" }) as object, {
      envelope: record.envelope,
      filler: true,
    });
    await expect(repository.applyBatch([inheritedMutation] as never)).rejects.toMatchObject({
      code: "invalid-record",
    });

    const inheritedRecord = Object.assign(Object.create({ privileged: true }) as object, record);
    expect(() => validateEncryptedRecordCandidate(inheritedRecord)).toThrowError(
      EncryptedRecordFailure,
    );

    class HostileConditions<T> extends Array<T> {
      override some(): boolean {
        return false;
      }
    }
    await expect(
      repository.applyConditionalBatch(new HostileConditions(record), [], [], undefined, 10, [
        { envelope: record.envelope, type: "put" },
      ]),
    ).rejects.toMatchObject({ code: "invalid-record" });
    expect(await repository.list()).toEqual([]);

    const exactConditions = new Proxy([record], {
      get: () => {
        throw new Error("dynamic array access");
      },
    });
    await expect(
      repository.applyConditionalBatch(exactConditions, [], [], undefined, 10, [
        { envelope: record.envelope, type: "put" },
      ]),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("enforces optional account coherence against the complete existing keyspace", async () => {
    const repository = new MemoryEncryptedRecordRepository();
    const primary = createEncryptedRecord(envelope("envelope-item-payload-canonical-padding"));
    const foreignBytes = primary.envelope.slice();
    foreignBytes[8] = (foreignBytes[8] as number) ^ 0xff || 1;
    const foreign = createEncryptedRecord(foreignBytes);
    await repository.put(primary.envelope);
    await repository.put(foreign.envelope);
    const primaryAccount = primary.identity.split(":")[2] as string;
    const foreignAccount = foreign.identity.split(":")[2] as string;

    await expect(
      repository.applyConditionalBatch([primary], [], [], primaryAccount, 10, [
        { identity: primary.identity, type: "delete" },
      ]),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(await repository.listIdentities(10)).toHaveLength(2);

    await repository.applyConditionalBatch([primary], [], [], undefined, 10, [
      { identity: primary.identity, type: "delete" },
    ]);
    await repository.applyConditionalBatch([foreign], [], [], foreignAccount, 10, [
      { identity: foreign.identity, type: "delete" },
    ]);
    expect(await repository.listIdentities(0)).toEqual([]);
    await expect(
      repository.applyConditionalBatch([], [], [], primaryAccount.toUpperCase(), 10, [
        { envelope: primary.envelope, type: "put" },
      ]),
    ).rejects.toMatchObject({ code: "invalid-record" });
  });

  it("does not dispatch through a selectively hostile Array.prototype.push", async () => {
    const repository = new MemoryEncryptedRecordRepository();
    const record = createEncryptedRecord(envelope("envelope-item-payload-canonical-padding"));
    const accountId = record.identity.split(":")[2] as string;
    const originalPush = Array.prototype.push;
    let operation: Promise<void> | undefined;
    try {
      Object.defineProperty(Array.prototype, "push", {
        configurable: true,
        value: () => {
          throw new Error("inherited push invoked");
        },
        writable: true,
      });
      operation = repository.applyConditionalBatch([], [record.identity], [], accountId, 1, [
        { envelope: record.envelope, type: "put" },
      ]);
    } finally {
      Object.defineProperty(Array.prototype, "push", {
        configurable: true,
        value: originalPush,
        writable: true,
      });
    }
    await operation;
    expect(await repository.listIdentities(1)).toEqual([record.identity]);
  });

  it("initializes exactly once without partial or aliased records", async () => {
    const repository = new MemoryEncryptedRecordRepository();
    const first = envelope("envelope-item-payload-canonical-padding");
    const second = envelope("envelope-index-payload-canonical-padding");
    const initialized = await repository.initializeIfEmpty([first, second]);
    first.fill(0);
    initialized[0]?.envelope.fill(0);
    expect(await repository.list()).toHaveLength(2);
    await expect(repository.initializeIfEmpty([second])).rejects.toMatchObject({
      code: "conflict",
    });
    expect(await repository.list()).toHaveLength(2);

    await expect(
      new MemoryEncryptedRecordRepository().initializeIfEmpty([
        second,
        envelope("hardening-reject-bad-magic"),
      ]),
    ).rejects.toMatchObject({ code: "invalid-record" });
  });
});
