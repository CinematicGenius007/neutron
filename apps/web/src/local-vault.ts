import type { CryptoProvider } from "@neutron/crypto";
import {
  decodeRecoveryKitV1,
  ENVELOPE_KIND,
  type EnvelopeHeader,
  encodePasswordString,
  encodeRecoveryKitV1,
  incrementGeneration,
  type OpenedEnvelope,
  openEnvelope,
  parseUnauthenticatedEnvelopeHeader,
  sealEnvelope,
} from "@neutron/protocol";
import {
  createEncryptedRecord,
  decodeVaultItem,
  type EncryptedRecord,
  EncryptedRecordFailure,
  type EncryptedRecordIdentity,
  type EncryptedRecordRepository,
  encodeVaultItem,
  parseEncryptedRecordIdentityPrefix,
  type VaultItem,
} from "@neutron/vault-domain";

export type LocalVaultFailureCode =
  | "already-initialized"
  | "confirmation-failed"
  | "conflict"
  | "corrupt-item"
  | "corrupt-state"
  | "enrollment-state"
  | "invalid-password-input"
  | "invalid-item-reference"
  | "item-limit"
  | "item-not-found"
  | "locked"
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

export interface VaultItemRecord {
  readonly generation: bigint;
  readonly id: string;
  readonly item: VaultItem;
  readonly keyVersion: number;
}

export interface VaultItemList {
  readonly issues: readonly Readonly<{ code: "corrupt-item"; id: string }>[];
  readonly items: readonly VaultItemRecord[];
}

export interface VaultItemSummary {
  readonly generation: bigint;
  readonly id: string;
  readonly keyVersion: number;
  readonly title: string;
  readonly type: VaultItem["type"];
}

export interface VaultItemSummaryPage {
  readonly issues: readonly Readonly<{ code: "corrupt-item"; id: string }>[];
  readonly items: readonly VaultItemSummary[];
  readonly nextCursor?: string;
}

export interface VaultItemDeletionReceipt {
  readonly generation: bigint;
  readonly id: string;
  readonly keyVersion: number;
}

type InternalItem =
  | Readonly<{
      generation: bigint;
      id: string;
      item: VaultItem;
      keyVersion: number;
      payload: EncryptedRecord;
      status: "valid";
      wrapper: EncryptedRecord;
    }>
  | Readonly<{ id: string; status: "corrupt" }>;

interface ItemInventoryEntry {
  corrupt: boolean;
  readonly id: string;
  payloadIdentity?: EncryptedRecordIdentity;
  wrapperIdentity?: EncryptedRecordIdentity;
}

const itemIdPattern = /^[0-9a-f]{32}$/;
const maximumStoredRecords = 20_003;
const maximumSummaryPageSize = 100;
const sessionCapability = Symbol("LocalVaultSession");
const enrollmentCapability = Symbol("PendingOfflineEnrollment");

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

function fromHexId(value: unknown): Uint8Array {
  if (typeof value !== "string" || !itemIdPattern.test(value))
    throw new LocalVaultFailure("invalid-item-reference");
  return Uint8Array.from(value.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));
}

function expectedGeneration(value: unknown): bigint {
  if (typeof value !== "bigint" || value < 1n || value > 0xffff_ffff_ffff_ffffn)
    throw new LocalVaultFailure("invalid-item-reference");
  return value;
}

function expectedKeyVersion(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 0xffff_ffff)
    throw new LocalVaultFailure("invalid-item-reference");
  return value as number;
}

function isRecordConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === "EncryptedRecordFailure" &&
    (error as Error & { code?: unknown }).code === "conflict"
  );
}

function isRecordLimit(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === "EncryptedRecordFailure" &&
    (error as Error & { code?: unknown }).code === "limit"
  );
}

