# TASK 0014 — Offline recovery-kit format

Status: done
Owner: unassigned
Claimed: 2026-07-27T23:46:00Z
Worktree/branch: shared-worktree (main)
Reviewer: `/root/task_0014_recovery_reviewer`
Review claimed: 2026-07-27T23:49:29Z
Depends on: 0002, 0003, 0012
Blocks: Stage 2 local enrollment and recovery ceremony
Security-sensitive: yes

## Outcome

Specify a canonical, versioned, checksummed text format for the offline recovery
kit and the confirmation gate that must precede local vault initialization.

## Allowed paths

- This task file
- `docs/decisions/0011-offline-recovery-kit-format.md`
- `docs/decisions/README.md`
- `docs/protocol/offline-recovery-kit.md`
- `docs/security/crypto-envelope.md` only for a recovery-kit clarification

## Out of scope

- Codec or enrollment implementation
- Server recovery authentication owned by Task 0009
- UI, printing, QR rendering, cloud storage, or escrow
- Recovery-secret rotation or ARK migration

## Acceptance criteria

- [x] The exact binary payload, text encoding, checksum, bounds, and canonical
      parser rules are fixed without defining a new cryptographic primitive.
- [x] Account binding, error behavior, confirmation, redaction, metadata, and
      forward-version handling are explicit.
- [x] Deterministic valid and adversarial vector requirements are recorded.
- [x] Compatibility and migration behavior is fail closed.
- [x] An independent security review accepts ADR 0011.

## Verification plan

Reproduce format lengths and vectors independently, check every parser rule and
failure class, verify compatibility with ADRs 0002 and 0010, and obtain a
separate read-only security review.

## Progress log

- 2026-07-27T23:46:00Z — Claimed after Task 0013 commit `17db94e`.
  Reserved ADR 0011. Bounded the offline kit separately because its public
  recovery format was not previously specified.
- 2026-07-27T23:49:29Z — Proposed fixed 49-byte v1 payload in a canonical
  90-character Bech32m encoding, strict fail-closed parsing, mandatory exact
  confirmation, redaction requirements, compatibility rules, and vectors.
- 2026-07-27T23:55:00Z — Independent review reproduced both vectors, length,
  symbol count, padding, polymod, and round trip with no findings. Accepted ADR
  0011.

## Verification

Locally and independently reproduced the 49-byte to 79-symbol conversion, three
zero padding bits, exact 90-character length, both deterministic vectors,
Bech32m polymod `0x2bc830a3`, and `git diff --check`.

## Handoff

After acceptance, Task 0015 may implement the codec and require exact kit
confirmation before atomically initializing encrypted local state.

## Review

PASS by `/root/task_0014_recovery_reviewer`; no P0/P1/P2 findings. The reviewer
confirmed consistency with ADRs 0002/0010 and BIPs 173/350 and approved ADR 0011.
