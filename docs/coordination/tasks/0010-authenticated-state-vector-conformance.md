# TASK 0010 — Authenticated-state vector conformance

Status: proposed
Owner: unassigned
Claimed: —
Worktree/branch: —
Reviewer: unassigned
Review claimed: —
Depends on: 0004
Blocks: Stage 3 sync implementation
Security-sensitive: yes

## Outcome

Define and independently review deterministic conformance vectors for the
authenticated account-state decisions that Task 0004 specifies.

## Context

Task 0005 owns cryptographic envelope parsing, wrapping, rewrap outputs, and
structural header-generation checks. It does not own the authenticated live
child-wrapper authority, stale/replay decisions, atomic successor activation, or
mutation-signing public-binding transitions. Those decisions require Task 0004's
account-state format and are Stage 3 work.

Originating Task 0005 requirements: `generation-reject-stale-account-state`,
`migration-reject-missing-child`, `migration-reject-partial-successor`,
`migration-minimum-ark-rewrap-success`, and
`migration-full-rotation-is-distinct`.

## Allowed paths

- This task file for lifecycle metadata
- `packages/test-vectors/**` for authenticated-state vector fixtures, schemas,
  and tests after Task 0004 defines the canonical state format
- `docs/protocol/**` and `docs/security/**` only for Task-0004-compatible
  authenticated-state vector requirements
- A separately reserved ADR only if Task 0004's accepted state format requires
  one; no cryptographic primitive or envelope change is in scope

## Out of scope

- Task 0004 or Task 0009 implementation or specification work
- Production crypto, sync, server API, browser execution, and envelope-format
  changes
- Replacing Task 0005's cryptographic rewrap-output vectors

## Acceptance criteria

- [ ] Vectors define exact canonical authenticated states and successor actions
      for stale, replay, live-child-set, and atomic-activation decisions.
- [ ] Vectors cover mutation-signing public-binding transitions needed by full
      descendant rotation.
- [ ] Task 0005 cryptographic results and Task 0004 authenticated acceptance are
      tested as separate layers.
- [ ] All fixtures are synthetic and validate size, version, and failure bounds.
- [ ] Independent security review is recorded.

## Verification

Pending Task 0004. Record schema validation, positive/negative state vectors,
stale/replay probes, atomicity probes, and independent review results.

## Progress log

- 2026-07-27T01:57:04Z — Reserved by Task 0005 coordination remediation. It is
  a dependency record only and cannot be claimed until Task 0004 supplies the
  authenticated account-state format.

## Handoff

Task 0004 must provide the canonical signed account-state encoding, authoritative
live child-wrapper set, successor rules, and public-binding representation. Then
claim this task to turn the listed originating requirements into Stage 3 vectors.

## Review

Pending; independent security review required.