function publicItem(entry: Extract<InternalItem, { status: "valid" }>): VaultItemRecord {
  return Object.freeze({
    generation: entry.generation,
    id: entry.id,
    item: entry.item,
    keyVersion: entry.keyVersion,
  });
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
  readonly #repository: EncryptedRecordRepository;
  readonly #accountId: Uint8Array;
  readonly #vaults: { id: Uint8Array; keyVersion: number; key: Uint8Array }[];
  #locked = false;
  #operationEpoch = 0;

  constructor(
    capability: typeof sessionCapability,
    provider: CryptoProvider,
    repository: EncryptedRecordRepository,
    accountId: Uint8Array,
    arkEpoch: number,
    vaults: readonly { id: Uint8Array; keyVersion: number; key: Uint8Array }[],
  ) {
    if (capability !== sessionCapability) throw new LocalVaultFailure("corrupt-state");
    this.#provider = provider;
    this.#repository = repository;
    this.#accountId = new Uint8Array(accountId);
    this.#vaults = vaults.map(({ id, keyVersion, key }) => ({
      id: new Uint8Array(id),
      key: new Uint8Array(key),
      keyVersion,
    }));
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

  #assertUnlocked(): void {
    if (this.#locked) throw new LocalVaultFailure("locked");
  }

  #beginOperation(): number {
    this.#assertUnlocked();
    return this.#operationEpoch;
  }

  #assertOperation(epoch: number): void {
    if (this.#locked || epoch !== this.#operationEpoch) throw new LocalVaultFailure("locked");
  }

  #vault(vaultId: unknown, epoch: number): { id: Uint8Array; keyVersion: number; key: Uint8Array } {
    this.#assertOperation(epoch);
    if (typeof vaultId !== "string" || !itemIdPattern.test(vaultId))
      throw new LocalVaultFailure("invalid-item-reference");
    for (let index = 0; index < this.#vaults.length; index += 1) {
      const vault = this.#vaults[index];
      if (vault !== undefined && hex(vault.id) === vaultId) return vault;
    }
    throw new LocalVaultFailure("invalid-item-reference");
  }

  async #inventory(epoch: number): Promise<readonly ItemInventoryEntry[]> {
    let identities: readonly EncryptedRecordIdentity[];
    try {
      identities = await this.#repository.listIdentities(maximumStoredRecords);
    } catch (error) {
      this.#assertOperation(epoch);
      if (isRecordLimit(error)) throw new LocalVaultFailure("item-limit");
      throw error;
    }
    this.#assertOperation(epoch);
    const groups = new Map<string, ItemInventoryEntry>();
    for (let index = 0; index < identities.length; index += 1) {
      const identity = identities[index];
      if (identity === undefined) throw new LocalVaultFailure("corrupt-state");
      const parts = identity.split(":");
      if (parts[2] !== this.metadata.accountId) throw new LocalVaultFailure("corrupt-state");
      const kind = Number.parseInt(parts[1] ?? "", 16);
      if (kind !== ENVELOPE_KIND.VAULT_ITEM && kind !== ENVELOPE_KIND.ITEM_PAYLOAD) continue;
      const id = parts[3];
      if (id === undefined) throw new LocalVaultFailure("corrupt-state");
      let entry = groups.get(id);
      if (entry === undefined) {
        entry = { corrupt: false, id };
        groups.set(id, entry);
      }
      if (kind === ENVELOPE_KIND.VAULT_ITEM) {
        if (entry.wrapperIdentity !== undefined) entry.corrupt = true;
        else entry.wrapperIdentity = identity;
      } else {
        if (entry.payloadIdentity !== undefined) entry.corrupt = true;
        else entry.payloadIdentity = identity;
      }
    }
    const output: ItemInventoryEntry[] = [];
    for (const entry of groups.values()) {
      if (entry.wrapperIdentity === undefined || entry.payloadIdentity === undefined)
        entry.corrupt = true;
      let insertion = output.length;
      while (insertion > 0 && (output[insertion - 1]?.id ?? "") > entry.id) insertion -= 1;
      output.splice(insertion, 0, entry);
    }
    return output;
  }

  async #loadItem(
    vault: { id: Uint8Array; keyVersion: number; key: Uint8Array },
    entry: ItemInventoryEntry,
    epoch: number,
  ): Promise<InternalItem> {
    if (entry.corrupt || entry.wrapperIdentity === undefined || entry.payloadIdentity === undefined)
      return { id: entry.id, status: "corrupt" };
    let wrapperRead: Awaited<ReturnType<EncryptedRecordRepository["get"]>>;
    let payloadRead: Awaited<ReturnType<EncryptedRecordRepository["get"]>>;
    try {
      [wrapperRead, payloadRead] = await Promise.all([
        this.#repository.get(entry.wrapperIdentity),
        this.#repository.get(entry.payloadIdentity),
      ]);
    } catch (error) {
      this.#assertOperation(epoch);
      throw error;
    }
    this.#assertOperation(epoch);
    if (
      wrapperRead === undefined ||
      payloadRead === undefined ||
      wrapperRead.status !== "valid" ||
      payloadRead.status !== "valid"
    )
      return { id: entry.id, status: "corrupt" };
    let itemKey: Uint8Array | undefined;
    let plaintext: Uint8Array | undefined;
    try {
      const wrapperHeader = parseUnauthenticatedEnvelopeHeader(wrapperRead.record.envelope);
      const payloadHeader = parseUnauthenticatedEnvelopeHeader(payloadRead.record.envelope);
      if (
        wrapperHeader.kind !== ENVELOPE_KIND.VAULT_ITEM ||
        payloadHeader.kind !== ENVELOPE_KIND.ITEM_PAYLOAD ||
        hex(wrapperHeader.accountId) !== this.metadata.accountId ||
        hex(payloadHeader.accountId) !== this.metadata.accountId ||
        hex(wrapperHeader.objectId) !== entry.id ||
        hex(payloadHeader.objectId) !== entry.id ||
        wrapperHeader.generation !== 0n ||
        payloadHeader.generation < 1n ||
        wrapperHeader.keyVersion !== payloadHeader.keyVersion
      )
        throw new LocalVaultFailure("corrupt-item");
      const openedWrapper = openEnvelope(this.#provider, wrapperRead.record.envelope, {
        parentKey: vault.key,
        source: "parent",
      });
      if (openedWrapper.content.type !== "key-material")
        throw new LocalVaultFailure("corrupt-item");
      itemKey = openedWrapper.content.material;
      if (openedWrapper.content.materialType !== 4) throw new LocalVaultFailure("corrupt-item");
      const openedPayload = openEnvelope(this.#provider, payloadRead.record.envelope, {
        parentKey: itemKey,
        source: "parent",
      });
      if (openedPayload.content.type !== "payload") throw new LocalVaultFailure("corrupt-item");
      plaintext = openedPayload.content.plaintext;
      const item = decodeVaultItem(plaintext);
      this.#assertOperation(epoch);
      return {
        generation: payloadHeader.generation,
        id: entry.id,
        item,
        keyVersion: payloadHeader.keyVersion,
        payload: payloadRead.record,
        status: "valid",
        wrapper: wrapperRead.record,
      };
    } catch (error) {
      if (error instanceof LocalVaultFailure && error.code === "locked") throw error;
      return { id: entry.id, status: "corrupt" };
    } finally {
      clear(this.#provider, plaintext);
      clear(this.#provider, itemKey);
    }
  }

  async #readItems(
    vault: { id: Uint8Array; keyVersion: number; key: Uint8Array },
    epoch: number,
  ): Promise<readonly InternalItem[]> {
    const inventory = await this.#inventory(epoch);
    const output: InternalItem[] = [];
    for (let index = 0; index < inventory.length; index += 1) {
      const entry = inventory[index];
      if (entry !== undefined) output.push(await this.#loadItem(vault, entry, epoch));
    }
    this.#assertOperation(epoch);
    return output;
  }

  async #findItem(
    vault: { id: Uint8Array; keyVersion: number; key: Uint8Array },
    id: string,
    epoch: number,
  ): Promise<InternalItem | undefined> {
    const inventory = await this.#inventory(epoch);
    for (let index = 0; index < inventory.length; index += 1) {
      const entry = inventory[index];
      if (entry?.id === id) return this.#loadItem(vault, entry, epoch);
    }
    return undefined;
  }

  async listItems(vaultId: unknown): Promise<VaultItemList> {
    const epoch = this.#beginOperation();
    const vault = this.#vault(vaultId, epoch);
    const entries = await this.#readItems(vault, epoch);
    const items: VaultItemRecord[] = [];
    const issues: { code: "corrupt-item"; id: string }[] = [];
    for (const entry of entries) {
      if (entry.status === "valid") items.push(publicItem(entry));
      else issues.push(Object.freeze({ code: "corrupt-item", id: entry.id }));
    }
    this.#assertOperation(epoch);
    return Object.freeze({ issues: Object.freeze(issues), items: Object.freeze(items) });
  }

  async listItemSummaries(
    vaultId: unknown,
    cursor: unknown,
    limit: unknown,
  ): Promise<VaultItemSummaryPage> {
    const epoch = this.#beginOperation();
    const vault = this.#vault(vaultId, epoch);
    if (cursor !== undefined && (typeof cursor !== "string" || !itemIdPattern.test(cursor)))
      throw new LocalVaultFailure("invalid-item-reference");
    if (
      !Number.isInteger(limit) ||
      (limit as number) < 1 ||
      (limit as number) > maximumSummaryPageSize
    )
      throw new LocalVaultFailure("invalid-item-reference");
    const inventory = await this.#inventory(epoch);
    let start = 0;
    if (cursor !== undefined) {
      while (start < inventory.length && (inventory[start]?.id ?? "") <= cursor) start += 1;
    }
    const end = Math.min(start + (limit as number), inventory.length);
    const items: VaultItemSummary[] = [];
    const issues: { code: "corrupt-item"; id: string }[] = [];
    for (let index = start; index < end; index += 1) {
      const inventoryEntry = inventory[index];
      if (inventoryEntry === undefined) throw new LocalVaultFailure("corrupt-state");
      const entry = await this.#loadItem(vault, inventoryEntry, epoch);
      if (entry.status === "corrupt") {
        issues.push(Object.freeze({ code: "corrupt-item", id: entry.id }));
      } else {
        items.push(
          Object.freeze({
            generation: entry.generation,
            id: entry.id,
            keyVersion: entry.keyVersion,
            title: entry.item.title,
            type: entry.item.type,
          }),
        );
      }
    }
    this.#assertOperation(epoch);
    const nextCursor = end < inventory.length ? inventory[end - 1]?.id : undefined;
    return Object.freeze({
      issues: Object.freeze(issues),
      items: Object.freeze(items),
      ...(nextCursor === undefined ? {} : { nextCursor }),
    });
  }

  async getItem(vaultId: unknown, itemId: unknown): Promise<VaultItemRecord | undefined> {
    const epoch = this.#beginOperation();
    const vault = this.#vault(vaultId, epoch);
    const id = hex(fromHexId(itemId));
    const entry = await this.#findItem(vault, id, epoch);
    if (entry === undefined) return undefined;
    if (entry.status === "corrupt") throw new LocalVaultFailure("corrupt-item");
    this.#assertOperation(epoch);
    return publicItem(entry);
  }

  async createItem(vaultId: unknown, candidate: unknown): Promise<VaultItemRecord> {
    const epoch = this.#beginOperation();
    const vault = this.#vault(vaultId, epoch);
    const encoded = encodeVaultItem(candidate);
    const item = decodeVaultItem(encoded);
    try {
      for (let attempt = 0; attempt < 16; attempt += 1) {
        this.#assertOperation(epoch);
        const itemId = randomNonzeroId(this.#provider);
        const itemKey = random(this.#provider, 32);
        try {
          const wrapperEnvelope = sealEnvelope(this.#provider, {
            accountId: this.#accountId,
            content: { material: itemKey, materialType: 4, type: "key-material" },
            generation: 0n,
            keySource: { parentKey: vault.key, source: "parent" },
            keyVersion: 1,
            kind: ENVELOPE_KIND.VAULT_ITEM,
            objectId: itemId,
          });
          const payloadEnvelope = sealEnvelope(this.#provider, {
            accountId: this.#accountId,
            content: { plaintext: encoded, type: "payload" },
            generation: 1n,
            keySource: { parentKey: itemKey, source: "parent" },
            keyVersion: 1,
            kind: ENVELOPE_KIND.ITEM_PAYLOAD,
            objectId: itemId,
          });
          const wrapper = createEncryptedRecord(wrapperEnvelope);
          const payload = createEncryptedRecord(payloadEnvelope);
          try {
            await this.#repository.applyConditionalBatch(
              [],
              [],
              [
                parseEncryptedRecordIdentityPrefix(
                  `v1:04:${this.metadata.accountId}:${hex(itemId)}:`,
                ),
                parseEncryptedRecordIdentityPrefix(
                  `v1:10:${this.metadata.accountId}:${hex(itemId)}:`,
                ),
              ],
              this.metadata.accountId,
              maximumStoredRecords,
              [
                { envelope: wrapper.envelope, type: "put" },
                { envelope: payload.envelope, type: "put" },
              ],
            );
          } catch (error) {
            this.#assertOperation(epoch);
            if (isRecordConflict(error)) continue;
            if (isRecordLimit(error)) throw new LocalVaultFailure("item-limit");
            throw error;
          }
          this.#assertOperation(epoch);
          return Object.freeze({ generation: 1n, id: hex(itemId), item, keyVersion: 1 });
        } finally {
          clear(this.#provider, itemId);
          clear(this.#provider, itemKey);
        }
      }
      throw new LocalVaultFailure("conflict");
    } finally {
      clear(this.#provider, encoded);
    }
  }

  async updateItem(
    vaultId: unknown,
    itemId: unknown,
    expected: unknown,
    expectedVersion: unknown,
    candidate: unknown,
  ): Promise<VaultItemRecord> {
    const epoch = this.#beginOperation();
    const vault = this.#vault(vaultId, epoch);
    const id = hex(fromHexId(itemId));
    const generation = expectedGeneration(expected);
    const keyVersion = expectedKeyVersion(expectedVersion);
    const current = await this.#findItem(vault, id, epoch);
    if (current === undefined) throw new LocalVaultFailure("item-not-found");
    if (current.status === "corrupt") throw new LocalVaultFailure("corrupt-item");
    if (current.generation !== generation || current.keyVersion !== keyVersion)
      throw new LocalVaultFailure("conflict");
    const nextGeneration = BigInt(incrementGeneration("item", generation.toString()));
    const encoded = encodeVaultItem(candidate);
    const item = decodeVaultItem(encoded);
    let itemKey: Uint8Array | undefined;
    try {
      const opened = openEnvelope(this.#provider, current.wrapper.envelope, {
        parentKey: vault.key,
        source: "parent",
      });
      if (opened.content.type !== "key-material") throw new LocalVaultFailure("corrupt-item");
      itemKey = opened.content.material;
      if (opened.content.materialType !== 4) throw new LocalVaultFailure("corrupt-item");
      const successor = createEncryptedRecord(
        sealEnvelope(this.#provider, {
          accountId: this.#accountId,
          content: { plaintext: encoded, type: "payload" },
          generation: nextGeneration,
          keySource: { parentKey: itemKey, source: "parent" },
          keyVersion: current.keyVersion,
          kind: ENVELOPE_KIND.ITEM_PAYLOAD,
          objectId: fromHexId(id),
        }),
      );
      try {
        await this.#repository.applyConditionalBatch(
          [current.wrapper, current.payload],
          [successor.identity],
          [],
          this.metadata.accountId,
          maximumStoredRecords,
          [
            { identity: current.payload.identity, type: "delete" },
            { envelope: successor.envelope, type: "put" },
          ],
        );
      } catch (error) {
        this.#assertOperation(epoch);
        if (isRecordConflict(error)) throw new LocalVaultFailure("conflict");
        if (isRecordLimit(error)) throw new LocalVaultFailure("item-limit");
        throw error;
      }
      this.#assertOperation(epoch);
      return Object.freeze({
        generation: nextGeneration,
        id,
        item,
        keyVersion: current.keyVersion,
      });
    } finally {
      clear(this.#provider, encoded);
      clear(this.#provider, itemKey);
    }
  }

  async deleteItem(
    vaultId: unknown,
    itemId: unknown,
    expected: unknown,
    expectedVersion: unknown,
  ): Promise<VaultItemDeletionReceipt> {
    const epoch = this.#beginOperation();
    const vault = this.#vault(vaultId, epoch);
    const id = hex(fromHexId(itemId));
    const generation = expectedGeneration(expected);
    const keyVersion = expectedKeyVersion(expectedVersion);
    const current = await this.#findItem(vault, id, epoch);
    if (current === undefined) throw new LocalVaultFailure("item-not-found");
    if (current.status === "corrupt") throw new LocalVaultFailure("corrupt-item");
    if (current.generation !== generation || current.keyVersion !== keyVersion)
      throw new LocalVaultFailure("conflict");
    try {
      await this.#repository.applyConditionalBatch(
        [current.wrapper, current.payload],
        [],
        [],
        this.metadata.accountId,
        maximumStoredRecords,
        [
          { identity: current.wrapper.identity, type: "delete" },
          { identity: current.payload.identity, type: "delete" },
        ],
      );
    } catch (error) {
      this.#assertOperation(epoch);
      if (isRecordConflict(error)) throw new LocalVaultFailure("conflict");
      if (isRecordLimit(error)) throw new LocalVaultFailure("item-limit");
      throw error;
    }
    this.#assertOperation(epoch);
    return Object.freeze({
      generation: current.generation,
      id: current.id,
      keyVersion: current.keyVersion,
    });
  }

  lock(): void {
    if (this.#locked) return;
    this.#locked = true;
    this.#operationEpoch += 1;
    clear(this.#provider, this.#accountId);
    for (const vault of this.#vaults) {
      clear(this.#provider, vault.id);
      clear(this.#provider, vault.key);
    }
    this.#vaults.length = 0;
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
    capability: typeof enrollmentCapability,
    provider: CryptoProvider,
    repository: EncryptedRecordRepository,
    accountId: Uint8Array,
    vaultId: Uint8Array,
    recoverySecret: Uint8Array,
    ark: Uint8Array,
    vaultKey: Uint8Array,
    envelopes: readonly Uint8Array[],
  ) {
    if (capability !== enrollmentCapability) throw new LocalVaultFailure("corrupt-state");
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
      const session = new LocalVaultSession(
        sessionCapability,
        this.#provider,
        this.#repository,
        this.#accountId,
        1,
        [{ id: this.#vaultId, key: this.#vaultKey, keyVersion: 1 }],
      );
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
  try {
    if ((await repository.listIdentities(1)).length !== 0)
      throw new LocalVaultFailure("already-initialized");
  } catch (error) {
    if (error instanceof LocalVaultFailure) throw error;
    throw new LocalVaultFailure("already-initialized");
  }
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
      enrollmentCapability,
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
    let identities: readonly EncryptedRecordIdentity[];
    try {
      identities = await repository.listIdentities(maximumStoredRecords);
    } catch {
      throw new LocalVaultFailure("corrupt-state");
    }
    if (identities.length === 0) throw new LocalVaultFailure("not-initialized");
    let accountId: string | undefined;
    const authorityIdentities: EncryptedRecordIdentity[] = [];
    for (let index = 0; index < identities.length; index += 1) {
      const identity = identities[index];
      if (identity === undefined) throw new LocalVaultFailure("corrupt-state");
      const parts = identity.split(":");
      if (accountId === undefined) accountId = parts[2];
      else if (parts[2] !== accountId) throw new LocalVaultFailure("corrupt-state");
      const kind = Number.parseInt(parts[1] ?? "", 16);
      if (
        kind === ENVELOPE_KIND.PASSWORD_ARK ||
        kind === ENVELOPE_KIND.RECOVERY_ARK ||
        kind === ENVELOPE_KIND.ARK_CHILD
      )
        authorityIdentities.push(identity);
    }
    const records: { header: EnvelopeHeader; record: EncryptedRecord }[] = [];
    for (let index = 0; index < authorityIdentities.length; index += 1) {
      const identity = authorityIdentities[index];
      if (identity === undefined) throw new LocalVaultFailure("corrupt-state");
      const read = await repository.get(identity);
      if (read === undefined || read.status !== "valid")
        throw new LocalVaultFailure("corrupt-state");
      records.push({
        header: parseUnauthenticatedEnvelopeHeader(read.record.envelope),
        record: read.record,
      });
    }
    const passwords: (typeof records)[number][] = [];
    const recoveries: (typeof records)[number][] = [];
    const children: (typeof records)[number][] = [];
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      if (record?.header.kind === ENVELOPE_KIND.PASSWORD_ARK) passwords.push(record);
      else if (record?.header.kind === ENVELOPE_KIND.RECOVERY_ARK) recoveries.push(record);
      else if (record?.header.kind === ENVELOPE_KIND.ARK_CHILD) children.push(record);
    }
    if (passwords.length !== 1 || recoveries.length !== 1 || children.length !== 1)
      throw new LocalVaultFailure("corrupt-state");
    const passwordRoot = passwords[0] as (typeof passwords)[number];
    const recoveryRoot = recoveries[0] as (typeof recoveries)[number];
    if (
      passwordRoot.header.keyVersion !== recoveryRoot.header.keyVersion ||
      hex(passwordRoot.header.accountId) !== hex(recoveryRoot.header.accountId)
    )
      throw new LocalVaultFailure("corrupt-state");
    for (let index = 0; index < records.length; index += 1)
      if (hex((records[index] as (typeof records)[number]).header.accountId) !== accountId)
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
    if (opened.content.type !== "key-material") throw new LocalVaultFailure("corrupt-state");
    ark = opened.content.material;
    if (opened.content.materialType !== 1) throw new LocalVaultFailure("corrupt-state");
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
      sessionCapability,
      provider,
      repository,
      passwordRoot.header.accountId,
      passwordRoot.header.keyVersion,
      vaults,
    );
  } finally {
    clear(provider, passwordBytes);
    clear(provider, ark);
    for (const vault of vaults) clear(provider, vault.key);
  }
}
