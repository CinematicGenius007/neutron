# TASK 0006 — Cloudflare and self-host portability spike

Status: blocked  
Owner: unassigned  
Claimed: —  
Worktree/branch: —  
Reviewer: unassigned  
Review claimed: —  
Depends on: 0001  
Blocks: Infrastructure implementation tasks  
Security-sensitive: no

## Outcome

Prove that one small opaque-record/blob use case can run through portable ports
using both local adapters and Cloudflare development bindings, with no product
or crypto data.

## Allowed paths

- This task file for lifecycle metadata
- `apps/api/**`
- `infra/**`
- Infrastructure-focused tests and docs
- `docs/decisions/0012-infrastructure-port-contracts.md` if needed (reserved)

## Out of scope

- Deployment to production, authentication, vault schemas, or encryption.

## Acceptance criteria

- [ ] Core ports contain no Cloudflare types.
- [ ] Local and Cloudflare-development adapters pass one shared contract test.
- [ ] Current pricing/limits relevant to the design are recorded with primary
      sources and date checked.
- [ ] No external account mutation or deployment occurs without explicit scope.

## Progress log

- 2026-07-26T00:00:00Z — Blocked on repository bootstrap.

## Handoff

Pending.

## Verification

Pending. Record shared adapter contract and local development results.

## Review

Pending.
