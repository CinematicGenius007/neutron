import type { FormEvent } from "react";
import { useRef, useState } from "react";
import { type BrowserSupport, detectBrowserSupport } from "./browser-support.js";
import type { LocalVaultMetadata } from "./local-vault.js";
import {
  createVaultWorkerClient,
  type VaultWorkerClient,
  type VaultWorkerItemRecord,
  type VaultWorkerSummaryPage,
} from "./vault-worker-client.js";

export interface VaultBroker
  extends Pick<
    VaultWorkerClient,
    | "beginEnrollment"
    | "cancelEnrollment"
    | "confirmEnrollment"
    | "getItem"
    | "isClosed"
    | "listItemSummaries"
    | "lock"
    | "terminate"
    | "unlock"
  > {}

export interface VaultAppProps {
  readonly createBroker?: () => VaultBroker;
  readonly support?: BrowserSupport;
}

type Screen = "locked" | "enroll" | "confirm-recovery" | "unlocked";

const genericErrors: Readonly<Record<string, string>> = Object.freeze({
  "already-initialized": "A vault already exists in this browser.",
  "confirmation-failed": "The recovery kit did not match. Enrollment was cancelled.",
  conflict: "The item changed elsewhere. Lock and try again.",
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

function itemDetails(record: VaultWorkerItemRecord) {
  const item = record.item;
  return (
    <article className="item-detail" aria-labelledby="item-detail-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{item.type}</p>
          <h2 id="item-detail-title">{item.title}</h2>
        </div>
      </div>
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

export function VaultApp({
  createBroker = createVaultWorkerClient,
  support = detectBrowserSupport(),
}: VaultAppProps) {
  const broker = useRef<VaultBroker | undefined>(undefined);
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
  }

  async function loadPage(session: LocalVaultMetadata, cursor?: string): Promise<void> {
    const vaultId = session.vaults[0]?.id;
    if (vaultId === undefined) throw new Error("missing vault");
    setPage(await currentBroker().listItemSummaries(vaultId, 24, cursor));
  }

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (cause) {
      setError(safeMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function unlock(event: FormEvent): Promise<void> {
    event.preventDefault();
    await run(async () => {
      const session = await currentBroker().unlock(password);
      setPassword("");
      setMetadata(session);
      setScreen("unlocked");
      await loadPage(session);
    });
    setPassword("");
  }

  async function beginEnrollment(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (password !== passwordAgain) {
      setError("The passwords do not match.");
      return;
    }
    await run(async () => {
      const kit = await currentBroker().beginEnrollment(password);
      setRecoveryKit(kit);
      setScreen("confirm-recovery");
    });
    setPassword("");
    setPasswordAgain("");
  }

  async function confirmRecovery(event: FormEvent): Promise<void> {
    event.preventDefault();
    await run(async () => {
      const session = await currentBroker().confirmEnrollment(recoveryConfirmation);
      setRecoveryKit("");
      setRecoveryConfirmation("");
      setMetadata(session);
      setScreen("unlocked");
      await loadPage(session);
    });
  }

  async function cancelEnrollment(): Promise<void> {
    const active = broker.current;
    resetSecrets();
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
    resetSecrets();
    setError(undefined);
    setScreen("locked");
    broker.current = undefined;
    if (active !== undefined) await active.lock();
  }

  async function openItem(id: string): Promise<void> {
    if (metadata === undefined) return;
    await run(async () => {
      const vaultId = metadata.vaults[0]?.id;
      if (vaultId === undefined) throw new Error("missing vault");
      setSelected(await currentBroker().getItem(vaultId, id));
    });
  }

  if (!support.supported) {
    return (
      <main className="centered-shell">
        <section className="card" aria-labelledby="unsupported-title">
          <p className="eyebrow">Unsupported browser</p>
          <h1 id="unsupported-title">Neutron cannot open safely here</h1>
          <p>This browser is missing required local security capabilities:</p>
          <ul>
            {support.missing.map((feature) => (
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
          <h1 id="unlock-title">Welcome back</h1>
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
          <h1 id="enroll-title">Choose a master password</h1>
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
          <h1 id="recovery-title">Save this recovery kit offline</h1>
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
              <h1>Your vault</h1>
            </div>
            <button type="button" className="danger" onClick={() => void lock()}>
              Lock now
            </button>
          </div>
          <div className="vault-grid">
            <section className="item-list" aria-labelledby="items-title">
              <div className="section-heading">
                <h2 id="items-title">Items</h2>
                <span>{page?.items.length ?? 0} shown</span>
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
                  onClick={() => void run(() => loadPage(metadata, page.nextCursor))}
                >
                  Next page
                </button>
              )}
            </section>
            <section className="detail-panel" aria-live="polite">
              {selected === undefined ? (
                <div className="empty-detail">
                  <p className="eyebrow">No item selected</p>
                  <h2>Choose an item to decrypt it</h2>
                  <p>Summaries contain only title, type, and revision metadata.</p>
                </div>
              ) : (
                itemDetails(selected)
              )}
            </section>
          </div>
        </section>
      ) : null}
    </main>
  );
}
