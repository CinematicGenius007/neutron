# TASK 0029 — UI review findings remediation

Status: review
Owner: unassigned (implemented by `/root`)
Claimed: 2026-08-01T09:40:23Z
Worktree/branch: shared-worktree (`main`)
Reviewer: `/root/task_0029_reviewer`
Review claimed: 2026-08-01T09:46:59Z
Depends on: 0028
Blocks: 0030
Security-sensitive: yes

## Outcome

The independently identified Task 0024 UI race and test-evidence gaps are
closed without changing persistence, protocol, worker, cryptography, or public
security policy.

## Context

The 2026-08-01 adversarial re-review of Task 0024 returned P0 0 / P1 1 / P2 6.
TASK-0028 made that result durable and reserved this task as the first
remediation step. The P1 is an enabled `Discard and continue` action while a
page operation is busy. The six P2 observations separate the two stale intent
paths, the two independently active confirmation groups, and the two
secret-absence evidence gaps.

This task preserves the accepted Task 0024 behavior: locking remains immediate
and unguarded, plaintext detail secrets remain absent until explicit reveal,
and failures expose only redacted messages.

## Allowed paths

- This task file
- `docs/coordination/HANDOFF.md`
- `apps/web/src/app.tsx`
- `apps/web/src/item-editor.tsx`
- `apps/web/test/browser/app.browser.tsx`
- `apps/web/scripts/test-production.mjs`

## Out of scope

- TASK-0030 boundary enforcement or CI wiring.
- TASK-0031 worker request/result validation.
- Idle auto-lock, clipboard behavior, recovery semantics, and emitted-wordlist
  delimiter decisions; each remains ADR work.
- Search, service-worker delivery, schema-driven additional item types, sync,
  imports, exports, deployment, dependencies, or persisted formats.
- Any change under `packages/`, to worker protocol/runtime code, or to crypto.

## Acceptance criteria

- [x] A pending dirty-navigation confirmation cannot be accepted or cancelled
      while another operation is busy; the reproduced pagination race cannot
      discard the draft or leave a stale `Opening item…` state.
- [x] A successful save clears any stale navigation intent before rendering the
      saved detail.
- [x] A successful delete clears any stale navigation intent before rendering
      the empty detail state.
- [x] The editor's discard-draft confirmation is wholly disabled while busy.
- [x] The editor's delete confirmation is wholly disabled while busy, including
      cancellation.
- [x] Browser assertions prove classified secret *values* are absent after
      reveal-reset transitions and cannot pass merely because an element ID was
      renamed.
- [x] The production exact-CSP flow scans `runtimeSurfaceDump` while a real item
      is selected and its secret fields are masked.
- [x] Targeted regression tests cover the busy dirty-navigation race, stale
      intent removal after save/delete, and both disabled confirmation groups.
- [x] Existing immediate lock, dirty-navigation, save/delete, secret reveal,
      pagination, focus, and redacted-error behavior remains passing.
- [x] No persistence, protocol, worker, crypto, dependency, metadata, or network
      behavior changes.
- [x] No real secrets appear in code, tests, logs, or history.
- [ ] A separate reviewer reviews an identifiable committed artifact and records
      P0/P1/P2 findings before closure.

## Verification

Run and record exact results:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
pnpm --filter @neutron/web test:browser
pnpm --filter @neutron/web test:production
git diff --check
```

The reviewer must additionally inspect the busy-state transitions and verify
that the new secret checks compare values or a complete runtime surface, not
only selector identities.

## Progress log

- 2026-08-01T09:40:23Z — Orchestrator verified TASK-0028 is done, no queued
  task file exists, the working tree is clean, and the declared paths overlap
  no active task. Reserved TASK-0029 and claimed it for bounded implementation.
- 2026-08-01T09:46:17Z — Implemented the three production-state changes and
  added targeted browser and exact-CSP evidence. A first production assertion
  included username even though Task 0024's reveal policy intentionally renders
  it normally; narrowed that assertion to the reveal-gated login fields rather
  than changing product policy. A failed browser assertion produced two
  disposable screenshot files; both exact generated files and their now-empty
  directories were removed before checkpointing.
- 2026-08-01T09:46:17Z — Verification passed: frozen install; typecheck; lint
  and format across 109 files; 12 unit files with 102 tests; root build; browser
  tests with 4 files / 35 tests in Chromium plus 3 files / 3 TOTP matrix tests;
  production build boundary verification (`Verified 7 production files`) and
  exact-CSP Chromium flow; and `git diff --check`. No generated test artifact
  remains.
- 2026-08-01T09:46:59Z — Implementation complete. Orchestrator cleared
  implementation ownership, assigned `/root/task_0029_reviewer`, and moved the
  task to `review`. The reviewer must inspect the committed candidate rather
  than this mutable working tree.

## Handoff

`app.tsx` clears stale navigation intent after successful save/delete and
disables the app-level discard decision through its complete busy interval.
`item-editor.tsx` disables both standalone confirmation groups while busy.
Browser tests reproduce each race and compare secret values across complete
runtime surfaces. The production flow now scans masked selected login, secure
note, backup-code, and JSON records before reveal.

No persistence, protocol, worker, crypto, dependency, metadata, or network path
changed. The implementation awaits independent review of a committed artifact.

## Review

Pending independent review of a committed artifact.
