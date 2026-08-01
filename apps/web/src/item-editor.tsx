import { parseVaultItem, type VaultItem } from "@neutron/vault-domain/items";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_PASSPHRASE_GENERATOR_OPTIONS,
  type PassphraseGeneratorOptionsV1,
} from "./passphrase-generator.js";
import { EFF_LONG_WORDLIST_ATTRIBUTION } from "./passphrase-wordlist.js";
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
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onGeneratePassphrase: (options: PassphraseGeneratorOptionsV1) => Promise<string>;
  readonly onGeneratePassword: (options: PasswordGeneratorOptionsV1) => Promise<string>;
  readonly onSave: (item: VaultItem) => void;
  readonly privacyEpoch: number;
}

interface DraftIssue {
  readonly fieldId: string;
  readonly message: string;
}

interface ValidationAlert extends DraftIssue {
  readonly id: number;
}

const encoder = new TextEncoder();

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

function byteLength(value: string): number {
  return encoder.encode(value).length;
}

function linesIssue(value: string, maximumEntries: number, maximumBytes: number): boolean {
  const entries = value === "" ? [] : value.split("\n");
  return (
    entries.length > maximumEntries ||
    entries.some((entry) => entry.length === 0 || byteLength(entry) > maximumBytes) ||
    new Set(entries).size !== entries.length
  );
}

function draftIssue(draft: ItemDraft): DraftIssue | undefined {
  if (byteLength(draft.title) < 1 || byteLength(draft.title) > 256)
    return {
      fieldId: "item-title",
      message: "Enter a title between 1 and 256 UTF-8 bytes.",
    };
  if (linesIssue(draft.tags, 64, 128))
    return {
      fieldId: "item-tags",
      message:
        "Enter no more than 64 unique, non-empty tags, one per line and at most 128 UTF-8 bytes each.",
    };
  switch (draft.type) {
    case "login":
      if (byteLength(draft.username) > 2_048)
        return {
          fieldId: "item-username",
          message: "Keep the username within 2,048 UTF-8 bytes.",
        };
      if (byteLength(draft.password) > 4_096)
        return {
          fieldId: "item-password",
          message: "Keep the password within 4,096 UTF-8 bytes.",
        };
      if (draft.hasUrl && byteLength(draft.url) > 2_048)
        return {
          fieldId: "item-url",
          message: "Keep the URL within 2,048 UTF-8 bytes.",
        };
      if (draft.hasNotes && byteLength(draft.notes) > 65_536)
        return {
          fieldId: "item-notes",
          message: "Keep notes within 65,536 UTF-8 bytes.",
        };
      return undefined;
    case "secure-note":
      return byteLength(draft.body) > 65_536
        ? {
            fieldId: "item-body",
            message: "Keep the secure note within 65,536 UTF-8 bytes.",
          }
        : undefined;
    case "totp": {
      const period = Number(draft.period);
      if (!/^[A-Z2-7]{16,512}$/.test(draft.secretBase32))
        return {
          fieldId: "item-totp-secret",
          message: "Enter a canonical uppercase Base32 secret of 16–512 characters.",
        };
      if (!Number.isInteger(period) || period < 15 || period > 300)
        return {
          fieldId: "item-totp-period",
          message: "Enter a TOTP period from 15 to 300 seconds.",
        };
      if (draft.hasIssuer && byteLength(draft.issuer) > 256)
        return {
          fieldId: "item-totp-issuer",
          message: "Keep the issuer within 256 UTF-8 bytes.",
        };
      if (draft.hasAccountName && byteLength(draft.accountName) > 256)
        return {
          fieldId: "item-totp-account",
          message: "Keep the account name within 256 UTF-8 bytes.",
        };
      return undefined;
    }
    case "backup-code":
      return linesIssue(draft.codes, 256, 1_024) || draft.codes === ""
        ? {
            fieldId: "item-codes",
            message:
              "Enter 1–256 unique, non-empty backup codes, one per line and at most 1,024 UTF-8 bytes each.",
          }
        : undefined;
    case "json":
      try {
        JSON.parse(draft.json);
        return undefined;
      } catch {
        return {
          fieldId: "item-json",
          message: "Enter valid JSON within the supported size and nesting limits.",
        };
      }
  }
}

function fallbackDraftIssue(type: ItemType): DraftIssue {
  switch (type) {
    case "totp":
      return {
        fieldId: "item-totp-secret",
        message: "Check the Base32 secret and TOTP settings.",
      };
    case "backup-code":
      return {
        fieldId: "item-codes",
        message: "Check the backup-code list and its limits.",
      };
    case "json":
      return {
        fieldId: "item-json",
        message: "Check the JSON value, nesting, and size limits.",
      };
    default:
      return {
        fieldId: "item-title",
        message: "Check the item fields and UTF-8 byte limits.",
      };
  }
}

