import { createLibsodiumProvider } from "@neutron/crypto";
import { MemoryEncryptedRecordRepository, type VaultItem } from "@neutron/vault-domain";
import { describe, expect, it } from "vitest";
import { beginOfflineEnrollment } from "../src/local-vault.js";
import { DEFAULT_PASSPHRASE_GENERATOR_OPTIONS } from "../src/passphrase-generator.js";
import { DEFAULT_PASSWORD_GENERATOR_OPTIONS } from "../src/password-generator.js";
import {
  VaultWorkerClient,
  type VaultWorkerClientFailure,
  type VaultWorkerLike,
} from "../src/vault-worker-client.js";
import {
  parseVaultWorkerRequest,
  parseVaultWorkerResponse,
  VAULT_WORKER_PROTOCOL,
  VaultWorkerProtocolFailure,
} from "../src/vault-worker-protocol.js";
import { VaultWorkerRuntime, validateItemOperationResult } from "../src/vault-worker-runtime.js";

const login: VaultItem = {
  schemaVersion: 1,
  type: "login",
  title: "Synthetic worker login",
  tags: ["private-tag-sentinel"],
  username: "worker@example.invalid",
  password: "synthetic-worker-password",
  url: "https://worker.invalid",
};

const totpItem: VaultItem = {
  schemaVersion: 1,
  type: "totp",
  title: "Synthetic worker TOTP",
  tags: [],
  secretBase32: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
  algorithm: "SHA1",
  digits: 8,
  period: 30,
};

const validPassphrase = "abacus.abdomen.abdominal.abide.abiding.ability.ablaze.abnormal";

function request(operation: string, input: unknown = {}) {
  return { protocol: VAULT_WORKER_PROTOCOL, requestId: "1", sessionEpoch: "0", operation, input };
}

class LoopbackWorker implements VaultWorkerLike {
  onerror: ((event: ErrorEvent) => unknown) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => unknown) | null = null;
  onmessageerror: ((event: MessageEvent<unknown>) => unknown) | null = null;
  readonly transcript: unknown[] = [];
  terminated = false;
  readonly #runtime: VaultWorkerRuntime;

  constructor(
    repository = new MemoryEncryptedRecordRepository(),
    nowMilliseconds: () => number = () => 59_000,
    subtle: Pick<SubtleCrypto, "importKey" | "sign"> = crypto.subtle,
  ) {
    this.#runtime = new VaultWorkerRuntime(
      {
        createProvider: createLibsodiumProvider,
        nowMilliseconds,
        openRepository: async () => repository,
        subtle,
      },
      {
        postMessage: (message) => {
          this.transcript.push(structuredClone(message));
          queueMicrotask(() => this.onmessage?.(new MessageEvent("message", { data: message })));
        },
      },
    );
  }

  postMessage(message: unknown): void {
    if (this.terminated) throw new Error("terminated");
    this.transcript.push(structuredClone(message));
    queueMicrotask(() => void this.#runtime.receive(structuredClone(message)));
  }

  terminate(): void {
    this.terminated = true;
  }
}

