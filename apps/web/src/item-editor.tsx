import { parseVaultItem, type VaultItem } from "@neutron/vault-domain/items";
import type { FormEvent } from "react";
import { useRef, useState } from "react";
import {
  DEFAULT_PASSWORD_GENERATOR_OPTIONS,
  type PasswordGeneratorOptionsV1,
} from "./password-generator.js";

type ItemType = VaultItem["type"];

interface ItemDraft {
  readonly accountName: string;
  readonly algorithm: "SHA1" | "SHA256" | "SHA512";
  readonly body: string;
  readonly codes: string;
  readonly digits: "6" | "8";
  readonly hasAccountName: boolean;
  readonly hasIssuer: boolean;
  readonly hasNotes: boolean;
  readonly hasUrl: boolean;
  readonly issuer: string;
  readonly json: string;
  readonly notes: string;
  readonly password: string;
  readonly period: string;
  readonly secretBase32: string;
  readonly tags: string;
  readonly title: string;
  readonly type: ItemType;
  readonly url: string;
  readonly username: string;
}

export interface ItemEditorProps {
  readonly busy: boolean;
  readonly initial?: VaultItem;
  readonly onCancel: () => void;
  readonly onDelete?: () => void;
  readonly onGeneratePassword: (options: PasswordGeneratorOptionsV1) => Promise<string>;
  readonly onSave: (item: VaultItem) => void;
}

const invalidDraftMessage = "Check the item fields and limits.";

function initialDraft(item?: VaultItem): ItemDraft {
  return {
    accountName: item?.type === "totp" ? (item.accountName ?? "") : "",
    algorithm: item?.type === "totp" ? item.algorithm : "SHA1",
    body: item?.type === "secure-note" ? item.body : "",
    codes: item?.type === "backup-code" ? item.codes.join("\n") : "",
    digits: item?.type === "totp" ? (item.digits.toString() as "6" | "8") : "6",
    hasAccountName: item?.type === "totp" && Object.hasOwn(item, "accountName"),
    hasIssuer: item?.type === "totp" && Object.hasOwn(item, "issuer"),
    hasNotes:
      (item?.type === "login" || item?.type === "backup-code") && Object.hasOwn(item, "notes"),
    hasUrl: item?.type === "login" && Object.hasOwn(item, "url"),
    issuer: item?.type === "totp" ? (item.issuer ?? "") : "",
    json: item?.type === "json" ? JSON.stringify(item.value, null, 2) : "{}",
    notes: item?.type === "login" || item?.type === "backup-code" ? (item.notes ?? "") : "",
    password: item?.type === "login" ? item.password : "",
    period: item?.type === "totp" ? item.period.toString() : "30",
    secretBase32: item?.type === "totp" ? item.secretBase32 : "",
    tags: item?.tags.join("\n") ?? "",
    title: item?.title ?? "",
    type: item?.type ?? "login",
    url: item?.type === "login" ? (item.url ?? "") : "",
    username: item?.type === "login" ? item.username : "",
  };
}

function strictLines(value: string, allowEmpty: boolean): readonly string[] {
  if (value === "" && allowEmpty) return [];
  const entries = value.split("\n");
  if (entries.some((entry) => entry.length === 0)) throw new Error("invalid lines");
  return entries;
}

function optional(enabled: boolean, value: string, key: string): Record<string, string> {
  return enabled ? { [key]: value } : {};
}

function itemFromDraft(draft: ItemDraft): VaultItem {
  const common = {
    schemaVersion: 1 as const,
    tags: strictLines(draft.tags, true),
    title: draft.title,
  };
  let candidate: unknown;
  switch (draft.type) {
    case "login":
      candidate = {
        ...common,
        type: "login",
        username: draft.username,
        password: draft.password,
        ...optional(draft.hasUrl, draft.url, "url"),
        ...optional(draft.hasNotes, draft.notes, "notes"),
      };
      break;
    case "secure-note":
      candidate = { ...common, type: "secure-note", body: draft.body };
      break;
    case "totp": {
      if (!/^(?:0|[1-9][0-9]*)$/.test(draft.period)) throw new Error("invalid period");
      candidate = {
        ...common,
        type: "totp",
        secretBase32: draft.secretBase32,
        algorithm: draft.algorithm,
        digits: Number(draft.digits),
        period: Number(draft.period),
        ...optional(draft.hasIssuer, draft.issuer, "issuer"),
        ...optional(draft.hasAccountName, draft.accountName, "accountName"),
      };
      break;
    }
    case "backup-code":
      candidate = {
        ...common,
        type: "backup-code",
        codes: strictLines(draft.codes, false),
        ...optional(draft.hasNotes, draft.notes, "notes"),
      };
      break;
    case "json":
      candidate = { ...common, type: "json", value: JSON.parse(draft.json) as unknown };
      break;
  }
  return parseVaultItem(candidate);
}

