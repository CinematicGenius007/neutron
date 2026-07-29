import type { CryptoProvider } from "@neutron/crypto";
import type { EncryptedRecordRepository } from "@neutron/vault-domain";
import {
  beginOfflineEnrollment,
  LocalVaultFailure,
  type LocalVaultSession,
  type PendingOfflineEnrollment,
  unlockOfflineVault,
} from "./local-vault.js";
import { generatePassword, validateGeneratedPassword } from "./password-generator.js";
import {
  parseVaultWorkerRequest,
  parseVaultWorkerResponse,
  VAULT_WORKER_PROTOCOL,
  type VaultWorkerError,
  type VaultWorkerRequest,
  type VaultWorkerResponse,
} from "./vault-worker-protocol.js";

export interface VaultWorkerRuntimeDependencies {
  readonly createProvider: () => Promise<CryptoProvider>;
  readonly openRepository: () => Promise<EncryptedRecordRepository>;
}

export interface VaultWorkerRuntimePort {
  postMessage(message: VaultWorkerResponse): void;
}

function success(
  request: VaultWorkerRequest,
  sessionEpoch: string,
  result: unknown,
): VaultWorkerResponse {
  return {
    protocol: VAULT_WORKER_PROTOCOL,
    requestId: request.requestId,
    sessionEpoch,
    operation: request.operation,
    ok: true,
    result,
  };
}

function errorCode(error: unknown): VaultWorkerError["error"] {
  return error instanceof LocalVaultFailure ? error.code : "internal";
}

export class VaultWorkerRuntime {
  readonly #dependencies: VaultWorkerRuntimeDependencies;
  readonly #port: VaultWorkerRuntimePort;
  #provider: CryptoProvider | undefined;
  #repository: EncryptedRecordRepository | undefined;
  #pending: PendingOfflineEnrollment | undefined;
  #session: LocalVaultSession | undefined;
  #epoch = 0n;
  #highestRequestId = -1n;
  #queue: Promise<void> = Promise.resolve();

  constructor(dependencies: VaultWorkerRuntimeDependencies, port: VaultWorkerRuntimePort) {
    this.#dependencies = dependencies;
    this.#port = port;
  }

