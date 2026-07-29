import type { VaultItem } from "@neutron/vault-domain/items";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { type BrowserSupport, detectBrowserSupport } from "./browser-support.js";
import { ItemEditor } from "./item-editor.js";
import type { LocalVaultMetadata } from "./local-vault.js";
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
}: Readonly<{
  onCompute: () => Promise<VaultWorkerTotpCode>;
}>) {
  const compute = useRef(onCompute);
  compute.current = onCompute;
  const [code, setCode] = useState<VaultWorkerTotpCode>();
  const [codeError, setCodeError] = useState<string>();

  useEffect(() => {
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
  }, []);

  return (
    <section className="totp-code" aria-labelledby="totp-code-title">
      <h3 id="totp-code-title">Current verification code</h3>
      {code === undefined ? null : (
        <output
          aria-live="polite"
          data-expires-at={code.expiresAtUnixSeconds}
          data-valid-from={code.validFromUnixSeconds}
        >
          {code.code}
        </output>
      )}
      {code === undefined && codeError === undefined ? <p role="status">Calculating…</p> : null}
      {codeError === undefined ? null : (
        <p className="error" role="alert">
          {codeError}
        </p>
      )}
      <p>Codes refresh automatically. If a code is rejected, check this device’s clock.</p>
    </section>
  );
}

function itemDetails(
  record: VaultWorkerItemRecord,
  onEdit: () => void,
  totpCode?: React.ReactNode,
) {
  const item = record.item;
  return (
    <article className="item-detail" aria-labelledby="item-detail-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{item.type}</p>
          <h2 id="item-detail-title" ref={focusHeading} tabIndex={-1}>
            {item.title}
          </h2>
        </div>
        <button type="button" className="secondary" onClick={onEdit}>
          Edit item
        </button>
      </div>
      {totpCode}
      <dl>
        {Object.entries(item).map(([key, value]) => {
          if (key === "schemaVersion" || key === "type" || key === "title") return null;
          return (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</dd>
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
  const [selected, setSelected] = useState<VaultWorkerItemRecord>();
  const [editor, setEditor] = useState<EditorTarget>();

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

  function resetSecrets(): void {
    setPassword("");
    setPasswordAgain("");
    setRecoveryKit("");
    setRecoveryConfirmation("");
    setMetadata(undefined);
    setPage(undefined);
    setSelected(undefined);
    setEditor(undefined);
  }

  async function loadPage(
    session: LocalVaultMetadata,
    epoch: number,
    cursor?: string,
    active: VaultBroker = currentBroker(),
  ): Promise<void> {
    const vaultId = session.vaults[0]?.id;
    if (vaultId === undefined) throw new Error("missing vault");
    const nextPage = await active.listItemSummaries(vaultId, 24, cursor);
    if (operationEpoch.current === epoch) setPage(nextPage);
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
      if (operationEpoch.current === epoch) setError(errorMessage(cause));
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
      await loadPage(session, epoch);
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
    await run(async (epoch) => {
      const session = await currentBroker().confirmEnrollment(recoveryConfirmation);
      if (operationEpoch.current !== epoch) return;
      setRecoveryKit("");
      setRecoveryConfirmation("");
      setMetadata(session);
      setScreen("unlocked");
      await loadPage(session, epoch);
    });
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
    await run(async (epoch) => {
      const vaultId = metadata.vaults[0]?.id;
      if (vaultId === undefined) throw new Error("missing vault");
      const item = await currentBroker().getItem(vaultId, id);
      if (operationEpoch.current === epoch) {
        setSelected(item);
        setEditor(undefined);
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
    setError(undefined);
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
        setPage(undefined);
        try {
          await loadPage(session, epoch, undefined, active);
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
        setPage(undefined);
        try {
          await loadPage(session, epoch, undefined, active);
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

  return (
    <main className={screen === "unlocked" ? "vault-shell" : "centered-shell"}>
      <header className="brand">
        <img src="/icon.svg" width="44" height="44" alt="" />
        <div>
          <span>Neutron</span>
          <small>Local encrypted vault</small>
        </div>
      </header>
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
          <div className="vault-toolbar">
            <div>
              <p className="eyebrow">Unlocked locally</p>
              <h1 ref={focusHeading} tabIndex={-1}>
                Your vault
              </h1>
            </div>
            <button type="button" className="danger" onClick={() => void lock()}>
              Lock now
            </button>
          </div>
          <div className="vault-grid">
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
                  <span>{page?.items.length ?? 0} shown</span>
                </div>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  ref={(node) => {
                    if (node !== null && focusCreateAfterRender.current) {
                      focusCreateAfterRender.current = false;
                      node.focus();
                    }
                  }}
                  onClick={beginCreate}
                >
                  Create item
                </button>
              </div>
              {page === undefined || page.items.length === 0 ? (
                <p className="empty">No items on this page.</p>
              ) : (
                <ul>
                  {page.items.map((item) => (
                    <li key={item.id}>
                      <button type="button" onClick={() => void openItem(item.id)}>
                        <span>{item.title}</span>
                        <small>{item.type}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {page?.issues.map((issue) => (
                <p className="warning" key={issue.id}>
                  One item could not be authenticated.
                </p>
              ))}
              {page?.nextCursor === undefined ? null : (
                <button
                  className="secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => void run((epoch) => loadPage(metadata, epoch, page.nextCursor))}
                >
                  Next page
                </button>
              )}
            </section>
            <section className="detail-panel" aria-live="polite">
              {editor !== undefined ? (
                <ItemEditor
                  key={
                    editor.kind === "create"
                      ? `create:${editor.identity}`
                      : `edit:${editor.base.id}:${editor.base.generation}:${editor.base.keyVersion}`
                  }
                  busy={busy}
                  {...(editor.kind === "edit" ? { initial: editor.base.item } : {})}
                  onCancel={() => {
                    if (editor.kind === "create") focusCreateAfterRender.current = true;
                    setEditor(undefined);
                    setError(undefined);
                  }}
                  onGeneratePassword={generateEditorPassword}
                  {...(editor.kind === "edit" ? { onDelete: deleteEditorItem } : {})}
                  onSave={saveEditorItem}
                />
              ) : selected === undefined ? (
                <div className="empty-detail">
                  <p className="eyebrow">No item selected</p>
                  <h2>Choose an item to decrypt it</h2>
                  <p>Summaries contain only title, type, and revision metadata.</p>
                </div>
              ) : (
                itemDetails(
                  selected,
                  () => {
                    setEditor({ base: selected, kind: "edit" });
                    setError(undefined);
                  },
                  selected.item.type === "totp" ? (
                    <TotpCodeDisplay
                      key={`${selected.id}:${selected.generation}:${selected.keyVersion}`}
                      onCompute={() => computeSelectedTotp(selected)}
                    />
                  ) : undefined,
                )
              )}
            </section>
          </div>
        </section>
      ) : null}
    </main>
  );
}
