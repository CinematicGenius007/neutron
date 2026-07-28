import { parseVaultItem, type VaultItem } from "@neutron/vault-domain/items";
import type { LocalVaultFailureCode, LocalVaultMetadata } from "./local-vault.js";

export const VAULT_WORKER_PROTOCOL = 1 as const;
export const MAX_SUMMARY_PAGE_SIZE = 100;

const uint64Pattern = /^(0|[1-9][0-9]{0,19})$/;
const idPattern = /^[0-9a-f]{32}$/;
const uint64Maximum = 18_446_744_073_709_551_615n;

export type VaultWorkerOperation =
  | "begin-enrollment"
  | "cancel-enrollment"
  | "confirm-enrollment"
  | "create-item"
  | "delete-item"
  | "get-item"
  | "list-item-summaries"
  | "lock"
  | "state"
  | "unlock"
  | "update-item";

export type VaultWorkerState = "locked" | "pending-enrollment" | "unlocked";

export interface VaultWorkerRequest {
  readonly protocol: 1;
  readonly requestId: string;
  readonly sessionEpoch: string;
  readonly operation: VaultWorkerOperation;
  readonly input: Readonly<Record<string, unknown>>;
}

export interface VaultWorkerSuccess {
  readonly protocol: 1;
  readonly requestId: string;
  readonly sessionEpoch: string;
  readonly operation: VaultWorkerOperation;
  readonly ok: true;
  readonly result: unknown;
}

export interface VaultWorkerError {
  readonly protocol: 1;
  readonly requestId: string;
  readonly sessionEpoch: string;
  readonly operation: VaultWorkerOperation;
  readonly ok: false;
  readonly error: LocalVaultFailureCode | "internal" | "invalid-message";
}

export type VaultWorkerResponse = VaultWorkerSuccess | VaultWorkerError;

export class VaultWorkerProtocolFailure extends Error {
  constructor() {
    super("invalid vault worker message");
    this.name = "VaultWorkerProtocolFailure";
  }
}

function fail(): never {
  throw new VaultWorkerProtocolFailure();
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") fail();
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    )
      fail();
  }
  return value as Record<string, unknown>;
}

function exact(value: unknown, required: readonly string[], optional: readonly string[] = []) {
  const output = record(value);
  for (let index = 0; index < required.length; index += 1) {
    const key = required[index];
    if (key === undefined || !Object.hasOwn(output, key)) fail();
  }
  for (let index = 0; index < optional.length; index += 1) {
    const key = optional[index];
    if (key === undefined) fail();
  }
  const keys = Reflect.ownKeys(output);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof key !== "string") fail();
    let allowed = false;
    for (let requiredIndex = 0; requiredIndex < required.length; requiredIndex += 1)
      if (required[requiredIndex] === key) allowed = true;
    for (let optionalIndex = 0; optionalIndex < optional.length; optionalIndex += 1)
      if (optional[optionalIndex] === key) allowed = true;
    if (!allowed) fail();
  }
  return output;
}

function array(value: unknown, maximum: number, minimum = 0): readonly unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length < minimum ||
    value.length > maximum
  )
    fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[index.toString()];
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    )
      fail();
  }
  const keys = Reflect.ownKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)
      fail();
  }
  return value;
}

function text(value: unknown, maximum: number, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0) || value.length > maximum)
    fail();
  return value;
}

function password(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) fail();
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit <= 0x7f) bytes += 1;
    else if (unit <= 0x7ff) bytes += 2;
    else if (unit >= 0xd800 && unit <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (index + 1 >= value.length || low < 0xdc00 || low > 0xdfff) fail();
      bytes += 4;
      index += 1;
    } else {
      if (unit >= 0xdc00 && unit <= 0xdfff) fail();
      bytes += 3;
    }
    if (bytes > 1_024) fail();
  }
  return value;
}

function itemType(value: unknown): VaultItem["type"] {
  switch (value) {
    case "login":
    case "secure-note":
    case "totp":
    case "backup-code":
    case "json":
      return value;
    default:
      fail();
  }
}

function vaultItem(value: unknown): VaultItem {
  try {
    return parseVaultItem(value);
  } catch {
    fail();
  }
}

