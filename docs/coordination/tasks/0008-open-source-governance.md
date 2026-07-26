# TASK 0008 — Open-source governance and supply-chain policy

Status: blocked  
Owner: unassigned  
Claimed: —  
Worktree/branch: —  
Reviewer: unassigned  
Review claimed: —  
Depends on: 0001  
Blocks: Public repository release  
Security-sensitive: no

## Outcome

Finalize licensing boundaries, contribution/security policies, release signing,
provenance, CI permissions, dependency policy, and disclosure workflow.

## Allowed paths

- This task file for lifecycle metadata
- `LICENSE*`
- `SECURITY.md`
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `docs/governance/**`
- `.github/ISSUE_TEMPLATE/**`
- `docs/decisions/0009-supply-chain-policy.md` if needed (reserved)

## Out of scope

- Publishing the repository, accepting legal risk on behalf of the owner, or
  configuring production secrets.

## Acceptance criteria

- [ ] Owner identity/copyright and package license boundaries are confirmed.
- [ ] Private vulnerability disclosure and supported-version policy exist.
- [ ] Untrusted PR workflows cannot access release/deploy credentials.
- [ ] Dependency, action pinning, SBOM, provenance, and signing policies exist.
- [ ] SimpleLogin integration licensing assumptions are documented as assumptions
      pending legal review where appropriate.

## Progress log

- 2026-07-26T00:00:00Z — Created from the accepted master plan.

## Handoff

Pending.

## Verification

Pending. Record policy, workflow-permission, licensing, and release review.

## Review

Pending.