describe("vault worker protocol", () => {
  it("rejects aliases, extra fields, malformed uint64 values, and accessors without invoking them", () => {
    expect(() => parseVaultWorkerRequest(request("state"))).not.toThrow();
    expect(() => parseVaultWorkerRequest({ ...request("state"), protocol: 1 })).toThrow(
      VaultWorkerProtocolFailure,
    );
    for (const requestId of [0, 1, "01", "-1", "1e2", "18446744073709551616"])
      expect(() => parseVaultWorkerRequest({ ...request("state"), requestId })).toThrow(
        VaultWorkerProtocolFailure,
      );
    expect(() => parseVaultWorkerRequest({ ...request("state"), alias: true })).toThrow(
      VaultWorkerProtocolFailure,
    );
    expect(() =>
      parseVaultWorkerRequest(request("unlock", { password: "valid", itemId: "0".repeat(32) })),
    ).toThrow(VaultWorkerProtocolFailure);

    let invoked = false;
    const hostile = Object.create(Object.prototype, {
      protocol: { enumerable: true, value: 1 },
      requestId: { enumerable: true, value: "1" },
      sessionEpoch: { enumerable: true, value: "0" },
      operation: { enumerable: true, value: "unlock" },
      input: {
        enumerable: true,
        get() {
          invoked = true;
          return { password: "secret" };
        },
      },
    });
    expect(() => parseVaultWorkerRequest(hostile)).toThrow(VaultWorkerProtocolFailure);
    expect(invoked).toBe(false);

    const nested = { ...login } as Record<string, unknown>;
    Object.defineProperty(nested, "title", {
      enumerable: true,
      get() {
        invoked = true;
        return "hostile";
      },
    });
    expect(() =>
      parseVaultWorkerRequest(request("create-item", { vaultId: "1".repeat(32), item: nested })),
    ).toThrow(VaultWorkerProtocolFailure);
    expect(invoked).toBe(false);

    const sparseTags: string[] = [];
    sparseTags.length = 1;
    expect(() =>
      parseVaultWorkerRequest(
        request("create-item", {
          vaultId: "1".repeat(32),
          item: { ...login, tags: sparseTags },
        }),
      ),
    ).toThrow();

    for (const valid of ["A".repeat(1_024), "é".repeat(512), "🔐".repeat(256)])
      expect(() => parseVaultWorkerRequest(request("unlock", { password: valid }))).not.toThrow();
    for (const invalid of [
      "",
      "A".repeat(1_025),
      "é".repeat(513),
      "🔐".repeat(257),
      "\ud800",
      "\udc00",
    ])
      expect(() => parseVaultWorkerRequest(request("unlock", { password: invalid }))).toThrow(
        VaultWorkerProtocolFailure,
      );

    expect(() =>
      parseVaultWorkerRequest(
        request("update-item", {
          vaultId: "1".repeat(32),
          itemId: "2".repeat(32),
          generation: "0",
          keyVersion: 1,
          item: login,
        }),
      ),
    ).toThrow(VaultWorkerProtocolFailure);
    const maximum = "18446744073709551615";
    expect(() =>
      parseVaultWorkerRequest(
        request("update-item", {
          vaultId: "1".repeat(32),
          itemId: "2".repeat(32),
          generation: maximum,
          keyVersion: 1,
          item: login,
        }),
      ),
    ).toThrow(VaultWorkerProtocolFailure);
    expect(() =>
      parseVaultWorkerRequest(
        request("delete-item", {
          vaultId: "1".repeat(32),
          itemId: "2".repeat(32),
          generation: maximum,
          keyVersion: 1,
        }),
      ),
    ).not.toThrow();
    expect(() =>
      parseVaultWorkerRequest(
        request("get-item", { vaultId: "0".repeat(32), itemId: "2".repeat(32) }),
      ),
    ).toThrow(VaultWorkerProtocolFailure);
    expect(() =>
      parseVaultWorkerRequest(
        request("compute-totp", {
          vaultId: "1".repeat(32),
          itemId: "2".repeat(32),
          generation: "1",
          keyVersion: 1,
          seed: totpItem.secretBase32,
        }),
      ),
    ).toThrow(VaultWorkerProtocolFailure);
  });

  it("rejects mixed, unknown, and malformed worker responses", () => {
    expect(() =>
      parseVaultWorkerRequest(
        request("generate-password", { ...DEFAULT_PASSWORD_GENERATOR_OPTIONS, length: 15 }),
      ),
    ).toThrow(VaultWorkerProtocolFailure);
    expect(() =>
      parseVaultWorkerRequest(
        request("generate-password", { ...DEFAULT_PASSWORD_GENERATOR_OPTIONS, extra: true }),
      ),
    ).toThrow(VaultWorkerProtocolFailure);
    for (const input of [{ words: 6 }, { words: 25 }, { words: 8, extra: true }])
      expect(() => parseVaultWorkerRequest(request("generate-passphrase", input))).toThrow(
        VaultWorkerProtocolFailure,
      );
    expect(() =>
      parseVaultWorkerResponse({
        protocol: VAULT_WORKER_PROTOCOL,
        requestId: "1",
        sessionEpoch: "0",
        operation: "generate-password",
        ok: true,
        result: { kind: "generated-password", password: "a".repeat(15) },
      }),
    ).toThrow(VaultWorkerProtocolFailure);
    for (const passphrase of [
      "abacus.abdomen.abdominal.abide.abiding.ability.not-a-word.abnormal",
      "abacus..abdominal.abide.abiding.ability.ablaze.abnormal",
    ])
      expect(() =>
        parseVaultWorkerResponse({
          protocol: VAULT_WORKER_PROTOCOL,
          requestId: "1",
          sessionEpoch: "0",
          operation: "generate-passphrase",
          ok: true,
          result: { kind: "generated-passphrase", passphrase },
        }),
      ).toThrow(VaultWorkerProtocolFailure);
    const totpResponse = {
      protocol: VAULT_WORKER_PROTOCOL,
      requestId: "1",
      sessionEpoch: "1",
      operation: "compute-totp",
      ok: true,
      result: {
        kind: "totp-code",
        itemId: "2".repeat(32),
        generation: "1",
        keyVersion: 1,
        algorithm: "SHA1",
        digits: 8,
        period: 30,
        code: "94287082",
        validFromUnixSeconds: "30",
        expiresAtUnixSeconds: "60",
      },
    };
    expect(() => parseVaultWorkerResponse(totpResponse)).not.toThrow();
    for (const result of [
      { ...totpResponse.result, code: "9428708" },
      { ...totpResponse.result, validFromUnixSeconds: "31" },
      { ...totpResponse.result, expiresAtUnixSeconds: "61" },
      { ...totpResponse.result, seed: totpItem.secretBase32 },
    ])
      expect(() => parseVaultWorkerResponse({ ...totpResponse, result })).toThrow(
        VaultWorkerProtocolFailure,
      );
    const deletedResponse = {
      protocol: VAULT_WORKER_PROTOCOL,
      requestId: "1",
      sessionEpoch: "0",
      operation: "delete-item",
      ok: true,
      result: {
        kind: "deleted",
        vaultId: "1".repeat(32),
        deletion: { id: "2".repeat(32), generation: "1", keyVersion: 1 },
      },
    };
    expect(() => parseVaultWorkerResponse(deletedResponse)).not.toThrow();
    expect(() =>
      parseVaultWorkerResponse({ ...deletedResponse, result: { kind: "done" } }),
    ).toThrow(VaultWorkerProtocolFailure);
    expect(() =>
      parseVaultWorkerResponse({
        protocol: VAULT_WORKER_PROTOCOL,
        requestId: "1",
        sessionEpoch: "0",
        operation: "lock",
        ok: false,
        error: "locked",
        result: { kind: "done" },
      }),
    ).toThrow(VaultWorkerProtocolFailure);
    expect(() =>
      parseVaultWorkerResponse({
        protocol: VAULT_WORKER_PROTOCOL,
        requestId: "1",
        sessionEpoch: "1",
        operation: "unlock",
        ok: true,
        result: {
          kind: "session",
          metadata: {
            accountId: "1".repeat(32),
            arkEpoch: 1,
            vaults: [
              { id: "2".repeat(32), keyVersion: 1 },
              { id: "2".repeat(32), keyVersion: 1 },
            ],
          },
        },
      }),
    ).toThrow(VaultWorkerProtocolFailure);
    expect(() =>
      parseVaultWorkerResponse({
        protocol: VAULT_WORKER_PROTOCOL,
        requestId: "1",
        sessionEpoch: "0",
        operation: "create-item",
        ok: true,
        result: {
          kind: "revision",
          vaultId: "1".repeat(32),
          revision: { id: "1".repeat(32), generation: "0", keyVersion: 1 },
        },
      }),
    ).toThrow(VaultWorkerProtocolFailure);
    expect(() =>
      parseVaultWorkerResponse({
        protocol: VAULT_WORKER_PROTOCOL,
        requestId: "1",
        sessionEpoch: "0",
        operation: "lock",
        ok: false,
        error: "provider-stack-leak",
      }),
    ).toThrow(VaultWorkerProtocolFailure);
    expect(() =>
      parseVaultWorkerResponse({
        protocol: VAULT_WORKER_PROTOCOL,
        requestId: "1",
        sessionEpoch: "0",
        operation: "state",
        ok: true,
        result: { kind: "done" },
      }),
    ).toThrow(VaultWorkerProtocolFailure);
    expect(() =>
      parseVaultWorkerResponse({
        protocol: VAULT_WORKER_PROTOCOL,
        requestId: "1",
        sessionEpoch: "0",
        operation: "state",
        ok: false,
        error: "unlock-failed",
      }),
    ).toThrow(VaultWorkerProtocolFailure);
  });

  it("rejects request-mismatched item results inside the worker", () => {
    const vaultId = "1".repeat(32);
    const itemId = "2".repeat(32);
    const nextId = "3".repeat(32);
    const lastId = "4".repeat(32);
    const parsed = (operation: string, input: unknown) =>
      parseVaultWorkerRequest(request(operation, input));
    const assertInvalid = (workerRequest: ReturnType<typeof parsed>, results: unknown[]) => {
      for (const result of results)
        expect(() => validateItemOperationResult(workerRequest, result)).toThrowError(
          expect.objectContaining({ code: "corrupt-state" }),
        );
    };

    const listRequest = parsed("list-item-summaries", { vaultId, cursor: itemId, limit: 2 });
    const summary = {
      id: nextId,
      generation: "1",
      keyVersion: 1,
      title: "Synthetic summary",
      type: "login",
    };
    const issue = { code: "corrupt-item", id: lastId };
    const validList = {
      kind: "summaries",
      vaultId,
      items: [summary],
      issues: [issue],
      nextCursor: lastId,
    };
    expect(() => validateItemOperationResult(listRequest, validList)).not.toThrow();
    assertInvalid(listRequest, [
      { ...validList, vaultId: "f".repeat(32) },
      { ...validList, items: [summary, { ...summary, id: lastId }] },
      { ...validList, issues: [{ ...issue, id: nextId }] },
      { ...validList, items: [{ ...summary, id: itemId }] },
      { ...validList, items: [{ ...summary, id: lastId }, summary], issues: [] },
      { ...validList, nextCursor: nextId },
      { ...validList, items: [], issues: [], nextCursor: itemId },
    ]);

    const getRequest = parsed("get-item", { vaultId, itemId });
    const validItem = {
      kind: "item",
      vaultId,
      item: { id: itemId, generation: "1", keyVersion: 1, item: login },
    };
    expect(() => validateItemOperationResult(getRequest, validItem)).not.toThrow();
    assertInvalid(getRequest, [
      { ...validItem, vaultId: lastId },
      { ...validItem, item: { ...validItem.item, id: nextId } },
    ]);

    const createRequest = parsed("create-item", { vaultId, item: login });
    const validCreate = {
      kind: "revision",
      vaultId,
      revision: { id: itemId, generation: "1", keyVersion: 1 },
    };
    expect(() => validateItemOperationResult(createRequest, validCreate)).not.toThrow();
    assertInvalid(createRequest, [
      { ...validCreate, vaultId: lastId },
      { ...validCreate, revision: { ...validCreate.revision, generation: "2" } },
      { ...validCreate, revision: { ...validCreate.revision, keyVersion: 2 } },
    ]);

    const updateRequest = parsed("update-item", {
      vaultId,
      itemId,
      generation: "7",
      keyVersion: 3,
      item: login,
    });
    const validUpdate = {
      kind: "revision",
      vaultId,
      revision: { id: itemId, generation: "8", keyVersion: 3 },
    };
    expect(() => validateItemOperationResult(updateRequest, validUpdate)).not.toThrow();
    assertInvalid(updateRequest, [
      { ...validUpdate, revision: { ...validUpdate.revision, id: nextId } },
      { ...validUpdate, revision: { ...validUpdate.revision, generation: "9" } },
      { ...validUpdate, revision: { ...validUpdate.revision, keyVersion: 4 } },
    ]);

    const deleteRequest = parsed("delete-item", {
      vaultId,
      itemId,
      generation: "8",
      keyVersion: 3,
    });
    const validDelete = {
      kind: "deleted",
      vaultId,
      deletion: { id: itemId, generation: "8", keyVersion: 3 },
    };
    expect(() => validateItemOperationResult(deleteRequest, validDelete)).not.toThrow();
    assertInvalid(deleteRequest, [
      { ...validDelete, deletion: { ...validDelete.deletion, id: nextId } },
      { ...validDelete, deletion: { ...validDelete.deletion, generation: "7" } },
      { ...validDelete, deletion: { ...validDelete.deletion, keyVersion: 2 } },
    ]);
  });
});

