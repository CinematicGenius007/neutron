import type { CryptoProvider } from "@neutron/crypto";
import {
  decodeRecoveryKitV1,
  ENVELOPE_KIND,
  encodePasswordString,
  encodeRecoveryKitV1,
  type OpenedEnvelope,
  openEnvelope,
  parseUnauthenticatedEnvelopeHeader,
  sealEnvelope,
} from "@neutron/protocol";
import { EncryptedRecordFailure, type EncryptedRecordRepository } from "@neutron/vault-domain";

export type LocalVaultFailureCode =
  | "already-initialized"
  | "confirmation-failed"
  | "corrupt-state"
  | "enrollment-state"
  | "invalid-password-input"
  | "not-initialized"
  | "unlock-failed";

export class LocalVaultFailure extends Error {
  readonly code: LocalVaultFailureCode;

  constructor(code: LocalVaultFailureCode) {
    super(code);
    this.name = "LocalVaultFailure";
    this.code = code;
  }
}

export interface LocalVaultMetadata {
  readonly accountId: string;
  readonly arkEpoch: number;
  readonly vaults: readonly Readonly<{ id: string; keyVersion: number }>[];
}

const zeroObjectId = new Uint8Array(16);
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const intrinsicBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, "buffer")?.get as (
  this: Uint8Array,
) => ArrayBufferLike;
const intrinsicByteLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteLength")
  ?.get as (this: Uint8Array) => number;
const intrinsicByteOffset = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteOffset")
  ?.get as (this: Uint8Array) => number;

function clear(provider: CryptoProvider, value: Uint8Array | undefined): void {
  if (value === undefined) return;
  try {
    provider.clear(value);
  } catch {
    value.fill(0);
  }
}

function ownProviderBytes(provider: CryptoProvider, value: unknown, length: number): Uint8Array {
  try {
    if (
      typeof value !== "object" ||
      value === null ||
      Object.getPrototypeOf(value) !== Uint8Array.prototype
    )
      throw new Error("provider");
    const bytes = value as Uint8Array;
    const buffer = intrinsicBuffer.call(bytes);
    const byteLength = intrinsicByteLength.call(bytes);
    const byteOffset = intrinsicByteOffset.call(bytes);
    if (
      byteLength !== length ||
      (typeof SharedArrayBuffer !== "undefined" && buffer instanceof SharedArrayBuffer)
    )
      throw new Error("provider");
    const owned = new Uint8Array(new Uint8Array(buffer, byteOffset, byteLength));
    clear(provider, bytes);
    return owned;
  } catch {
    throw new LocalVaultFailure("corrupt-state");
  }
}

function random(provider: CryptoProvider, length: number): Uint8Array {
  try {
    return ownProviderBytes(provider, provider.randomBytes(length), length);
  } catch (error) {
    if (error instanceof LocalVaultFailure) throw error;
    throw new LocalVaultFailure("corrupt-state");
  }
}

function randomNonzeroId(provider: CryptoProvider): Uint8Array {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const value = random(provider, 16);
    let aggregate = 0;
    for (const byte of value) aggregate |= byte;
    if (aggregate !== 0) return value;
    clear(provider, value);
  }
  throw new LocalVaultFailure("corrupt-state");
}

function hex(value: Uint8Array): string {
  let output = "";
  for (const byte of value) output += byte.toString(16).padStart(2, "0");
  return output;
}

function isEnvelopeAuthenticationFailure(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === "EnvelopeFailure" &&
    error.message === "authentication" &&
    (error as Error & { code?: unknown }).code === "authentication"
  );
}

function confirmed(leftAccount: Uint8Array, leftSecret: Uint8Array, text: string): boolean {
  let decoded: ReturnType<typeof decodeRecoveryKitV1> | undefined;
  try {
    decoded = decodeRecoveryKitV1(text);
    let difference = 0;
    for (let index = 0; index < 16; index += 1)
      difference |= (leftAccount[index] as number) ^ (decoded.accountId[index] as number);
    for (let index = 0; index < 32; index += 1)
      difference |= (leftSecret[index] as number) ^ (decoded.recoverySecret[index] as number);
    return difference === 0;
  } catch {
    return false;
  } finally {
    decoded?.accountId.fill(0);
    decoded?.recoverySecret.fill(0);
  }
}

export class LocalVaultSession {
  readonly metadata: LocalVaultMetadata;
  readonly #provider: CryptoProvider;
  readonly #ark: Uint8Array;
  readonly #vaultKeys: Uint8Array[];
  #locked = false;

