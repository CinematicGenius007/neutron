# TASK 0012 — Canonical v1 envelope codec

Status: done
Owner: `/root`
Claimed: 2026-07-27T17:07:12Z
Worktree/branch: shared-worktree (main)
Reviewer: `task_0012_codec_reviewer`
Review claimed: 2026-07-27T22:58:00Z
Depends on: 0003, 0005, 0011
Blocks: Stage 1 local encrypted-vault implementation
Security-sensitive: yes

## Outcome

Implement the canonical runtime-portable v1 envelope encoder, structural
parser, authenticated opener, password conversion, key derivation, wrapper and
payload plaintext codecs, and minimum ARK child rewrap operation.

## Context

ADR 0010 and `docs/protocol/crypto-envelope.md` are normative. Task 0005
provides the frozen 83-case catalog and Task 0011 provides the reviewed
production primitive provider. This task joins those boundaries without
changing the protocol or immutable vectors.

## Allowed paths

- This task file for lifecycle metadata
- `packages/protocol/**`
- `packages/test-vectors/**` only for production-codec conformance adapters and
  Node/browser tests; immutable fixtures, digest, schemas, and generator outputs
  must not change
- `pnpm-lock.yaml` only if package metadata requires a lockfile update

## Out of scope

- Authenticated account-state monotonicity, replay, and atomic server commit
- Mutation-signing semantics and public-key binding
- Storage, sync, API, UI, account auth, recovery ceremony, import, and export
- Deterministic caller-selected salt or nonce in the public production writer
- Changing ADR 0010, the normative protocol, or frozen vectors

## Acceptance criteria

- [x] Parser validates the fixed header and every kind-specific structural bound
      before KDF, AEAD, or ciphertext-sized allocation.
- [x] Password scalar conversion rejects invalid Unicode and enforces the exact
      1–1,024-byte limit before Argon2id.
- [x] Authentication data, derivation labels, wrapper plaintexts, and payload
      padding are canonical and fail closed.
- [x] Public writers obtain every salt and nonce from the provider CSPRNG and
      expose no deterministic production mode.
- [x] Minimum ARK migration rewraps every validated live child or returns no
      partial replacement set.
- [x] The production codec passes all applicable immutable vectors in Node and
      real Chromium without modifying the catalog or digest.
- [x] Adversarial tests prove structural rejection occurs before KDF/AEAD and
      unauthenticated plaintext is never returned.
- [x] Frozen install, tests, typecheck, lint, format check, build, diff check,
      and independent security review pass.

## Verification plan

Run the complete repository gates, targeted Node tests, the real Chromium
catalog adapter, immutable digest validation, mutation/failure probes, and an
independent read-only security review.

## Progress log

- 2026-07-27T17:07:12Z — Claimed immediately after Task 0011 final independent
  PASS and commit `e5b79df`. Began mapping the normative wire format and frozen
  catalog into a narrow production API.
- 2026-07-27T22:58:00Z — Implemented the codec, two-phase minimum child rewrap,
  password/generation helpers, full production catalog adapter, Node
  conformance, and real-Chromium conformance. Moved to independent review.
- 2026-07-27T23:02:34Z — First review found provider-output trust/alias gaps,
  insufficient pre-crypto instrumentation, and nonincremental password bounds.
  Remediated with exact type/length and overlap-safe provider outputs, a
  34-case catalog-derived zero-primitive-call matrix, dishonest-provider
  regressions, and incremental 1,024-byte password rejection.

## Verification

2026-07-27T23:08:00Z — Frozen install was retained after the reviewed lockfile
change. `pnpm test` passed 31 tests; the dedicated production catalog passed all
83 immutable cases; typecheck, lint, format check, build, and diff check passed.
Real Chromium passed both independent portable and production adapters (83
cases each). The immutable fixture and digest were unchanged.

## Handoff

After independent PASS, Stage 1 can consume this package for local encrypted
vault persistence without reimplementing cryptographic semantics.

## Review

First pass: FAIL (0 P0, 2 P1, 2 P2). A second pass found one remaining P1 in
migration nonce ownership. After remediation, final review PASS with no P0,
P1, or P2 findings. The reviewer independently reproduced the former alias
attack against built output and confirmed the caller-owned old ARK remains
unchanged.