function focusEditorElement(node: HTMLElement | null): void {
  node?.focus();
}

export function ItemEditor({
  busy,
  initial,
  onCancel,
  onDelete,
  onGeneratePassword,
  onSave,
}: ItemEditorProps) {
  const [draft, setDraft] = useState<ItemDraft>(() => initialDraft(initial));
  const [validationError, setValidationError] = useState<string>();
  const [generationError, setGenerationError] = useState<string>();
  const [generatorOptions, setGeneratorOptions] = useState<PasswordGeneratorOptionsV1>(
    DEFAULT_PASSWORD_GENERATOR_OPTIONS,
  );
  const [generating, setGenerating] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const focusDeleteStart = useRef(false);
  const generationEpoch = useRef(0);
  const editing = initial !== undefined;

  function invalidateGeneration(): void {
    generationEpoch.current += 1;
    setGenerating(false);
    setGenerationError(undefined);
  }

  function field<Key extends keyof ItemDraft>(key: Key, value: ItemDraft[Key]): void {
    if (key === "password") invalidateGeneration();
    setDraft((current) => ({ ...current, [key]: value }));
    setValidationError(undefined);
  }

  function generatorOption<Key extends keyof PasswordGeneratorOptionsV1>(
    key: Key,
    value: PasswordGeneratorOptionsV1[Key],
  ): void {
    invalidateGeneration();
    setGeneratorOptions((current) => ({ ...current, [key]: value }));
  }

  async function requestGeneratedPassword(): Promise<void> {
    if (busy) return;
    const epoch = generationEpoch.current + 1;
    generationEpoch.current = epoch;
    setGenerating(true);
    setGenerationError(undefined);
    try {
      const password = await onGeneratePassword(generatorOptions);
      if (generationEpoch.current !== epoch) return;
      setDraft((current) => (current.type === "login" ? { ...current, password } : current));
    } catch {
      if (generationEpoch.current === epoch)
        setGenerationError("Password could not be generated. Check the generator options.");
    } finally {
      if (generationEpoch.current === epoch) setGenerating(false);
    }
  }

  function changeType(type: ItemType): void {
    invalidateGeneration();
    setDraft((current) => ({
      ...initialDraft(),
      tags: current.tags,
      title: current.title,
      type,
    }));
    setValidationError(undefined);
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (busy) return;
    try {
      const item = itemFromDraft(draft);
      setValidationError(undefined);
      onSave(item);
    } catch {
      setValidationError(invalidDraftMessage);
    }
  }

  return (
    <article className="item-editor" aria-labelledby="item-editor-title">
      <p className="eyebrow">{editing ? "Editing item" : "New item"}</p>
      <h2 id="item-editor-title" ref={focusEditorElement} tabIndex={-1}>
        {editing ? `Edit ${initial.title}` : "Create an item"}
      </h2>
      <p>Fields are validated locally before encrypted storage is contacted.</p>
      {validationError === undefined ? null : (
        <p className="error editor-error" role="alert" ref={focusEditorElement} tabIndex={-1}>
          {validationError}
        </p>
      )}
      <form aria-label={editing ? "Edit item" : "Create item"} onSubmit={submit} noValidate>
        <label htmlFor="item-type">Type</label>
        <select
          id="item-type"
          value={draft.type}
          disabled={editing || busy}
          onChange={(event) => changeType(event.currentTarget.value as ItemType)}
        >
          <option value="login">Login</option>
          <option value="secure-note">Secure note</option>
          <option value="totp">TOTP seed</option>
          <option value="backup-code">Backup codes</option>
          <option value="json">JSON</option>
        </select>

        <label htmlFor="item-title">Title</label>
        <input
          id="item-title"
          value={draft.title}
          maxLength={256}
          required
          onChange={(event) => field("title", event.currentTarget.value)}
        />

        <label htmlFor="item-tags">Tags, one per line</label>
        <textarea
          id="item-tags"
          value={draft.tags}
          maxLength={8_255}
          onChange={(event) => field("tags", event.currentTarget.value)}
        />

        {draft.type === "login" ? (
          <>
            <label htmlFor="item-username">Username</label>
            <input
              id="item-username"
              value={draft.username}
              maxLength={2_048}
              autoComplete="off"
              onChange={(event) => field("username", event.currentTarget.value)}
            />
            <label htmlFor="item-password">Password</label>
            <input
              id="item-password"
              type="password"
              value={draft.password}
              maxLength={4_096}
              autoComplete="new-password"
              onChange={(event) => field("password", event.currentTarget.value)}
            />
            <fieldset className="password-generator" aria-busy={generating}>
              <legend>Generate a random password</legend>
              <label htmlFor="password-generator-length">Length</label>
              <input
                id="password-generator-length"
                type="number"
                min={16}
                max={128}
                step={1}
                value={generatorOptions.length}
                onChange={(event) => generatorOption("length", Number(event.currentTarget.value))}
              />
              {(
                [
                  ["lowercase", "Lowercase letters"],
                  ["uppercase", "Uppercase letters"],
                  ["digits", "Digits"],
                  ["symbols", "Symbols"],
                ] as const
              ).map(([key, label]) => (
                <label className="check-label" htmlFor={`password-generator-${key}`} key={key}>
                  <input
                    id={`password-generator-${key}`}
                    type="checkbox"
                    checked={generatorOptions[key]}
                    onChange={(event) => generatorOption(key, event.currentTarget.checked)}
                  />
                  {label}
                </label>
              ))}
              {generationError === undefined ? null : (
                <p className="error" role="alert">
                  {generationError}
                </p>
              )}
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void requestGeneratedPassword()}
              >
                {generating ? "Generate another password" : "Generate password"}
              </button>
              <p className="field-hint">
                Character classes are allowed sets; each selected class may not appear every time.
              </p>
            </fieldset>
            <label className="check-label" htmlFor="item-has-url">
              <input
                id="item-has-url"
                type="checkbox"
                checked={draft.hasUrl}
                onChange={(event) => field("hasUrl", event.currentTarget.checked)}
              />
              Store a URL field
            </label>
            {draft.hasUrl ? (
              <>
                <label htmlFor="item-url">URL</label>
                <input
                  id="item-url"
                  type="url"
                  value={draft.url}
                  maxLength={2_048}
                  onChange={(event) => field("url", event.currentTarget.value)}
                />
              </>
            ) : null}
            <label className="check-label" htmlFor="item-has-notes">
              <input
                id="item-has-notes"
                type="checkbox"
                checked={draft.hasNotes}
                onChange={(event) => field("hasNotes", event.currentTarget.checked)}
              />
              Store a notes field
            </label>
            {draft.hasNotes ? (
              <>
                <label htmlFor="item-notes">Notes</label>
                <textarea
                  id="item-notes"
                  value={draft.notes}
                  maxLength={65_536}
                  onChange={(event) => field("notes", event.currentTarget.value)}
                />
              </>
            ) : null}
          </>
        ) : null}

        {draft.type === "secure-note" ? (
          <>
            <label htmlFor="item-body">Note</label>
            <textarea
              id="item-body"
              value={draft.body}
              maxLength={65_536}
              onChange={(event) => field("body", event.currentTarget.value)}
            />
          </>
        ) : null}

        {draft.type === "totp" ? (
          <>
            <label htmlFor="item-totp-secret">Base32 secret</label>
            <input
              id="item-totp-secret"
              value={draft.secretBase32}
              maxLength={512}
              autoComplete="off"
              required
              onChange={(event) => field("secretBase32", event.currentTarget.value)}
            />
            <label htmlFor="item-totp-algorithm">Algorithm</label>
            <select
              id="item-totp-algorithm"
              value={draft.algorithm}
              onChange={(event) =>
                field("algorithm", event.currentTarget.value as ItemDraft["algorithm"])
              }
            >
              <option value="SHA1">SHA-1</option>
              <option value="SHA256">SHA-256</option>
              <option value="SHA512">SHA-512</option>
            </select>
            <label htmlFor="item-totp-digits">Digits</label>
            <select
              id="item-totp-digits"
              value={draft.digits}
              onChange={(event) => field("digits", event.currentTarget.value as "6" | "8")}
            >
              <option value="6">6</option>
              <option value="8">8</option>
            </select>
            <label htmlFor="item-totp-period">Period in seconds</label>
            <input
              id="item-totp-period"
              inputMode="numeric"
              value={draft.period}
              maxLength={3}
              required
              onChange={(event) => field("period", event.currentTarget.value)}
            />
            <label className="check-label" htmlFor="item-has-issuer">
              <input
                id="item-has-issuer"
                type="checkbox"
                checked={draft.hasIssuer}
                onChange={(event) => field("hasIssuer", event.currentTarget.checked)}
              />
              Store an issuer field
            </label>
            {draft.hasIssuer ? (
              <>
                <label htmlFor="item-totp-issuer">Issuer</label>
                <input
                  id="item-totp-issuer"
                  value={draft.issuer}
                  maxLength={256}
                  onChange={(event) => field("issuer", event.currentTarget.value)}
                />
              </>
            ) : null}
            <label className="check-label" htmlFor="item-has-account">
              <input
                id="item-has-account"
                type="checkbox"
                checked={draft.hasAccountName}
                onChange={(event) => field("hasAccountName", event.currentTarget.checked)}
              />
              Store an account-name field
            </label>
            {draft.hasAccountName ? (
              <>
                <label htmlFor="item-totp-account">Account name</label>
                <input
                  id="item-totp-account"
                  value={draft.accountName}
                  maxLength={256}
                  onChange={(event) => field("accountName", event.currentTarget.value)}
                />
              </>
            ) : null}
          </>
        ) : null}

        {draft.type === "backup-code" ? (
          <>
            <label htmlFor="item-codes">Codes, one per line</label>
            <textarea
              id="item-codes"
              value={draft.codes}
              maxLength={262_399}
              required
              onChange={(event) => field("codes", event.currentTarget.value)}
            />
            <label className="check-label" htmlFor="item-has-notes">
              <input
                id="item-has-notes"
                type="checkbox"
                checked={draft.hasNotes}
                onChange={(event) => field("hasNotes", event.currentTarget.checked)}
              />
              Store a notes field
            </label>
            {draft.hasNotes ? (
              <>
                <label htmlFor="item-notes">Notes</label>
                <textarea
                  id="item-notes"
                  value={draft.notes}
                  maxLength={65_536}
                  onChange={(event) => field("notes", event.currentTarget.value)}
                />
              </>
            ) : null}
          </>
        ) : null}

        {draft.type === "json" ? (
          <>
            <label htmlFor="item-json">JSON value</label>
            <textarea
              id="item-json"
              className="code-input"
              value={draft.json}
              maxLength={1_048_576}
              required
              spellCheck={false}
              onChange={(event) => field("json", event.currentTarget.value)}
            />
          </>
        ) : null}

        <div className="editor-actions">
          <button type="submit" disabled={busy || generating}>
            {busy ? "Saving…" : editing ? "Save changes" : "Create item"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => {
              invalidateGeneration();
              onCancel();
            }}
          >
            Cancel editing
          </button>
        </div>
      </form>

      {!editing || onDelete === undefined ? null : confirmingDelete ? (
        <fieldset className="delete-confirmation">
          <legend ref={focusEditorElement} tabIndex={-1}>
            Delete this item?
          </legend>
          <p>This removes the encrypted local record. This action cannot be undone.</p>
          <div className="editor-actions">
            <button type="button" className="danger" disabled={busy} onClick={onDelete}>
              Confirm delete
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                focusDeleteStart.current = true;
                setConfirmingDelete(false);
              }}
            >
              Cancel deletion
            </button>
          </div>
        </fieldset>
      ) : (
        <button
          type="button"
          className="danger delete-start"
          disabled={busy}
          ref={(node) => {
            if (node !== null && focusDeleteStart.current) {
              focusDeleteStart.current = false;
              node.focus();
            }
          }}
          onClick={() => setConfirmingDelete(true)}
        >
          Delete item
        </button>
      )}
    </article>
  );
}
