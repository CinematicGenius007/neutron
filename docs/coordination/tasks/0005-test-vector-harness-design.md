# TASK 0005 — Test-vector and adversarial harness design

Status: active
Owner: /root
Claimed: 2026-07-26T15:49:57Z
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
- `packages/test-vectors/package.json` and `pnpm-lock.yaml` for the reviewed,
  test-only reference generator dependency required by remediation.

## Out of scope

- Product UI, server API, and choosing different primitives.

## Acceptance criteria

- [ ] Browser and Node harnesses consume the same immutable vectors. The catalog
      remains a candidate pending concrete-vector completion and browser execution.
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
- 2026-07-26T15:26:49Z — Remediation claim granted to `/root` in the shared
  worktree after independent reviewer `task_0005_reviewer` returned FAIL: no P0
  findings and four P1 findings. The prior scaffold allowed expectation echoing,
  had unsafe assertion comparison, used an underconstrained schema, and supplied
  scenario metadata rather than deterministic concrete vectors. The candidate
  catalog must not be described as immutable until it is complete and passes a
  new independent review. Exact test-only generator dependency paths are now
  reserved above; no production provider will be added.
- 2026-07-26T15:30:50Z — Remediated the runner trust boundary: adapters receive
  only `VectorRequest` (never `expect`), observations are runtime-validated,
  assertion comparison is length-and-element exact, and malformed/duplicate
  observations fail. Added semantic duplicate-ID validation and schema branches
  that make success/error and rejection/output mutually exclusive. Added a
  separate test-only Noble reference generator for deterministic XChaCha20-
  Poly1305, HKDF-SHA-256, and Argon2id candidate generation. The existing 42
  cases are still not a complete concrete catalog, so the digest remains a
  candidate-only integrity check and the task is blocked.
- 2026-07-26T15:49:57Z — Remediation claim granted to `/root` after independent
  reviewer `task_0005_remediation_reviewer` returned FAIL with no P0 and three
  P1 findings: the schema is not operation-discriminated, assertion-only success
  cases cannot be honestly verified, and the generator smoke test lacks an
  independent anchor. An object-alias probe also reproduced expectation exposure.
  This pass will make validated loading mandatory, remove the generator from the
  default test graph, and use exact primitive anchors before further catalog work.

## Handoff

An independent reviewer should verify adapters cannot access expected values,
including through object aliases; malformed observations and duplicate IDs fail;
and `['a', 'b']` never compares equal to `['a\\u0000b']`. The next implementer
must use the separate Noble generator to replace every scenario-only entry with
concrete reviewed envelope bytes or base-vector-plus-mutation recipes before
regenerating the catalog digest. Do not accept current representation tests as
interoperability evidence.

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

2026-07-26T15:31:57Z — Remediation verification: `pnpm install
--frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm
test`, `pnpm build`, and `git diff --check` each exited 0. Node executed one
test file with seven tests. Browser execution was not attempted: this workspace
has no configured real-browser runner. The candidate catalog remains 42 cases
(24 rejections), of which only the two primitive known answers plus the new
synthetic XChaCha generator smoke output are concrete cryptographic outputs;
the remaining scenario entries require reviewed generator output before the
catalog can be frozen.

Blocker: exhaustive positive/negative primitive and envelope verification cannot
be completed until the candidate catalog is expanded into exact reviewed
envelope/vector bytes and a real-browser runner is available. This is not a
Stage 1 production-provider dependency: `packages/test-vectors/src/reference-
generator.ts` provides the test-only primitive machinery. The smallest next step
is to generate and review concrete fixture candidates, then run the unchanged
catalog in Node and a real browser before requesting independent review.

## Review

2026-07-26T15:26:49Z — FAIL — `task_0005_reviewer` found no P0 and four P1
findings: expectation echoing, scenario-only vectors, an underconstrained schema,
and NUL-delimited assertion comparison. Remediation is incomplete until concrete
vector coverage and browser execution are complete.
