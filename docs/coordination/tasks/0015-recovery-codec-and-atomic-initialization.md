# TASK 0015 — Recovery codec and atomic initialization

Status: done
Owner: unassigned
Claimed: 2026-07-27T23:56:00Z
Worktree/branch: shared-worktree (main)
Reviewer: `/root/task_0015_reviewer`
Review claimed: 2026-07-28T00:00:00Z
Depends on: 0013, 0014
Blocks: local enrollment/unlock kernel
Security-sensitive: yes

## Outcome

Implement accepted recovery-kit v1 encoding/decoding and an atomic
initialize-if-empty repository primitive so concurrent tabs cannot create two
local vaults in one database.

## Allowed paths

- This task file
- `packages/protocol/**` for the recovery-kit codec and tests
- `packages/vault-domain/**` for the repository contract and memory adapter
- `apps/web/**` only for IndexedDB initialization and browser contract tests

## Out of scope

- Enrollment ceremony, password handling, key generation, unlock, and sessions
- React UI, printing/QR, item workflows, server recovery, or sync
- Changes to the accepted format or envelope cryptography

## Acceptance criteria

- [x] Codec implements ADR 0011 exactly and returns only owned bytes.
- [x] BIP 173/350 and Neutron valid/adversarial vectors pass.
- [x] Memory and IndexedDB initialize atomically only when empty.
- [x] Concurrent real-Chromium initialization has exactly one winner and no
      mixed or partial vault.
- [x] All gates and independent security review pass.

## Verification plan

Run deterministic codec vectors and hostile input tests in Node, shared
repository contracts in memory and Chromium, a same-database race in Chromium,
all repository gates, and independent review.

## Progress log

- 2026-07-27T23:56:00Z — Claimed after accepted ADR 0011 commit `7ba7c30`.
- 2026-07-28T00:00:00Z — Implemented the strict recovery-kit codec, BIP and
  Neutron vectors, owned-byte boundaries, initialize-if-empty in both adapters,
  and a real IndexedDB two-connection race with one complete winner.
- 2026-07-28T00:03:00Z — Initial review found missing explicit adversarial
  vectors and caller-controlled typed-array errors. Added the full published
  invalid set, checksum-valid wrong-padding/wrong-constant cases, intrinsic
  typed-array brand access, uniform failures, and hostile input regressions.
- 2026-07-28T00:04:00Z — Remediation review passed with no remaining findings.

## Verification

Passed 49 Node tests, two real-Chromium contracts, build, typecheck, lint,
format check, and diff check. The final focused codec test has seven passing
tests.

## Handoff

Enrollment may expose the canonical kit and call initialize-if-empty only after
exact confirmation.

## Review

Initial result: FAIL with one P1 vector-evidence gap and one P2 typed-array
boundary finding. Final result: PASS by `/root/task_0015_reviewer`, with no
remaining P0/P1/P2 findings; IndexedDB atomicity and concurrency also passed.
