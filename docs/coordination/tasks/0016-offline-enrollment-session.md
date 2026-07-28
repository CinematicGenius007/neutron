# TASK 0016 — Offline enrollment and key session

Status: done
Owner: unassigned
Claimed: 2026-07-28T00:06:00Z
Worktree/branch: shared-worktree (main)
Reviewer: `/root/task_0016_reviewer`
Review claimed: 2026-07-28T00:12:00Z
Depends on: 0013, 0014, 0015
Blocks: Stage 2 item workflows and enrollment UI
Security-sensitive: yes

## Outcome

Implement local enrollment gated by exact recovery-kit confirmation, strict
password unlock, explicit lock, and a non-key-exporting in-memory session.

## Allowed paths

- This task file
- `apps/web/**` for trusted-client orchestration and tests
- `pnpm-lock.yaml` for direct workspace dependency metadata

## Out of scope

- React UI, worker isolation, auto-lock events, item CRUD, and search
- Recovery unlock, password change, server authentication, signing, and sync
- Multiple vaults or mutation-signing child material before Task 0004 state semantics
- Exporting ARK, vault keys, recovery secret, or password bytes from a session

## Acceptance criteria

- [x] Enrollment persists nothing until the exact generated kit is parsed and
      confirmed, then atomically writes both root wrappers and one vault child.
- [x] Cancel, mismatch, duplicate/concurrent confirmation, and existing state
      fail closed and best-effort clear owned secrets.
- [x] Unlock validates one coherent account/epoch authority set, collapses wrong
      password errors, and isolates unrelated corrupt item records.
- [x] Session exposes only frozen opaque metadata and idempotent lock state; no
      raw key getter exists.
- [x] Reload, wrong-password, correct-unlock, and lock pass in real Chromium;
      raw IndexedDB contains no password, kit text, recovery secret, ARK, or
      vault key.
- [x] All gates and independent security review pass.

## Verification plan

Use synthetic deterministic hostile providers in Node and the production
libsodium provider in Chromium. Exercise state-machine races, malformed and
cross-account storage, clear instrumentation, reload, raw persistence scans,
and all repository gates.

## Progress log

- 2026-07-28T00:06:00Z — Claimed after Task 0015 commit `e68807e`.
- 2026-07-28T00:12:00Z — Implemented uncommitted enrollment, exact kit
  confirmation, atomic initialization, strict coherent-state unlock, and an
  explicit non-key-exporting lock session. Added hostile entropy, state race,
  reload, wrong-password, raw persistence, and real-browser tests.
- 2026-07-28T00:16:00Z — Review found that confirmation mismatch retained the
  pending ceremony. Made mismatch terminal, cleared every owned ceremony byte
  array, preserved empty storage, and rejected reuse. Final review passed.

## Verification

Passed frozen install, 52 Node tests, three real-Chromium contracts, build,
typecheck, lint, format check, and diff check after final remediation.

## Handoff

Item orchestration should be added as narrow session operations and must never
obtain general-purpose raw key access.

## Review

Initial result: FAIL with one P1 mismatch-retention finding. Final result: PASS
by `/root/task_0016_reviewer`, with no remaining P0/P1 or concrete P2 defect.
The reviewer recommended broader table-driven corrupt-authority combinations as
nonblocking follow-up hardening for the item-workflow milestone.
