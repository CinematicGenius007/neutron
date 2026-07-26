# TASK 0005 — Test-vector and adversarial harness design

Status: blocked  
Owner: unassigned  
Claimed: —  
Worktree/branch: —  
Reviewer: unassigned  
Review claimed: —  
Depends on: 0001, 0003  
Blocks: Stage 1 crypto implementation  
Security-sensitive: yes

## Outcome

Define and scaffold runtime-neutral positive and negative vectors for every
persisted cryptographic operation and parser boundary.

## Allowed paths

- This task file for lifecycle metadata
- `packages/test-vectors/**`
- Test-only configuration
- `docs/security/**`
- `docs/protocol/**`

## Out of scope

- Product UI, server API, and choosing different primitives.

## Acceptance criteria

- [ ] Browser and Node harnesses consume the same immutable vectors.
- [ ] Wrong key/AAD/version, mutation, truncation, extension, and oversized cases
      are represented.
- [ ] Fixtures are synthetic and contain no operational secrets.
- [ ] Vector generation is separated from vector verification.
- [ ] Independent review is recorded.

## Progress log

- 2026-07-26T00:00:00Z — Blocked on repository and envelope specification.

## Handoff

Pending.

## Verification

Pending. Record cross-runtime positive and negative harness results.

## Review

Pending; independent security review required.
