# TASK 0003 — Cryptographic envelope specification

Status: review
Owner: unassigned
Claimed: —
Worktree/branch: main (baseline 1834f95)
Reviewer: unassigned  
Review claimed: —  
Depends on: 0002  
Blocks: 0005, 0009, and Stage 1 crypto implementation  
Security-sensitive: yes

## Outcome

Specify byte-level key wrappers, item/blob envelopes, canonical encoding, AAD,
derivation labels, KDF policy, limits, versioning, and migration behavior.

## Allowed paths

- This task file for lifecycle metadata
- `docs/security/crypto-envelope.md`
- `docs/protocol/crypto-envelope.md`
- `docs/decisions/0010-crypto-envelope-format.md` (reserved)
- `packages/test-vectors/**` for non-executable vector schemas/fixtures after 0001
- `docs/MASTER_PLAN.md` to align the accepted Argon2id provider profile

## Out of scope

- Production crypto implementation or changing primitives without a new ADR.

## Acceptance criteria

- [x] Every byte and field has an encoding, length, purpose, and limit.
- [x] Nonces, salts, keys, wrappers, AAD, and labels have lifecycle rules.
- [x] The recovery wrapping key, wrapper envelope, and shared derivation-label
      registry are fixed for the authentication/recovery protocol to consume.
- [x] Unknown-version and migration behavior is explicit.
- [x] Known-answer and negative-vector format is specified.
- [ ] Independent cryptographic review is recorded.

## Progress log

- 2026-07-26T00:00:00Z — Blocked until detailed threat model is reviewed.
- 2026-07-26T04:11:12Z — Claim assigned by the orchestrator after Task 0002
  passed independent review. No active task owns this task's specification,
  ADR, or vector-schema paths.
- 2026-07-26T04:17:10Z — Added proposed ADR 0010, the version-1 fixed binary
  envelope specification, its security companion, and non-executable portable
  vector schema/fixtures. The format fixes wrapper/payload layouts, AAD,
  Argon2id policy, HKDF labels, padding, bounds, and migration behavior while
  preserving Task 0009 ownership of recovery authentication and signing.
- 2026-07-26T06:31:18Z — Remediation claim granted by the user/orchestrator.
  Independent review began against every acceptance criterion and the reported
  circular child-key label, libsodium KDF compatibility, root-wrapper lifecycle,
  password encoding, signing ownership, and vector-governance findings. The
  allowed paths now include `docs/MASTER_PLAN.md` solely to keep its accepted
  Argon2id profile consistent with the specified provider.
- 2026-07-26T06:37:50Z — Remediation completed and returned to review. The
  remediation audit confirmed all reported blockers: kind `0x03` selected
  a label from encrypted data; the selected libsodium high-level API fixes
  Argon2id to one lane and cannot reproduce the RFC vector's secret/associated
  data inputs; root wrappers lacked revisions and a compromise flow; password
  byte rules were absent; mutation-signing semantics were assigned to the wrong
  task; and the vector schema was prematurely immutable without validation.
  The specification now derives one pre-decryption `ark/child-key-wrap` key,
  validates its encrypted material type after authentication, fixes the v1
  profile to 64 MiB/three passes/one lane, defines strict unnormalized UTF-8
  input (1–1,024 bytes), adds ARK epochs and root-wrapper revisions with
  ordinary and compromise rotation stories, assigns mutation-signing material
  to Task 0004, and marks the vector document draft pending Task 0005.
- 2026-07-26T07:48:09Z — Follow-up remediation claim granted by the
  user/orchestrator after review found three remaining specification defects:
  compromise rotation did not explicitly replace exposed authorities, kind
  `0x03` leaked encrypted key type through its variable ciphertext length, and
  item/index generation rules were incomplete. A local current-state baseline
  commit (`1834f95`) was created before this change; no active task overlaps
  this task's declared paths.
