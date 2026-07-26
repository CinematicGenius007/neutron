# TASK 0005 — Test-vector and adversarial harness design

Status: blocked
Owner: unassigned
Claimed: —
Worktree/branch: shared-worktree (main)
Reviewer: unassigned  
Review claimed: —  
Depends on: 0001, 0003  
Blocks: Stage 1 crypto implementation  
Security-sensitive: yes

## Outcome

Define and scaffold runtime-neutral positive and negative vectors for every
persisted cryptographic operation and parser boundary.

## Allowed paths

- This task file for lifecycle metadata
- `packages/test-vectors/**`
- Test-only configuration
- `docs/security/**`
- `docs/protocol/**`
- `packages/test-vectors/package.json` and `pnpm-lock.yaml` only if a
  test-harness JSON Schema validator is required; no production dependency may
  be added.

## Out of scope

- Product UI, server API, and choosing different primitives.

## Acceptance criteria

- [ ] Browser and Node harnesses consume the same immutable vectors. Runtime-neutral
      adapters and the immutable catalog exist, but browser execution is blocked.
- [x] Wrong key/AAD/version, mutation, truncation, extension, and oversized cases
      are represented.
- [x] Fixtures are synthetic and contain no operational secrets.
- [x] Vector generation is separated from vector verification.
- [ ] Independent review is recorded.

## Progress log

- 2026-07-26T00:00:00Z — Blocked on repository and envelope specification.
- 2026-07-26T14:42:52Z — Dependencies are complete: TASK 0001 is done and TASK
  0003 closed after an independent PASS review. Claim granted to `/root` in the
  shared worktree. The bounded harness will use the existing synthetic fixture
  and schema, preserve generation/verification separation, and add executable
  Node verification. A browser adapter boundary will be included, but browser
  execution cannot be claimed unless an actual browser runtime is available.
- 2026-07-26T14:49:52Z — Added the immutable v1 synthetic catalog, its recorded
  SHA-256 digest, an Ajv Draft 2020-12 schema-validation test, and a
  runtime-neutral verifier contract with no generation API. The catalog has 42
  cases (24 explicit rejections): HKDF and Argon2id known answers; six password
  encoding/bounds cases; all eight envelope kinds and seven registered labels;
  canonical payload and fixed-child padding; parser/authentication/bounds
  failures; zero/initial/incremented/stale/overflow generations; and six
  minimum-ARK-migration/full-rotation cases. No product crypto provider,
  account-state transaction, or server behavior was implemented.

## Handoff

An independent security reviewer should first verify that the catalog's labels,
kind bounds, rejection codes, and migration assertions exactly match ADR 0010
and `docs/protocol/crypto-envelope.md`; in particular, try to find a boundary
that is represented only by an assertion rather than an exact supplied
cryptographic input/output. Then review the digest/version policy and verify
that `VectorVerifier` cannot generate or overwrite expected values. Browser and
provider execution remain blocked, so do not treat the representation tests as
cryptographic interoperability evidence.

## Verification

2026-07-26T14:49:52Z — Node: `pnpm exec vitest run
packages/test-vectors/test/catalog.test.ts` exited 0 (one file, five tests).
It executed Ajv Draft 2020-12 validation, rejected a deliberately malformed
catalog, verified the fixture SHA-256 digest, checked required coverage and
explicit rejection codes, and exercised exact adapter-result comparison without
generating expectations. Browser: not executed and not claimed; the repository
has neither a production XChaCha20-Poly1305/Argon2id provider nor a browser test
runner. The shared catalog and runtime-neutral adapter boundary are ready for
both runtimes once those dependencies exist.

2026-07-26T14:49:52Z — `pnpm install --frozen-lockfile`, `pnpm typecheck`,
`pnpm lint`, `pnpm format:check`, `pnpm test`, and `pnpm build` each exited 0.
`pnpm test` executed the five new Node tests. `git diff --check` exited 0.

Blocker: exhaustive positive/negative primitive and envelope verification cannot
execute without the Stage 1 production crypto provider, and a browser claim
would be false without a real browser runner. A successor implementation task
must add independently observed deterministic provider outputs to this catalog's
adapter execution, run it in Node and a real browser, and arrange independent
security review before changing this task to `review`.

## Review

Pending; independent security review required.