function hasTypeSpecificContent(draft: ItemDraft): boolean {
  switch (draft.type) {
    case "login":
      return draft.username !== "" || draft.password !== "" || draft.hasUrl || draft.hasNotes;
    case "secure-note":
      return draft.body !== "";
    case "totp":
      return (
        draft.secretBase32 !== "" ||
        draft.algorithm !== "SHA1" ||
        draft.digits !== "6" ||
        draft.period !== "30" ||
        draft.hasIssuer ||
        draft.hasAccountName
      );
    case "backup-code":
      return draft.codes !== "" || draft.hasNotes;
    case "json":
      return draft.json !== "{}";
  }
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
      candidate = {
        ...common,
        type: "json",
        value: JSON.parse(draft.json) as unknown,
      };
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
  onDirtyChange,
  onGeneratePassphrase,
  onGeneratePassword,
  onSave,
  privacyEpoch,
}: ItemEditorProps) {
  const [draft, setDraft] = useState<ItemDraft>(() => initialDraft(initial));
  const [validationError, setValidationError] = useState<ValidationAlert>();
  const [generationError, setGenerationError] = useState<string>();
  const [editorStatus, setEditorStatus] = useState<string>();
  const [generatorMode, setGeneratorMode] = useState<"passphrase" | "password">("password");
  const [generatorOptions, setGeneratorOptions] = useState<PasswordGeneratorOptionsV1>(
    DEFAULT_PASSWORD_GENERATOR_OPTIONS,
  );
  const [passphraseOptions, setPassphraseOptions] = useState<PassphraseGeneratorOptionsV1>(
    DEFAULT_PASSPHRASE_GENERATOR_OPTIONS,
  );
  const [generating, setGenerating] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [pendingType, setPendingType] = useState<ItemType>();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    void privacyEpoch;
    setPasswordVisible(false);
    setEditorStatus(undefined);
  }, [privacyEpoch]);
  const focusDeleteStart = useRef(false);
  const generationEpoch = useRef(0);
  const nextValidationId = useRef(1);
  const editing = initial !== undefined;

  function markDirty(): void {
    if (dirty) return;
    setDirty(true);
    onDirtyChange(true);
  }

  function invalidateGeneration(): void {
    generationEpoch.current += 1;
    setGenerating(false);
    setGenerationError(undefined);
  }

  function field<Key extends keyof ItemDraft>(key: Key, value: ItemDraft[Key]): void {
    if (key === "password") invalidateGeneration();
    markDirty();
    setDraft((current) => ({ ...current, [key]: value }));
    setValidationError(undefined);
    setConfirmingCancel(false);
  }

  function generatorOption<Key extends keyof PasswordGeneratorOptionsV1>(
    key: Key,
    value: PasswordGeneratorOptionsV1[Key],
  ): void {
    invalidateGeneration();
    setGeneratorOptions((current) => ({ ...current, [key]: value }));
  }

  function passphraseOption(words: number): void {
    invalidateGeneration();
    setPassphraseOptions({ words });
  }

  function changeGeneratorMode(mode: "passphrase" | "password"): void {
    invalidateGeneration();
    setGeneratorMode(mode);
  }

  async function requestGeneratedSecret(): Promise<void> {
    if (busy) return;
    const epoch = generationEpoch.current + 1;
    generationEpoch.current = epoch;
    setGenerating(true);
    setGenerationError(undefined);
    setEditorStatus(
      generatorMode === "password" ? "Generating password…" : "Generating passphrase…",
    );
    try {
      const password =
        generatorMode === "password"
          ? await onGeneratePassword(generatorOptions)
          : await onGeneratePassphrase(passphraseOptions);
      if (generationEpoch.current !== epoch) return;
      setDraft((current) => (current.type === "login" ? { ...current, password } : current));
      setPasswordVisible(false);
      markDirty();
      setEditorStatus(
        generatorMode === "password"
          ? "Password generated and placed in the masked password field."
          : "Passphrase generated and placed in the masked password field.",
      );
    } catch {
      if (generationEpoch.current === epoch) {
        setPasswordVisible(false);
        setEditorStatus(undefined);
        setGenerationError("The credential could not be generated. Check the generator options.");
      }
    } finally {
      if (generationEpoch.current === epoch) setGenerating(false);
    }
  }

  function applyType(type: ItemType): void {
    invalidateGeneration();
    markDirty();
    setPasswordVisible(false);
    setDraft((current) => ({
      ...initialDraft(),
      tags: current.tags,
      title: current.title,
      type,
    }));
    setPendingType(undefined);
    setValidationError(undefined);
  }

  function requestType(type: ItemType): void {
    if (type === draft.type) return;
    if (hasTypeSpecificContent(draft)) {
      setPendingType(type);
      return;
    }
    applyType(type);
  }

  function reportValidation(issue: DraftIssue): void {
    const id = nextValidationId.current;
    nextValidationId.current += 1;
    setPasswordVisible(false);
    setEditorStatus(undefined);
    setValidationError({ id, ...issue });
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (busy) return;
    const advisory = draftIssue(draft);
    if (advisory !== undefined) {
      reportValidation(advisory);
      return;
    }
    try {
      const item = itemFromDraft(draft);
      setValidationError(undefined);
      onSave(item);
    } catch {
      reportValidation(fallbackDraftIssue(draft.type));
    }
  }

  function requestCancel(): void {
    invalidateGeneration();
    if (dirty) {
      setConfirmingCancel(true);
      return;
    }
    onCancel();
  }

  function togglePasswordVisibility(): void {
    setPasswordVisible((visible) => {
      setEditorStatus(visible ? "Password hidden." : "Password shown.");
      return !visible;
    });
  }

  function invalidProps(fieldId: string): Readonly<{
    "aria-describedby"?: string;
    "aria-invalid"?: true;
  }> {
    return validationError?.fieldId === fieldId
      ? {
          "aria-describedby": `editor-error-${validationError.id}`,
          "aria-invalid": true,
        }
      : {};
  }

  return (
    <article className="item-editor" aria-labelledby="item-editor-title">
      <p className="eyebrow">{editing ? "Editing item" : "New item"}</p>
      <h2 id="item-editor-title" ref={focusEditorElement} tabIndex={-1}>
        {editing ? `Edit ${initial.title}` : "Create an item"}
      </h2>
      <p>Fields are validated locally before encrypted storage is contacted.</p>
      {editorStatus === undefined ? null : (
        <p className="visually-hidden" role="status">
          {editorStatus}
        </p>
      )}
      {validationError === undefined ? null : (
        <p
          className="error editor-error"
          id={`editor-error-${validationError.id}`}
          key={validationError.id}
          role="alert"
          ref={focusEditorElement}
          tabIndex={-1}
        >
          {validationError.message}
        </p>
      )}
      <form aria-label={editing ? "Edit item" : "Create item"} onSubmit={submit} noValidate>
        <fieldset className="editor-fields" disabled={busy}>
          <legend className="visually-hidden">Item fields</legend>
          <label htmlFor="item-type">Type</label>
          <select
            id="item-type"
            value={draft.type}
            disabled={editing || busy}
            onChange={(event) => requestType(event.currentTarget.value as ItemType)}
          >
            <option value="login">Login</option>
            <option value="secure-note">Secure note</option>
            <option value="totp">TOTP seed</option>
            <option value="backup-code">Backup codes</option>
            <option value="json">JSON</option>
          </select>
          {pendingType === undefined ? null : (
            <fieldset className="discard-confirmation">
              <legend ref={focusEditorElement} tabIndex={-1}>
                Change item type and clear its fields?
              </legend>
              <p>
                Type-specific fields from the current draft will be permanently cleared. Title and
                tags will be kept.
              </p>
              <div className="editor-actions">
                <button type="button" className="danger" onClick={() => applyType(pendingType)}>
                  Clear fields and change type
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setPendingType(undefined)}
                >
                  Keep current type
                </button>
              </div>
            </fieldset>
          )}

          <label htmlFor="item-title">Title</label>
          <input
            id="item-title"
            {...invalidProps("item-title")}
            value={draft.title}
            maxLength={256}
            required
            onChange={(event) => field("title", event.currentTarget.value)}
          />

          <label htmlFor="item-tags">Tags, one per line</label>
          <textarea
            id="item-tags"
            {...invalidProps("item-tags")}
            value={draft.tags}
            maxLength={8_255}
            onChange={(event) => field("tags", event.currentTarget.value)}
          />

          {draft.type === "login" ? (
            <>
              <label htmlFor="item-username">Username</label>
              <input
                id="item-username"
                {...invalidProps("item-username")}
                value={draft.username}
                maxLength={2_048}
                autoComplete="off"
                onChange={(event) => field("username", event.currentTarget.value)}
              />
              <label htmlFor="item-password">Password</label>
              <div className="secret-input">
                <input
                  id="item-password"
                  {...invalidProps("item-password")}
                  type={passwordVisible ? "text" : "password"}
                  value={draft.password}
                  maxLength={4_096}
                  autoComplete="new-password"
                  spellCheck={false}
                  autoCapitalize="off"
                  onChange={(event) => field("password", event.currentTarget.value)}
                />
                <button
                  type="button"
                  className="secondary"
                  aria-controls="item-password"
                  aria-pressed={passwordVisible}
                  onClick={togglePasswordVisibility}
                >
                  {passwordVisible ? "Hide password" : "Show password"}
                </button>
              </div>
              <fieldset className="password-generator" aria-busy={generating}>
                <legend>Generate a credential</legend>
                <label className="check-label" htmlFor="generator-mode-password">
                  <input
                    id="generator-mode-password"
                    type="radio"
                    name="generator-mode"
                    checked={generatorMode === "password"}
                    onChange={() => changeGeneratorMode("password")}
                  />
                  Random-character password (recommended for stored credentials)
                </label>
                <label className="check-label" htmlFor="generator-mode-passphrase">
                  <input
                    id="generator-mode-passphrase"
                    type="radio"
                    name="generator-mode"
                    checked={generatorMode === "passphrase"}
                    onChange={() => changeGeneratorMode("passphrase")}
                  />
                  Random-word passphrase
                </label>
                {generatorMode === "password" ? (
                  <>
                    <label htmlFor="password-generator-length">Length</label>
                    <input
                      id="password-generator-length"
                      type="number"
                      min={16}
                      max={128}
                      step={1}
                      value={generatorOptions.length}
                      onChange={(event) =>
                        generatorOption("length", Number(event.currentTarget.value))
                      }
                    />
                    {(
                      [
                        ["lowercase", "Lowercase letters"],
                        ["uppercase", "Uppercase letters"],
                        ["digits", "Digits"],
                        ["symbols", "Symbols"],
                      ] as const
                    ).map(([key, label]) => (
                      <label
                        className="check-label"
                        htmlFor={`password-generator-${key}`}
                        key={key}
                      >
                        <input
                          id={`password-generator-${key}`}
                          type="checkbox"
                          checked={generatorOptions[key]}
                          onChange={(event) => generatorOption(key, event.currentTarget.checked)}
                        />
                        {label}
                      </label>
                    ))}
                    <p className="field-hint">
                      Character classes are allowed sets; each selected class may not appear every
                      time.
                    </p>
                  </>
                ) : (
                  <>
                    <label htmlFor="passphrase-generator-words">Words</label>
                    <input
                      id="passphrase-generator-words"
                      type="number"
                      min={7}
                      max={24}
                      step={1}
                      value={passphraseOptions.words}
                      onChange={(event) => passphraseOption(Number(event.currentTarget.value))}
                    />
                    <p className="field-hint">
                      Eight words provide about 103.4 bits of ideal search space. Passphrases are
                      intended for human entry; they are not stronger than an equivalent random
                      password.
                    </p>
                    <p className="field-hint">{EFF_LONG_WORDLIST_ATTRIBUTION}</p>
                  </>
                )}
                {generationError === undefined ? null : (
                  <p className="error" role="alert">
                    {generationError}
                  </p>
                )}
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => void requestGeneratedSecret()}
                >
                  {generating
                    ? generatorMode === "password"
                      ? "Generate another password"
                      : "Generate another passphrase"
                    : generatorMode === "password"
                      ? "Generate password"
                      : "Generate passphrase"}
                </button>
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
                    {...invalidProps("item-url")}
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
                    {...invalidProps("item-notes")}
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
                {...invalidProps("item-body")}
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
                {...invalidProps("item-totp-secret")}
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
                {...invalidProps("item-totp-period")}
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
                    {...invalidProps("item-totp-issuer")}
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
                    {...invalidProps("item-totp-account")}
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
                {...invalidProps("item-codes")}
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
                    {...invalidProps("item-notes")}
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
                {...invalidProps("item-json")}
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
            <button type="button" className="secondary" disabled={busy} onClick={requestCancel}>
              Cancel editing
            </button>
          </div>
        </fieldset>
      </form>

      {!confirmingCancel ? null : (
        <fieldset className="discard-confirmation" disabled={busy}>
          <legend ref={focusEditorElement} tabIndex={-1}>
            Discard unsaved changes?
          </legend>
          <p>The open item draft will be permanently cleared.</p>
          <div className="editor-actions">
            <button type="button" className="danger" onClick={onCancel}>
              Discard draft
            </button>
            <button type="button" className="secondary" onClick={() => setConfirmingCancel(false)}>
              Keep editing
            </button>
          </div>
        </fieldset>
      )}

      {!editing || onDelete === undefined ? null : confirmingDelete ? (
        <fieldset className="delete-confirmation" disabled={busy}>
          <legend ref={focusEditorElement} tabIndex={-1}>
            Delete “{initial.title}”?
          </legend>
          <p>
            This removes the encrypted local record and discards unsaved changes. This action cannot
            be undone.
          </p>
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
          onClick={() => {
            setPasswordVisible(false);
            setEditorStatus(undefined);
            setConfirmingDelete(true);
          }}
        >
          Delete item
        </button>
      )}
    </article>
  );
}
