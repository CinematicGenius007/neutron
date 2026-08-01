import { type CryptoProvider, createLibsodiumProvider } from "@neutron/crypto";
import { ENVELOPE_KIND, sealEnvelope } from "@neutron/protocol";
import {
  type EncryptedRecord,
  type EncryptedRecordIdentity,
  type EncryptedRecordIdentityPrefix,
  type EncryptedRecordMutation,
  type EncryptedRecordRead,
  type EncryptedRecordRepository,
  MemoryEncryptedRecordRepository,
  type VaultItem,
} from "@neutron/vault-domain";
import { describe, expect, it } from "vitest";

import {
  beginOfflineEnrollment,
  LocalVaultFailure,
  unlockOfflineVault,
} from "../src/local-vault.js";

function replaceRandom(
  provider: CryptoProvider,
  randomBytes: (length: number) => Uint8Array,
): CryptoProvider {
  return {
    name: provider.name,
    sodiumVersion: provider.sodiumVersion,
    clear: (value) => provider.clear(value),
    decryptXChaCha20Poly1305: (input) => provider.decryptXChaCha20Poly1305(input),
    deriveArgon2idKey: (password, salt) => provider.deriveArgon2idKey(password, salt),
    deriveHkdfSha256: (input) => provider.deriveHkdfSha256(input),
    encryptXChaCha20Poly1305: (input) => provider.encryptXChaCha20Poly1305(input),
    randomBytes,
  };
}

type PausableRepositoryMethod = "applyConditionalBatch" | "get";

class ObservedEncryptedRecordRepository implements EncryptedRecordRepository {
  readonly delegate = new MemoryEncryptedRecordRepository();
  readonly getCalls: EncryptedRecordIdentity[] = [];
  #pause:
    | {
        readonly entered: () => void;
        readonly method: PausableRepositoryMethod;
        readonly released: Promise<void>;
      }
    | undefined;

  pauseNext(method: PausableRepositoryMethod): Readonly<{
    entered: Promise<void>;
    release: () => void;
  }> {
    if (this.#pause !== undefined) throw new Error("repository pause already armed");
    let entered!: () => void;
    let release!: () => void;
    const enteredPromise = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.#pause = { entered, method, released };
    return { entered: enteredPromise, release };
  }

  resetGetCalls(): void {
    this.getCalls.length = 0;
  }

  async #pauseAfter(method: PausableRepositoryMethod): Promise<void> {
    const pause = this.#pause;
    if (pause?.method !== method) return;
    this.#pause = undefined;
    pause.entered();
    await pause.released;
  }

  async applyBatch(mutations: readonly EncryptedRecordMutation[]): Promise<void> {
    await this.delegate.applyBatch(mutations);
  }

  async applyConditionalBatch(
    requiredPresent: readonly EncryptedRecord[],
    requiredAbsent: readonly EncryptedRecordIdentity[],
    requiredAbsentPrefixes: readonly EncryptedRecordIdentityPrefix[],
    requiredAccountId: string | undefined,
    maximumRecordCount: number,
    mutations: readonly EncryptedRecordMutation[],
  ): Promise<void> {
    await this.delegate.applyConditionalBatch(
      requiredPresent,
      requiredAbsent,
      requiredAbsentPrefixes,
      requiredAccountId,
      maximumRecordCount,
      mutations,
    );
    await this.#pauseAfter("applyConditionalBatch");
  }

  close(): void {
    this.delegate.close();
  }

  delete(identity: EncryptedRecordIdentity): Promise<boolean> {
    return this.delegate.delete(identity);
  }

  async get(identity: EncryptedRecordIdentity): Promise<EncryptedRecordRead | undefined> {
    this.getCalls.push(identity);
    const result = await this.delegate.get(identity);
    await this.#pauseAfter("get");
    return result;
  }

  initializeIfEmpty(envelopes: readonly Uint8Array[]): Promise<readonly EncryptedRecord[]> {
    return this.delegate.initializeIfEmpty(envelopes);
  }

  listIdentities(maximum: number): Promise<readonly EncryptedRecordIdentity[]> {
    return this.delegate.listIdentities(maximum);
  }

  list(): Promise<readonly EncryptedRecordRead[]> {
    return this.delegate.list();
  }

  put(envelope: Uint8Array): Promise<EncryptedRecord> {
    return this.delegate.put(envelope);
  }
}

