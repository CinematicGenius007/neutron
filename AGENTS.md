# Instructions for agents working on Neutron

These instructions apply to the entire repository. A more local `AGENTS.md`
may add stricter rules for its directory but may not weaken these rules.

## Mission

Build Neutron as a boring, auditable, self-hostable zero-knowledge vault first.
Email aliases and mail are later, separate trust domains. Optimize for security,
clarity, portability, and low personal operating cost—not feature count.

## Required reading order

Before claiming or changing anything, read:

1. `README.md`
2. `docs/MASTER_PLAN.md`
3. `docs/SECURITY_MODEL.md`
4. `docs/ARCHITECTURE.md`
5. `docs/ROADMAP.md`
6. `docs/decisions/README.md` and every accepted ADR relevant to the task
7. `docs/coordination/README.md`
8. The task file being claimed

If documents disagree, security invariants win, then accepted ADRs, then the
master plan, then the roadmap. Stop and create an ADR proposal if the conflict
would affect cryptography, authentication, recovery, privacy, or a public API.

## Non-negotiable security rules

- The vault server must never receive vault plaintext, plaintext vault keys,
  the master password, or password-equivalent authentication material.
- The master password is for local key unwrapping. WebAuthn/passkeys authenticate
  the account to the server.
- Use established cryptographic libraries and specified constructions. Never
  invent a primitive or silently change a parameter, label, encoding, or format.
- Item type, title, username, URL, notes, tags, filenames, TOTP seeds, and import
  data are encrypted before network or server persistence.
- Decryption belongs in the trusted client, preferably an isolated worker.
- No third-party analytics, scripts, fonts, tag managers, or telemetry may run in
  an unlocked vault context.
- Logs, errors, traces, fixtures, screenshots, and tests must contain synthetic
  data only and must not expose plaintext secrets or cryptographic key material.
- Mail is not to be described as zero-knowledge. Ordinary SMTP is visible at a
  receiving/sending boundary before at-rest encryption.
- Do not use Neutron for real credentials until the Stage 5 release gate passes.

Any change touching `packages/crypto`, envelope formats, authentication,
recovery, sync signatures, import parsing, or security headers requires:

1. An accepted or proposed ADR.
2. Test vectors or adversarial tests.
3. A separate review task owned by an agent other than the implementer.
4. Documentation of metadata and compatibility impact.

## Architecture boundaries

- `apps/web`: static React PWA and client orchestration. No SSR requirement.
- `apps/api`: thin ciphertext and authentication API. No vault decryption.
- `packages/crypto`: versioned cryptographic API and providers only.
- `packages/protocol`: wire formats, schemas, and compatibility rules.
- `packages/sync-engine`: client-side reconciliation and conflict behavior.
- `packages/vault-domain`: plaintext domain types used only in trusted clients.
- `packages/import-export`: offline parsers and encrypted export format.
- `infra/cloudflare`: hosted adapter using Workers, D1, and R2.
- `infra/self-hosted`: portable Node plus SQLite/Postgres and S3-compatible mode.

Cloudflare bindings must not leak into crypto, protocol, sync, or domain
packages. Domain packages must not import application or infrastructure code.

## Task protocol

The files under `docs/coordination/tasks/` are the source of truth. Do not use a
chat transcript or an untracked private checklist as project state.

1. Choose one task whose `Status` is `ready` and whose dependencies are done.
2. Check that none of its declared paths overlap another `active` task.
3. In a shared workspace, obtain an explicit claim from the orchestrating agent;
   agents must not independently perform a check-then-write claim. In independent
   Git worktrees, coordinate the claim before implementation begins.
4. Record the granted claim by setting `Status: active`, `Owner`, `Claimed`, and
   `Worktree/branch`. A task's own file is always an allowed path for lifecycle
   metadata.
5. Re-read its acceptance criteria before making changes.
6. Stay within its allowed paths. If scope must expand, record it first in the
   task or create a follow-up task.
7. Add short timestamped progress notes at meaningful checkpoints.
8. Run the task's verification commands and record exact results.
9. Set `Status: review` when implementation is finished. Clear implementation
   ownership and have the orchestrator assign `Reviewer` and `Review claimed`.
   Do not self-approve a security-sensitive task.
10. A reviewer moves it to `done` only after recording findings and satisfying
    every criterion. If remediation is needed, return it to `active`, clear
    review ownership, record required changes, and have the orchestrator reassign
    implementation ownership.

Allowed statuses are `proposed`, `ready`, `active`, `blocked`, `review`, and
`done`. One agent owns at most one active implementation task at a time.

## Parallel-work rules

- Prefer tasks with disjoint path ownership. The orchestrator serializes claims
  in a shared workspace.
- Never modify, delete, reset, or reformat another active task's files.
- Preserve user and agent changes that are outside the task.
- Broad formatting, dependency upgrades, and generated-file changes need their
  own task because they create cross-task conflicts.
- If shared files must change, nominate one integration task/owner. Other agents
  provide patches or notes instead of editing the shared file concurrently.
- Commits should contain one task ID and one coherent concern.
- Never bypass a failing test to unblock another agent.

## Decision and documentation discipline

- Record lasting decisions as ADRs using `docs/decisions/ADR_TEMPLATE.md`. A task
  must reserve an exact ADR filename before parallel work begins.
- ADRs are append-only history. Supersede an old ADR with a new one rather than
  rewriting why the previous decision was made.
- Update the threat model when a trust boundary or metadata exposure changes.
- Update the protocol version and migration story before changing persisted or
  transmitted formats.
- Say what is unknown. Do not convert an assumption into a security claim.

## Baseline quality expectations

- TypeScript must be strict; avoid `any` at trust boundaries.
- Validate all network, storage, import, and decrypted payloads against explicit
  schemas with size and depth limits.
- Use deterministic tests, synthetic fixtures, and cross-runtime test vectors.
- Fail closed on unknown critical fields, authentication failures, stale heads,
  malformed input, and unsupported versions.
- Comments should explain security intent and invariants, not restate code.
- Prefer small dependencies and standards-based interfaces.

## Stop conditions

Stop and mark the task blocked when:

- A requested action would weaken a security invariant.
- A crypto or auth choice lacks a maintained implementation or test vectors.
- A format change has no migration/rollback design.
- Required work overlaps an active task and cannot be separated.
- Real production secrets would be needed for development or tests.

Record the blocker and the smallest user or design decision needed to proceed.
