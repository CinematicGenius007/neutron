# TASK 0034 — Idle auto-lock decision

Status: review  
Owner: —  
Claimed: 2026-08-15  
Worktree/branch: shared-worktree (`main`)  
Reviewer: unassigned  
Review claimed: —  
Depends on: —  
Blocks: 0035 (protocol sequencing only), idle auto-lock implementation  
Security-sensitive: yes

## Outcome

An accepted, independently reviewed decision on unlocked-session lifetime, so
that the "short unlock lifetime" control named in `docs/SECURITY_MODEL.md` can
be implemented without inventing its semantics inside an implementation task.

## Context

`docs/coordination/HANDOFF.md` has carried ADR-0016 as the next queued decision
across several sessions. `docs/coordination/reviews/2026-08-15-independent-audit.md`
rates the missing control P1: the threat model claims a short unlock lifetime
and the code has none.

This task produces a **decision only**. It writes no product code. The
implementation is a separate task that may not start until this ADR is accepted.

## Reserved ADR filename

`docs/decisions/0016-idle-auto-lock.md`

ADR numbers 0016 and 0017 were confirmed free before reservation. This task does
not touch the stale reservations recorded as HANDOFF finding C3, nor the
unexplained 0007/0009 gaps recorded as C4; both still need their own owning
task.

## Allowed paths

- This task file
- `docs/decisions/0016-idle-auto-lock.md`
- `docs/decisions/README.md`
- `docs/coordination/HANDOFF.md`

## Out of scope

- Any change under `apps/`, `packages/`, `infra/`, or `.github/`.
- Implementing auto-lock, the warning UI, or the protocol operations.
- Clipboard access or clipboard clearing.
- Biometric or passkey quick-unlock, which belongs to ADR 0002's work.
- Persisted UI preferences, including a user-configurable timeout.
- Adding a service worker, which is a delivery-trust change under ADR 0008.
- Editing `docs/SECURITY_MODEL.md` to claim a control that is not implemented.

## Acceptance criteria

- [x] The ADR states one testable decision covering both an idle limit and an
      absolute session ceiling.
- [x] The ADR names which side owns enforcement and why, and explains why a
      window-side countdown is rejected.
- [x] The ADR defines exactly what does and does not count as activity, and
      addresses the existing TOTP revalidation timers explicitly.
- [x] The ADR addresses non-monotonic wall-clock movement.
- [x] The ADR satisfies WCAG 2.2 SC 2.2.1 by warning with at least 20 seconds of
      lead and permitting extension, and cites the criterion.
- [x] The ADR states its default constants as product defaults with comparable
      prior art, and does not present them as derived from a security proof.
- [x] The ADR states its protocol-version consequence and its lack of any
      persisted-format consequence.
- [x] The ADR lists verification required before acceptance and before the
      implementing task closes.
- [x] Security and privacy consequences name what is **not** improved and what
      remains unknown.
- [ ] An independent reviewer who did not write the ADR records P0/P1/P2
      findings against the exact committed artifact and accepts or rejects it.

## Verification

This task changes no code, so the build and test gates prove nothing about it.
The applicable checks are:

```sh
git diff --check
```

The reviewer must independently confirm: that ADR 0016 and 0017 filenames were
free; that no accepted ADR was edited; that the claimed WCAG requirement matches
the cited source; that the cited comparable defaults match their sources; and
that no path outside the allowed list changed.

## Progress log

- 2026-08-15 — The user reviewed the standing audit finding and directed that
  the two blocked decisions be written rather than more UI. Claimed TASK-0034,
  reserved `docs/decisions/0016-idle-auto-lock.md`, and confirmed 0016 free.
- 2026-08-15 — ADR 0016 drafted at status `Proposed`. The design is
  deadline-evaluated rather than countdown-based: the binding check runs on every
  worker operation, the worker timer is an optimisation, and focus/visibility
  restoration triggers a status check. Only an explicit `extend-session` request
  driven by real user interaction extends a session, which deliberately excludes
  the existing TOTP freshness watchdog. Moved to `review`; implementation
  ownership is cleared.

## Handoff

ADR 0016 exists at status `Proposed` and is binding on nobody. Do not implement
idle auto-lock, do not add the `extend-session` or `session-status` operations,
and do not increment the worker protocol until an independent reviewer accepts
it. The pre-acceptance verification item — per-engine behaviour of dedicated
worker timers in a fully backgrounded tab — has not been run.

## Review

Pending. No reviewer assigned, no verdict recorded. The author of the ADR may
not accept it.
