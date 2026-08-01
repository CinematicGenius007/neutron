# Neutron session handoff

Updated: 2026-08-01
Branch: `main`
Last committed checkpoint before this task: `605b196`
Current checkpoint: Task 0024 complete and independently approved; implementation
and closure commit(s) are recorded by `git log` immediately above `605b196`.

This is a navigation checkpoint, not a substitute for authoritative task files
or accepted ADRs. Verify it against the repository before acting.

## Resume here

1. Read `AGENTS.md` and every document it requires, in order. `CLAUDE.md` is
   practical guidance only and cannot override repository instructions.
2. Run `git status --short` and `git log -12 --oneline`. Expect clean `main` once
   the Task 0024 closure commit is present.
3. Read Task 0024 and its initial BLOCK plus remediation PASS review record.
4. Do not use real credentials. The UI persistently states that Stage 5 has not
   passed and accepts synthetic test data only.
5. Claim no new task until its dependencies, allowed paths, ADR requirements,
   and overlap are independently preflighted.

## Task 0024 — completed functional UI remediation

Task 0024 is done and independently reviewed by
`/root/task_0024_adversarial_review`.

- Initial review: BLOCK, P0 0 / P1 5 / P2 0.
- Remediation review: PASS, P0 0 / P1 0 / P2 0.
- Product paths stayed limited to `app.tsx`, `item-editor.tsx`, and
  `styles.css`; browser and production tests plus this coordination record were
  the only other changed paths.
- No dependency, persistence, URL, protocol, worker, crypto, network, server,
  or third-party runtime-content change was made.

The shipped local UI now:

- keeps login passwords/notes, secure-note bodies, TOTP seeds, backup codes/
  notes, and JSON values absent from the DOM until an explicit per-field reveal;
- clears reveal state on item/revision changes, editor entry, errors, cancel,
  delete, and lock, while keeping TOTP codes out of live regions;
- masks editor passwords with redacted Show/Hide and generation statuses;
- guards dirty create/item/type/cancel navigation without ever delaying lock;
- disables the submitted draft during pending saves and prevents post-submit
  edits from being silently lost;
- provides in-memory Previous/Next pagination with distinct loading, unavailable,
  retry, and verified-empty states;
- recovers cleanly from a failed recovery-kit confirmation;
- identifies current selection and corrupt opaque record IDs, provides honest
  retry/lock guidance, names deletion targets, retries TOTP calculation, and
  repeats specific field-level validation feedback;
- shows a persistent synthetic-data/Stage-5 warning on every supported data
  entry screen; and
- retains visible keyboard focus and 320-pixel reflow across the tested screens.

The most important review catches were not cosmetic: a dirty editor survived a
failed item read after parent state had been cleared, controls stayed editable
during save, failed forward pagination could present stale empty content, and a
TOTP code was itself live-announced. All have direct adversarial regressions.

## Verification actually run

Final implementation/remediation evidence:

```text
pnpm install --frozen-lockfile               pass; already up to date
pnpm typecheck                               pass
pnpm lint                                    pass; 109 files
pnpm format:check                            pass; 109 files
pnpm test                                    pass; 12 files, 102 tests
pnpm build                                   pass
pnpm --filter @neutron/web test:browser      pass; 7 files, 35 tests
pnpm --filter @neutron/web test:production   pass twice consecutively after final wait fix
git diff --check                             pass
```

The exact-CSP production flow uses the real built worker and encrypted
IndexedDB. It covers every classified secret field, redacted TOTP failure and
retry after authenticated-record corruption/restore, repeated validation,
current selection, keyboard traversal, forward/back pagination over 25 real
encrypted items, named deletion, and the complete 320-pixel screen matrix. It
sentinel-scans storage, runtime DOM/form values, network requests, console,
origin state, and static emitted artifacts after required resets.

Recorded final emitted sizes:

| Emitted asset | Task 0023 checkpoint | Task 0024 final | Delta |
|---|---:|---:|---:|
| Window JavaScript | 303,516 B | 314,769 B | +11,253 B |
| Vault worker JavaScript | 661,361 B | 661,361 B | 0 B |
| CSS | 4,759 B | 5,922 B | +1,163 B |

Every production retry is recorded with its exact cause in Task 0024. The final
test-only issue was an ambiguous `includes(".")` passphrase wait; all three waits
now require the exact redacted success status to be attached before the value is
read and independently validated.

## Deliberately unfinished

- Tasks 0004, 0006, 0008, and 0009 remain blocked; Task 0010 remains proposed.
- Stage 2 still lacks bounded encrypted local search and a service-worker
  install/update/rollback state machine. Search requires an ADR for index-shard
  leakage and persisted-format policy.
- Idle auto-lock and clipboard copy remain ADR-worthy security decisions.
- QR handling, `otpauth://` import, adjacent-step TOTP validation, clock
  synchronization, deployment, connected CI evidence, dogfood approval, and a
  production release remain absent.
- Do not treat Task 0024 completion as Stage 5 approval.

## Next safe direction

Run a fresh plan/readiness review before choosing more Stage 2 scope. The likely
next candidates are the bounded encrypted-search ADR/task or the service-worker
delivery state machine; neither is authorized by Task 0024 and neither should
start without a separate preflight. If the goal is release rather than more
features, audit the remaining Stage 5 gates instead of expanding the UI.

## Manual UI smoke test

Run `pnpm --filter @neutron/web dev` from the repository root and use a fresh
browser profile/origin with synthetic data only. Enrollment, recovery-kit
confirmation, lock/unlock, all five item types, CRUD, password/passphrase
generation, secret reveal, pagination, and TOTP display are available. This is
not a dogfood or production-security release.

## Mandatory next-session stop protocol

Before the next session ends, update this file with repository-verifiable task
status, exact commits, dirty paths, commands actually run, unresolved findings,
next safe action, and explicit non-goals. Prefer a clean committed checkpoint.
Never use a handoff to self-approve security-sensitive work.