  async #resources(): Promise<readonly [CryptoProvider, EncryptedRecordRepository]> {
    if (this.#provider === undefined) this.#provider = await this.#dependencies.createProvider();
    if (this.#repository === undefined)
      this.#repository = await this.#dependencies.openRepository();
    return [this.#provider, this.#repository];
  }

  #state(): "locked" | "pending-enrollment" | "unlocked" {
    if (this.#session !== undefined) return "unlocked";
    if (this.#pending !== undefined) return "pending-enrollment";
    return "locked";
  }

  #requireSession(): LocalVaultSession {
    if (this.#session === undefined) throw new LocalVaultFailure("locked");
    return this.#session;
  }

  #send(response: VaultWorkerResponse): void {
    this.#port.postMessage(parseVaultWorkerResponse(response));
  }

  async #dispatch(request: VaultWorkerRequest, startingEpoch: bigint): Promise<unknown> {
    const input = request.input;
    switch (request.operation) {
      case "state":
        return { kind: "state", state: this.#state() };
      case "begin-enrollment": {
        if (this.#state() !== "locked") throw new LocalVaultFailure("enrollment-state");
        const [provider, repository] = await this.#resources();
        const pending = await beginOfflineEnrollment(
          provider,
          repository,
          input.password as string,
        );
        if (this.#epoch !== startingEpoch) {
          pending.cancel();
          throw new LocalVaultFailure("locked");
        }
        this.#pending = pending;
        return { kind: "enrollment", recoveryKit: pending.recoveryKit };
      }
      case "cancel-enrollment":
        if (this.#pending === undefined) throw new LocalVaultFailure("enrollment-state");
        this.#pending.cancel();
        this.#pending = undefined;
        return { kind: "done" };
      case "confirm-enrollment": {
        if (this.#pending === undefined) throw new LocalVaultFailure("enrollment-state");
        const pending = this.#pending;
        this.#pending = undefined;
        const session = await pending.confirm(input.recoveryKit as string);
        if (this.#epoch !== startingEpoch) {
          session.lock();
          throw new LocalVaultFailure("locked");
        }
        this.#session = session;
        this.#epoch += 1n;
        return { kind: "session", metadata: this.#session.metadata };
      }
      case "unlock": {
        if (this.#state() !== "locked") throw new LocalVaultFailure("locked");
        const [provider, repository] = await this.#resources();
        const session = await unlockOfflineVault(provider, repository, input.password as string);
        if (this.#epoch !== startingEpoch) {
          session.lock();
          throw new LocalVaultFailure("locked");
        }
        this.#session = session;
        this.#epoch += 1n;
        return { kind: "session", metadata: this.#session.metadata };
      }
      case "lock":
        this.#pending?.cancel();
        this.#pending = undefined;
        this.#session?.lock();
        this.#session = undefined;
        this.#epoch += 1n;
        return { kind: "done" };
      case "list-item-summaries": {
        const page = await this.#requireSession().listItemSummaries(
          input.vaultId,
          input.cursor,
          input.limit,
        );
        const items: unknown[] = [];
        for (let index = 0; index < page.items.length; index += 1) {
          const item = page.items[index];
          if (item === undefined) throw new LocalVaultFailure("corrupt-state");
          items[index] = { ...item, generation: item.generation.toString() };
        }
        return {
          kind: "summaries",
          items,
          issues: page.issues,
          ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
        };
      }
      case "get-item": {
        const item = await this.#requireSession().getItem(input.vaultId, input.itemId);
        return {
          kind: "item",
          item: item === undefined ? null : { ...item, generation: item.generation.toString() },
        };
      }
      case "generate-password": {
        this.#requireSession();
        const provider = this.#provider;
        if (provider === undefined) throw new Error("missing provider");
        const password = generatePassword(provider, input);
        validateGeneratedPassword(password, input);
        return { kind: "generated-password", password };
      }
      case "create-item": {
        const item = await this.#requireSession().createItem(input.vaultId, input.item);
        return {
          kind: "revision",
          revision: {
            id: item.id,
            generation: item.generation.toString(),
            keyVersion: item.keyVersion,
          },
        };
      }
      case "update-item": {
        const item = await this.#requireSession().updateItem(
          input.vaultId,
          input.itemId,
          BigInt(input.generation as string),
          input.keyVersion,
          input.item,
        );
        return {
          kind: "revision",
          revision: {
            id: item.id,
            generation: item.generation.toString(),
            keyVersion: item.keyVersion,
          },
        };
      }
      case "delete-item":
        await this.#requireSession().deleteItem(
          input.vaultId,
          input.itemId,
          BigInt(input.generation as string),
          input.keyVersion,
        );
        return { kind: "done" };
      default: {
        const exhaustive: never = request.operation;
        return exhaustive;
      }
    }
  }

  async #process(request: VaultWorkerRequest): Promise<void> {
    if (request.sessionEpoch !== this.#epoch.toString()) {
      this.#send({
        protocol: VAULT_WORKER_PROTOCOL,
        requestId: request.requestId,
        sessionEpoch: this.#epoch.toString(),
        operation: request.operation,
        ok: false,
        error: "locked",
      });
      return;
    }
    const startingEpoch = this.#epoch;
    try {
      const result = await this.#dispatch(request, startingEpoch);
      const expectedEpoch =
        request.operation === "unlock" || request.operation === "confirm-enrollment"
          ? startingEpoch + 1n
          : startingEpoch;
      if (request.operation !== "lock" && this.#epoch !== expectedEpoch) return;
      this.#send(success(request, this.#epoch.toString(), result));
    } catch (error) {
      if (request.sessionEpoch !== this.#epoch.toString()) return;
      this.#send({
        protocol: VAULT_WORKER_PROTOCOL,
        requestId: request.requestId,
        sessionEpoch: this.#epoch.toString(),
        operation: request.operation,
        ok: false,
        error: errorCode(error),
      });
    }
  }

  async receive(candidate: unknown): Promise<void> {
    let request: VaultWorkerRequest;
    try {
      request = parseVaultWorkerRequest(candidate);
      const numericId = BigInt(request.requestId);
      if (numericId <= this.#highestRequestId) throw new Error("invalid-message");
      this.#highestRequestId = numericId;
    } catch {
      return;
    }
    if (request.operation === "lock") {
      await this.#process(request);
      return;
    }
    const work = this.#queue.then(() => this.#process(request));
    this.#queue = work.catch(() => undefined);
    await work;
  }
}