  constructor(
    provider: CryptoProvider,
    accountId: Uint8Array,
    arkEpoch: number,
    ark: Uint8Array,
    vaults: readonly { id: Uint8Array; keyVersion: number; key: Uint8Array }[],
  ) {
    this.#provider = provider;
    this.#ark = new Uint8Array(ark);
    this.#vaultKeys = vaults.map(({ key }) => new Uint8Array(key));
    this.metadata = Object.freeze({
      accountId: hex(accountId),
      arkEpoch,
      vaults: Object.freeze(
        vaults.map(({ id, keyVersion }) => Object.freeze({ id: hex(id), keyVersion })),
      ),
    });
  }

  get isLocked(): boolean {
    return this.#locked;
  }

  lock(): void {
    if (this.#locked) return;
    this.#locked = true;
    clear(this.#provider, this.#ark);
    for (const key of this.#vaultKeys) clear(this.#provider, key);
    this.#vaultKeys.length = 0;
  }
}

export class PendingOfflineEnrollment {
  readonly recoveryKit: string;
  readonly #provider: CryptoProvider;
  readonly #repository: EncryptedRecordRepository;
  readonly #accountId: Uint8Array;
  readonly #vaultId: Uint8Array;
  readonly #recoverySecret: Uint8Array;
  readonly #ark: Uint8Array;
  readonly #vaultKey: Uint8Array;
  readonly #envelopes: readonly Uint8Array[];
  #state: "pending" | "committing" | "closed" = "pending";

  constructor(
    provider: CryptoProvider,
    repository: EncryptedRecordRepository,
    accountId: Uint8Array,
    vaultId: Uint8Array,
    recoverySecret: Uint8Array,
    ark: Uint8Array,
    vaultKey: Uint8Array,
    envelopes: readonly Uint8Array[],
  ) {
    this.#provider = provider;
    this.#repository = repository;
    this.#accountId = accountId;
    this.#vaultId = vaultId;
    this.#recoverySecret = recoverySecret;
    this.#ark = ark;
    this.#vaultKey = vaultKey;
    this.#envelopes = envelopes;
    this.recoveryKit = encodeRecoveryKitV1(accountId, recoverySecret);
  }

  #clear(): void {
    clear(this.#provider, this.#accountId);
    clear(this.#provider, this.#vaultId);
    clear(this.#provider, this.#recoverySecret);
    clear(this.#provider, this.#ark);
    clear(this.#provider, this.#vaultKey);
  }

  cancel(): void {
    if (this.#state === "closed") return;
    if (this.#state !== "pending") throw new LocalVaultFailure("enrollment-state");
    this.#state = "closed";
    this.#clear();
  }

  async confirm(reenteredKit: string): Promise<LocalVaultSession> {
    if (this.#state !== "pending") throw new LocalVaultFailure("enrollment-state");
    if (!confirmed(this.#accountId, this.#recoverySecret, reenteredKit)) {
      this.#state = "closed";
      this.#clear();
      throw new LocalVaultFailure("confirmation-failed");
    }
    this.#state = "committing";
    try {
      await this.#repository.initializeIfEmpty(this.#envelopes);
      const session = new LocalVaultSession(this.#provider, this.#accountId, 1, this.#ark, [
        { id: this.#vaultId, key: this.#vaultKey, keyVersion: 1 },
      ]);
      this.#state = "closed";
      this.#clear();
      return session;
    } catch (error) {
      this.#state = "closed";
      this.#clear();
      if (error instanceof EncryptedRecordFailure && error.code === "conflict")
        throw new LocalVaultFailure("already-initialized");
      throw error;
    }
  }
}

export async function beginOfflineEnrollment(
  provider: CryptoProvider,
  repository: EncryptedRecordRepository,
  password: string,
): Promise<PendingOfflineEnrollment> {
  if ((await repository.list()).length !== 0) throw new LocalVaultFailure("already-initialized");
  let passwordBytes: Uint8Array;
  try {
    passwordBytes = encodePasswordString(password);
  } catch {
    throw new LocalVaultFailure("invalid-password-input");
  }
  let accountId: Uint8Array | undefined;
  let vaultId: Uint8Array | undefined;
  let recoverySecret: Uint8Array | undefined;
  let ark: Uint8Array | undefined;
  let vaultKey: Uint8Array | undefined;
  try {
    accountId = randomNonzeroId(provider);
    vaultId = randomNonzeroId(provider);
    recoverySecret = random(provider, 32);
    ark = random(provider, 32);
    vaultKey = random(provider, 32);
    const passwordWrapper = sealEnvelope(provider, {
      accountId,
      content: { material: ark, materialType: 1, type: "key-material" },
      generation: 1n,
      keySource: { password: passwordBytes, source: "password" },
      keyVersion: 1,
      kind: ENVELOPE_KIND.PASSWORD_ARK,
      objectId: zeroObjectId,
    });
    const recoveryWrapper = sealEnvelope(provider, {
      accountId,
      content: { material: ark, materialType: 1, type: "key-material" },
      generation: 1n,
      keySource: { parentKey: recoverySecret, source: "parent" },
      keyVersion: 1,
      kind: ENVELOPE_KIND.RECOVERY_ARK,
      objectId: zeroObjectId,
    });
    const vaultWrapper = sealEnvelope(provider, {
      accountId,
      content: { material: vaultKey, materialType: 3, type: "key-material" },
      generation: 0n,
      keySource: { parentKey: ark, source: "parent" },
      keyVersion: 1,
      kind: ENVELOPE_KIND.ARK_CHILD,
      objectId: vaultId,
    });
    return new PendingOfflineEnrollment(
      provider,
      repository,
      accountId,
      vaultId,
      recoverySecret,
      ark,
      vaultKey,
      [passwordWrapper, recoveryWrapper, vaultWrapper],
    );
  } catch (error) {
    clear(provider, accountId);
    clear(provider, vaultId);
    clear(provider, recoverySecret);
    clear(provider, ark);
    clear(provider, vaultKey);
    throw error;
  } finally {
    clear(provider, passwordBytes);
  }
}

export async function unlockOfflineVault(
  provider: CryptoProvider,
  repository: EncryptedRecordRepository,
  password: string,
): Promise<LocalVaultSession> {
  let passwordBytes: Uint8Array;
  try {
    passwordBytes = encodePasswordString(password);
  } catch {
    throw new LocalVaultFailure("invalid-password-input");
  }
  let ark: Uint8Array | undefined;
  const vaults: { id: Uint8Array; keyVersion: number; key: Uint8Array }[] = [];
  try {
    const reads = await repository.list();
    if (reads.length === 0) throw new LocalVaultFailure("not-initialized");
    const records = [];
    for (const read of reads) {
      if (read.status === "corrupt") {
        const kind =
          read.identity === undefined
            ? undefined
            : Number.parseInt(read.identity.split(":")[1] ?? "", 16);
        if (kind === undefined || kind < 0x10) throw new LocalVaultFailure("corrupt-state");
        continue;
      }
      records.push({
        record: read.record,
        header: parseUnauthenticatedEnvelopeHeader(read.record.envelope),
      });
    }
    const passwords = records.filter(({ header }) => header.kind === ENVELOPE_KIND.PASSWORD_ARK);
    const recoveries = records.filter(({ header }) => header.kind === ENVELOPE_KIND.RECOVERY_ARK);
    const children = records.filter(({ header }) => header.kind === ENVELOPE_KIND.ARK_CHILD);
    if (passwords.length !== 1 || recoveries.length !== 1 || children.length !== 1)
      throw new LocalVaultFailure("corrupt-state");
    const passwordRoot = passwords[0] as (typeof passwords)[number];
    const recoveryRoot = recoveries[0] as (typeof recoveries)[number];
    if (
      passwordRoot.header.keyVersion !== recoveryRoot.header.keyVersion ||
      hex(passwordRoot.header.accountId) !== hex(recoveryRoot.header.accountId) ||
      records.some(({ header }) => hex(header.accountId) !== hex(passwordRoot.header.accountId))
    )
      throw new LocalVaultFailure("corrupt-state");
    let opened: OpenedEnvelope;
    try {
      opened = openEnvelope(provider, passwordRoot.record.envelope, {
        password: passwordBytes,
        source: "password",
      });
    } catch (error) {
      if (isEnvelopeAuthenticationFailure(error)) throw new LocalVaultFailure("unlock-failed");
      throw new LocalVaultFailure("corrupt-state");
    }
    if (opened.content.type !== "key-material" || opened.content.materialType !== 1)
      throw new LocalVaultFailure("corrupt-state");
    ark = opened.content.material;
    for (const child of children) {
      let childOpened: OpenedEnvelope;
      try {
        childOpened = openEnvelope(provider, child.record.envelope, {
          parentKey: ark,
          source: "parent",
        });
      } catch {
        throw new LocalVaultFailure("corrupt-state");
      }
      if (childOpened.content.type !== "key-material") throw new LocalVaultFailure("corrupt-state");
      if (childOpened.content.materialType === 3)
        vaults.push({
          id: child.header.objectId,
          key: childOpened.content.material,
          keyVersion: child.header.keyVersion,
        });
      else clear(provider, childOpened.content.material);
    }
    if (vaults.length !== 1) throw new LocalVaultFailure("corrupt-state");
    return new LocalVaultSession(
      provider,
      passwordRoot.header.accountId,
      passwordRoot.header.keyVersion,
      ark,
      vaults,
    );
  } finally {
    clear(provider, passwordBytes);
    clear(provider, ark);
    for (const vault of vaults) clear(provider, vault.key);
  }
}
