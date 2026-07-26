# TASK 0002 — Detailed threat and metadata model

Status: done  
Owner: unassigned  
Claimed: —  
Worktree/branch: —  
Reviewer: root  
Review claimed: 2026-07-26T04:11:12Z  
Depends on: —  
Blocks: 0003, 0004  
Security-sensitive: yes

## Outcome

Turn the baseline security model into testable attacker stories, trust-boundary
data flows, metadata classifications, and explicit security claims/non-claims.

## Allowed paths

- This task file for lifecycle metadata
- `docs/SECURITY_MODEL.md`
- `docs/security/threat-model.md`

## Out of scope

- Implementing controls or changing accepted crypto/auth decisions.

## Acceptance criteria

- [ ] Malicious server, client compromise, MITM, database theft, device loss,
      recovery theft, rollback/fork, import, export, coercion, and mail threats
      each have attacker capability, asset, control, residual risk, and tests.
- [ ] Every planned server-visible field is classified.
- [ ] Vault and mail claims are clearly separated.
- [ ] Review is performed by a different agent.

## Progress log

- 2026-07-26T00:00:00Z — Created from the accepted master plan.
- 2026-07-26T03:59:50Z — Claim assigned by the orchestrator after Task 0001
  passed re-review. No active task owns this task's documentation paths.
- 2026-07-26T04:02:11Z — Added testable attacker stories, trust-boundary flows,
  lifecycle traces, server-visible field classifications, and explicit vault/
  mail claims in `docs/security/threat-model.md`. Exact recovery-authentication
  construction remains deferred to Task 0009 and cryptographic envelope details
  to Task 0003.
- 2026-07-26T04:04:58Z — Implementation audit confirmed that every conceptual
  architecture record is represented in the field inventory and all required
  attacker stories have a control, residual risk, and testable check. `git diff
  --check` exited 0.

## Handoff

Implementation is complete and ready for independent security review. Verify
that each planned server-visible field has one classification, every required
attacker story has a concrete future test, and residual risks do not overclaim
web, client, rollback/fork, or SMTP protections.

## Verification

2026-07-26T04:02:11Z — Scenario review completed against the required attacker
list and the architecture's conceptual server records. Metadata-field audit
completed: every listed server-visible field is classified as public metadata,
ciphertext, or operational secret in `docs/security/threat-model.md`.

## Review

2026-07-26T04:11:12Z — Independent review passed. The field inventory covers
every conceptual server record in `docs/ARCHITECTURE.md`, including the
authentication, recovery, rate-limiting, logging, and later-mail additions.
Every required attacker story identifies capability/asset, control, residual
risk, and a concrete future test. Vault and mail claims remain explicitly
separate, and the model does not overclaim protection from a malicious web
release, an unlocked-client compromise, or rollback/fork limits. Reviewer:
root.
