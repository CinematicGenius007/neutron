# TASK 0021 — CSPRNG-backed password generator

Status: review
Owner: unassigned
Claimed: 2026-07-29T02:06:58Z
Worktree/branch: shared-worktree (main)
Reviewer: `/root/task_0021_reviewer`
Review claimed: 2026-07-29T02:17:07Z
Depends on: 0007, 0011, 0018, 0020
Blocks: remaining Stage 2 passphrase and item-utility work
Security-sensitive: yes

## Outcome

Add an unlocked-login password generator backed only by the existing
worker-owned CSPRNG. It fills the password field in the currently keyed login
editor and does not persist until the user explicitly saves.

## Context

An independent preflight passed the reviewed Task 0020 checkpoint with P0 0 and
P1 0, confirmed the sequencing above, and required a lasting generator policy.
ADR 0012 was independently reviewed, remediated, and accepted at commit
`4ee1f96` before this task was claimed.

## Allowed paths

- This task file
- `apps/web/src/password-generator.ts`
- `apps/web/src/vault-worker-protocol.ts`
- `apps/web/src/vault-worker-runtime.ts`
- `apps/web/src/vault-worker-client.ts`
- `apps/web/src/app.tsx`
- `apps/web/src/item-editor.tsx`
- `apps/web/src/styles.css`
- `apps/web/test/password-generator.test.ts`
- `apps/web/test/vault-worker.test.ts`
- `apps/web/test/browser/vault-worker.browser.ts`
- `apps/web/test/browser/app.browser.tsx`
- `apps/web/scripts/test-production.mjs`

## Out of scope

- `packages/crypto`, provider APIs, envelope/storage/server/network formats, or
  package manifests
- Generic random-byte APIs, caller entropy/seed/nonce, `Math.random`, or a
  deterministic production hook
- Passphrases/wordlists, TOTP computation, search, clipboard, strength scoring,
  password history, ambiguous-character exclusions, master-password/recovery
  generation, automatic save, service worker, sync, server work, or deployment

## Acceptance criteria

- [x] Exact ADR 0012 options, fixed alphabets/defaults, 80-bit floor, and
      unbiased byte rejection sampling are implemented with the exact bounded
      provider-return and byte-clearing behavior.
- [x] A single named `generate-password` worker operation is unlocked-only and
      independently validates its request, standalone response schema, local
      worker result, and broker pending expectation without exposing random bytes.
- [x] Invalid input reaches no provider; provider faults fail closed with a
      stable redacted error and no partial candidate. Lock retains priority and
      stale epochs cannot resolve into the window.
- [x] Only the active keyed login editor receives the generated password. Manual
      edits, a newer request, type/target changes, cancel, and lock suppress old
      results. Generation never saves automatically.
- [x] Accessible defaults/options, keyboard use, redacted errors, and a
      320-pixel layout pass real-browser component tests.
- [x] Deterministic tests cover all 15 set combinations, option/entropy bounds,
      prototypes/extra fields, every reachable alphabet size and byte residue,
      exact randomness budget, malformed/short/overlong returns, and clearing.
- [x] Protocol/client/runtime adversarial tests cover mutation, forged and
      cross-operation responses, wrong length/alphabet, locked and pending
      states, operation/request/session correlation, and late lock responses.
- [x] Exact-CSP emitted production uses the real built worker to generate and
      insert a password, proves no Neutron-controlled persistence before Save,
      encrypted persistence after Save, no network/log/static leakage, and
      clearing from active DOM/origin-visible application storage on cancel,
      delete, and lock with a fresh worker after unlock.
- [ ] All repository gates and an independent adversarial security review pass.

## Verification

Implementation gates passed: frozen install; typecheck; lint and format check
across 102 files; 83 Node tests; root build; 20 real-Chromium tests; exact-policy
emitted production Chromium flow and build-output verification; and diff check.
Independent review remains pending.

## Progress log

- 2026-07-29T02:06:58Z — Claimed after clean-checkpoint preflight and accepted,
  independently reviewed ADR 0012. No package, provider, persistence, server,
  network, or delivery-format change is authorized.
- 2026-07-29T02:17:07Z — Implemented the exact ADR 0012 generator, named
  unlocked worker operation, request/global-response/pending-expectation
  validation, current-editor insertion and invalidation, deterministic sampling
  and provider-fault tests, real-worker Chromium coverage, and emitted exact-CSP
  persistence/runtime/network leakage flow. All implementation gates passed;
  moved to independent adversarial review.

## Handoff

Do not mark this task done without a separate reviewer. Update
`docs/coordination/HANDOFF.md` before stopping.

## Review

Pending independent adversarial review.
