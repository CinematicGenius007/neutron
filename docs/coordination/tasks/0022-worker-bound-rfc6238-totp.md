# TASK 0022 — Worker-bound RFC 6238 TOTP display

Status: review
Owner: unassigned
Claimed: 2026-07-29T16:34:59Z
Worktree/branch: shared-worktree (main)
Reviewer: `/root/task_0022_reviewer`
Review claimed: 2026-07-29T16:54:45Z
Depends on: 0017, 0018, 0019, 0020, 0021; accepted ADR 0013
Blocks: remaining Stage 2 item utilities
Security-sensitive: yes

## Outcome

Display a refreshed RFC 6238 code for the exact selected current TOTP-item
revision through one named unlocked worker operation, without sending a seed or
time from the window and without persisting the code.

## Context

Independent checkpoint preflight passed sequencing but blocked code until the
TOTP HMAC, Base32, clock, protocol, plaintext, and compatibility policy received
an ADR. ADR 0013 was independently reviewed, remediated, and accepted in commit
`21fec13` before this task was claimed.

## Allowed paths

- This task file
- `apps/web/src/totp.ts`
- `apps/web/src/vault-worker-protocol.ts`
- `apps/web/src/vault-worker-runtime.ts`
- `apps/web/src/vault-worker-client.ts`
- `apps/web/src/vault-worker-entry.ts`
- `apps/web/src/app.tsx`
- `apps/web/src/styles.css`
- `apps/web/test/totp.test.ts`
- `apps/web/test/vault-worker.test.ts`
- `apps/web/test/browser/totp.browser.ts`
- `apps/web/test/browser/vault-worker.browser.ts`
- `apps/web/test/browser/app.browser.tsx`
- `apps/web/package.json`
- `apps/web/test/vitest.browser.config.ts`
- `apps/web/test/vitest.totp-browser.config.ts`
- `apps/web/scripts/test-production.mjs`

## Out of scope

- `packages/crypto`, generic HMAC, dependencies, item/envelope/storage/server/
  network schemas, or caller-provided seed/time/counter/HMAC inputs
- Removing the existing complete-item/seed point-read exposure
- Clipboard/copy, QR generation/scanning, `otpauth://` parsing/import, adjacent
  step validation, clock synchronization, search, passphrases, automatic item
  mutation, service worker, sync, server work, or deployment

## Acceptance criteria

- [x] RFC 6238 with exact ADR 0013 algorithms, clock, counter, truncation,
      leading-zero, period, validity-boundary, and canonical Base32 rules is
      implemented using only worker-local Web Crypto HMAC.
- [x] Named `compute-totp` accepts only an exact item revision reference. The
      worker point-reads and rejects missing/corrupt/wrong-type/point-read-stale
      items before HMAC, and neither request nor result contains seed or time.
- [x] Standalone result shape/interval validation, worker local validation,
      broker immutable item-policy/revision expectation and receipt freshness,
      and UI pre-render freshness are independently enforced.
- [x] The active exact-revision TOTP view refreshes at expiry and on focus/
      visibility restoration. Target/editor/newer-result/error/expiry/lock
      invalidation clears older codes; only one calculation is pending per target.
- [x] Stable redacted errors follow ADR 0013. The UI states local-clock risk,
      has accessible live output, works by keyboard at 320 pixels, never copies
      or automatically saves, and does not imply the seed is worker-only overall.
- [x] All 18 RFC 6238 and ten RFC 4226 values, RFC 4648/canonical-tail cases,
      boundaries, clock/HMAC faults, counter encoding, and buffer clearing pass.
- [x] Hostile protocol/client/runtime cases cover prototypes/accessors, extras,
      cross-operation fields/results, forged policy/code/boundaries, mutation,
      wrong item type, missing/stale/corrupt records, and operation/epoch/lock races.
- [x] SHA-1/SHA-256/SHA-512 HMAC vectors pass in pinned Chromium, Firefox, and
      WebKit automation; inability to execute any engine blocks this checkpoint.
- [x] Exact-CSP emitted production computes through the built worker,
      independently verifies with Node HMAC, and proves seed/code absence from
      network, URL, logs, static artifacts and origin persistence, plus active
      DOM/runtime clearing and fresh-worker behavior after lock.
- [ ] All repository gates and independent adversarial security review pass.

## Verification

Implementation gates passed: frozen install; typecheck; lint and format check
across 106 files; 94 Node tests; root build; 23 full Chromium tests; three
additional TOTP Web Crypto vector probes across pinned Chromium, Firefox, and
WebKit; exact-policy emitted production Chromium flow/build verification; and
diff check. Independent review remains pending.

## Progress log

- 2026-07-29T16:34:59Z — Claimed after clean reviewed Task 0021 checkpoint,
  independent preflight, and independently reviewed accepted ADR 0013. No
  package, provider, persisted schema, server, network, or delivery-format
  change is authorized.
- 2026-07-29T16:38:40Z — Installed the pinned Playwright Firefox and WebKit
  binaries after the matrix stop gate found them absent. A trial of every legacy
  browser test in all engines exposed unrelated Firefox focus and WebKit
  IndexedDB-cleanup assumptions. Reserved a separate three-engine TOTP vector
  config and package-script composition so the new policy gate is exact while
  the established full application suite remains Chromium-bound.
- 2026-07-29T16:54:45Z — Implemented canonical Base32 decoding, RFC 6238 Web
  Crypto HMAC computation, exact revision-bound worker/client protocol,
  point-read stale rejection, receipt/UI freshness, bounded expired-result
  retry, active-view expiry/focus/visibility refresh, lock/target invalidation,
  and redacted output. Added authoritative vectors, adversarial boundary tests,
  three-engine probes, real-worker coverage, and emitted exact-CSP independent
  Node-HMAC/leakage verification. All implementation gates passed; moved to
  independent adversarial review.

## Handoff

Do not mark this task done without a separate reviewer. Update
`docs/coordination/HANDOFF.md` before stopping.

## Review

Pending independent adversarial review.