- 2026-07-26T07:51:38Z — Follow-up remediation completed and returned to
  review. Compromise rotation now replaces a known exposed password or recovery
  secret before it wraps the new ARK, and recovery-secret replacement requires
  Task 0009 recovery-public-material rotation/revocation. Kind `0x03` now has
  a fixed 131-byte plaintext / 147-byte ciphertext with authenticated canonical
  zero padding. Item/index generations begin at one and are structurally
  nonzero; blobs remain zero-based. The invalid-Unicode seed fixture now carries
  explicit UTF-16BE code units rather than an embedded lone JSON surrogate.

## Handoff

Follow-up remediation is ready for a different independent cryptographic reviewer. Verify
the one-lane libsodium claim against the maintained API/source, the supplied
libsodium KAT, fixed-header offsets and size calculations, every 0x80 padding
boundary, fixed kind-`0x03` internal-padding behavior and ciphertext length,
root-wrapper epoch/revision rollback story, authority replacement for each
compromise case, item/index generation boundaries, strict password encoding
limits, and the split: Task 0004 owns mutation signing while Task 0009 owns
recovery authentication.
Do not begin Task 0005 or approve this task without an independent review.

## Verification

2026-07-26T04:17:10Z — Historical evidence superseded by the remediation below:
the former RFC 9106 Argon2id case was not compatible with the selected
libsodium high-level call because it uses four lanes plus optional secret and
associated-data inputs.

2026-07-26T06:37:50Z — `pnpm install --frozen-lockfile` exited 0 (already up to
date). `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, and
`pnpm build` each exited 0. `pnpm test` reported no test files, so this is not
evidence of implementation or cross-runtime vector coverage. `git diff --check`
exited 0; Git still has no commits and every repository file is untracked, so
that command has no tracked diff to inspect. A separate no-index whitespace
check covered each changed file. Node parsed the draft schema and fixture JSON.
A local maintained libsodium 1.0.22 `crypto_pwhash` invocation with password
`password`, salt `000102030405060708090a0b0c0d0e0f`, Argon2id v1.3, 64 MiB,
three passes, one lane, and a 32-byte output produced
`def6fd068289b9a0cf1114f8e978a2c4dab6faef377d895b9c2d59fc93fc5653`, matching
the replacement fixture. A standalone arithmetic audit passed every fixed
header offset, the 72-byte header, exact total-length formula, wrapper and
payload ciphertext bounds, 4 KiB padding boundaries, label registry, and
root-wrapper lifecycle requirements.

Remaining assumptions: browser performance for the 64 MiB/three-pass floor has
not been benchmarked; the draft schema was JSON-parsed but no JSON Schema
validator/harness exists yet; cross-runtime vectors, exhaustive negatives, and
catalog immutability remain Task 0005 work; Task 0004 and Task 0009 must define
their respective signing and authenticated-state protocols before implementation.

2026-07-26T07:51:38Z — A local current-state baseline was committed as
`1834f95 chore: establish current Neutron baseline` before follow-up edits.
The required `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`,
`pnpm format:check`, `pnpm test`, and `pnpm build` each exited 0. `pnpm test`
again reported no test files. `git diff --check` exited 0 against the baseline.
Node parsed both JSON documents; the Argon2id known-answer fixture remains
unchanged. A standalone audit passed all fixed-header offsets, total-length
formulae, normal and fixed kind-`0x03` wrapper sizes, internal-padding lengths,
payload bounds, root/child/payload generation constraints, and the required
authority-replacement statements.

Remaining assumptions: Task 0005 still owns executable JSON Schema validation,
cross-runtime execution, complete malformed-padding/generation vector coverage,
and vector immutability. Task 0004 must bind monotonic successor/stale/replay
checks to authenticated account state; Task 0009 must specify and perform the
recovery-authentication public-material rotation/revocation referenced here.

## Review

Pending; independent cryptographic review required. The implementer must not
approve this security-sensitive task.