export function parseCanonicalUint64(value: unknown): string {
  if (typeof value !== "string" || !uint64Pattern.test(value)) fail();
  if (BigInt(value) > uint64Maximum) fail();
  return value;
}

function parsePositiveCanonicalUint64(value: unknown): string {
  const parsed = parseCanonicalUint64(value);
  if (parsed === "0") fail();
  return parsed;
}

export function incrementPositiveCanonicalUint64(value: unknown): string {
  const parsed = parsePositiveCanonicalUint64(value);
  if (BigInt(parsed) >= uint64Maximum) fail();
  return (BigInt(parsed) + 1n).toString();
}

function id(value: unknown): string {
  if (typeof value !== "string" || !idPattern.test(value) || /^0{32}$/.test(value)) fail();
  return value;
}

function positiveUint32(value: unknown, maximum = 0xffff_ffff): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > maximum) fail();
  return value as number;
}

function parseInput(
  operation: VaultWorkerOperation,
  candidate: unknown,
): Readonly<Record<string, unknown>> {
  let input: Record<string, unknown>;
  switch (operation) {
    case "state":
    case "cancel-enrollment":
    case "lock":
      input = exact(candidate, []);
      break;
    case "begin-enrollment":
    case "unlock":
      input = exact(candidate, ["password"]);
      password(input.password);
      break;
    case "confirm-enrollment":
      input = exact(candidate, ["recoveryKit"]);
      if (text(input.recoveryKit, 90).length !== 90) fail();
      break;
    case "list-item-summaries":
      input = exact(candidate, ["vaultId", "limit"], ["cursor"]);
      id(input.vaultId);
      positiveUint32(input.limit, MAX_SUMMARY_PAGE_SIZE);
      if (Object.hasOwn(input, "cursor")) id(input.cursor);
      break;
    case "get-item":
      input = exact(candidate, ["vaultId", "itemId"]);
      id(input.vaultId);
      id(input.itemId);
      break;
    case "create-item":
      input = exact(candidate, ["vaultId", "item"]);
      id(input.vaultId);
      input.item = vaultItem(input.item);
      break;
    case "update-item":
      input = exact(candidate, ["vaultId", "itemId", "generation", "keyVersion", "item"]);
      id(input.vaultId);
      id(input.itemId);
      incrementPositiveCanonicalUint64(input.generation);
      positiveUint32(input.keyVersion);
      input.item = vaultItem(input.item);
      break;
    case "delete-item":
      input = exact(candidate, ["vaultId", "itemId", "generation", "keyVersion"]);
      id(input.vaultId);
      id(input.itemId);
      parsePositiveCanonicalUint64(input.generation);
      positiveUint32(input.keyVersion);
      break;
    default: {
      const exhaustive: never = operation;
      return exhaustive;
    }
  }
  return Object.freeze(input);
}

function operation(value: unknown): VaultWorkerOperation {
  switch (value) {
    case "begin-enrollment":
    case "cancel-enrollment":
    case "confirm-enrollment":
    case "create-item":
    case "delete-item":
    case "get-item":
    case "list-item-summaries":
    case "lock":
    case "state":
    case "unlock":
    case "update-item":
      return value;
    default:
      fail();
  }
}

export function parseVaultWorkerRequest(candidate: unknown): VaultWorkerRequest {
  const value = exact(candidate, ["protocol", "requestId", "sessionEpoch", "operation", "input"]);
  if (value.protocol !== VAULT_WORKER_PROTOCOL) fail();
  const parsedOperation = operation(value.operation);
  return Object.freeze({
    protocol: VAULT_WORKER_PROTOCOL,
    requestId: parseCanonicalUint64(value.requestId),
    sessionEpoch: parseCanonicalUint64(value.sessionEpoch),
    operation: parsedOperation,
    input: parseInput(parsedOperation, value.input),
  });
}

