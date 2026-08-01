# TASK 0027 — Passphrase policy audit remediation

Status: review
Owner: unassigned (implemented by `/root`)
Claimed: 2026-08-01T00:45:11Z
Worktree/branch: shared-worktree (main)
Reviewer: `/root/task_0022_reviewer`
Review claimed: 2026-08-01T00:47:34Z
Depends on: 0026
Blocks: 0023 readiness
Security-sensitive: yes

## Outcome

The takeover audit of ADR 0014 and Task 0023 is durably recorded, every planning
and acceptance mismatch is corrected, and a separately reviewed successor ADR
closes the selected-word collection channel before passphrase product code begins.

## Allowed paths

- This task file
- `docs/decisions/0015-passphrase-policy-audit-corrections.md`
- `docs/decisions/README.md`
- `docs/decisions/0014-passphrase-generation-policy.md` metadata only, and only
  after ADR 0015 is accepted
- `docs/coordination/reviews/2026-08-01-adr-0014-takeover-review.md`
- `docs/coordination/reviews/2026-08-01-stage-2-plan-review.md`
- `docs/coordination/tasks/0023-wordlist-passphrase-generator.md`
- `docs/coordination/tasks/0025-vault-worker-bundle-boundary.md`
- `docs/third-party-notices.md`
- `docs/coordination/HANDOFF.md`

## Out of scope

- Any application, test, package, dependency, wordlist, build, protocol, storage,
  server, network, or deployment change
- Replacing the EFF list, changing its order/digests, changing word-count bounds,
  separator, entropy floor, rejection sampler, provider, or worker operation
- Claiming Task 0023, which remains proposed until this task and ADR 0015 pass
  independent review

## Acceptance criteria

- [x] ADR 0015 forbids selected-index and selected-word collections, requires
      incremental output construction, and corrects the exhaustion probability
      and output-length arithmetic without weakening ADR 0014.
- [x] ADR 0015 and Task 0023 bind the complete minification-surviving attribution
      fields and production assertion required by CC BY 4.0 and ADR 0014.
- [x] Task 0023 depends on completed Task 0026 and accepted ADR 0015 before it may
      become ready; Task 0025 records that it blocked Task 0023.
- [x] The Stage 2 review no longer contradicts the roadmap about recovery unlock,
      and pre-implementation documents use future rather than false present tense.
- [x] The takeover review records the independent reviewer identity and every
      P1/P2 disposition using repository-verifiable evidence.
- [ ] Independent adversarial review passes before ADR 0015 is accepted and ADR
      0014 is marked superseded.
- [x] Formatting and diff checks pass with no non-document change.

## Progress log

- 2026-08-01T00:45:11Z — Claimed after an independent takeover audit blocked
  Task 0023 readiness with P0 0, P1 4, P2 5. No passphrase code exists. Reserved
  ADR 0015 rather than rewriting the rationale of accepted ADR 0014.
- 2026-08-01T00:47:34Z — Drafted successor ADR 0015, aligned task dependencies,
  attribution and intermediate-state acceptance, corrected the Stage 2 recovery
  contradiction and historical block metadata, made pre-implementation notice
  language honest, and retained the named takeover audit. Formatting and diff
  checks pass with documentation-only changes; moved to independent re-review.

## Handoff

Do not accept ADR 0015 or make Task 0023 ready without separate review.

## Review

Pending.
