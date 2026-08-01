# TASK 0023 — Wordlist-backed passphrase generator

Status: review
Owner: unassigned
Claimed: 2026-08-01T01:48:52Z
Worktree/branch: shared-worktree (main)
Reviewer: `/root/task_0023_review`
Review claimed: 2026-08-01T02:02:15Z
Depends on: 0018, 0020, 0021, 0025, 0026; accepted ADR 0015 (supersedes 0014)
Blocks: Stage 2 generator completeness
Security-sensitive: yes

## Outcome

The unlocked login editor can generate an EFF-wordlist passphrase using only the
existing worker-owned CSPRNG, under governing ADR 0015 and the unchanged policy
it carries forward from ADR 0014. The
passphrase fills the active login editor's password field and does not persist
until the user explicitly saves the item.

## Context

ADR 0012 deliberately deferred passphrase generation until a wordlist, license,
provenance, normalization policy, entropy treatment, and update process were
decided. ADR 0015 is the governing document for this task; it supersedes ADR
0014 while carrying forward every part it does not correct. Where this file and
those decisions disagree, ADR 0015 wins. The task deliberately mirrors Task
0021's structure so that the passphrase path is reviewed against the same bar as
the password path rather than becoming a second dialect.

## Allowed paths

- This task file
- `apps/web/src/passphrase-wordlist.ts`
- `apps/web/src/passphrase-generator.ts`
- `apps/web/src/vault-worker-protocol.ts`
- `apps/web/src/vault-worker-runtime.ts`
- `apps/web/src/vault-worker-client.ts`
- `apps/web/src/app.tsx`
- `apps/web/src/item-editor.tsx`
- `apps/web/src/styles.css`
- `apps/web/test/passphrase-generator.test.ts`
- `apps/web/test/vault-worker.test.ts`
- `apps/web/test/browser/app.browser.tsx`
- `apps/web/test/browser/vault-worker.browser.ts`
- `apps/web/scripts/test-production.mjs`

## Out of scope

- `packages/crypto`, provider APIs, envelope/storage/server/network formats, and
  package manifests
- Any change to the reviewed random-character generator's behavior, alphabet,
  bounds, or exported functions in `apps/web/src/password-generator.ts`
- Generic random-byte APIs, caller-supplied entropy, `Math.random`, or a
  deterministic production hook
- A configurable separator, capitalization, digit or symbol insertion, repeat
  suppression, strength meters, passphrase history, clipboard or copy actions,
  bounded local search, recovery unlock UI, master-password or recovery-secret
  generation, service-worker delivery, sync, server work, and deployment
- Functional UI/UX remediation, which is Task 0024

## Acceptance criteria

- [x] The bundled wordlist matches governing ADR 0015 and the unchanged wordlist
      policy it carries forward from ADR 0014: 7,776 entries, the recorded
      canonical SHA-256 recomputed from the loaded list, the stated alphabet and
      length range, strict code-unit sort order, no entry containing the
      separator, and a complete exported and user-rendered attribution string
      naming EFF, `CC-BY-4.0`, the license URI, upstream URL, retrieval date,
      modification, and disclaimer reference. A source header is insufficient.
- [x] Word selection is independent, uniform, and unbiased over all 7,776
      indices using the ADR's 16-bit rejection sampler, with the exact bounded
      provider-return and byte-clearing behavior and a `words * 32` byte budget.
      Output is constructed incrementally; no selected-index or selected-word
      collection is created or retained during selection. Post-candidate
      validators may temporarily split the already-complete string as ADR 0014
      requires, but return only the validated string and never token collections.
- [x] A single named `generate-passphrase` worker operation is unlocked-only and
      independently validates its request, the standalone global response schema
      including list membership, the local worker result, and the broker's
      pre-send expectation, without exposing random bytes or indices.
- [x] Invalid input reaches no provider call. Provider faults, malformed returns,
      and budget exhaustion fail closed with the existing stable redacted error
      and no partial candidate. Lock retains priority and a stale session epoch
      cannot resolve into the window.
- [x] Only the active keyed login editor receives the generated passphrase.
      Manual edits, a newer request, type or target changes, cancel, and lock
      suppress older results. Generation never saves automatically.
- [x] The generator UI exposes both modes with accessible labelling and keyboard
      operation, defaults to 8 words, states the entropy honestly, and does not
      claim a passphrase is stronger than an equivalent random password.