function observeDecrypts(provider: CryptoProvider): Readonly<{
  calls: () => number;
  provider: CryptoProvider;
  reset: () => void;
}> {
  let decryptCalls = 0;
  return {
    calls: () => decryptCalls,
    provider: {
      name: provider.name,
      sodiumVersion: provider.sodiumVersion,
      clear: (value) => provider.clear(value),
      decryptXChaCha20Poly1305: (input) => {
        decryptCalls += 1;
        return provider.decryptXChaCha20Poly1305(input);
      },
      deriveArgon2idKey: (password, salt) => provider.deriveArgon2idKey(password, salt),
      deriveHkdfSha256: (input) => provider.deriveHkdfSha256(input),
      encryptXChaCha20Poly1305: (input) => provider.encryptXChaCha20Poly1305(input),
      randomBytes: (length) => provider.randomBytes(length),
    },
    reset: () => {
      decryptCalls = 0;
    },
  };
}

function bytesFromHex(value: string): Uint8Array {
  return Uint8Array.from(value.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));
}

const itemFixtures: readonly VaultItem[] = [
  {
    schemaVersion: 1,
    type: "login",
    title: "Synthetic login",
    tags: ["critical"],
    username: "alice@example.invalid",
    password: "fixture password",
    url: "https://fixture.invalid",
  },
  {
    schemaVersion: 1,
    type: "secure-note",
    title: "Synthetic note",
    tags: [],
    body: "fixture note body",
  },
  {
    schemaVersion: 1,
    type: "totp",
    title: "Synthetic TOTP",
    tags: [],
    secretBase32: "JBSWY3DPEHPK3PXP",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  },
  {
    schemaVersion: 1,
    type: "backup-code",
    title: "Synthetic codes",
    tags: [],
    codes: ["fixture-0001", "fixture-0002"],
  },
  {
    schemaVersion: 1,
    type: "json",
    title: "Synthetic JSON",
    tags: [],
    value: { enabled: true, marker: "fixture-json" },
  },
];

