# TASK 0004 — Server schema and sync protocol specification

Status: blocked  
Owner: unassigned  
Claimed: —  
Worktree/branch: —  
Reviewer: unassigned  
Review claimed: —  
Depends on: 0002, 0003, 0009  
Blocks: Stage 3 implementation tasks  
Security-sensitive: yes

## Outcome

Specify opaque server records, signed operation chains, concurrency, conflicts,
tombstones, pagination, idempotency, rollback detection, and API limits.

## Allowed paths

- This task file for lifecycle metadata
- `docs/ARCHITECTURE.md`
- `docs/protocol/**`
- `docs/security/**`
- `docs/decisions/0011-sync-and-server-schema.md` (reserved)

## Out of scope

- Database migrations and API implementation.

## Acceptance criteria

- [ ] Server schema exposes no prohibited vault metadata.
- [ ] API contracts include versions, limits, authorization, and errors.
- [ ] Same-item concurrency and delete/edit conflicts are deterministic.
- [ ] Rollback/fork guarantees and limitations are testable and honest.
- [ ] Independent security review is recorded.

## Progress log

- 2026-07-26T00:00:00Z — Blocked on threat and envelope specifications.

## Handoff

Pending.

## Verification

Pending. Record schema classification and adversarial protocol review results.

## Review

Pending; independent security review required.
