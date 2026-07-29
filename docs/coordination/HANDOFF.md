# Neutron session handoff

Updated: 2026-07-29
Branch: `main`
Reviewed implementation tip: `0f56f62`

This is a navigation checkpoint, not a substitute for authoritative task files
or accepted ADRs. Verify it against the repository before acting.

## Resume here

1. Read `AGENTS.md` and every document it requires, in order.
2. Run `git status --short` and `git log -7 --oneline`. Expect clean `main` with
   this handoff/task-closure commit above `0f56f62`, `4e0c979`, and `21fec13`.
3. Read accepted ADR 0013, Tasks 0018 through 0022, and
   `docs/security/web-delivery.md` before changing the worker or UI boundary.
4. Confirm Task 0022 is `done`. There is no active implementation task at this
   checkpoint. Start the next milestone with a separate read-only preflight and
   an exact allowed-path reservation.
5. Update this file before the next session stops, including if work is blocked
   or still in review.

## Checkpoint outcome

Task 0022, worker-bound RFC 6238 TOTP display, is complete and independently
security-reviewed.

- ADR commit: `21fec13 docs(adr): accept worker-bound TOTP policy`.
- Implementation commit: `4e0c979 feat(web): add worker-bound TOTP display`.
- Review-remediation commit: `0f56f62 fix(web): revalidate TOTP after clock jumps`.
- ADR review: initial BLOCK P0 0/P1 3/P2 2, final PASS P0 0/P1 0/P2 0.
- Implementation review: initial BLOCK P0 0/P1 1/P2 0, final PASS P0 0/P1 0/P2 0.

The reviewed implementation now:

- Computes SHA-1, SHA-256, and SHA-512 RFC 6238 codes only inside the unlocked
  vault worker, using worker-local Web Crypto HMAC and canonical unpadded RFC
  4648 Base32 decoding. SHA-1 is authorized only for this TOTP compatibility
  use case.
- Accepts an exact item revision reference rather than caller-supplied seed,
  time, counter, or HMAC input. The worker point-reads the item and rejects
  missing, malformed, wrong-type, or stale revisions before computation.
- Returns only the exact revision, public TOTP policy, code, and validity bounds.
  Protocol, runtime, broker, receipt-time, and UI checks fail closed on forged,
  stale, cross-operation, expired, or otherwise malformed results.
- Displays the code only in the active exact-revision TOTP view. Target/editor
  changes, errors, expiry, lock, and unmount clear it; focus/visibility restoration
  recomputes it; only one request is pending for a target.
- Checks wall-clock freshness at most one second apart without asking the worker
  to recompute while a receipt remains fresh. Forward or backward clock jumps
  outside the inclusive-start/exclusive-expiry interval clear and refresh it.
- Keeps the seed out of the new compute request/result and keeps codes out of
  Neutron-controlled persistence, URLs, network, logs, and static output. This
  does not remove the existing complete-item seed exposure to the active editor,
  and it does not claim JavaScript/browser memory erasure.
- Uses no new production dependency, service, server, or recurring-cost resource.

## Verification actually run

Implementation and remediation gates passed:

```text
pnpm install --frozen-lockfile               # already up to date
pnpm typecheck                               # pass
pnpm lint                                    # 106 files, pass
pnpm format:check                            # 106 files, pass
pnpm test                                    # 11 files, 94 tests, pass
pnpm build                                   # pass
pnpm --filter @neutron/web test:browser      # 23 Chromium + 3 engine probes, pass
pnpm --filter @neutron/web test:production   # emitted exact-CSP flow, pass
git diff --check                             # pass
```

The TOTP matrix separately ran Web Crypto probes in pinned Chromium, Firefox,
and WebKit. The emitted-production flow independently checked the code with
Node HMAC and scanned runtime, persistence, static, URL, log, and network
surfaces. One combined local run hit the unchanged Chromium worker test's known
`IndexedDB deletion blocked` teardown race; the immediate complete browser rerun
passed 23/23 before the matrix and production gates. The final reviewer then
independently reproduced every gate with a clean worktree at exact HEAD.

## Deliberately unfinished

- Stage 2 still lacks passphrase/wordlist generation, bounded encrypted local
  search, offline recovery unlock UI, and the service-worker install/update/
  rollback state machine required for the PWA milestone.
- Clipboard/copy, QR generation/scanning, `otpauth://` parsing/import, adjacent
  TOTP-step validation, and clock synchronization remain deliberately absent.
- Browser/OS/password-manager/extension handling of plaintext remains part of
  the documented client TCB and residual risk; Neutron cannot prove erasure of
  immutable strings or engine-internal copies.
- The checked production policy server is test infrastructure, not a deployed
  `_headers` adapter. No deployment occurred.
- Import/export completion, passkeys, sync, server adapters, backup/restore
  drills, release provenance, and open-source release automation belong to
  later stages.
- Tasks 0004, 0006, 0008, and 0009 remain blocked; Task 0010 remains proposed.
  Do not treat those designs as complete.
- Do not use real credentials before the Stage 5 dogfood gate.

## Next safe direction

Do not start implementation from this suggestion alone. The smallest natural
next Stage 2 checkpoint is a passphrase-generator policy preflight. ADR 0012
explicitly deferred it until a wordlist, normalization policy, provenance,
update process, and entropy treatment are decided. The preflight should also
decide whether a bundled immutable wordlist is acceptable for offline use and
open-source redistribution, and it must verify licensing before any list enters
the repository.

Keep this checkpoint separate from local search, recovery unlock, clipboard,
TOTP import/QR work, service-worker delivery, sync, server work, and deployment.
If the preflight finds the wordlist/licensing policy premature, stop without
code and recommend either bounded local search or recovery unlock as the next
independently preflighted milestone.

Suggested prompt for the next agent:

> Resume Neutron from `docs/coordination/HANDOFF.md` and verify the clean,
> independently reviewed Task 0022 checkpoint above `0f56f62`. Read every
> document required by `AGENTS.md`. Before any edit, assign a separate read-only
> agent to preflight one narrow passphrase-generator milestone. Require an
> explicit ADR decision covering the exact bundled wordlist and license,
> upstream digest/provenance, normalization and delimiter policy, entropy math,
> word-count bounds/default, unbiased worker-local selection, update/rollback
> compatibility, plaintext lifetime, named protocol shape, and deterministic
> tests. If policy or licensing cannot be made repository-verifiable, stop with
> no implementation and recommend the next bounded Stage 2 milestone. Otherwise
> draft and independently review the ADR before claiming product paths; then
> implement, run root/browser/emitted-production/leakage gates, obtain separate
> adversarial review, remediate every P0/P1, commit a clean checkpoint, and
> update this handoff. Do not bundle local search, recovery unlock, clipboard,
> TOTP import/QR, service worker, sync, server, or deployment work.

## Manual UI smoke test

From the repository root, run `pnpm --filter @neutron/web dev`, open the printed
local URL, and use a fresh browser profile/origin. Enrollment, recovery-kit
confirmation, lock/unlock, item CRUD, password generation, and TOTP display are
available for synthetic test data. The current dev build is not a dogfood or
production security release; do not enter real credentials.

## Mandatory next-session stop protocol

Before the next session ends, record repository-verifiable task/review status,
exact commits, dirty paths, commands actually run and results, unresolved
findings, next safe action, and explicit non-goals here. Prefer a clean committed
checkpoint. Never use the handoff to self-approve a security-sensitive task.
