# TASK 0017 — Encrypted item session CRUD

Status: done
Owner: unassigned
Claimed: 2026-07-28T00:21:00Z
Worktree/branch: shared-worktree (main)
Reviewer: `/root/task_0017_reviewer`
Review claimed: 2026-07-28T01:45:00Z
Depends on: 0013, 0016
Blocks: Stage 2 vault UI and local search
Security-sensitive: yes

## Outcome

Add conflict-safe create, list, update, and delete operations for all five item
types as narrow unlocked-session methods, with only key wrappers and encrypted
payload envelopes persisted.

## Allowed paths

- This task file
- `packages/vault-domain/**` for conditional repository contracts/adapters tests
- `apps/web/**` for IndexedDB conditional transactions, session orchestration,
  and Node/Chromium tests

## Out of scope

- React UI, search indexes, password generator, TOTP computation, attachments
- Multiple vaults, sync, tombstones, mutation signatures, or server operations
- Returning ARK, vault keys, item keys, or decrypted bytes from generic getters

## Acceptance criteria

- [x] Create atomically persists one kind-`0x04` item-key wrapper and one
      kind-`0x10` payload; update replaces only the expected payload key-version
      and generation tuple; delete atomically removes the expected tuple's
      wrapper and payload.
- [x] Conditional batches prevent lost updates and mixed partial state across
      concurrent sessions/tabs.
- [x] List decrypts and validates complete items only while unlocked and returns
      per-item corruption without damaging or hiding healthy items.
- [x] Item IDs and revisions are canonical opaque values; invalid, missing,
      stale, duplicate, orphaned, cross-account, and tampered records fail closed.
- [x] Locked sessions reject every item operation and export no raw key material.
- [x] Real Chromium covers all five types, reload, stale-write races, corruption
      isolation, deletion, and raw persistence scans for item plaintext.
- [x] All gates and independent security review pass.

## Verification plan

Add shared conditional repository contracts in memory and IndexedDB, deterministic
session tests for all item states, a two-session Chromium conflict race, raw
database scans, full repository gates, and independent review.

## Progress log

- 2026-07-28T00:21:00Z — Claimed after Task 0016 commit `deee30a`.
- 2026-07-28T00:33:00Z — Implemented byte-exact conditional repository
  transactions, single-vault session CRUD, deterministic bounded reads,
  per-item corruption isolation, stale-write conflicts, and capability-gated
  session construction. Removed unnecessary ARK retention after unlock.
- 2026-07-28T01:00:00Z — Independent review failed with reproduced inherited
  array-method CAS bypass, non-initial item-prefix collision, ineffective record
  bounds, and post-lock in-flight plaintext return. Returned to active for
  atomic prefix/count conditions, key-only bounded inventory, operation epochs,
  and point-read isolation.
- 2026-07-28T01:25:00Z — Remediated all initial findings. Conditional storage
  now validates byte-exact snapshots, object prefixes, and final counts in one
  transaction; inventory is bounded and key-only; point operations load only
  their target; lock epochs invalidate every in-flight result. Added hostile
  prototype, overwritten-byte, orphan-collision, capacity-race, point-isolation,
  and all-CRUD lock-race tests.
- 2026-07-28T01:35:00Z — Fresh review failed on an equivalent inherited
  `Array.prototype.push` bypass in IndexedDB condition-request accumulation.
  Returned to active to remove inherited array dispatch throughout the CAS path
  and add the selective-push real-Chromium reproduction.
- 2026-07-28T01:45:00Z — Remediated the second review: CAS paths use indexed
  array construction; an atomic account-coherence predicate rejects mixed
  keyspaces; Chromium covers selective-push, exact-byte, prefix, account, and
  capacity conditions. Update/delete revisions now require both key version and
  generation to prevent future post-rotation ABA.
- 2026-07-28T01:55:00Z — Final independent review passed with no remaining
  P0/P1/P2 findings after reproducing the original and equivalent attacks.

## Verification

Passed 63 Node tests, four real-Chromium contracts, build, typecheck, lint,
format check, and diff check after the final remediation.

## Handoff

The UI and bounded local search may consume only the validated item-read API.

## Review

Initial and second reviews: FAIL. Final result: PASS by
`/root/task_0017_reviewer`, with no remaining P0/P1/P2 findings. An
already-issued atomic persistence transaction may finish after
`lock()`, but its caller rejects with `locked` and returns no plaintext or
success result.