function parseMetadata(candidate: unknown): LocalVaultMetadata {
  const value = exact(candidate, ["accountId", "arkEpoch", "vaults"]);
  id(value.accountId);
  positiveUint32(value.arkEpoch);
  const sourceVaults = array(value.vaults, 16, 1);
  const vaults: { id: string; keyVersion: number }[] = [];
  const vaultIds = new Set<string>();
  for (let index = 0; index < sourceVaults.length; index += 1) {
    const vault = exact(sourceVaults[index], ["id", "keyVersion"]);
    const vaultId = id(vault.id);
    if (vaultIds.has(vaultId)) fail();
    vaultIds.add(vaultId);
    vaults[index] = Object.freeze({
      id: vaultId,
      keyVersion: positiveUint32(vault.keyVersion),
    });
  }
  return Object.freeze({
    accountId: value.accountId as string,
    arkEpoch: value.arkEpoch as number,
    vaults: Object.freeze(vaults),
  });
}

function parseItemRecord(candidate: unknown): unknown {
  const value = exact(candidate, ["id", "generation", "keyVersion", "item"]);
  return Object.freeze({
    id: id(value.id),
    generation: parsePositiveCanonicalUint64(value.generation),
    keyVersion: positiveUint32(value.keyVersion),
    item: vaultItem(value.item),
  });
}

function parseRevision(candidate: unknown): unknown {
  const value = exact(candidate, ["id", "generation", "keyVersion"]);
  return Object.freeze({
    id: id(value.id),
    generation: parsePositiveCanonicalUint64(value.generation),
    keyVersion: positiveUint32(value.keyVersion),
  });
}

function parseResult(candidate: unknown): unknown {
  const value = record(candidate);
  const kind = value.kind;
  switch (kind) {
    case "state": {
      const result = exact(value, ["kind", "state"]);
      if (
        result.state !== "locked" &&
        result.state !== "pending-enrollment" &&
        result.state !== "unlocked"
      )
        fail();
      return Object.freeze({ kind, state: result.state as VaultWorkerState });
    }
    case "enrollment": {
      const result = exact(value, ["kind", "recoveryKit"]);
      const recoveryKit = text(result.recoveryKit, 90);
      if (recoveryKit.length !== 90) fail();
      return Object.freeze({ kind, recoveryKit });
    }
    case "session": {
      const result = exact(value, ["kind", "metadata"]);
      return Object.freeze({ kind, metadata: parseMetadata(result.metadata) });
    }
    case "item": {
      const result = exact(value, ["kind", "item"]);
      return Object.freeze({
        kind,
        item: result.item === null ? null : parseItemRecord(result.item),
      });
    }
    case "revision": {
      const result = exact(value, ["kind", "revision"]);
      return Object.freeze({ kind, revision: parseRevision(result.revision) });
    }
    case "summaries": {
      const result = exact(value, ["kind", "items", "issues"], ["nextCursor"]);
      const sourceItems = array(result.items, MAX_SUMMARY_PAGE_SIZE);
      const sourceIssues = array(result.issues, MAX_SUMMARY_PAGE_SIZE);
      const items: unknown[] = [];
      for (let index = 0; index < sourceItems.length; index += 1) {
        const summary = exact(sourceItems[index], [
          "id",
          "generation",
          "keyVersion",
          "title",
          "type",
        ]);
        const parsedType = itemType(summary.type);
        const parsedTitle = text(summary.title, 256);
        if (new TextEncoder().encode(parsedTitle).length > 256) fail();
        items[index] = Object.freeze({
          id: id(summary.id),
          generation: parsePositiveCanonicalUint64(summary.generation),
          keyVersion: positiveUint32(summary.keyVersion),
          title: parsedTitle,
          type: parsedType,
        });
      }
      const issues: unknown[] = [];
      for (let index = 0; index < sourceIssues.length; index += 1) {
        const issue = exact(sourceIssues[index], ["code", "id"]);
        if (issue.code !== "corrupt-item") fail();
        issues[index] = Object.freeze({ code: "corrupt-item", id: id(issue.id) });
      }
      return Object.freeze({
        kind,
        items: Object.freeze(items),
        issues: Object.freeze(issues),
        ...(Object.hasOwn(result, "nextCursor") ? { nextCursor: id(result.nextCursor) } : {}),
      });
    }
    case "done":
      exact(value, ["kind"]);
      return Object.freeze({ kind });
    default:
      fail();
  }
}

