# TASK 0009 — Authentication, session, and recovery protocol specification

Status: blocked  
Owner: unassigned  
Claimed: —  
Worktree/branch: —  
Reviewer: unassigned  
Review claimed: —  
Depends on: 0002, 0003  
Blocks: 0004 and Stage 3 authentication implementation  
Security-sensitive: yes

## Outcome

Specify the complete WebAuthn account, session, credential lifecycle, and offline
recovery ceremonies without exposing the master password or recovery secret.

## Context

The accepted design separates server authentication from local vault unlock, but
the exact challenges, bindings, sessions, recovery authentication construction,
rotation, and abuse controls require a reviewed protocol before implementation.
Task 0003 owns recovery wrapping and the shared derivation-label registry; this
task consumes that specification and must not redefine it.

## Allowed paths

- This task file for lifecycle metadata
- `docs/security/authentication-recovery.md`
- `docs/protocol/authentication-recovery.md`
- `docs/decisions/0007-authentication-recovery-protocol.md` (reserved)
- `docs/ARCHITECTURE.md` authentication/recovery sections only

## Out of scope

- Implementation, UI, OPAQUE, mail authentication, and changing the accepted
  separation between passkey authentication and master-password unlock.

## Acceptance criteria

- [ ] Account bootstrap and lookup avoid unnecessary identity enumeration.
- [ ] RP ID, origins, user handles, attestation, counters/backup flags, and
      credential add/remove rules are explicit.
- [ ] Challenges have transcript binding, TTL, single-use/replay protection, and
      rate limits.
- [ ] Session cookies, expiry, rotation, logout, CSRF, and sensitive-action
      reauthentication are specified.
- [ ] Recovery selects an exact reviewed signature/authentication construction,
      public-key binding, authentication-only derivation labels, rotation,
      revocation, and failure behavior while reusing Task 0003's wrapper.
- [ ] Enrollment, authentication, recovery, and removal have positive and
      negative test-vector or ceremony-test requirements.
- [ ] Independent security review is recorded.

## Verification

Pending. Record ceremony walkthroughs, replay/CSRF/enumeration analysis, and
construction/vector review.

## Progress log

- 2026-07-26T00:00:00Z — Added after independent review identified the missing
  protocol ownership lane.

## Handoff

Pending.

## Review

Pending; must be owned by a different agent.
