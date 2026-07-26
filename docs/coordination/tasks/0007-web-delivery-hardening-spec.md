# TASK 0007 — Web delivery hardening specification

Status: ready  
Owner: unassigned  
Claimed: —  
Worktree/branch: —  
Reviewer: unassigned  
Review claimed: —  
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

- [ ] Required security headers and resource policies are testable.
- [ ] Client/worker message schemas and plaintext boundaries are identified.
- [ ] Update, rollback, and build-hash UX is specified.
- [ ] The residual malicious-JavaScript risk is prominent.
- [ ] Independent review is recorded.

## Progress log

- 2026-07-26T00:00:00Z — Created from the accepted master plan.

## Handoff

Pending.

## Verification

Pending. Record header-policy, browser-matrix, and malicious-origin review.

## Review

Pending; must be owned by a different agent.