describe("vault worker boundary", () => {
  it("cannot resurrect pending or unlocked authority after a concurrent lock", async () => {
    const provider = await createLibsodiumProvider();

    {
      const repository = new MemoryEncryptedRecordRepository();
      let releaseProvider = () => {};
      const providerGate = new Promise<void>((resolve) => {
        releaseProvider = resolve;
      });
      const responses: unknown[] = [];
      const runtime = new VaultWorkerRuntime(
        {
          createProvider: async () => {
            await providerGate;
            return provider;
          },
          nowMilliseconds: () => 59_000,
          openRepository: async () => repository,
          subtle: crypto.subtle,
        },
        { postMessage: (message) => responses.push(message) },
      );
      const beginning = runtime.receive(request("begin-enrollment", { password: "synthetic" }));
      await Promise.resolve();
      await runtime.receive({ ...request("lock"), requestId: "2" });
      releaseProvider();
      await beginning;
      await runtime.receive({
        ...request("state"),
        requestId: "3",
        sessionEpoch: "1",
      });
      expect(responses).toHaveLength(2);
      expect(responses).toEqual([
        expect.objectContaining({ requestId: "2", sessionEpoch: "1", ok: true }),
        expect.objectContaining({
          requestId: "3",
          sessionEpoch: "1",
          result: { kind: "state", state: "locked" },
        }),
      ]);
    }

    {
      const repository = new MemoryEncryptedRecordRepository();
      let releaseInitialize = () => {};
      const initializeGate = new Promise<void>((resolve) => {
        releaseInitialize = resolve;
      });
      const initialize = repository.initializeIfEmpty.bind(repository);
      repository.initializeIfEmpty = async (envelopes) => {
        await initializeGate;
        return initialize(envelopes);
      };
      const responses: unknown[] = [];
      const runtime = new VaultWorkerRuntime(
        {
          createProvider: async () => provider,
          nowMilliseconds: () => 59_000,
          openRepository: async () => repository,
          subtle: crypto.subtle,
        },
        { postMessage: (message) => responses.push(message) },
      );
      await runtime.receive(request("begin-enrollment", { password: "synthetic" }));
      const kit = (responses[0] as { result: { recoveryKit: string } }).result.recoveryKit;
      const confirming = runtime.receive({
        ...request("confirm-enrollment", { recoveryKit: kit }),
        requestId: "2",
      });
      await Promise.resolve();
      await runtime.receive({ ...request("lock"), requestId: "3" });
      releaseInitialize();
      await confirming;
      await runtime.receive({
        ...request("state"),
        requestId: "4",
        sessionEpoch: "1",
      });
      expect(responses.map((value) => (value as { requestId: string }).requestId)).toEqual([
        "1",
        "3",
        "4",
      ]);
      expect(responses[2]).toMatchObject({ result: { kind: "state", state: "locked" } });
    }

    {
      const repository = new MemoryEncryptedRecordRepository();
      const pending = await beginOfflineEnrollment(provider, repository, "synthetic");
      const initialized = await pending.confirm(pending.recoveryKit);
      initialized.lock();
      let releaseList = () => {};
      const listGate = new Promise<void>((resolve) => {
        releaseList = resolve;
      });
      const listIdentities = repository.listIdentities.bind(repository);
      repository.listIdentities = async (maximum) => {
        await listGate;
        return listIdentities(maximum);
      };
      const responses: unknown[] = [];
      const runtime = new VaultWorkerRuntime(
        {
          createProvider: async () => provider,
          nowMilliseconds: () => 59_000,
          openRepository: async () => repository,
          subtle: crypto.subtle,
        },
        { postMessage: (message) => responses.push(message) },
      );
      const unlocking = runtime.receive(request("unlock", { password: "synthetic" }));
      await Promise.resolve();
      await runtime.receive({ ...request("lock"), requestId: "2" });
      releaseList();
      await unlocking;
      await runtime.receive({
        ...request("state"),
        requestId: "3",
        sessionEpoch: "1",
      });
      expect(responses.map((value) => (value as { requestId: string }).requestId)).toEqual([
        "2",
        "3",
      ]);
      expect(responses[1]).toMatchObject({ result: { kind: "state", state: "locked" } });
    }
  });

  it("runs enrollment and narrow CRUD through the broker, then terminates on lock", async () => {
    const worker = new LoopbackWorker();
    const client = new VaultWorkerClient(worker);
    expect(await client.state()).toBe("locked");
    const recoveryKit = await client.beginEnrollment("correct horse battery staple");
    expect(await client.state()).toBe("pending-enrollment");
    const metadata = await client.confirmEnrollment(recoveryKit);
    const generated = await client.generatePassword(DEFAULT_PASSWORD_GENERATOR_OPTIONS);
    expect(generated).toHaveLength(20);
    expect(generated).toMatch(/^[A-Za-z0-9!@#$%^&*()\-_=+[\]{};:,.?]+$/);
    const generatedPassphrase = await client.generatePassphrase(
      DEFAULT_PASSPHRASE_GENERATOR_OPTIONS,
    );
    expect(generatedPassphrase.split(".")).toHaveLength(8);
    const vaultId = metadata.vaults[0]?.id as string;
    const created = await client.createItem(vaultId, login);
    expect(created).toMatchObject({ generation: "1", keyVersion: 1 });

    const page = await client.listItemSummaries(vaultId, 10);
    expect(page.items).toEqual([
      expect.objectContaining({ id: created.id, title: login.title, type: "login" }),
    ]);
    expect(JSON.stringify(page)).not.toContain(login.password);
    expect(JSON.stringify(page)).not.toContain(login.username);
    expect(JSON.stringify(page)).not.toContain(login.tags[0]);

    const read = await client.getItem(vaultId, created.id);
    expect(read?.item).toEqual(login);
    const updated = await client.updateItem(
      vaultId,
      created.id,
      created.generation,
      created.keyVersion,
      { ...login, title: "Updated synthetic title" },
    );
    expect(updated.generation).toBe("2");
    await client.deleteItem(vaultId, updated.id, updated.generation, updated.keyVersion);
    expect(await client.getItem(vaultId, updated.id)).toBeUndefined();

    await client.lock();
    expect(worker.terminated).toBe(true);
    await expect(client.state()).rejects.toMatchObject({ code: "closed" });

    const transcript = JSON.stringify(worker.transcript);
    expect(transcript).not.toMatch(/vaultKey|itemKey|envelope/i);
  });

  it("allows generation only in an unlocked runtime state", async () => {
    const worker = new LoopbackWorker();
    const client = new VaultWorkerClient(worker);
    await expect(client.generatePassword(DEFAULT_PASSWORD_GENERATOR_OPTIONS)).rejects.toMatchObject(
      {
        code: "locked",
      },
    );
    await expect(
      client.generatePassphrase(DEFAULT_PASSPHRASE_GENERATOR_OPTIONS),
    ).rejects.toMatchObject({ code: "locked" });
    const recoveryKit = await client.beginEnrollment("correct horse battery staple");
    await expect(client.generatePassword(DEFAULT_PASSWORD_GENERATOR_OPTIONS)).rejects.toMatchObject(
      {
        code: "locked",
      },
    );
    await expect(
      client.generatePassphrase(DEFAULT_PASSPHRASE_GENERATOR_OPTIONS),
    ).rejects.toMatchObject({ code: "locked" });
    await client.confirmEnrollment(recoveryKit);
    await expect(client.generatePassword(DEFAULT_PASSWORD_GENERATOR_OPTIONS)).resolves.toHaveLength(
      20,
    );
    await expect(client.generatePassphrase(DEFAULT_PASSPHRASE_GENERATOR_OPTIONS)).resolves.toMatch(
      /^(?:[a-z-]+\.){7}[a-z-]+$/,
    );
    await client.lock();
  });

  it("computes TOTP for an exact current revision and rejects missing, wrong-type, and stale references", async () => {
    const worker = new LoopbackWorker();
    const client = new VaultWorkerClient(worker, 2_000, () => 59_000);
    const recoveryKit = await client.beginEnrollment("correct horse battery staple");
    const metadata = await client.confirmEnrollment(recoveryKit);
    const vaultId = metadata.vaults[0]?.id as string;
    const revision = await client.createItem(vaultId, totpItem);
    const record = { ...revision, item: totpItem };
    await expect(client.computeTotp(vaultId, record)).resolves.toEqual({
      itemId: revision.id,
      generation: "1",
      keyVersion: 1,
      algorithm: "SHA1",
      digits: 8,
      period: 30,
      code: "94287082",
      validFromUnixSeconds: "30",
      expiresAtUnixSeconds: "60",
    });

    await expect(
      client.computeTotp(vaultId, { ...record, id: "f".repeat(32) }),
    ).rejects.toMatchObject({ code: "item-not-found" });
    await expect(client.computeTotp(vaultId, { ...record, item: login })).rejects.toMatchObject({
      code: "invalid-request",
    });
    await client.updateItem(vaultId, revision.id, revision.generation, revision.keyVersion, {
      ...totpItem,
      title: "Updated TOTP",
    });
    await expect(client.computeTotp(vaultId, record)).rejects.toMatchObject({ code: "conflict" });
    await client.lock();
  });

  it("rejects a forged compute request for a non-TOTP record inside the runtime", async () => {
    const repository = new MemoryEncryptedRecordRepository();
    const setupWorker = new LoopbackWorker(repository);
    const setupClient = new VaultWorkerClient(setupWorker);
    const recoveryKit = await setupClient.beginEnrollment("correct horse battery staple");
    const metadata = await setupClient.confirmEnrollment(recoveryKit);
    const vaultId = metadata.vaults[0]?.id as string;
    const revision = await setupClient.createItem(vaultId, login);
    await setupClient.lock();

    const responses: unknown[] = [];
    const runtime = new VaultWorkerRuntime(
      {
        createProvider: createLibsodiumProvider,
        nowMilliseconds: () => 59_000,
        openRepository: async () => repository,
        subtle: crypto.subtle,
      },
      { postMessage: (message) => responses.push(message) },
    );
    await runtime.receive(request("unlock", { password: "correct horse battery staple" }));
    await runtime.receive({
      ...request("compute-totp", {
        vaultId,
        itemId: revision.id,
        generation: revision.generation,
        keyVersion: revision.keyVersion,
      }),
      requestId: "2",
      sessionEpoch: "1",
    });
    expect(responses[1]).toMatchObject({
      operation: "compute-totp",
      ok: false,
      error: "invalid-item-reference",
    });
  });

  it("returns a stable internal failure for an invalid worker clock", async () => {
    const worker = new LoopbackWorker(new MemoryEncryptedRecordRepository(), () => -1);
    const client = new VaultWorkerClient(worker, 2_000, () => 59_000);
    const recoveryKit = await client.beginEnrollment("correct horse battery staple");
    const metadata = await client.confirmEnrollment(recoveryKit);
    const vaultId = metadata.vaults[0]?.id as string;
    const revision = await client.createItem(vaultId, totpItem);
    await expect(
      client.computeTotp(vaultId, { ...revision, item: totpItem }),
    ).rejects.toMatchObject({
      code: "internal",
    });
    await client.lock();
  });

  it("fails closed on forged TOTP policy and receipt-time freshness", async () => {
    for (const result of [
      {
        algorithm: "SHA256",
        code: "46119246",
        validFromUnixSeconds: "30",
        expiresAtUnixSeconds: "60",
      },
      {
        algorithm: "SHA1",
        code: "94287082",
        validFromUnixSeconds: "0",
        expiresAtUnixSeconds: "30",
      },
    ]) {
      let terminated = false;
      const sent: unknown[] = [];
      const worker: VaultWorkerLike = {
        onerror: null,
        onmessage: null,
        onmessageerror: null,
        postMessage(message) {
          sent.push(message);
        },
        terminate() {
          terminated = true;
        },
      };
      const client = new VaultWorkerClient(worker, 2_000, () => 59_000);
      const record = {
        id: "2".repeat(32),
        generation: "1",
        keyVersion: 1,
        item: totpItem,
      };
      const computing = client.computeTotp("1".repeat(32), record);
      const posted = sent[0] as { input: Record<string, unknown> };
      expect(posted.input).toEqual({
        vaultId: "1".repeat(32),
        itemId: "2".repeat(32),
        generation: "1",
        keyVersion: 1,
      });
      expect(JSON.stringify(posted)).not.toContain(totpItem.secretBase32);
      worker.onmessage?.(
        new MessageEvent("message", {
          data: {
            protocol: VAULT_WORKER_PROTOCOL,
            requestId: "1",
            sessionEpoch: "0",
            operation: "compute-totp",
            ok: true,
            result: {
              kind: "totp-code",
              itemId: record.id,
              generation: record.generation,
              keyVersion: record.keyVersion,
              digits: 8,
              period: 30,
              ...result,
            },
          },
        }),
      );
      const expired = result.expiresAtUnixSeconds === "30";
      await expect(computing).rejects.toMatchObject({
        code: expired ? "expired-result" : "invalid-worker-response",
      });
      expect(terminated).toBe(!expired);
    }
  });

  it("fails closed on request-specific generated-password forgeries and snapshots options", async () => {
    const sent: unknown[] = [];
    let terminated = false;
    const worker: VaultWorkerLike = {
      onerror: null,
      onmessage: null,
      onmessageerror: null,
      postMessage(message) {
        sent.push(message);
      },
      terminate() {
        terminated = true;
      },
    };
    const client = new VaultWorkerClient(worker);
    const options = {
      length: 25,
      lowercase: false,
      uppercase: false,
      digits: true,
      symbols: false,
    };
    const generating = client.generatePassword(options);
    options.digits = false;
    options.lowercase = true;
    const posted = sent[0] as { input: { digits: boolean; lowercase: boolean } };
    expect(posted.input).toMatchObject({ digits: true, lowercase: false });
    worker.onmessage?.(
      new MessageEvent("message", {
        data: {
          protocol: VAULT_WORKER_PROTOCOL,
          requestId: "1",
          sessionEpoch: "0",
          operation: "generate-password",
          ok: true,
          result: { kind: "generated-password", password: "a".repeat(25) },
        },
      }),
    );
    await expect(generating).rejects.toMatchObject({ code: "invalid-worker-response" });
    expect(terminated).toBe(true);
  });

  it("fails closed on request-specific passphrase forgeries, mutation, and cross-operation results", async () => {
    for (const result of [
      {
        kind: "generated-passphrase",
        passphrase: validPassphrase.replace("abnormal", "not-a-word"),
      },
      {
        kind: "generated-passphrase",
        passphrase: validPassphrase.split(".").slice(0, 7).join("."),
      },
      { kind: "generated-password", password: "a".repeat(20) },
    ]) {
      const sent: unknown[] = [];
      let terminated = false;
      const worker: VaultWorkerLike = {
        onerror: null,
        onmessage: null,
        onmessageerror: null,
        postMessage(message) {
          sent.push(message);
        },
        terminate() {
          terminated = true;
        },
      };
      const client = new VaultWorkerClient(worker);
      const options = { words: 8 };
      const generating = client.generatePassphrase(options);
      options.words = 7;
      expect(sent[0]).toMatchObject({ input: { words: 8 } });
      worker.onmessage?.(
        new MessageEvent("message", {
          data: {
            protocol: VAULT_WORKER_PROTOCOL,
            requestId: "1",
            sessionEpoch: "0",
            operation: "generate-passphrase",
            ok: true,
            result,
          },
        }),
      );
      await expect(generating).rejects.toMatchObject({ code: "invalid-worker-response" });
      expect(terminated).toBe(true);
    }
  });

  it("fails closed on a forged response and rejects every outstanding request", async () => {
    const worker: VaultWorkerLike = {
      onerror: null,
      onmessage: null,
      onmessageerror: null,
      postMessage() {},
      terminate: () => {
        terminated = true;
      },
    };
    let terminated = false;
    const client = new VaultWorkerClient(worker);
    const pending = client.state();
    worker.onmessage?.(
      new MessageEvent("message", {
        data: {
          protocol: VAULT_WORKER_PROTOCOL,
          requestId: "1",
          sessionEpoch: "0",
          operation: "state",
          ok: true,
          result: { kind: "session", metadata: {} },
        },
      }),
    );
    await expect(pending).rejects.toEqual(
      expect.objectContaining<VaultWorkerClientFailure>({ code: "invalid-worker-response" }),
    );
    expect(terminated).toBe(true);
  });

  it("rejects schema-valid cross-operation and wrong-item responses", async () => {
    const createWorker: VaultWorkerLike = {
      onerror: null,
      onmessage: null,
      onmessageerror: null,
      postMessage() {},
      terminate() {},
    };
    const createClient = new VaultWorkerClient(createWorker);
    const creating = createClient.createItem("1".repeat(32), login);
    createWorker.onmessage?.(
      new MessageEvent("message", {
        data: {
          protocol: VAULT_WORKER_PROTOCOL,
          requestId: "1",
          sessionEpoch: "0",
          operation: "update-item",
          ok: true,
          result: {
            kind: "revision",
            vaultId: "1".repeat(32),
            revision: { id: "2".repeat(32), generation: "1", keyVersion: 1 },
          },
        },
      }),
    );
    await expect(creating).rejects.toMatchObject({ code: "invalid-worker-response" });

    const readWorker: VaultWorkerLike = {
      onerror: null,
      onmessage: null,
      onmessageerror: null,
      postMessage() {},
      terminate() {},
    };
    const readClient = new VaultWorkerClient(readWorker);
    const reading = readClient.getItem("1".repeat(32), "2".repeat(32));
    readWorker.onmessage?.(
      new MessageEvent("message", {
        data: {
          protocol: VAULT_WORKER_PROTOCOL,
          requestId: "1",
          sessionEpoch: "0",
          operation: "get-item",
          ok: true,
          result: {
            kind: "item",
            vaultId: "1".repeat(32),
            item: {
              id: "3".repeat(32),
              generation: "1",
              keyVersion: 1,
              item: login,
            },
          },
        },
      }),
    );
    await expect(reading).rejects.toMatchObject({ code: "invalid-worker-response" });
  });

  it("rejects schema-valid wrong-vault pages and forged deletion receipts", async () => {
    let pageTerminated = false;
    const pageWorker: VaultWorkerLike = {
      onerror: null,
      onmessage: null,
      onmessageerror: null,
      postMessage() {},
      terminate() {
        pageTerminated = true;
      },
    };
    const pageClient = new VaultWorkerClient(pageWorker);
    const listing = pageClient.listItemSummaries("1".repeat(32), 1);
    pageWorker.onmessage?.(
      new MessageEvent("message", {
        data: {
          protocol: VAULT_WORKER_PROTOCOL,
          requestId: "1",
          sessionEpoch: "0",
          operation: "list-item-summaries",
          ok: true,
          result: {
            kind: "summaries",
            vaultId: "2".repeat(32),
            items: [],
            issues: [],
          },
        },
      }),
    );
    await expect(listing).rejects.toMatchObject({ code: "invalid-worker-response" });
    expect(pageTerminated).toBe(true);

    const cursorWorker: VaultWorkerLike = {
      onerror: null,
      onmessage: null,
      onmessageerror: null,
      postMessage() {},
      terminate() {},
    };
    const cursorClient = new VaultWorkerClient(cursorWorker);
    const cursor = "2".repeat(32);
    const emptyPage = cursorClient.listItemSummaries("1".repeat(32), 1, cursor);
    cursorWorker.onmessage?.(
      new MessageEvent("message", {
        data: {
          protocol: VAULT_WORKER_PROTOCOL,
          requestId: "1",
          sessionEpoch: "0",
          operation: "list-item-summaries",
          ok: true,
          result: {
            kind: "summaries",
            vaultId: "1".repeat(32),
            items: [],
            issues: [],
            nextCursor: cursor,
          },
        },
      }),
    );
    await expect(emptyPage).rejects.toMatchObject({ code: "invalid-worker-response" });

    let deletionTerminated = false;
    const deletionWorker: VaultWorkerLike = {
      onerror: null,
      onmessage: null,
      onmessageerror: null,
      postMessage() {},
      terminate() {
        deletionTerminated = true;
      },
    };
    const deletionClient = new VaultWorkerClient(deletionWorker);
    const deleting = deletionClient.deleteItem("1".repeat(32), "2".repeat(32), "7", 3);
    deletionWorker.onmessage?.(
      new MessageEvent("message", {
        data: {
          protocol: VAULT_WORKER_PROTOCOL,
          requestId: "1",
          sessionEpoch: "0",
          operation: "delete-item",
          ok: true,
          result: {
            kind: "deleted",
            vaultId: "1".repeat(32),
            deletion: { id: "3".repeat(32), generation: "7", keyVersion: 3 },
          },
        },
      }),
    );
    await expect(deleting).rejects.toMatchObject({ code: "invalid-worker-response" });
    expect(deletionTerminated).toBe(true);
  });

  it("rejects invalid summary ordering and snapshots requests before posting", async () => {
    const sent: unknown[] = [];
    let terminated = false;
    const worker: VaultWorkerLike = {
      onerror: null,
      onmessage: null,
      onmessageerror: null,
      postMessage(message) {
        sent.push(message);
      },
      terminate() {
        terminated = true;
      },
    };
    const client = new VaultWorkerClient(worker);
    const listing = client.listItemSummaries("1".repeat(32), 2, "1".repeat(32));
    worker.onmessage?.(
      new MessageEvent("message", {
        data: {
          protocol: VAULT_WORKER_PROTOCOL,
          requestId: "1",
          sessionEpoch: "0",
          operation: "list-item-summaries",
          ok: true,
          result: {
            kind: "summaries",
            vaultId: "1".repeat(32),
            items: [
              { id: "3".repeat(32), generation: "1", keyVersion: 1, title: "B", type: "login" },
              { id: "2".repeat(32), generation: "1", keyVersion: 1, title: "A", type: "login" },
            ],
            issues: [],
          },
        },
      }),
    );
    await expect(listing).rejects.toMatchObject({ code: "invalid-worker-response" });
    expect(terminated).toBe(true);

    const mutationWorker: VaultWorkerLike = {
      onerror: null,
      onmessage: null,
      onmessageerror: null,
      postMessage(message) {
        sent.push(message);
      },
      terminate() {},
    };
    const mutationClient = new VaultWorkerClient(mutationWorker);
    await expect(
      mutationClient.updateItem("1".repeat(32), "2".repeat(32), "not-a-number", 1, login),
    ).rejects.toMatchObject({ code: "invalid-request" });
    expect(sent).toHaveLength(1);
    const candidate = { ...login, tags: ["original-tag"] };
    const creating = mutationClient.createItem("1".repeat(32), candidate);
    const rejection = expect(creating).rejects.toMatchObject({ code: "closed" });
    candidate.title = "mutated title";
    candidate.tags[0] = "mutated-tag";
    const posted = sent[1] as { input: { item: VaultItem } };
    expect(posted.input.item.title).toBe(login.title);
    expect(posted.input.item.tags).toEqual(["original-tag"]);
    mutationClient.terminate();
    await rejection;
  });

  it("drops duplicate and out-of-order request IDs without dispatch", async () => {
    const responses: unknown[] = [];
    const runtime = new VaultWorkerRuntime(
      {
        createProvider: createLibsodiumProvider,
        nowMilliseconds: () => 59_000,
        openRepository: async () => new MemoryEncryptedRecordRepository(),
        subtle: crypto.subtle,
      },
      { postMessage: (message) => responses.push(message) },
    );
    await runtime.receive({ ...request("state"), requestId: "2" });
    await runtime.receive({ ...request("state"), requestId: "2" });
    await runtime.receive({ ...request("state"), requestId: "1" });
    await runtime.receive({ ...request("state"), requestId: "3", sessionEpoch: "1" });
    expect(responses).toHaveLength(2);
    expect(responses[0]).toMatchObject({ requestId: "2", ok: true });
    expect(responses[1]).toMatchObject({ requestId: "3", ok: false, error: "locked" });
  });

  it("rejects pending work as soon as lock starts and discards its late result", async () => {
    const sent: unknown[] = [];
    let terminated = false;
    const worker: VaultWorkerLike = {
      onerror: null,
      onmessage: null,
      onmessageerror: null,
      postMessage(message) {
        sent.push(message);
      },
      terminate() {
        terminated = true;
      },
    };
    const client = new VaultWorkerClient(worker);
    const generation = client.generatePassphrase(DEFAULT_PASSPHRASE_GENERATOR_OPTIONS);
    const rejectedGeneration = expect(generation).rejects.toMatchObject({ code: "locked" });
    const locking = client.lock();
    await rejectedGeneration;
    expect(sent).toHaveLength(2);
    worker.onmessage?.(
      new MessageEvent("message", {
        data: {
          protocol: VAULT_WORKER_PROTOCOL,
          requestId: "1",
          sessionEpoch: "0",
          operation: "generate-passphrase",
          ok: true,
          result: { kind: "generated-passphrase", passphrase: validPassphrase },
        },
      }),
    );
    worker.onmessage?.(
      new MessageEvent("message", {
        data: {
          protocol: VAULT_WORKER_PROTOCOL,
          requestId: "2",
          sessionEpoch: "1",
          operation: "lock",
          ok: true,
          result: { kind: "done" },
        },
      }),
    );
    await locking;
    expect(terminated).toBe(true);
  });

  it("terminates an unresponsive worker when lock acknowledgement expires", async () => {
    let terminated = false;
    const worker: VaultWorkerLike = {
      onerror: null,
      onmessage: null,
      onmessageerror: null,
      postMessage() {},
      terminate() {
        terminated = true;
      },
    };
    const client = new VaultWorkerClient(worker, 5);
    await expect(client.lock()).rejects.toMatchObject({ code: "lock-timeout" });
    expect(terminated).toBe(true);
    expect(client.isClosed).toBe(true);
  });
});
