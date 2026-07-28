import type { VaultItem } from "@neutron/vault-domain";
import type { LocalVaultMetadata } from "./local-vault.js";
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

export class VaultWorkerClientFailure extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "VaultWorkerClientFailure";
    this.code = code;
  }
}

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
  readonly reject: (reason: VaultWorkerClientFailure) => void;
  readonly resolve: (value: unknown) => void;
}

interface ResponseExpectation {
  readonly expectedGeneration?: string;
  readonly expectedItemId?: string;
  readonly expectedKeyVersion?: number;
  readonly listCursor?: string;
  readonly listLimit?: number;
}

function resultRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new VaultWorkerProtocolFailure();
  return value as Record<string, unknown>;
}

function validateOperationResult(pending: PendingRequest, result: Record<string, unknown>): void {
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
  #epoch = 0n;
  #nextRequestId = 1n;
  #closed = false;
  #locking = false;

  constructor(worker: VaultWorkerLike) {
    this.#worker = worker;
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
      validateOperationResult(pending, result);
      this.#pending.delete(response.requestId);
      this.#epoch = expectedEpoch;
      pending.resolve(result);
    } catch {
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
    try {
      await this.#call("lock", {}, "done", true);
    } finally {
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
