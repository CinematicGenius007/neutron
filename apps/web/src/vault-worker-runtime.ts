import type { CryptoProvider } from "@neutron/crypto";
import type { EncryptedRecordRepository } from "@neutron/vault-domain";
import {
  beginOfflineEnrollment,
  LocalVaultFailure,
  type LocalVaultSession,
  type PendingOfflineEnrollment,
  unlockOfflineVault,
} from "./local-vault.js";
import { generatePassphrase, validateGeneratedPassphrase } from "./passphrase-generator.js";
import { generatePassword, validateGeneratedPassword } from "./password-generator.js";
import { computeTotp, validateTotpComputation } from "./totp.js";
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
  readonly nowMilliseconds: () => number;
  readonly openRepository: () => Promise<EncryptedRecordRepository>;
  readonly subtle: Pick<SubtleCrypto, "importKey" | "sign">;
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

function corruptResult(): never {
  throw new LocalVaultFailure("corrupt-state");
}

function resultRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) corruptResult();
  return value as Record<string, unknown>;
}

function validateIdentity(
  candidate: unknown,
  expectedId: unknown,
  expectedGeneration?: string,
  expectedKeyVersion?: unknown,
): void {
  const identity = resultRecord(candidate);
  if (
    identity.id !== expectedId ||
    (expectedGeneration !== undefined && identity.generation !== expectedGeneration) ||
    (expectedKeyVersion !== undefined && identity.keyVersion !== expectedKeyVersion)
  )
    corruptResult();
}

export function validateItemOperationResult(request: VaultWorkerRequest, candidate: unknown): void {
  const result = resultRecord(candidate);
  const input = request.input;
  switch (request.operation) {
    case "list-item-summaries": {
      if (result.kind !== "summaries" || result.vaultId !== input.vaultId) corruptResult();
      if (!Array.isArray(result.items) || !Array.isArray(result.issues)) corruptResult();
      if (result.items.length + result.issues.length > (input.limit as number)) corruptResult();
      const seen = new Set<string>();
      let maximum: string | undefined;
      for (const values of [result.items, result.issues]) {
        let previous = input.cursor as string | undefined;
        for (const candidateValue of values) {
          const value = resultRecord(candidateValue);
          const itemId = value.id;
          if (
            typeof itemId !== "string" ||
            (previous !== undefined && itemId <= previous) ||
            seen.has(itemId)
          )
            corruptResult();
          seen.add(itemId);
          previous = itemId;
          if (maximum === undefined || itemId > maximum) maximum = itemId;
        }
      }
      if (
        result.nextCursor !== undefined &&
        (maximum === undefined || result.nextCursor !== maximum)
      )
        corruptResult();
      return;
    }
    case "get-item":
      if (result.kind !== "item" || result.vaultId !== input.vaultId) corruptResult();
      if (result.item !== null) validateIdentity(result.item, input.itemId);
      return;
    case "create-item":
      if (result.kind !== "revision" || result.vaultId !== input.vaultId) corruptResult();
      {
        const revision = resultRecord(result.revision);
        if (revision.generation !== "1" || revision.keyVersion !== 1) corruptResult();
      }
      return;
    case "update-item":
      if (result.kind !== "revision" || result.vaultId !== input.vaultId) corruptResult();
      validateIdentity(
        result.revision,
        input.itemId,
        (BigInt(input.generation as string) + 1n).toString(),
        input.keyVersion,
      );
      return;
    case "delete-item":
      if (result.kind !== "deleted" || result.vaultId !== input.vaultId) corruptResult();
      validateIdentity(result.deletion, input.itemId, input.generation as string, input.keyVersion);
      return;
    default:
      return;
  }
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
        const result = {
          kind: "summaries",
          vaultId: input.vaultId,
          items,
          issues: page.issues,
          ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
        };
        validateItemOperationResult(request, result);
        return result;
      }
      case "get-item": {
        const item = await this.#requireSession().getItem(input.vaultId, input.itemId);
        const result = {
          kind: "item",
          vaultId: input.vaultId,
          item: item === undefined ? null : { ...item, generation: item.generation.toString() },
        };
        validateItemOperationResult(request, result);
        return result;
      }
      case "compute-totp": {
        const item = await this.#requireSession().getItem(input.vaultId, input.itemId);
        if (item === undefined) throw new LocalVaultFailure("item-not-found");
        if (
          item.generation !== BigInt(input.generation as string) ||
          item.keyVersion !== input.keyVersion
        )
          throw new LocalVaultFailure("conflict");
        if (item.item.type !== "totp") throw new LocalVaultFailure("invalid-item-reference");
        const result = await computeTotp(
          this.#dependencies.subtle,
          item.item,
          this.#dependencies.nowMilliseconds(),
        );
        validateTotpComputation(result, item.item);
        return {
          kind: "totp-code",
          itemId: item.id,
          generation: item.generation.toString(),
          keyVersion: item.keyVersion,
          ...result,
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
      case "generate-passphrase": {
        this.#requireSession();
        const provider = this.#provider;
        if (provider === undefined) throw new Error("missing provider");
        const passphrase = generatePassphrase(provider, input);
        validateGeneratedPassphrase(passphrase, input);
        return { kind: "generated-passphrase", passphrase };
      }
      case "create-item": {
        const item = await this.#requireSession().createItem(input.vaultId, input.item);
        const result = {
          kind: "revision",
          vaultId: input.vaultId,
          revision: {
            id: item.id,
            generation: item.generation.toString(),
            keyVersion: item.keyVersion,
          },
        };
        validateItemOperationResult(request, result);
        return result;
      }
      case "update-item": {
        const item = await this.#requireSession().updateItem(
          input.vaultId,
          input.itemId,
          BigInt(input.generation as string),
          input.keyVersion,
          input.item,
        );
        const result = {
          kind: "revision",
          vaultId: input.vaultId,
          revision: {
            id: item.id,
            generation: item.generation.toString(),
            keyVersion: item.keyVersion,
          },
        };
        validateItemOperationResult(request, result);
        return result;
      }
      case "delete-item": {
        const deletion = await this.#requireSession().deleteItem(
          input.vaultId,
          input.itemId,
          BigInt(input.generation as string),
          input.keyVersion,
        );
        const result = {
          kind: "deleted",
          vaultId: input.vaultId,
          deletion: {
            id: deletion.id,
            generation: deletion.generation.toString(),
            keyVersion: deletion.keyVersion,
          },
        };
        validateItemOperationResult(request, result);
        return result;
      }
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
