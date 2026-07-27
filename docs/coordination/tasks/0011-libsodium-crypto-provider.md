# TASK 0011 — Libsodium crypto provider

Status: done
Owner: `/root`
Claimed: 2026-07-27T06:02:19Z
Worktree/branch: shared-worktree (main)
Reviewer: `task_0011_provider_reviewer`
Review claimed: 2026-07-27T14:31:37Z
Depends on: 0003, 0005
Blocks: Stage 1 envelope codec
Security-sensitive: yes

## Outcome

Implement the narrow runtime-portable production cryptographic primitive API
and its pinned libsodium WASM provider.

## Context

ADR 0003 selects a TypeScript API with a maintained libsodium WASM provider.
ADR 0010 fixes XChaCha20-Poly1305-IETF, libsodium-compatible Argon2id v1.3,
HKDF-SHA-256, and CSPRNG behavior. Task 0005 supplies the immutable reviewed
cross-runtime vectors.

## Allowed paths

- This task file for lifecycle metadata
- `packages/crypto/**`
- `packages/test-vectors/**` only for production-provider conformance adapters
  and Node/browser tests; the immutable fixture, digest, and generator outputs
  must not change
- `pnpm-lock.yaml`

## Out of scope

- Envelope header encoding/decoding and wrapper/payload semantics
- Vault UI, persistence, sync, server, and account-state behavior
- Caller-controlled deterministic nonces in the production API

## Acceptance criteria

- [x] Provider initialization is explicit and race-safe in Node and browsers.
- [x] CSPRNG, Argon2id v1.3, HKDF-SHA-256, XChaCha20-Poly1305-IETF, and
      best-effort memory clearing have closed, validated interfaces.
- [x] Provider code passes applicable immutable vectors in Node and Chromium.
- [x] Invalid key/nonce/salt/length/policy inputs fail before provider calls.
- [x] Dependency version, integrity, provenance, and license are recorded.
- [x] No real secrets appear in source, fixtures, logs, or history.
- [x] Independent security review is recorded.

## Verification plan

Run frozen install, provider unit/conformance tests in Node and Chromium,
typecheck, lint, format check, build, diff check, and an independent review.

## Progress log

- 2026-07-27T06:02:19Z — Claimed after Task 0005 independent PASS. Selected
  `libsodium-wrappers-sumo@0.8.4` from the official jedisct1/libsodium.js
  package (ISC; registry integrity pinned by pnpm). The implementation will keep
  envelope parsing out of this primitive-only task.
- 2026-07-27T14:31:37Z — Implemented the runtime-portable provider with
  race-safe explicit initialization, fixed Argon2id, RFC-5869 HKDF-SHA-256,
  XChaCha20-Poly1305-IETF, CSPRNG, closed authentication errors, validation
  bounds, and best-effort clearing. Node executed 22 repository tests and real
  Chromium executed the provider vectors. Moved to independent review.
- 2026-07-27T17:05:00Z — Independent review found an unbounded HKDF IKM,
  copied primitive literals instead of catalog-bound conformance, incomplete
  transitive WASM provenance, and missing adversarial boundary instrumentation.
  Remediated all findings: every HKDF input now has the documented 4 KiB cap;
  Node and Chromium validate the frozen schema/catalog/digest before executing
  its primitive cases through the production provider; both sumo packages and
  integrities are recorded; and tests prove malformed/over-bound requests do
  not invoke libsodium while exercising exact upper bounds and wrong AAD.

## Verification

2026-07-27T17:05:00Z — Frozen install, `pnpm test` (two files, 24 tests),
`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`, and `git diff
--check` passed after remediation. `pnpm --filter @neutron/crypto test:browser`
passed one real-Chromium test covering browser CSPRNG, the validated immutable
catalog/digest primitive subset, and fixed XChaCha output.

## Handoff

After review, create a separate envelope-codec task consuming this provider and
the immutable Task 0005 catalog.

## Review

First pass: FAIL (0 P0, 2 P1, 2 P2). All findings were remediated. Final pass:
PASS with no P0, P1, or P2 findings. The reviewer confirmed the HKDF cap,
catalog/digest-bound conformance, dependency provenance, pre-provider
instrumentation, exact bounds, wrong-AAD behavior, and clean allowed-path
scope.
