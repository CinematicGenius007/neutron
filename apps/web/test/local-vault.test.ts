import { type CryptoProvider, createLibsodiumProvider } from "@neutron/crypto";
import { MemoryEncryptedRecordRepository } from "@neutron/vault-domain";
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
  }, 30_000);
});