- [x] Deterministic tests cover the wordlist invariants, all word-count and
      entropy boundaries, hostile prototypes and extra fields, the exhaustive
      16-bit residue domain, the exact randomness budget, malformed provider
      returns, and buffer clearing on success and failure.
- [x] Protocol, client, and runtime adversarial tests cover mutation, forged and
      cross-operation responses, non-list words, wrong token counts, wrong or
      duplicated separators, empty and edge tokens, locked and pending states,
      request/operation/session correlation, and late post-lock responses.
- [x] The emitted exact-CSP production flow generates through the real built
      worker, extracts exactly one frozen wordlist from that emitted worker,
      recomputes the literal canonical SHA-256
      `abae49761b88f3f1ba31ef944bea1f61b795a3cd7e1cfb7d276ed45bf77967ba`,
      re-validates the value against that independently extracted list, and proves absence
      from origin-visible persistence before save, ciphertext-only persistence
      after save, absence from network, console, and static artifacts, and
      clearing from the DOM and origin storage on cancel, delete, and lock with a
      fresh worker after unlock. The same flow proves the complete attribution
      survives emitted production and is rendered in the generator surface.
- [x] Built window and worker bundle sizes are measured and recorded before and
      after the change.
- [ ] All repository gates and an independent adversarial security review pass.

## Verification

Record exact results for:

```text
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

Also record the measured `apps/web/dist` window-entry and vault-worker asset
sizes before and after, and any test retry with its exact cause.

## Progress log

- 2026-07-31T23:14:01Z — Created after an independent read-only preflight of the
  Task 0022 checkpoint and drafted alongside ADR 0014. Not claimable until
  ADR 0014 is independently reviewed and accepted.
- 2026-07-31T23:14:01Z — ADR 0014 independently reviewed: BLOCK with P0 0, P1 5,
  P2 9. All findings remediated and the ADR accepted. Two P1s were substantive
  rather than editorial: the byte-pair assembly rule permitted an
  entropy-reducing sliding-window implementation, and the required attribution
  would not have survived minification. Both are now binding requirements above.
  Task sequenced behind Task 0025, which owns the shared build file.
- 2026-08-01T00:45:11Z — Takeover audit blocked readiness with P0 0, P1 4,
  P2 5. Task 0026 is now done and an explicit dependency. Proposed ADR 0015 must
  close the selected-word collection channel and attribution mismatch, receive
  independent review, and be accepted before this task may become ready.
- 2026-08-01T00:50:23Z — ADR 0015 independently passed with P0 0, P1 0, P2 0
  and was accepted as the governing successor to ADR 0014. All task dependencies
  are done and its acceptance criteria are testable; moved to ready, unclaimed.
- 2026-08-01T01:48:52Z — Independent preflight passed after correcting operative
  ADR references, with P0 0, P1 0, P2 2. Clarified that the no-collection rule
  governs selection rather than the required post-candidate validator split,
  and made emitted-worker extraction plus the literal canonical digest an exact
  production criterion. Recorded clean baseline window/worker sizes of 237,586
  and 596,854 bytes, then claimed the exact allowed paths.
- 2026-08-01T02:00:59Z — Implementation completed and moved to review. Added the
  frozen 7,776-entry EFF list, bounded unbiased generator, four-layer worker
  validation, dual-mode keyed editor integration, and adversarial unit, browser,
  real-worker, and exact-CSP production proofs. The production gate extracts the
  single minified frozen list from the emitted worker and independently verifies
  its literal canonical digest. All required commands passed without retry:
  frozen install; typecheck; lint; format check; 12 test files with 102 tests;
  build; browser suites with 7 files and 27 tests; production flow; and diff
  check. Final emitted sizes are 303,516-byte window JavaScript,
  661,361-byte worker JavaScript, and 4,759-byte CSS, versus the recorded
  237,586 / 596,854 / 4,759-byte baseline. Independent review remains required.

## Handoff

The unlocked login editor now offers the existing random-character password mode
and an eight-word-default EFF passphrase mode. Selection stays inside the vault
worker and uses the existing provider; the window receives only the validated
final string. The principal audit surfaces are `passphrase-wordlist.ts`,
`passphrase-generator.ts`, the worker protocol/runtime/client chain, the keyed
editor epoch logic, and the emitted-artifact extraction in `test-production.mjs`.
The unavoidable plaintext string and immutable prefixes retain ADR 0014/0015's
documented JavaScript-memory risk. No persistence, protocol version, provider,
crypto package, dependency, or network format changed.

## Review

Reviewer, date, findings, and disposition. Required; the implementer must not
self-approve.
