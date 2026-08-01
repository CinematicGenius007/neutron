import type { VaultItem } from "@neutron/vault-domain";
import type { LocalVaultMetadata } from "./local-vault.js";
import {
  type PassphraseGeneratorOptionsV1,
  parsePassphraseGeneratorOptions,
  validateGeneratedPassphrase,
} from "./passphrase-generator.js";
import {
  type PasswordGeneratorOptionsV1,
  parsePasswordGeneratorOptions,
  validateGeneratedPassword,
} from "./password-generator.js";
import { isTotpResultFresh, type TotpComputation } from "./totp.js";
import vaultWorkerScript from "./vault-worker-entry.ts?worker&url";
import {
  incrementPositiveCanonicalUint64,
  parseVaultWorkerRequest,
  parseVaultWorkerResponse,
  VAULT_WORKER_PROTOCOL,
  type VaultWorkerOperation,
  VaultWorkerProtocolFailure,
  type VaultWorkerResponse,
  type VaultWorkerState,
} from "./vault-worker-protocol.js";

export interface VaultWorkerLike {
  onerror: ((event: ErrorEvent) => unknown) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => unknown) | null;
  onmessage: ((event: MessageEvent<unknown>) => unknown) | null;
  postMessage(message: unknown): void;
  terminate(): void;
}

export interface VaultWorkerItemRecord {
  readonly generation: string;
  readonly id: string;
  readonly item: VaultItem;
  readonly keyVersion: number;
}

export interface VaultWorkerRevision {
  readonly generation: string;
  readonly id: string;
  readonly keyVersion: number;
}

export interface VaultWorkerSummaryPage {
  readonly issues: readonly Readonly<{ code: "corrupt-item"; id: string }>[];
  readonly items: readonly Readonly<{
    generation: string;
    id: string;
    keyVersion: number;
    title: string;
    type: VaultItem["type"];
  }>[];
  readonly nextCursor?: string;
}

export interface VaultWorkerTotpCode extends TotpComputation {
  readonly generation: string;
  readonly itemId: string;
  readonly keyVersion: number;
}

export class VaultWorkerClientFailure extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "VaultWorkerClientFailure";
    this.code = code;
  }
}

class TotpReceiptExpiredFailure extends Error {}

interface NeutronTrustedTypesPolicy {
  createScriptURL(value: string): unknown;
}

interface NeutronTrustedTypesFactory {
  createPolicy(
    name: "neutron-static-script-url",
    rules: Readonly<{ createScriptURL(value: string): string }>,
  ): NeutronTrustedTypesPolicy;
}

let workerScriptPolicy: NeutronTrustedTypesPolicy | undefined;
const defaultLockTimeoutMilliseconds = 2_000;
const moduleWorkerProbeTimeoutMilliseconds = 2_000;

function trustedWorkerScriptUrl(url: URL): URL | string {
  const factory = (globalThis as { trustedTypes?: NeutronTrustedTypesFactory }).trustedTypes;
  if (factory === undefined) return url;
  workerScriptPolicy ??= factory.createPolicy("neutron-static-script-url", {
    createScriptURL(value) {
      if (value !== url.href) throw new TypeError("unapproved worker script URL");
      return value;
    },
  });
  return workerScriptPolicy.createScriptURL(url.href) as string;
}

interface PendingRequest {
  readonly expectedGeneration?: string;
  readonly expectedKind: string;
  readonly expectedItemId?: string;
  readonly expectedKeyVersion?: number;
  readonly listCursor?: string;
  readonly listLimit?: number;
  readonly operation: VaultWorkerOperation;
  readonly passphraseGeneratorOptions?: PassphraseGeneratorOptionsV1;
  readonly passwordGeneratorOptions?: PasswordGeneratorOptionsV1;
  readonly reject: (reason: VaultWorkerClientFailure) => void;
  readonly resolve: (value: unknown) => void;
  readonly totpExpectation?: Readonly<{
    algorithm: "SHA1" | "SHA256" | "SHA512";
    digits: 6 | 8;
    generation: string;
    itemId: string;
    keyVersion: number;
    period: number;
  }>;
}

interface ResponseExpectation {
  readonly expectedGeneration?: string;
  readonly expectedItemId?: string;
  readonly expectedKeyVersion?: number;
  readonly listCursor?: string;
  readonly listLimit?: number;
  readonly passphraseGeneratorOptions?: PassphraseGeneratorOptionsV1;
  readonly passwordGeneratorOptions?: PasswordGeneratorOptionsV1;
  readonly totpExpectation?: NonNullable<PendingRequest["totpExpectation"]>;
}

function resultRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new VaultWorkerProtocolFailure();
  return value as Record<string, unknown>;
}

function validateOperationResult(
  pending: PendingRequest,
  result: Record<string, unknown>,
  nowMilliseconds: number,
): void {
  if (pending.passphraseGeneratorOptions !== undefined)
    validateGeneratedPassphrase(result.passphrase, pending.passphraseGeneratorOptions);
  if (pending.passwordGeneratorOptions !== undefined)
    validateGeneratedPassword(result.password, pending.passwordGeneratorOptions);
  if (pending.totpExpectation !== undefined) {
    const expectation = pending.totpExpectation;
    if (
      result.itemId !== expectation.itemId ||
      result.generation !== expectation.generation ||
      result.keyVersion !== expectation.keyVersion ||
      result.algorithm !== expectation.algorithm ||
      result.digits !== expectation.digits ||
      result.period !== expectation.period
    )
      throw new VaultWorkerProtocolFailure();
    if (!isTotpResultFresh(result as unknown as TotpComputation, nowMilliseconds))
      throw new TotpReceiptExpiredFailure();
  }
  if (pending.expectedItemId !== undefined) {
    const value = result.kind === "item" ? result.item : result.revision;
    if (value !== null && resultRecord(value).id !== pending.expectedItemId)
      throw new VaultWorkerProtocolFailure();
  }
  if (pending.expectedGeneration !== undefined || pending.expectedKeyVersion !== undefined) {
    const revision = resultRecord(result.revision);
    if (
      revision.generation !== pending.expectedGeneration ||
      revision.keyVersion !== pending.expectedKeyVersion
    )
      throw new VaultWorkerProtocolFailure();
  }
  if (pending.listLimit === undefined) return;
  const items = result.items as readonly Readonly<{ id: string }>[];
  const issues = result.issues as readonly Readonly<{ id: string }>[];
  if (items.length + issues.length > pending.listLimit) throw new VaultWorkerProtocolFailure();
  const ids = new Set<string>();
  let maximum = pending.listCursor;
  for (const values of [items, issues]) {
    let previous = pending.listCursor;
    for (let index = 0; index < values.length; index += 1) {
      const id = values[index]?.id;
      if (id === undefined || (previous !== undefined && id <= previous) || ids.has(id))
        throw new VaultWorkerProtocolFailure();
      ids.add(id);
      previous = id;
      if (maximum === undefined || id > maximum) maximum = id;
    }
  }
  const nextCursor = result.nextCursor;
  if (nextCursor !== undefined && (maximum === undefined || nextCursor !== maximum))
    throw new VaultWorkerProtocolFailure();
}

export class VaultWorkerClient {
  readonly #worker: VaultWorkerLike;
  readonly #pending = new Map<string, PendingRequest>();
  readonly #lockTimeoutMilliseconds: number;
  readonly #nowMilliseconds: () => number;
  #epoch = 0n;
  #nextRequestId = 1n;
  #closed = false;
  #locking = false;

  constructor(
    worker: VaultWorkerLike,
    lockTimeoutMilliseconds = defaultLockTimeoutMilliseconds,
    nowMilliseconds: () => number = Date.now,
  ) {
    if (!Number.isSafeInteger(lockTimeoutMilliseconds) || lockTimeoutMilliseconds < 1)
      throw new VaultWorkerClientFailure("invalid-request");
    this.#worker = worker;
    this.#lockTimeoutMilliseconds = lockTimeoutMilliseconds;
    this.#nowMilliseconds = nowMilliseconds;
    worker.onmessage = (event) => this.#receive(event.data);
    worker.onerror = () => this.#failClosed("worker-failure");
    worker.onmessageerror = () => this.#failClosed("invalid-worker-response");
  }

  get isClosed(): boolean {
    return this.#closed;
  }

  #failClosed(code: string): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#worker.terminate();
    for (const pending of this.#pending.values())
      pending.reject(new VaultWorkerClientFailure(code));
    this.#pending.clear();
  }

  #rejectPending(code: string): void {
    for (const pending of this.#pending.values())
      pending.reject(new VaultWorkerClientFailure(code));
    this.#pending.clear();
  }

