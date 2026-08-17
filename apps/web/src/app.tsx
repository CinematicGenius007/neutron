import type { VaultItem } from "@neutron/vault-domain/items";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { type BrowserSupport, detectBrowserSupport } from "./browser-support.js";
import { ItemEditor } from "./item-editor.js";
import type { LocalVaultMetadata } from "./local-vault.js";
import type { PassphraseGeneratorOptionsV1 } from "./passphrase-generator.js";
import type { PasswordGeneratorOptionsV1 } from "./password-generator.js";
import { isTotpResultFresh } from "./totp.js";
import {
  createVaultWorkerClient,
  type VaultWorkerClient,
  type VaultWorkerItemRecord,
  type VaultWorkerSummaryPage,
  type VaultWorkerTotpCode,
  verifyVaultModuleWorkerSupport,
} from "./vault-worker-client.js";

export interface VaultBroker
  extends Pick<
    VaultWorkerClient,
    | "beginEnrollment"
    | "cancelEnrollment"
    | "confirmEnrollment"
    | "createItem"
    | "deleteItem"
    | "getItem"
    | "isClosed"
    | "listItemSummaries"
    | "lock"
    | "terminate"
    | "unlock"
    | "updateItem"
  > {}

export interface VaultBroker {
  readonly computeTotp?: (
    vaultId: string,
    record: VaultWorkerItemRecord,
  ) => Promise<VaultWorkerTotpCode>;
  readonly generatePassphrase?: (options: PassphraseGeneratorOptionsV1) => Promise<string>;
  readonly generatePassword?: (options: PasswordGeneratorOptionsV1) => Promise<string>;
}

export interface VaultAppProps {
  readonly createBroker?: () => VaultBroker;
  readonly probeModuleWorker?: () => Promise<boolean>;
  readonly support?: BrowserSupport;
}

type Screen = "locked" | "enroll" | "confirm-recovery" | "unlocked";
type EditorTarget =
  | Readonly<{ identity: number; kind: "create" }>
  | Readonly<{ base: VaultWorkerItemRecord; kind: "edit" }>;
type NavigationIntent = Readonly<{ kind: "create" }> | Readonly<{ id: string; kind: "item" }>;

const genericErrors: Readonly<Record<string, string>> = Object.freeze({
  "already-initialized": "A vault already exists in this browser.",
  "confirmation-failed": "The recovery kit did not match. Enrollment was cancelled.",
  conflict: "The item changed elsewhere.",
  "corrupt-item": "This item could not be authenticated.",
  "corrupt-state": "The local vault could not be authenticated.",
  "enrollment-state": "That enrollment step is no longer available.",
  "invalid-password-input": "Use a valid password between 1 and 1,024 UTF-8 bytes.",
  "item-limit": "The local vault has reached its current item limit.",
  locked: "The vault is locked.",
  "not-initialized": "No local vault exists yet. Create one first.",
  "unlock-failed": "The password is incorrect or the vault cannot be unlocked.",
});

function safeMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  return typeof code === "string" && genericErrors[code] !== undefined
    ? (genericErrors[code] as string)
    : "The operation could not be completed.";
}