function workerError(value: unknown): VaultWorkerError["error"] {
  switch (value) {
    case "already-initialized":
    case "confirmation-failed":
    case "conflict":
    case "corrupt-item":
    case "corrupt-state":
    case "enrollment-state":
    case "internal":
    case "invalid-item-reference":
    case "invalid-message":
    case "invalid-password-input":
    case "item-limit":
    case "item-not-found":
    case "locked":
    case "not-initialized":
    case "unlock-failed":
      return value;
    default:
      fail();
  }
}

function expectedResultKind(operation: VaultWorkerOperation): string {
  switch (operation) {
    case "state":
      return "state";
    case "begin-enrollment":
      return "enrollment";
    case "confirm-enrollment":
    case "unlock":
      return "session";
    case "list-item-summaries":
      return "summaries";
    case "get-item":
      return "item";
    case "create-item":
    case "update-item":
      return "revision";
    case "cancel-enrollment":
    case "delete-item":
    case "lock":
      return "done";
    default: {
      const exhaustive: never = operation;
      return exhaustive;
    }
  }
}

function operationAllowsError(
  operation: VaultWorkerOperation,
  error: VaultWorkerError["error"],
): boolean {
  if (error === "internal" || error === "invalid-message" || error === "locked") return true;
  switch (operation) {
    case "state":
    case "lock":
      return false;
    case "begin-enrollment":
      return (
        error === "already-initialized" ||
        error === "corrupt-state" ||
        error === "enrollment-state" ||
        error === "invalid-password-input"
      );
    case "cancel-enrollment":
    case "confirm-enrollment":
      return (
        error === "enrollment-state" ||
        (operation === "confirm-enrollment" &&
          (error === "confirmation-failed" || error === "already-initialized"))
      );
    case "unlock":
      return (
        error === "invalid-password-input" ||
        error === "not-initialized" ||
        error === "unlock-failed" ||
        error === "corrupt-state"
      );
    case "list-item-summaries":
      return (
        error === "invalid-item-reference" || error === "item-limit" || error === "corrupt-state"
      );
    case "get-item":
      return (
        error === "invalid-item-reference" ||
        error === "item-limit" ||
        error === "corrupt-item" ||
        error === "corrupt-state"
      );
    case "create-item":
      return (
        error === "invalid-item-reference" ||
        error === "item-limit" ||
        error === "conflict" ||
        error === "corrupt-state"
      );
    case "update-item":
    case "delete-item":
      return (
        error === "invalid-item-reference" ||
        error === "item-limit" ||
        error === "item-not-found" ||
        error === "corrupt-item" ||
        error === "conflict" ||
        error === "corrupt-state"
      );
    default: {
      const exhaustive: never = operation;
      return exhaustive;
    }
  }
}

export function parseVaultWorkerResponse(candidate: unknown): VaultWorkerResponse {
  const value = record(candidate);
  if (value.protocol !== VAULT_WORKER_PROTOCOL || typeof value.ok !== "boolean") fail();
  const requestId = parseCanonicalUint64(value.requestId);
  const sessionEpoch = parseCanonicalUint64(value.sessionEpoch);
  const parsedOperation = operation(value.operation);
  if (value.ok) {
    exact(value, ["protocol", "requestId", "sessionEpoch", "operation", "ok", "result"]);
    const result = parseResult(value.result);
    if (resultRecordKind(result) !== expectedResultKind(parsedOperation)) fail();
    return Object.freeze({
      protocol: 1,
      requestId,
      sessionEpoch,
      operation: parsedOperation,
      ok: true,
      result,
    });
  }
  exact(value, ["protocol", "requestId", "sessionEpoch", "operation", "ok", "error"]);
  const error = workerError(value.error);
  if (!operationAllowsError(parsedOperation, error)) fail();
  return Object.freeze({
    protocol: 1,
    requestId,
    sessionEpoch,
    operation: parsedOperation,
    ok: false,
    error,
  });
}

function resultRecordKind(value: unknown): unknown {
  return (value as Readonly<{ kind: unknown }>).kind;
}
