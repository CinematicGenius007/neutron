# TASK 0007 — Web delivery hardening specification

Status: done
Owner: unassigned
Claimed: 2026-07-28T02:00:00Z
Worktree/branch: shared-worktree (main)
Reviewer: `/root/task_0017_reviewer`
Review claimed: 2026-07-28T02:50:00Z
Depends on: —  
Blocks: Stage 2 web shell and Stage 5 release gate  
Security-sensitive: yes

## Outcome

Specify the browser support matrix, CSP, Trusted Types, worker boundaries,
storage rules, service-worker updates, third-party prohibition, build identity,
and reproducible-release requirements.

## Allowed paths

- This task file for lifecycle metadata
- `docs/security/web-delivery.md`
- `docs/web/**`
- `docs/decisions/0008-web-delivery-policy.md` (reserved)

## Out of scope

- Building the PWA or claiming the malicious-origin risk is solved.

## Acceptance criteria

- [x] Required security headers and resource policies are testable.
- [x] Client/worker message schemas and plaintext boundaries are identified.
- [x] Update, rollback, and build-hash UX is specified.
- [x] The residual malicious-JavaScript risk is prominent.
- [x] Independent review is recorded.

## Progress log

- 2026-07-26T00:00:00Z — Created from the accepted master plan.
- 2026-07-28T02:00:00Z — Claimed after Task 0017 commit `d12404e` to
  unblock the Stage 2 React/Vite shell.
- 2026-07-28T02:20:00Z — Drafted ADR 0008 and the normative delivery policy
  from current W3C, MDN, Vite, and Cloudflare sources. Specified testable headers,
  worker/plaintext boundaries, explicit locked update activation, deterministic
  build identity, rollback, browser matrix, and malicious-origin limits.
- 2026-07-28T02:35:00Z — Independent review failed on multi-client update
  quiescence, omission of service-worker bytes from build identity, impossible
  receiver-side structured-clone claims, and redirect enforcement assigned to
  Trusted Types. Returned to active for protocol correction.
- 2026-07-28T02:50:00Z — Remediated review findings with an all-client
  quiescence barrier, two-build staged-cache lifecycle, service-worker-bound
  release identity using RFC 8785, tested-version CSP support claims, sender and
  receiver structured-clone rules, and deployed redirect enforcement.
- 2026-07-28T03:00:00Z — Fresh review found a service-worker termination race
  and underspecified canonical manifest. Added a separate persisted delivery-state
  machine consulted by every boot, a complete message-direction union, closed RFC
  8785 schemas, full path rules, and compatibility metadata in the build ID.
- 2026-07-28T03:10:00Z — Final review passed after defining atomic logical cache
  promotion, complete persisted recovery states, and the closed update message
  union. ADR 0008 accepted.

## Handoff

The Stage 2 shell must implement the checked-in header policy, vault-worker API,
service-worker lifecycle, build identity, and cross-browser release gates before
it can claim production readiness.

## Verification

Documentation and diff checks pass after final remediation.

## Review

Initial result: FAIL. Final result: PASS by `/root/task_0017_reviewer`, with no
remaining P0/P1/P2 findings.