describe("offline enrollment and session", () => {
  it("gates atomic initialization on exact kit confirmation and unlocks locally", async () => {
    const provider = await createLibsodiumProvider();
    const repository = new MemoryEncryptedRecordRepository();
    const rejected = await beginOfflineEnrollment(provider, repository, "correct horse 🔐");
    expect(await repository.list()).toEqual([]);
    const replacement = rejected.recoveryKit.endsWith("q") ? "p" : "q";
    await expect(
      rejected.confirm(`${rejected.recoveryKit.slice(0, -1)}${replacement}`),
    ).rejects.toMatchObject({
      code: "confirmation-failed",
    });
    expect(await repository.list()).toEqual([]);
    await expect(rejected.confirm(rejected.recoveryKit)).rejects.toMatchObject({
      code: "enrollment-state",
    });
    const pending = await beginOfflineEnrollment(provider, repository, "correct horse 🔐");
    const session = await pending.confirm(pending.recoveryKit);
    expect(await repository.list()).toHaveLength(3);
    expect(session.metadata.vaults).toHaveLength(1);
    expect(Object.isFrozen(session.metadata)).toBe(true);
    await expect(pending.confirm(pending.recoveryKit)).rejects.toMatchObject({
      code: "enrollment-state",
    });
    await expect(unlockOfflineVault(provider, repository, "wrong password")).rejects.toMatchObject({
      code: "unlock-failed",
    });
    const reopened = await unlockOfflineVault(provider, repository, "correct horse 🔐");
    expect(reopened.metadata).toEqual(session.metadata);
    expect(reopened.isLocked).toBe(false);
    reopened.lock();
    reopened.lock();
    expect(reopened.isLocked).toBe(true);
    session.lock();
  }, 30_000);

  it("cancels without persistence and rejects reuse and invalid passwords", async () => {
    const provider = await createLibsodiumProvider();
    const repository = new MemoryEncryptedRecordRepository();
    await expect(beginOfflineEnrollment(provider, repository, "")).rejects.toBeInstanceOf(
      LocalVaultFailure,
    );
    const pending = await beginOfflineEnrollment(provider, repository, "synthetic-password");
    pending.cancel();
    pending.cancel();
    expect(await repository.list()).toEqual([]);
    await expect(pending.confirm(pending.recoveryKit)).rejects.toMatchObject({
      code: "enrollment-state",
    });
    await expect(
      unlockOfflineVault(provider, repository, "synthetic-password"),
    ).rejects.toMatchObject({ code: "not-initialized" });
  }, 30_000);

  it("contains hostile entropy providers and concurrent confirmation", async () => {
    const provider = await createLibsodiumProvider();
    for (const randomBytes of [
      () => new Uint8Array(15),
      () => new (class extends Uint8Array {})(16),
      () => {
        throw new Error("provider-controlled");
      },
    ])
      await expect(
        beginOfflineEnrollment(
          replaceRandom(provider, randomBytes),
          new MemoryEncryptedRecordRepository(),
          "synthetic-password",
        ),
      ).rejects.toMatchObject({ code: "corrupt-state" });

    await expect(
      beginOfflineEnrollment(
        replaceRandom(provider, (length) => new Uint8Array(length)),
        new MemoryEncryptedRecordRepository(),
        "synthetic-password",
      ),
    ).rejects.toMatchObject({ code: "corrupt-state" });

    const repository = new MemoryEncryptedRecordRepository();
    const pending = await beginOfflineEnrollment(provider, repository, "race-password");
    const outcomes = await Promise.allSettled([
      pending.confirm(pending.recoveryKit),
      pending.confirm(pending.recoveryKit),
    ]);
    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect(await repository.list()).toHaveLength(3);
    const success = outcomes.find(({ status }) => status === "fulfilled");
    if (success?.status === "fulfilled") success.value.lock();

    let sixteenByteCalls = 0;
    const repeatedId = Uint8Array.from({ length: 16 }, (_, index) => index + 1);
    const collisionProvider = replaceRandom(provider, (length) => {
      if (length !== 16) return provider.randomBytes(length);
      sixteenByteCalls += 1;
      return sixteenByteCalls <= 2 ? provider.randomBytes(length) : repeatedId.slice();
    });
    const collisionRepository = new MemoryEncryptedRecordRepository();
    const collisionPending = await beginOfflineEnrollment(
      collisionProvider,
      collisionRepository,
      "collision-password",
    );
    const collisionSession = await collisionPending.confirm(collisionPending.recoveryKit);
    const vaultId = collisionSession.metadata.vaults[0]?.id;
    if (vaultId === undefined) throw new Error("missing vault");
    await collisionSession.createItem(vaultId, itemFixtures[0]);
    await expect(collisionSession.createItem(vaultId, itemFixtures[1])).rejects.toMatchObject({
      code: "conflict",
    });
    expect((await collisionSession.listItems(vaultId)).items).toHaveLength(1);
    collisionSession.lock();
  }, 30_000);

  it("creates, lists, updates, conflicts, and deletes every item type", async () => {
    const provider = await createLibsodiumProvider();
    const repository = new MemoryEncryptedRecordRepository();
    const pending = await beginOfflineEnrollment(provider, repository, "item-password");
    const firstSession = await pending.confirm(pending.recoveryKit);
    const secondSession = await unlockOfflineVault(provider, repository, "item-password");
    const vaultId = firstSession.metadata.vaults[0]?.id;
    if (vaultId === undefined) throw new Error("missing vault");

    const created = [];
    for (const item of itemFixtures) created.push(await firstSession.createItem(vaultId, item));
    expect(created.map(({ generation }) => generation)).toEqual([1n, 1n, 1n, 1n, 1n]);
    const listed = await firstSession.listItems(vaultId);
    expect(listed.issues).toEqual([]);
    expect(listed.items.map(({ item }) => item.type).sort()).toEqual(
      itemFixtures.map(({ type }) => type).sort(),
    );

    const target = created[0];
    if (target === undefined) throw new Error("missing item");
    const firstUpdate = firstSession.updateItem(vaultId, target.id, 1n, 1, {
      ...itemFixtures[0],
      title: "First concurrent title",
    });
    const secondUpdate = secondSession.updateItem(vaultId, target.id, 1n, 1, {
      ...itemFixtures[0],
      title: "Second concurrent title",
    });
    const outcomes = await Promise.allSettled([firstUpdate, secondUpdate]);
    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const winner = await firstSession.getItem(vaultId, target.id);
    expect(winner?.generation).toBe(2n);
    await expect(
      firstSession.updateItem(vaultId, target.id, 2n, 2, itemFixtures[0]),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      firstSession.updateItem(vaultId, target.id, 1n, 1, itemFixtures[0]),
    ).rejects.toMatchObject({ code: "conflict" });

    const deleted = created[1];
    if (deleted === undefined) throw new Error("missing item");
    await expect(
      firstSession.deleteItem(vaultId, deleted.id, deleted.generation, deleted.keyVersion),
    ).resolves.toEqual({
      generation: deleted.generation,
      id: deleted.id,
      keyVersion: deleted.keyVersion,
    });
    expect(await firstSession.getItem(vaultId, deleted.id)).toBeUndefined();
    expect(await repository.list()).toHaveLength(3 + 4 * 2);

    const corrupt = created[2];
    if (corrupt === undefined) throw new Error("missing item");
    const payload = (await repository.list()).find(
      (read) =>
        read.status === "valid" &&
        read.record.identity.split(":")[1] === "10" &&
        read.record.identity.split(":")[3] === corrupt.id,
    );
    if (payload?.status !== "valid") throw new Error("missing payload");
    const tampered = payload.record.envelope.slice();
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] as number) ^ 1;
    await repository.put(tampered);
    const isolated = await firstSession.listItems(vaultId);
    expect(isolated.items).toHaveLength(3);
    expect(isolated.issues).toEqual([{ code: "corrupt-item", id: corrupt.id }]);
    await expect(firstSession.getItem(vaultId, corrupt.id)).rejects.toMatchObject({
      code: "corrupt-item",
    });

    firstSession.lock();
    await expect(firstSession.listItems(vaultId)).rejects.toMatchObject({ code: "locked" });
    await expect(firstSession.createItem(vaultId, itemFixtures[0])).rejects.toMatchObject({
      code: "locked",
    });
    await expect(firstSession.getItem(vaultId, target.id)).rejects.toMatchObject({
      code: "locked",
    });
    await expect(firstSession.getItem(vaultId, "malformed-item-id")).rejects.toMatchObject({
      code: "locked",
    });
    await expect(firstSession.deleteItem(vaultId, target.id, 2n, 1)).rejects.toMatchObject({
      code: "locked",
    });
    await expect(
      firstSession.updateItem(vaultId, target.id, 2n, 1, itemFixtures[0]),
    ).rejects.toMatchObject({ code: "locked" });
    secondSession.lock();
  }, 30_000);

  it("rejects create when an orphan generation-2 payload owns the candidate object ID", async () => {
    const provider = await createLibsodiumProvider();
    let sixteenByteCalls = 0;
    const repeatedId = Uint8Array.from({ length: 16 }, (_, index) => index + 31);
    const collisionProvider = replaceRandom(provider, (length) => {
      if (length !== 16) return provider.randomBytes(length);
      sixteenByteCalls += 1;
      return sixteenByteCalls <= 2 ? provider.randomBytes(length) : repeatedId.slice();
    });
    const repository = new MemoryEncryptedRecordRepository();
    const pending = await beginOfflineEnrollment(
      collisionProvider,
      repository,
      "orphan-collision-password",
    );
    const session = await pending.confirm(pending.recoveryKit);
    const vaultId = session.metadata.vaults[0]?.id;
    if (vaultId === undefined) throw new Error("missing vault");
    await repository.put(
      sealEnvelope(collisionProvider, {
        accountId: bytesFromHex(session.metadata.accountId),
        content: { plaintext: Uint8Array.of(1), type: "payload" },
        generation: 2n,
        keySource: { parentKey: new Uint8Array(32), source: "parent" },
        keyVersion: 1,
        kind: ENVELOPE_KIND.ITEM_PAYLOAD,
        objectId: repeatedId,
      }),
    );

    await expect(session.createItem(vaultId, itemFixtures[0])).rejects.toMatchObject({
      code: "conflict",
    });
    expect(await repository.list()).toHaveLength(4);
    session.lock();
  }, 30_000);

  it("invalidates every in-flight item operation when the session locks", async () => {
    const provider = await createLibsodiumProvider();

    async function setup(password: string, createItem: boolean) {
      const repository = new ObservedEncryptedRecordRepository();
      const pending = await beginOfflineEnrollment(provider, repository, password);
      const session = await pending.confirm(pending.recoveryKit);
      const vaultId = session.metadata.vaults[0]?.id;
      if (vaultId === undefined) throw new Error("missing vault");
      const item = createItem ? await session.createItem(vaultId, itemFixtures[0]) : undefined;
      return { item, repository, session, vaultId };
    }

    {
      const { repository, session, vaultId } = await setup("in-flight-list", true);
      const pause = repository.pauseNext("get");
      const operation = session.listItems(vaultId);
      await pause.entered;
      const assertion = expect(operation).rejects.toMatchObject({ code: "locked" });
      session.lock();
      pause.release();
      await assertion;
    }

    {
      const { item, repository, session, vaultId } = await setup("in-flight-get", true);
      if (item === undefined) throw new Error("missing item");
      const pause = repository.pauseNext("get");
      const operation = session.getItem(vaultId, item.id);
      await pause.entered;
      const assertion = expect(operation).rejects.toMatchObject({ code: "locked" });
      session.lock();
      pause.release();
      await assertion;
    }

    {
      const { repository, session, vaultId } = await setup("in-flight-create", false);
      const pause = repository.pauseNext("applyConditionalBatch");
      const operation = session.createItem(vaultId, itemFixtures[0]);
      await pause.entered;
      expect(await repository.list()).toHaveLength(5);
      const assertion = expect(operation).rejects.toMatchObject({ code: "locked" });
      session.lock();
      pause.release();
      await assertion;
      expect(await repository.list()).toHaveLength(5);
    }

    {
      const { item, repository, session, vaultId } = await setup("in-flight-update", true);
      if (item === undefined) throw new Error("missing item");
      const pause = repository.pauseNext("applyConditionalBatch");
      const operation = session.updateItem(vaultId, item.id, item.generation, item.keyVersion, {
        ...itemFixtures[0],
        title: "Synthetic committed update",
      });
      await pause.entered;
      const assertion = expect(operation).rejects.toMatchObject({ code: "locked" });
      session.lock();
      pause.release();
      await assertion;
      const payloads = (await repository.list()).filter(
        (read) => read.status === "valid" && read.record.identity.split(":")[1] === "10",
      );
      expect(payloads).toHaveLength(1);
      expect(payloads[0]?.status === "valid" ? payloads[0].record.identity : "").toMatch(
        /:0000000000000002$/,
      );
    }

    {
      const { item, repository, session, vaultId } = await setup("in-flight-delete", true);
      if (item === undefined) throw new Error("missing item");
      const pause = repository.pauseNext("applyConditionalBatch");
      const operation = session.deleteItem(vaultId, item.id, item.generation, item.keyVersion);
      await pause.entered;
      expect(await repository.list()).toHaveLength(3);
      const assertion = expect(operation).rejects.toMatchObject({ code: "locked" });
      session.lock();
      pause.release();
      await assertion;
      expect(await repository.list()).toHaveLength(3);
    }
  }, 60_000);

  it("uses only the target records and keys for point get, update, and delete", async () => {
    const observedProvider = observeDecrypts(await createLibsodiumProvider());
    const repository = new ObservedEncryptedRecordRepository();
    const pending = await beginOfflineEnrollment(
      observedProvider.provider,
      repository,
      "point-read-isolation",
    );
    const session = await pending.confirm(pending.recoveryKit);
    const vaultId = session.metadata.vaults[0]?.id;
    if (vaultId === undefined) throw new Error("missing vault");
    const target = await session.createItem(vaultId, itemFixtures[0]);
    const unrelated = await session.createItem(vaultId, itemFixtures[1]);

    repository.resetGetCalls();
    observedProvider.reset();
    expect((await session.getItem(vaultId, target.id))?.id).toBe(target.id);
    expect(repository.getCalls).toHaveLength(2);
    expect(repository.getCalls.every((identity) => identity.split(":")[3] === target.id)).toBe(
      true,
    );
    expect(repository.getCalls.some((identity) => identity.includes(unrelated.id))).toBe(false);
    expect(observedProvider.calls()).toBe(2);

    repository.resetGetCalls();
    observedProvider.reset();
    const updated = await session.updateItem(
      vaultId,
      target.id,
      target.generation,
      target.keyVersion,
      {
        ...itemFixtures[0],
        title: "Synthetic isolated update",
      },
    );
    expect(repository.getCalls).toHaveLength(2);
    expect(repository.getCalls.every((identity) => identity.split(":")[3] === target.id)).toBe(
      true,
    );
    expect(repository.getCalls.some((identity) => identity.includes(unrelated.id))).toBe(false);
    expect(observedProvider.calls()).toBe(3);

    repository.resetGetCalls();
    observedProvider.reset();
    await session.deleteItem(vaultId, target.id, updated.generation, updated.keyVersion);
    expect(repository.getCalls).toHaveLength(2);
    expect(repository.getCalls.every((identity) => identity.split(":")[3] === target.id)).toBe(
      true,
    );
    expect(repository.getCalls.some((identity) => identity.includes(unrelated.id))).toBe(false);
    expect(observedProvider.calls()).toBe(2);
    session.lock();
  }, 30_000);

  it("fails closed on authority ambiguity while isolating corrupt item wrappers", async () => {
    const provider = await createLibsodiumProvider();

    const missingRepository = new MemoryEncryptedRecordRepository();
    const missingPending = await beginOfflineEnrollment(
      provider,
      missingRepository,
      "missing-root",
    );
    const missingSession = await missingPending.confirm(missingPending.recoveryKit);
    const recovery = (await missingRepository.list()).find(
      (read) => read.status === "valid" && read.record.identity.split(":")[1] === "02",
    );
    if (recovery?.status !== "valid") throw new Error("missing recovery fixture");
    await missingRepository.delete(recovery.record.identity);
    await expect(
      unlockOfflineVault(provider, missingRepository, "missing-root"),
    ).rejects.toMatchObject({ code: "corrupt-state" });
    missingSession.lock();

    const duplicateRepository = new MemoryEncryptedRecordRepository();
    const duplicatePending = await beginOfflineEnrollment(
      provider,
      duplicateRepository,
      "duplicate-root",
    );
    const duplicateSession = await duplicatePending.confirm(duplicatePending.recoveryKit);
    const password = (await duplicateRepository.list()).find(
      (read) => read.status === "valid" && read.record.identity.split(":")[1] === "01",
    );
    if (password?.status !== "valid") throw new Error("missing password fixture");
    const duplicate = password.record.envelope.slice();
    new DataView(duplicate.buffer, duplicate.byteOffset, duplicate.byteLength).setBigUint64(
      44,
      2n,
      false,
    );
    await duplicateRepository.put(duplicate);
    await expect(
      unlockOfflineVault(provider, duplicateRepository, "duplicate-root"),
    ).rejects.toMatchObject({ code: "corrupt-state" });
    duplicateSession.lock();

    const crossRepository = new MemoryEncryptedRecordRepository();
    const crossPending = await beginOfflineEnrollment(provider, crossRepository, "cross-account");
    const crossSession = await crossPending.confirm(crossPending.recoveryKit);
    await crossRepository.put(
      sealEnvelope(provider, {
        accountId: Uint8Array.from({ length: 16 }, (_, index) => index + 101),
        content: { plaintext: Uint8Array.of(1), type: "payload" },
        generation: 1n,
        keySource: { parentKey: new Uint8Array(32), source: "parent" },
        keyVersion: 1,
        kind: ENVELOPE_KIND.INDEX_PAYLOAD,
        objectId: Uint8Array.from({ length: 16 }, (_, index) => index + 51),
      }),
    );
    const crossVaultId = crossSession.metadata.vaults[0]?.id;
    if (crossVaultId === undefined) throw new Error("missing vault");
    await expect(crossSession.createItem(crossVaultId, itemFixtures[0])).rejects.toMatchObject({
      code: "conflict",
    });
    await expect(
      unlockOfflineVault(provider, crossRepository, "cross-account"),
    ).rejects.toMatchObject({ code: "corrupt-state" });
    crossSession.lock();

    const itemRepository = new MemoryEncryptedRecordRepository();
    const itemPending = await beginOfflineEnrollment(provider, itemRepository, "corrupt-item");
    const itemSession = await itemPending.confirm(itemPending.recoveryKit);
    const vaultId = itemSession.metadata.vaults[0]?.id;
    if (vaultId === undefined) throw new Error("missing vault");
    const item = await itemSession.createItem(vaultId, itemFixtures[0]);
    const wrapper = (await itemRepository.list()).find(
      (read) =>
        read.status === "valid" &&
        read.record.identity.split(":")[1] === "04" &&
        read.record.identity.split(":")[3] === item.id,
    );
    if (wrapper?.status !== "valid") throw new Error("missing wrapper");
    const corruptWrapper = wrapper.record.envelope.slice();
    corruptWrapper[corruptWrapper.length - 1] =
      (corruptWrapper[corruptWrapper.length - 1] as number) ^ 1;
    await itemRepository.put(corruptWrapper);
    itemSession.lock();
    const reopened = await unlockOfflineVault(provider, itemRepository, "corrupt-item");
    expect((await reopened.listItems(vaultId)).issues).toEqual([
      { code: "corrupt-item", id: item.id },
    ]);
    reopened.lock();
  }, 30_000);
});