  #receive(candidate: unknown): void {
    if (this.#closed) return;
    let response: VaultWorkerResponse;
    let pendingForExpiredResult: PendingRequest | undefined;
    let expiredRequestId: string | undefined;
    try {
      response = parseVaultWorkerResponse(candidate);
      const pending = this.#pending.get(response.requestId);
      if (pending === undefined) {
        if (this.#locking) return;
        throw new VaultWorkerProtocolFailure();
      }
      if (response.operation !== pending.operation) throw new VaultWorkerProtocolFailure();
      const expectedEpoch =
        response.ok &&
        (pending.operation === "unlock" ||
          pending.operation === "confirm-enrollment" ||
          pending.operation === "lock")
          ? this.#epoch + 1n
          : this.#epoch;
      if (response.sessionEpoch !== expectedEpoch.toString())
        throw new VaultWorkerProtocolFailure();
      if (!response.ok) {
        this.#pending.delete(response.requestId);
        pending.reject(new VaultWorkerClientFailure(response.error));
        return;
      }
      const result = resultRecord(response.result);
      if (result.kind !== pending.expectedKind) throw new VaultWorkerProtocolFailure();
      pendingForExpiredResult = pending;
      expiredRequestId = response.requestId;
      validateOperationResult(pending, result, this.#nowMilliseconds());
      this.#pending.delete(response.requestId);
      this.#epoch = expectedEpoch;
      pending.resolve(result);
    } catch (error) {
      if (
        error instanceof TotpReceiptExpiredFailure &&
        pendingForExpiredResult !== undefined &&
        expiredRequestId !== undefined
      ) {
        this.#pending.delete(expiredRequestId);
        pendingForExpiredResult.reject(new VaultWorkerClientFailure("expired-result"));
        return;
      }
      this.#failClosed("invalid-worker-response");
    }
  }

  #call(
    operation: VaultWorkerOperation,
    input: Record<string, unknown>,
    expectedKind: string,
    allowWhileLocking = false,
    expectation: ResponseExpectation = {},
  ) {
    if (this.#closed || (this.#locking && !allowWhileLocking))
      return Promise.reject(new VaultWorkerClientFailure(this.#closed ? "closed" : "locked"));
    if (this.#pending.size >= 32)
      return Promise.reject(new VaultWorkerClientFailure("too-many-pending-requests"));
    const requestId = this.#nextRequestId.toString();
    this.#nextRequestId += 1n;
    let request: ReturnType<typeof parseVaultWorkerRequest>;
    try {
      request = parseVaultWorkerRequest({
        protocol: VAULT_WORKER_PROTOCOL,
        requestId,
        sessionEpoch: this.#epoch.toString(),
        operation,
        input,
      });
    } catch {
      return Promise.reject(new VaultWorkerClientFailure("invalid-request"));
    }
    return new Promise<unknown>((resolve, reject) => {
      this.#pending.set(requestId, {
        expectedKind,
        ...expectation,
        operation,
        reject: reject as (reason: VaultWorkerClientFailure) => void,
        resolve,
      });
      try {
        this.#worker.postMessage(request);
      } catch {
        this.#pending.delete(requestId);
        reject(new VaultWorkerClientFailure("worker-failure"));
      }
    });
  }

  async state(): Promise<VaultWorkerState> {
    const result = resultRecord(await this.#call("state", {}, "state"));
    return result.state as VaultWorkerState;
  }

  async beginEnrollment(password: string): Promise<string> {
    const result = resultRecord(await this.#call("begin-enrollment", { password }, "enrollment"));
    return result.recoveryKit as string;
  }

  async cancelEnrollment(): Promise<void> {
    await this.#call("cancel-enrollment", {}, "done");
  }

  async confirmEnrollment(recoveryKit: string): Promise<LocalVaultMetadata> {
    const result = resultRecord(await this.#call("confirm-enrollment", { recoveryKit }, "session"));
    return result.metadata as LocalVaultMetadata;
  }

  async unlock(password: string): Promise<LocalVaultMetadata> {
    const result = resultRecord(await this.#call("unlock", { password }, "session"));
    return result.metadata as LocalVaultMetadata;
  }

  async listItemSummaries(
    vaultId: string,
    limit: number,
    cursor?: string,
  ): Promise<VaultWorkerSummaryPage> {
    const result = resultRecord(
      await this.#call(
        "list-item-summaries",
        { vaultId, limit, ...(cursor === undefined ? {} : { cursor }) },
        "summaries",
        false,
        { listLimit: limit, ...(cursor === undefined ? {} : { listCursor: cursor }) },
      ),
    );
    const { kind: _kind, ...page } = result;
    return page as unknown as VaultWorkerSummaryPage;
  }

  async getItem(vaultId: string, itemId: string): Promise<VaultWorkerItemRecord | undefined> {
    const result = resultRecord(
      await this.#call("get-item", { vaultId, itemId }, "item", false, {
        expectedItemId: itemId,
      }),
    );
    return result.item === null ? undefined : (result.item as VaultWorkerItemRecord);
  }

  async computeTotp(vaultId: string, record: VaultWorkerItemRecord): Promise<VaultWorkerTotpCode> {
    if (record.item.type !== "totp") throw new VaultWorkerClientFailure("invalid-request");
    const expectation = Object.freeze({
      algorithm: record.item.algorithm,
      digits: record.item.digits,
      generation: record.generation,
      itemId: record.id,
      keyVersion: record.keyVersion,
      period: record.item.period,
    });
    const result = resultRecord(
      await this.#call(
        "compute-totp",
        {
          vaultId,
          itemId: record.id,
          generation: record.generation,
          keyVersion: record.keyVersion,
        },
        "totp-code",
        false,
        { totpExpectation: expectation },
      ),
    );
    const { kind: _kind, ...code } = result;
    return code as unknown as VaultWorkerTotpCode;
  }

  async generatePassword(optionsCandidate: PasswordGeneratorOptionsV1): Promise<string> {
    let options: PasswordGeneratorOptionsV1;
    try {
      options = parsePasswordGeneratorOptions(optionsCandidate);
    } catch {
      throw new VaultWorkerClientFailure("invalid-request");
    }
    const result = resultRecord(
      await this.#call("generate-password", { ...options }, "generated-password", false, {
        passwordGeneratorOptions: options,
      }),
    );
    return result.password as string;
  }

  async generatePassphrase(optionsCandidate: PassphraseGeneratorOptionsV1): Promise<string> {
    let options: PassphraseGeneratorOptionsV1;
    try {
      options = parsePassphraseGeneratorOptions(optionsCandidate);
    } catch {
      throw new VaultWorkerClientFailure("invalid-request");
    }
    const result = resultRecord(
      await this.#call("generate-passphrase", { ...options }, "generated-passphrase", false, {
        passphraseGeneratorOptions: options,
      }),
    );
    return result.passphrase as string;
  }

  async createItem(vaultId: string, item: VaultItem): Promise<VaultWorkerRevision> {
    const result = resultRecord(
      await this.#call("create-item", { vaultId, item }, "revision", false, {
        expectedGeneration: "1",
        expectedKeyVersion: 1,
      }),
    );
    return result.revision as VaultWorkerRevision;
  }

  async updateItem(
    vaultId: string,
    itemId: string,
    generation: string,
    keyVersion: number,
    item: VaultItem,
  ): Promise<VaultWorkerRevision> {
    let expectedGeneration: string;
    try {
      expectedGeneration = incrementPositiveCanonicalUint64(generation);
    } catch {
      throw new VaultWorkerClientFailure("invalid-request");
    }
    const result = resultRecord(
      await this.#call(
        "update-item",
        { vaultId, itemId, generation, keyVersion, item },
        "revision",
        false,
        {
          expectedGeneration,
          expectedItemId: itemId,
          expectedKeyVersion: keyVersion,
        },
      ),
    );
    return result.revision as VaultWorkerRevision;
  }

  async deleteItem(
    vaultId: string,
    itemId: string,
    generation: string,
    keyVersion: number,
  ): Promise<void> {
    await this.#call("delete-item", { vaultId, itemId, generation, keyVersion }, "done");
  }

  async lock(): Promise<void> {
    if (this.#closed) return;
    if (this.#locking) throw new VaultWorkerClientFailure("locked");
    this.#locking = true;
    this.#rejectPending("locked");
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.#call("lock", {}, "done", true),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new VaultWorkerClientFailure("lock-timeout")),
            this.#lockTimeoutMilliseconds,
          );
        }),
      ]);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      this.#failClosed("locked");
    }
  }

  terminate(): void {
    this.#failClosed("closed");
  }
}

export function createVaultWorkerClient(): VaultWorkerClient {
  const workerUrl = new URL(vaultWorkerScript, globalThis.location.href);
  return new VaultWorkerClient(
    new Worker(trustedWorkerScriptUrl(workerUrl), {
      type: "module",
      name: "neutron-vault",
    }),
  );
}

export async function verifyVaultModuleWorkerSupport(): Promise<boolean> {
  let client: VaultWorkerClient | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    client = createVaultWorkerClient();
    await Promise.race([
      client.state(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new VaultWorkerClientFailure("worker-failure")),
          moduleWorkerProbeTimeoutMilliseconds,
        );
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    client?.terminate();
  }
}
