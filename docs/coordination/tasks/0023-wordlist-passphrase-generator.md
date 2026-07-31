# TASK 0023 — Wordlist-backed passphrase generator

Status: proposed
Owner: unassigned
Claimed: —
Worktree/branch: —
Reviewer: unassigned
Review claimed: —
Depends on: 0018, 0020, 0021, 0025; accepted ADR 0014
Blocks: Stage 2 generator completeness
Security-sensitive: yes

## Outcome

The unlocked login editor can generate an EFF-wordlist passphrase using only the
existing worker-owned CSPRNG, under the exact policy accepted in ADR 0014. The
passphrase fills the active login editor's password field and does not persist
until the user explicitly saves the item.

## Context

ADR 0012 deliberately deferred passphrase generation until a wordlist, license,
provenance, normalization policy, entropy treatment, and update process were
decided. ADR 0014 makes those decisions and is the governing document for this
task; where this file and ADR 0014 disagree, the ADR wins. The task deliberately
mirrors Task 0021's structure so that the passphrase path is reviewed against the
same bar as the password path rather than becoming a second dialect.

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

- [ ] The bundled wordlist matches ADR 0014 exactly: 7,776 entries, the recorded
      canonical SHA-256 recomputed from the loaded list, the stated alphabet and
      length range, strict code-unit sort order, no entry containing the
      separator, and an attribution header naming EFF, CC BY 4.0, the upstream
      URL, and the retrieval date.
- [ ] Word selection is independent, uniform, and unbiased over all 7,776
      indices using the ADR's 16-bit rejection sampler, with the exact bounded
      provider-return and byte-clearing behavior and a `words * 32` byte budget.
- [ ] A single named `generate-passphrase` worker operation is unlocked-only and
      independently validates its request, the standalone global response schema
      including list membership, the local worker result, and the broker's
      pre-send expectation, without exposing random bytes or indices.
- [ ] Invalid input reaches no provider call. Provider faults, malformed returns,
      and budget exhaustion fail closed with the existing stable redacted error
      and no partial candidate. Lock retains priority and a stale session epoch
      cannot resolve into the window.
- [ ] Only the active keyed login editor receives the generated passphrase.
      Manual edits, a newer request, type or target changes, cancel, and lock
      suppress older results. Generation never saves automatically.
- [ ] The generator UI exposes both modes with accessible labelling and keyboard
      operation, defaults to 8 words, states the entropy honestly, and does not
      claim a passphrase is stronger than an equivalent random password.
- [ ] Deterministic tests cover the wordlist invariants, all word-count and
      entropy boundaries, hostile prototypes and extra fields, the exhaustive
      16-bit residue domain, the exact randomness budget, malformed provider
      returns, and buffer clearing on success and failure.
- [ ] Protocol, client, and runtime adversarial tests cover mutation, forged and
      cross-operation responses, non-list words, wrong token counts, wrong or
      duplicated separators, empty and edge tokens, locked and pending states,
      request/operation/session correlation, and late post-lock responses.
- [ ] The emitted exact-CSP production flow generates through the real built
      worker, re-validates the value against the list in Node, and proves absence
      from origin-visible persistence before save, ciphertext-only persistence
      after save, absence from network, console, and static artifacts, and
      clearing from the DOM and origin storage on cancel, delete, and lock with a
      fresh worker after unlock.
- [ ] Built window and worker bundle sizes are measured and recorded before and
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

- 2026-08-01T00:00:00Z — Created after an independent read-only preflight of the
  Task 0022 checkpoint and drafted alongside ADR 0014. Not claimable until
  ADR 0014 is independently reviewed and accepted.
- 2026-08-01T00:00:00Z — ADR 0014 independently reviewed: BLOCK with P0 0, P1 5,
  P2 9. All findings remediated and the ADR accepted. Two P1s were substantive
  rather than editorial: the byte-pair assembly rule permitted an
  entropy-reducing sliding-window implementation, and the required attribution
  would not have survived minification. Both are now binding requirements above.
  Task sequenced behind Task 0025, which owns the shared build file.

## Handoff

Summarize changed behavior, important files, decisions, risks, and follow-up work.

## Review

Reviewer, date, findings, and disposition. Required; the implementer must not
self-approve.