function TotpCodeDisplay({
  onCompute,
  onError,
}: Readonly<{
  onCompute: () => Promise<VaultWorkerTotpCode>;
  onError: () => void;
}>) {
  const compute = useRef(onCompute);
  compute.current = onCompute;
  const privacyReset = useRef(onError);
  privacyReset.current = onError;
  const [code, setCode] = useState<VaultWorkerTotpCode>();
  const [codeError, setCodeError] = useState<string>();
  const [retryEpoch, setRetryEpoch] = useState(0);

  useEffect(() => {
    void retryEpoch;
    const freshnessWatchdogMilliseconds = 1_000;
    let active = true;
    let expiryRetries = 0;
    let pending = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    function clearTimeoutIfPresent(): void {
      if (timeout !== undefined) clearTimeout(timeout);
      timeout = undefined;
    }

    function watchFreshness(current: VaultWorkerTotpCode): void {
      const remainingMilliseconds = Number(current.expiresAtUnixSeconds) * 1_000 - Date.now();
      timeout = setTimeout(
        () => {
          if (!active) return;
          if (!isTotpResultFresh(current, Date.now())) {
            setCode(undefined);
            void refresh();
            return;
          }
          watchFreshness(current);
        },
        Math.max(0, Math.min(freshnessWatchdogMilliseconds, remainingMilliseconds)),
      );
    }

    async function refresh(): Promise<void> {
      if (!active || pending) return;
      pending = true;
      clearTimeoutIfPresent();
      setCode(undefined);
      setCodeError(undefined);
      let retryExpired = false;
      try {
        const next = await compute.current();
        if (!active) return;
        if (!isTotpResultFresh(next, Date.now())) {
          if (expiryRetries < 1) {
            expiryRetries += 1;
            retryExpired = true;
          } else {
            privacyReset.current();
            setCodeError("The current TOTP code could not be calculated.");
          }
          return;
        }
        expiryRetries = 0;
        setCode(next);
        watchFreshness(next);
      } catch (cause) {
        if (!active) return;
        const code =
          typeof cause === "object" && cause !== null && "code" in cause
            ? (cause as { code?: unknown }).code
            : undefined;
        if (code === "expired-result" && expiryRetries < 1) {
          expiryRetries += 1;
          retryExpired = true;
          return;
        }
        const value = safeMessage(cause);
        privacyReset.current();
        setCodeError(
          value === genericErrors.conflict
            ? "This TOTP item changed. Reopen it to calculate a current code."
            : "The current TOTP code could not be calculated.",
        );
      } finally {
        pending = false;
        if (active && retryExpired) void refresh();
      }
    }

    function revalidate(): void {
      if (!active || pending) return;
      setCode(undefined);
      void refresh();
    }

    function visibilityChanged(): void {
      if (document.visibilityState === "visible") revalidate();
    }

    globalThis.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", visibilityChanged);
    void refresh();
    return () => {
      active = false;
      clearTimeoutIfPresent();
      globalThis.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [retryEpoch]);

  return (
    <section className="totp-code" aria-labelledby="totp-code-title">
      <h3 id="totp-code-title">Current verification code</h3>
      {code === undefined ? null : (
        <>
          <span
            className="totp-value"
            data-expires-at={code.expiresAtUnixSeconds}
            data-valid-from={code.validFromUnixSeconds}
          >
            {code.code}
          </span>
          <p className="visually-hidden" role="status">
            Current TOTP code ready.
          </p>
        </>
      )}
      {code === undefined && codeError === undefined ? <p role="status">Calculating…</p> : null}
      {codeError === undefined ? null : (
        <>
          <p className="error" role="alert">
            {codeError}
          </p>
          <button
            type="button"
            className="secondary"
            onClick={() => setRetryEpoch((value) => value + 1)}
          >
            Try calculating again
          </button>
        </>
      )}
      <p>Codes refresh automatically. If a code is rejected, check this device’s clock.</p>
    </section>
  );
}

const detailLabels: Readonly<Record<string, string>> = Object.freeze({
  accountName: "Account name",
  algorithm: "Algorithm",
  body: "Secure note",
  codes: "Backup codes",
  digits: "Digits",
  issuer: "Issuer",
  keyVersion: "Key version",
  notes: "Notes",
  password: "Password",
  period: "Period",
  secretBase32: "TOTP secret",
  tags: "Tags",
  url: "URL",
  username: "Username",
  value: "JSON value",
});

const itemTypeLabels: Readonly<Record<VaultItem["type"], string>> = Object.freeze({
  "backup-code": "Backup codes",
  json: "JSON",
  login: "Login",
  "secure-note": "Secure note",
  totp: "TOTP",
});

// Decorative row anchors derived from the visible type label; they add no
// information and are hidden from assistive technology.
const itemTypeMonograms: Readonly<Record<VaultItem["type"], string>> = Object.freeze({
  "backup-code": "BC",
  json: "{}",
  login: "LG",
  "secure-note": "SN",
  totp: "2FA",
});

function detailLabel(key: string): string {
  return detailLabels[key] ?? key;
}

function isSecretDetailField(item: VaultItem, key: string): boolean {
  switch (item.type) {
    case "login":
      return key === "password" || key === "notes";
    case "secure-note":
      return key === "body";
    case "totp":
      return key === "secretBase32";
    case "backup-code":
      return key === "codes" || key === "notes";
    case "json":
      return key === "value";
  }
}

function detailValue(value: unknown): string {
  if (typeof value === "string") return value;
  // Tags and backup codes are string arrays; showing them as JSON literals makes
  // an ordinary list read like raw data. Every other value keeps JSON form.
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string"))
    return value.join("\n");
  return JSON.stringify(value, null, 2) ?? "";
}

// An absent optional list carries no information, so it is omitted rather than
// rendered as an empty literal.
function isEmptyDetailField(value: unknown): boolean {
  return Array.isArray(value) && value.length === 0;
}

function ItemDetails({
  computeTotp,
  onEdit,
  record,
}: Readonly<{
  computeTotp?: () => Promise<VaultWorkerTotpCode>;
  onEdit: () => void;
  record: VaultWorkerItemRecord;
}>) {
  const item = record.item;
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(() => new Set());
  const [revealStatus, setRevealStatus] = useState<string>();

  function toggleSecret(key: string): void {
    const next = new Set(revealed);
    const label = detailLabel(key);
    if (next.has(key)) {
      next.delete(key);
      setRevealStatus(`${label} hidden.`);
    } else {
      next.add(key);
      setRevealStatus(`${label} shown.`);
    }
    setRevealed(next);
  }

  function resetRevealedSecrets(): void {
    setRevealed(new Set());
    setRevealStatus(undefined);
  }

  return (
    <article className="item-detail" aria-labelledby="item-detail-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{itemTypeLabels[item.type]}</p>
          <h2 id="item-detail-title" ref={focusHeading} tabIndex={-1}>
            {item.title}
          </h2>
        </div>
        <button type="button" className="secondary" onClick={onEdit}>
          Edit item
        </button>
      </div>
      {computeTotp === undefined ? null : (
        <TotpCodeDisplay onCompute={computeTotp} onError={resetRevealedSecrets} />
      )}
      {revealStatus === undefined ? null : (
        <p className="visually-hidden" role="status">
          {revealStatus}
        </p>
      )}
      <dl>
        {Object.entries(item).map(([key, value]) => {
          if (key === "schemaVersion" || key === "type" || key === "title") return null;
          if (isEmptyDetailField(value)) return null;
          const secret = isSecretDetailField(item, key);
          const visible = !secret || revealed.has(key);
          const label = detailLabel(key);
          return (
            <div key={key}>
              <dt>{label}</dt>
              <dd>
                {visible ? (
                  <span
                    className="secret-value"
                    {...(secret ? { id: `detail-secret-${key}` } : {})}
                  >
                    {detailValue(value)}
                  </span>
                ) : null}
                {secret ? (
                  <button
                    type="button"
                    className="secondary secret-toggle"
                    aria-expanded={visible}
                    onClick={() => toggleSecret(key)}
                  >
                    {visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
                  </button>
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="revision">
        Revision {record.generation} · key version {record.keyVersion}
      </p>
    </article>
  );
}

function focusHeading(node: HTMLHeadingElement | null): void {
  node?.focus();
}

export function VaultApp({
  createBroker = createVaultWorkerClient,
  probeModuleWorker = verifyVaultModuleWorkerSupport,
  support,
}: VaultAppProps) {
  const broker = useRef<VaultBroker | undefined>(undefined);
  const focusCreateAfterRender = useRef(false);
  const focusItemsAfterRender = useRef(false);
  const nextEditorIdentity = useRef(1);
  const operationEpoch = useRef(0);
  const operationInFlight = useRef(false);
  const [checkedSupport, setCheckedSupport] = useState<BrowserSupport | undefined>(support);
  const [screen, setScreen] = useState<Screen>("locked");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");
  const [recoveryKit, setRecoveryKit] = useState("");
  const [recoveryConfirmation, setRecoveryConfirmation] = useState("");
  const [metadata, setMetadata] = useState<LocalVaultMetadata>();
  const [page, setPage] = useState<VaultWorkerSummaryPage>();
  const [pageCursorHistory, setPageCursorHistory] = useState<readonly string[]>([]);
  const [pageLoadFailed, setPageLoadFailed] = useState(false);
  const [selected, setSelected] = useState<VaultWorkerItemRecord>();
  const [editor, setEditor] = useState<EditorTarget>();
  const [editorDirty, setEditorDirty] = useState(false);
  const [navigationIntent, setNavigationIntent] = useState<NavigationIntent>();
  const [operationStatus, setOperationStatus] =
    useState<
      Readonly<{
        id: number;
        message: string;
      }>
    >();
  const [privacyEpoch, setPrivacyEpoch] = useState(0);
  const nextStatusId = useRef(1);

  useEffect(() => {
    if (support !== undefined) {
      setCheckedSupport(support);
      return;
    }
    const detected = detectBrowserSupport();
    if (!detected.supported) {
      setCheckedSupport(detected);
      return;
    }
    let cancelled = false;
    void probeModuleWorker().then(
      (moduleWorkerSupported) => {
        if (cancelled) return;
        setCheckedSupport(
          moduleWorkerSupported
            ? detected
            : Object.freeze({
                missing: Object.freeze(["module workers"]),
                supported: false,
              }),
        );
      },
      () => {
        if (!cancelled)
          setCheckedSupport(
            Object.freeze({
              missing: Object.freeze(["module workers"]),
              supported: false,
            }),
          );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [probeModuleWorker, support]);

  function currentBroker(): VaultBroker {
    if (broker.current === undefined || broker.current.isClosed) broker.current = createBroker();
    return broker.current;
  }

  function announce(message: string): void {
    const id = nextStatusId.current;
    nextStatusId.current += 1;
    setOperationStatus({ id, message });
  }

  function resetDetailPrivacy(): void {
    setPrivacyEpoch((value) => value + 1);
  }

  function resetSecrets(): void {
    setPassword("");
    setPasswordAgain("");
    setRecoveryKit("");
    setRecoveryConfirmation("");
    setMetadata(undefined);
    setPage(undefined);
    setPageCursorHistory([]);
    setPageLoadFailed(false);
    setSelected(undefined);
    setEditor(undefined);
    setEditorDirty(false);
    setNavigationIntent(undefined);
    setOperationStatus(undefined);
    resetDetailPrivacy();
  }

  async function loadPage(
    session: LocalVaultMetadata,
    epoch: number,
    cursor?: string,
    active: VaultBroker = currentBroker(),
  ): Promise<void> {
    const vaultId = session.vaults[0]?.id;
    if (vaultId === undefined) throw new Error("missing vault");
    if (operationEpoch.current === epoch) setPageLoadFailed(false);
    try {
      const nextPage = await active.listItemSummaries(vaultId, 24, cursor);
      if (operationEpoch.current === epoch) setPage(nextPage);
    } catch (cause) {
      if (operationEpoch.current === epoch) setPageLoadFailed(true);
      throw cause;
    }
  }

  async function run(
    action: (epoch: number) => Promise<void>,
    errorMessage: (cause: unknown) => string = safeMessage,
  ): Promise<void> {
    if (operationInFlight.current) return;
    const epoch = operationEpoch.current;
    operationInFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await action(epoch);
    } catch (cause) {
      if (operationEpoch.current === epoch) {
        resetDetailPrivacy();
        setError(errorMessage(cause));
      }
    } finally {
      if (operationEpoch.current === epoch) {
        operationInFlight.current = false;
        setBusy(false);
      }
    }
  }

  async function unlock(event: FormEvent): Promise<void> {
    event.preventDefault();
    await run(async (epoch) => {
      const session = await currentBroker().unlock(password);
      if (operationEpoch.current !== epoch) return;
      setPassword("");
      setMetadata(session);
      setScreen("unlocked");
      announce("Loading items…");
      await loadPage(session, epoch);
      if (operationEpoch.current === epoch) announce("Page 1 loaded.");
    });
    setPassword("");
  }

  async function beginEnrollment(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (password !== passwordAgain) {
      setError("The passwords do not match.");
      return;
    }
    await run(async (epoch) => {
      const kit = await currentBroker().beginEnrollment(password);
      if (operationEpoch.current !== epoch) return;
      setRecoveryKit(kit);
      setScreen("confirm-recovery");
    });
    setPassword("");
    setPasswordAgain("");
  }

  async function confirmRecovery(event: FormEvent): Promise<void> {
    event.preventDefault();
    await run(
      async (epoch) => {
        const session = await currentBroker().confirmEnrollment(recoveryConfirmation);
        if (operationEpoch.current !== epoch) return;
        setRecoveryKit("");
        setRecoveryConfirmation("");
        setMetadata(session);
        setScreen("unlocked");
        announce("Loading items…");
        await loadPage(session, epoch);
        if (operationEpoch.current === epoch) announce("Page 1 loaded.");
      },
      (cause) => {
        const message = safeMessage(cause);
        if (message !== genericErrors["confirmation-failed"]) return message;
        broker.current?.terminate();
        broker.current = undefined;
        resetSecrets();
        setScreen("enroll");
        return "The recovery kit did not match. Enrollment was cancelled. Choose a master password to start again.";
      },
    );
  }

  async function cancelEnrollment(): Promise<void> {
    const active = broker.current;
    operationEpoch.current += 1;
    operationInFlight.current = false;
    resetSecrets();
    setBusy(false);
    setScreen("locked");
    if (active !== undefined) {
      try {
        await active.cancelEnrollment();
      } finally {
        active.terminate();
        broker.current = undefined;
      }
    }
  }

  async function lock(): Promise<void> {
    const active = broker.current;
    operationEpoch.current += 1;
    operationInFlight.current = false;
    resetSecrets();
    setBusy(false);
    setError(undefined);
    setScreen("locked");
    broker.current = undefined;
    if (active !== undefined) {
      try {
        await active.lock();
      } catch {
        active.terminate();
      }
    }
  }

  async function openItem(id: string): Promise<void> {
    if (metadata === undefined) return;
    announce("Opening item…");
    await run(async (epoch) => {
      const vaultId = metadata.vaults[0]?.id;
      if (vaultId === undefined) throw new Error("missing vault");
      const item = await currentBroker().getItem(vaultId, id);
      if (operationEpoch.current === epoch) {
        setSelected(item);
        setEditor(undefined);
        setEditorDirty(false);
        resetDetailPrivacy();
        announce("Item opened.");
      }
    });
  }

  function vaultId(session: LocalVaultMetadata): string {
    const id = session.vaults[0]?.id;
    if (id === undefined) throw new Error("missing vault");
    return id;
  }

  function beginCreate(): void {
    const identity = nextEditorIdentity.current;
    nextEditorIdentity.current += 1;
    setSelected(undefined);
    setEditor({ identity, kind: "create" });
    setEditorDirty(false);
    setNavigationIntent(undefined);
    resetDetailPrivacy();
    setError(undefined);
  }

  function performNavigation(intent: NavigationIntent): void {
    setNavigationIntent(undefined);
    setEditorDirty(false);
    if (intent.kind === "create") beginCreate();
    else {
      setEditor(undefined);
      setSelected(undefined);
      resetDetailPrivacy();
      void openItem(intent.id);
    }
  }

  function requestNavigation(intent: NavigationIntent): void {
    if (editor !== undefined && editorDirty) {
      setNavigationIntent(intent);
      return;
    }
    performNavigation(intent);
  }

  function cancelEditor(): void {
    if (editor?.kind === "create") focusCreateAfterRender.current = true;
    setEditor(undefined);
    setEditorDirty(false);
    setNavigationIntent(undefined);
    resetDetailPrivacy();
    setError(undefined);
  }

  function returnToItems(): void {
    focusItemsAfterRender.current = true;
    setSelected(undefined);
    setNavigationIntent(undefined);
    resetDetailPrivacy();
    setError(undefined);
    announce("Item closed. Items ready.");
  }

  function retryCurrentPage(): void {
    const session = metadata;
    if (session === undefined) return;
    const cursor = pageCursorHistory.at(-1);
    setPage(undefined);
    setPageLoadFailed(false);
    announce("Loading items…");
    void run(async (epoch) => {
      await loadPage(session, epoch, cursor);
      if (operationEpoch.current === epoch)
        announce(`Page ${pageCursorHistory.length + 1} loaded.`);
    });
  }

  function navigatePage(direction: "next" | "previous"): void {
    const session = metadata;
    if (session === undefined || page === undefined) return;
    const nextHistory =
      direction === "next"
        ? page.nextCursor === undefined
          ? undefined
          : [...pageCursorHistory, page.nextCursor]
        : pageCursorHistory.slice(0, -1);
    if (nextHistory === undefined) return;
    const cursor = nextHistory.at(-1);
    setPage(undefined);
    setPageCursorHistory(nextHistory);
    setPageLoadFailed(false);
    announce("Loading items…");
    void run(async (epoch) => {
      await loadPage(session, epoch, cursor);
      if (operationEpoch.current !== epoch) return;
      announce(`Page ${nextHistory.length + 1} loaded.`);
    });
  }

  function saveEditorItem(item: VaultItem): void {
    const target = editor;
    const session = metadata;
    if (target === undefined || session === undefined) return;
    if (target.kind === "edit" && target.base.item.type !== item.type) {
      setError("The operation could not be completed.");
      return;
    }
    void run(
      async (epoch) => {
        const active = currentBroker();
        const id = vaultId(session);
        const revision =
          target.kind === "create"
            ? await active.createItem(id, item)
            : await active.updateItem(
                id,
                target.base.id,
                target.base.generation,
                target.base.keyVersion,
                item,
              );
        if (operationEpoch.current !== epoch) return;
        setSelected({ ...revision, item });
        setEditor(undefined);
        setEditorDirty(false);
        setNavigationIntent(undefined);
        setPage(undefined);
        setPageCursorHistory([]);
        setPageLoadFailed(false);
        announce("Item saved. Refreshing the item list…");
        try {
          await loadPage(session, epoch, undefined, active);
          if (operationEpoch.current === epoch) announce("Item saved. Page 1 loaded.");
        } catch {
          if (operationEpoch.current === epoch)
            setError("The item was saved, but the item list could not refresh.");
        }
      },
      (cause) =>
        safeMessage(cause) === genericErrors.conflict
          ? "The item changed elsewhere. Your draft was not saved."
          : safeMessage(cause),
    );
  }

  async function generateEditorPassword(options: PasswordGeneratorOptionsV1): Promise<string> {
    const active = currentBroker();
    const generate = active.generatePassword;
    if (generate === undefined) throw new Error("generator unavailable");
    return generate.call(active, options);
  }

  async function generateEditorPassphrase(options: PassphraseGeneratorOptionsV1): Promise<string> {
    const active = currentBroker();
    const generate = active.generatePassphrase;
    if (generate === undefined) throw new Error("generator unavailable");
    return generate.call(active, options);
  }

  async function computeSelectedTotp(record: VaultWorkerItemRecord): Promise<VaultWorkerTotpCode> {
    const session = metadata;
    const active = currentBroker();
    const compute = active.computeTotp;
    if (session === undefined || compute === undefined) throw new Error("TOTP unavailable");
    return compute.call(active, vaultId(session), record);
  }

  function deleteEditorItem(): void {
    const target = editor;
    const session = metadata;
    if (target?.kind !== "edit" || session === undefined) return;
    void run(
      async (epoch) => {
        const active = currentBroker();
        await active.deleteItem(
          vaultId(session),
          target.base.id,
          target.base.generation,
          target.base.keyVersion,
        );
        if (operationEpoch.current !== epoch) return;
        focusItemsAfterRender.current = true;
        setSelected(undefined);
        setEditor(undefined);
        setEditorDirty(false);
        setNavigationIntent(undefined);
        setPage(undefined);
        setPageCursorHistory([]);
        setPageLoadFailed(false);
        announce("Item deleted. Refreshing the item list…");
        try {
          await loadPage(session, epoch, undefined, active);
          if (operationEpoch.current === epoch) announce("Item deleted. Page 1 loaded.");
        } catch {
          if (operationEpoch.current === epoch)
            setError("The item was deleted, but the item list could not refresh.");
        }
      },
      (cause) =>
        safeMessage(cause) === genericErrors.conflict
          ? "The item changed elsewhere. It was not deleted."
          : safeMessage(cause),
    );
  }

  if (checkedSupport === undefined) {
    return (
      <main className="centered-shell" aria-busy="true">
        <section className="card" aria-labelledby="checking-title">
          <p className="eyebrow">Browser check</p>
          <h1 id="checking-title" ref={focusHeading} tabIndex={-1}>
            Verifying local security support…
          </h1>
          <p>Password entry stays unavailable until the module worker check succeeds.</p>
        </section>
      </main>
    );
  }

  if (!checkedSupport.supported) {
    return (
      <main className="centered-shell">
        <section className="card" aria-labelledby="unsupported-title">
          <p className="eyebrow">Unsupported browser</p>
          <h1 id="unsupported-title" ref={focusHeading} tabIndex={-1}>
            Neutron cannot open safely here
          </h1>
          <p>This browser is missing required local security capabilities:</p>
          <ul>
            {checkedSupport.missing.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
          <p>Nothing has been sent or stored.</p>
        </section>
      </main>
    );
  }

  const isFirstUseEmptyPage =
    page !== undefined &&
    page.items.length === 0 &&
    page.issues.length === 0 &&
    pageCursorHistory.length === 0 &&
    page.nextCursor === undefined;

  return (
    <main className={screen === "unlocked" ? "vault-shell" : "centered-shell"}>
      {/* One persistent application header. When the vault is unlocked it also
          carries the vault title, the session indicator, and the lock control,
          so those never scroll away from the person using them. */}
      <div className="app-header">
        <div className="app-bar">
          <header className="brand">
            <img src="/icon.svg" width="28" height="28" alt="" />
            <div>
              <span>Neutron</span>
              <small>Local encrypted vault</small>
            </div>
          </header>
          {screen === "unlocked" && metadata !== undefined ? (
            <div className="app-bar-session">
              <h1 className="app-bar-title" ref={focusHeading} tabIndex={-1}>
                Your vault
              </h1>
              <p className="eyebrow session-state">
                <span aria-hidden="true" /> Unlocked on this device
              </p>
              <div className="lock-action">
                <button
                  type="button"
                  className="secondary"
                  aria-describedby="lock-warning"
                  onClick={() => void lock()}
                >
                  Lock now
                </button>
                <p id="lock-warning">Locks immediately and discards unsaved changes.</p>
              </div>
            </div>
          ) : null}
        </div>
        <aside className="safety-notice" aria-label="Development safety warning">
          <span className="safety-mark" aria-hidden="true">
            !
          </span>
          <span>
            <strong>Development build — synthetic test data only.</strong> Neutron has not passed
            its Stage 5 security review. Do not store real credentials.
          </span>
        </aside>
      </div>
      {operationStatus === undefined ? null : (
        <p className="visually-hidden" role="status" key={operationStatus.id}>
          {operationStatus.message}
        </p>
      )}
      {error === undefined ? null : (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {screen === "locked" ? (
        <section className="card auth-card" aria-labelledby="unlock-title">
          <p className="eyebrow">Locked by default</p>
          <h1 id="unlock-title" ref={focusHeading} tabIndex={-1}>
            Welcome back
          </h1>
          <p>Your password stays in this browser and is used only by the isolated vault worker.</p>
          <form onSubmit={(event) => void unlock(event)}>
            <label htmlFor="unlock-password">Master password</label>
            <input
              id="unlock-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              required
            />
            <button type="submit" disabled={busy}>
              {busy ? "Unlocking…" : "Unlock vault"}
            </button>
          </form>
          <button
            className="secondary"
            type="button"
            disabled={busy}
            onClick={() => {
              setError(undefined);
              setScreen("enroll");
            }}
          >
            Create a local vault
          </button>
        </section>
      ) : null}

      {screen === "enroll" ? (
        <section className="card auth-card" aria-labelledby="enroll-title">
          <p className="eyebrow">New local vault</p>
          <h1 id="enroll-title" ref={focusHeading} tabIndex={-1}>
            Choose a master password
          </h1>
          <p>There is no password reset. Your recovery kit is the offline recovery path.</p>
          <form onSubmit={(event) => void beginEnrollment(event)}>
            <label htmlFor="new-password">Master password</label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              required
            />
            <label htmlFor="new-password-again">Confirm password</label>
            <input
              id="new-password-again"
              type="password"
              autoComplete="new-password"
              value={passwordAgain}
              onChange={(event) => setPasswordAgain(event.currentTarget.value)}
              required
            />
            <button type="submit" disabled={busy}>
              {busy ? "Preparing…" : "Continue"}
            </button>
          </form>
          <button
            className="secondary"
            type="button"
            disabled={busy}
            onClick={() => {
              resetSecrets();
              setError(undefined);
              setScreen("locked");
            }}
          >
            Back
          </button>
        </section>
      ) : null}

      {screen === "confirm-recovery" ? (
        <section className="card recovery-card" aria-labelledby="recovery-title">
          <p className="eyebrow">Recovery checkpoint</p>
          <h1 id="recovery-title" ref={focusHeading} tabIndex={-1}>
            Save this recovery kit offline
          </h1>
          <p>Enrollment is not stored until you re-enter this exact kit.</p>
          <output className="recovery-kit" aria-label="Recovery kit">
            {recoveryKit}
          </output>
          <form onSubmit={(event) => void confirmRecovery(event)}>
            <label htmlFor="recovery-confirmation">Re-enter recovery kit</label>
            <textarea
              id="recovery-confirmation"
              autoComplete="off"
              spellCheck={false}
              value={recoveryConfirmation}
              onChange={(event) => setRecoveryConfirmation(event.currentTarget.value)}
              required
            />
            <button type="submit" disabled={busy}>
              {busy ? "Confirming…" : "Confirm and create vault"}
            </button>
          </form>
          <button
            className="danger secondary"
            type="button"
            disabled={busy}
            onClick={() => void cancelEnrollment()}
          >
            Cancel enrollment
          </button>
        </section>
      ) : null}

      {screen === "unlocked" && metadata !== undefined ? (
        <section className="workspace" aria-label="Unlocked vault">
          <div
            className="vault-grid"
            data-active-pane={editor !== undefined || selected !== undefined ? "detail" : "list"}
          >
            <section className="item-list" aria-labelledby="items-title">
              <div className="section-heading">
                <div>
                  <h2
                    id="items-title"
                    ref={(node) => {
                      if (node !== null && focusItemsAfterRender.current) {
                        focusItemsAfterRender.current = false;
                        node.focus();
                      }
                    }}
                    tabIndex={-1}
                  >
                    Items
                  </h2>
                  {isFirstUseEmptyPage ? null : (
                    <span>
                      Page {pageCursorHistory.length + 1}
                      {page !== undefined
                        ? ` · ${page.items.length} shown`
                        : pageLoadFailed
                          ? " · unavailable"
                          : " · loading"}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className={isFirstUseEmptyPage ? "secondary compact-primary" : "secondary"}
                  disabled={busy}
                  ref={(node) => {
                    if (node !== null && focusCreateAfterRender.current) {
                      focusCreateAfterRender.current = false;
                      node.focus();
                    }
                  }}
                  onClick={() => requestNavigation({ kind: "create" })}
                >
                  Create item
                </button>
              </div>
              {page === undefined && busy ? <p role="status">Loading items…</p> : null}
              {!busy && pageLoadFailed ? (
                <div className="warning" role="alert">
                  <p>The item list could not be loaded.</p>
                  <button type="button" className="secondary" onClick={retryCurrentPage}>
                    Retry current page
                  </button>
                </div>
              ) : null}
              {page !== undefined && page.items.length === 0 ? (
                <div className="empty item-list-empty">
                  <p>
                    {isFirstUseEmptyPage
                      ? "Your vault has no items yet."
                      : "No items on this page."}
                  </p>
                  {/* The actionable first-use guidance lives once, in the detail
                      pane. At compact widths the promoted list action above
                      carries it instead. */}
                </div>
              ) : page === undefined ? null : (
                <ul>
                  {page.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        disabled={busy}
                        aria-current={selected?.id === item.id ? "true" : undefined}
                        onClick={() => requestNavigation({ id: item.id, kind: "item" })}
                      >
                        <span className="item-row-mark" aria-hidden="true">
                          {itemTypeMonograms[item.type]}
                        </span>
                        <span className="item-row-content">
                          <span className="item-row-title">{item.title}</span>
                          <small>{itemTypeLabels[item.type]}</small>
                        </span>
                        <span className="item-row-cue" aria-hidden="true">
                          ›
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {page === undefined || page.issues.length === 0 ? null : (
                <div className="warning corrupt-records" role="alert">
                  <p>
                    {page.issues.length} encrypted{" "}
                    {page.issues.length === 1 ? "record was" : "records were"}
                    {" skipped because authentication failed. "}
                    {page.issues.length === 1 ? "It was" : "They were"} not modified.
                  </p>
                  <ul>
                    {page.issues.map((issue) => (
                      <li key={issue.id}>Record {issue.id}</li>
                    ))}
                  </ul>
                  <p>
                    Retry this page. If the warning persists, lock the vault and stop using this
                    local copy.
                  </p>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={retryCurrentPage}
                  >
                    Retry current page
                  </button>
                </div>
              )}
              {page === undefined ||
              (pageCursorHistory.length === 0 && page.nextCursor === undefined) ? null : (
                <nav className="pagination" aria-label="Item pages">
                  <button
                    className="secondary"
                    type="button"
                    disabled={busy || pageCursorHistory.length === 0}
                    onClick={() => navigatePage("previous")}
                  >
                    Previous page
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    disabled={busy || page.nextCursor === undefined}
                    onClick={() => navigatePage("next")}
                  >
                    Next page
                  </button>
                </nav>
              )}
            </section>
            <section className="detail-panel">
              {navigationIntent === undefined ? null : (
                <fieldset className="discard-confirmation" disabled={busy}>
                  <legend ref={focusHeading} tabIndex={-1}>
                    Discard unsaved changes?
                  </legend>
                  <p>Continuing will permanently clear the open item draft.</p>
                  <div className="editor-actions">
                    <button
                      type="button"
                      className="danger"
                      onClick={() => performNavigation(navigationIntent)}
                    >
                      Discard and continue
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setNavigationIntent(undefined)}
                    >
                      Keep editing
                    </button>
                  </div>
                </fieldset>
              )}
              {editor !== undefined ? (
                <ItemEditor
                  key={
                    editor.kind === "create"
                      ? `create:${editor.identity}`
                      : `edit:${editor.base.id}:${editor.base.generation}:${editor.base.keyVersion}`
                  }
                  busy={busy}
                  {...(editor.kind === "edit" ? { initial: editor.base.item } : {})}
                  onCancel={cancelEditor}
                  onDirtyChange={setEditorDirty}
                  onGeneratePassphrase={generateEditorPassphrase}
                  onGeneratePassword={generateEditorPassword}
                  privacyEpoch={privacyEpoch}
                  {...(editor.kind === "edit" ? { onDelete: deleteEditorItem } : {})}
                  onSave={saveEditorItem}
                />
              ) : selected === undefined ? (
                <div className="empty-detail">
                  {isFirstUseEmptyPage ? (
                    <>
                      <p className="empty-mark" aria-hidden="true">
                        +
                      </p>
                      <p className="eyebrow">Empty vault</p>
                      <h2>Create your first encrypted item</h2>
                      <p>
                        Store a login, secure note, TOTP seed, backup code, or JSON item. The item
                        type, title, and every field are encrypted before storage.
                      </p>
                      <button type="button" onClick={() => requestNavigation({ kind: "create" })}>
                        Create your first item
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="eyebrow">No item selected</p>
                      <h2>Choose an item to decrypt it</h2>
                      <p>Summaries contain only title, type, and revision metadata.</p>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <button type="button" className="secondary compact-back" onClick={returnToItems}>
                    Back to items
                  </button>
                  <ItemDetails
                    key={`${selected.id}:${selected.generation}:${selected.keyVersion}:${privacyEpoch}`}
                    record={selected}
                    onEdit={() => {
                      setEditor({ base: selected, kind: "edit" });
                      setEditorDirty(false);
                      resetDetailPrivacy();
                      setError(undefined);
                    }}
                    {...(selected.item.type === "totp"
                      ? {
                          computeTotp: () => computeSelectedTotp(selected),
                        }
                      : {})}
                  />
                </>
              )}
            </section>
          </div>
        </section>
      ) : null}
    </main>
  );
}
