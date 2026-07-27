# TASK 0005 — Test-vector and adversarial harness design

Status: done
Owner: `/root`
Claimed: 2026-07-27T02:18:08Z
Worktree/branch: shared-worktree (main)
Reviewer: `task_0005_final_reviewer`
Review claimed: 2026-07-27T04:33:02Z
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

- [x] Browser and Node harnesses consume the same immutable vectors. The catalog
      remains a candidate until final independent review accepts it.
- [x] Wrong key/AAD/version, mutation, truncation, extension, and oversized cases
      are represented.
- [x] Fixtures are synthetic and contain no operational secrets.
- [x] Vector generation is separated from vector verification.
- [x] Independent review is recorded.

## Progress log

- 2026-07-27T02:18:08Z — Orchestrator reclaimed Task 0005 after independent
  review of `7d9447c` found one P1 and one P2. The bounded remediation will
  define and execute the state-generation operation contract, add missing root
  successor and invalid-transition coverage, synchronize exported pending
  manifest types, then continue directly into concrete envelope/migration
  candidate generation and real-browser execution.
- 2026-07-27T04:33:02Z — Completed the Task-0005-owned catalog and moved the
  task to independent review. The executable catalog now contains 83 exact
  cases: 24 successes and 59 rejections, including 35 individual parser
  hardening probes beyond the original grouped requirements. A generator-
  independent portable Noble adapter verifies all cases in Node and real
  Chromium. The pending manifest now contains only Task-0010 Stage-3 records.
  Crypto migration outputs are exact envelope bundles and deliberately contain
  no account-state activation result.
- 2026-07-27T05:05:40Z — Remediated final-review findings: added exact-total-
  length payload rejection cases for a 4,113-byte nonmultiple ciphertext and a
  4,111-byte below-minimum ciphertext; restricted repeat-output recipes to
  password vectors; and bounded envelope password key-source bytes to 1–1,024.
  The catalog now has 83 cases and returns to the same independent reviewer.

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
- 2026-07-26T16:34:57Z — Boundary remediation claim granted to `/root` after
  `task_0005_boundary_reviewer` returned FAIL with 0 P0, 3 P1, and 1 P2:
  expectation aliasing remained schema-valid, the TypeScript brand was forgeable
  at runtime, assertion-only successes were not executable, and the task record
  omitted those defects. This pass is limited to strict boundary/schema honesty
  and coordination records; it will not generate the full vector set or configure
  browser execution.
- 2026-07-26T16:55:00Z — Audited all 42 candidate entries against the stated
  executable definition. Six are executable: HKDF-SHA-256 (one success),
  Argon2id (one success), and password encoding (two successes, two rejections).
  The other 36 are separate pending requirements: password encoding (one success,
  one rejection), envelope (nine successes, 14 rejections), state-generation
  (two successes, three rejections), and migration (two successes, four
  rejections). The executable catalog has strict operation-discriminated
  branches and exact byte/state/rejection result unions; the pending manifest has
  no executable `expect` form. Its digest covers the six executable candidates
  only. The prior module-private WeakSet boundary was retained unchanged. This
  task remains blocked on concrete reviewed envelope/migration material and
  real-browser execution.
- 2026-07-26T18:09:53Z — Remediated the independent review of `50bb394`: the
  uint64 schema pattern now has a tested `2^64-1` ceiling and runtime validation
  adds a `BigInt` ceiling; canonical-state comparison explicitly compares field
  names and values without insertion-order dependence; valid password vectors
  now use Unicode scalar arrays rather than pre-encoded bytes; and pending
  records now use schema-validated document/heading references plus a required
  outcome. Tests enforce pending/executable disjointness, 42 unique combined
  IDs, pending-ID uniqueness, outcome-derived counts, and reference resolution.
  The task returns to blocked: concrete reviewed envelope/migration material and
  real-browser execution remain out of scope blockers.
- 2026-07-27T02:05:51Z — Resolved the coordination finding from the independent
  review of `720c440`. The catalog now has 19 executable vectors (including the
  two password-size boundaries and 11 envelope-local generation actions). The
  pending manifest has 27 Task-0005 Stage-1 records and five Task-0010 Stage-3
  records, with schema-enforced owner/stage/dependency metadata and 42 unique
  originating requirement IDs. Task 0010 records authenticated stale/replay,
  live-child-set, atomic-activation, and public-binding vector work after Task
  0004. Task 0005 remains blocked only on its own concrete envelope and
  cryptographic-migration vectors plus real-browser execution.

## Handoff

The final reviewer should attempt to disprove generator/verifier separation,
every error-code precedence choice, exact envelope and migration bytes, the 33
additional parser-boundary probes, and parity between Node and real Chromium.
After PASS, freeze the recorded digest and unblock Stage 1 production-provider
work. Task 0010 remains the sole owner of authenticated activation, live-child
authority, stale/replay decisions, and mutation-signing public bindings.

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

2026-07-26T15:49:57Z — The validated catalog is now defensively copied/frozen
and branded before verification; adapters receive a separately copied/frozen
request. Normal `pnpm test` no longer imports the reference generator. Explicit
`pnpm --filter @neutron/test-vectors test:generate` runs the separate generator
test and anchored HKDF, Argon2id, and XChaCha outputs. The catalog is still
metadata-heavy and no real-browser runner is configured, so this task remains
blocked.

2026-07-26T16:34:57Z — Added a module-private runtime registry so forged or
spread validated-catalog wrappers fail before an adapter can run; regression
tests cover both JavaScript-level forgeries. This does not resolve the remaining
strict operation-schema, executable-versus-pending-manifest, or browser-execution
work; all are blockers before concrete catalog generation may proceed.

2026-07-26T16:55:00Z — `pnpm install --frozen-lockfile`, `pnpm test` (one file,
eight tests), `pnpm --filter @neutron/test-vectors test:generate` (one generator
test; anchored HKDF, Argon2id, and XChaCha values unchanged), `pnpm typecheck`,
`pnpm lint`, `pnpm format:check`, `pnpm build`, and `git diff --check` each
exited 0. Schema adversarial tests reject input/expect aliases; input `outcome`,
`output`, `error`, and `expect` fields; HKDF `banana`/`potato` fields;
odd/uppercase hex; wrong Argon2 salt length; empty envelope input; wrong envelope
key/nonce/salt/header/account-ID lengths; unknown operation fields; success without output,
success-plus-error, rejection-plus-output, and unsafe uint64 JSON numbers.
They also prove invalid catalogs never invoke an adapter; duplicate executable
IDs fail at loading; source and request mutation are ineffective; and forged,
spread, structured-cloned, prototype-derived, and second-module wrappers fail
before adapter invocation. Browser execution remains unconfigured and is not
claimed.

2026-07-26T18:09:53Z — `pnpm install --frozen-lockfile`, `pnpm test` (one file,
14 tests), `pnpm --filter @neutron/test-vectors test:generate` (one generator
test; HKDF, Argon2id, and XChaCha anchors unchanged), `pnpm typecheck`, `pnpm
lint`, `pnpm format:check`, `pnpm build`, and `git diff --check` each exited 0.
The uint64 schema/runtime boundary accepts 0, 1, `18446744073709551614`, and
`18446744073709551615`; it rejects leading-zero, signed, fractional,
exponent-form, over-limit, and JSON-number inputs. The reference test resolved
all pending document/heading pairs against the current Markdown sources.

2026-07-27T02:05:51Z — `pnpm install --frozen-lockfile`, `pnpm test` (one file,
15 tests), `pnpm --filter @neutron/test-vectors test:generate` (one generator
test; HKDF, Argon2id, and XChaCha anchors unchanged), `pnpm typecheck`, `pnpm
lint`, `pnpm format:check`, `pnpm build`, and `git diff --check` each exited 0.
Tests derive executable, Stage-1-pending, Stage-3-deferred, outcome, and
originating-ID counts from validated fixture data; validate both password byte
boundaries and all 11 envelope-local generation actions; and reject owner/stage/
dependency schema violations. Browser execution remains unconfigured and is not
claimed.

2026-07-27T04:33:02Z — Completion verification: `pnpm install
--frozen-lockfile`, `pnpm test` (17 Node tests, including all 83 vectors),
`pnpm --filter @neutron/test-vectors test:generate` (three separated generator
tests), `pnpm --filter @neutron/test-vectors test:browser` (one real headless
Chromium test over all 83 vectors), `pnpm typecheck`, `pnpm lint`, `pnpm
format:check`, `pnpm build`, and `git diff --check` each exited 0. Browser
execution used pinned `@vitest/browser-playwright@4.1.10`,
  `playwright@1.62.0`, and Playwright Chromium v1234.
  The complete recovery-root envelope was separately reproduced with
  Node/OpenSSL HKDF-SHA-256 and native libsodium 1.0.22; both the derived key
  and 51-byte ciphertext matched the committed candidate exactly.

Blocker: none. Task 0010 retains the five authenticated-state requirements and
blocks Stage 3, not Task 0005 or Stage 1.

## Review

2026-07-27T05:05:40Z — FAIL pending remediation review —
`task_0005_final_reviewer` found 0 P0, 1 P1, and 2 P2 after reproducing all
Node/browser/security gates. The catalog omitted an exact-length nonmultiple
payload bound; repeat-output recipes were overbroad; and envelope password
bytes lacked the schema-level 1–1,024 bound. All three findings are remediated
in the current review candidate.

2026-07-27T05:19:56Z — PASS — `task_0005_final_reviewer` found 0 P0, 0 P1,
and 0 P2 after remediation. It confirmed both exact-total payload length bounds,
password-only repeat recipes, the 1–1,024-byte envelope password boundary, the
83-case/24-success/59-rejection accounting, digest integrity, Node execution,
generator anchors, and the orchestrator's real-Chromium execution. Task 0005 is
done and Stage 1 production-provider work is unblocked.

2026-07-27T02:18:08Z — FAIL — `task_0005_ownership_reviewer` found 0 P0, 1 P1,
and 1 P2. The ownership split and all 42 originating-requirement mappings are
correct, but the 11 state-generation records were counted rather than executed,
their action semantics were underdefined, and root successor coverage was
missing. The exported pending-manifest type also omitted four schema-required
ownership fields. Task returned to active for remediation.

2026-07-26T15:26:49Z — FAIL — `task_0005_reviewer` found no P0 and four P1
findings: expectation echoing, scenario-only vectors, an underconstrained schema,
and NUL-delimited assertion comparison. Remediation is incomplete until concrete
vector coverage and browser execution are complete.

2026-07-26T16:34:57Z — FAIL — `task_0005_boundary_reviewer` found 0 P0, 3 P1,
and 1 P2: schema-valid expectation aliasing, a forgeable runtime brand,
assertion-only executable successes, and an incomplete blocker record. The
runtime-brand issue is remediated; the remaining boundary findings are open.

2026-07-26T16:44:08Z — PASS — bounded independent runtime-boundary review of
commit `f371ddc` found 0 P0, 0 P1, and 0 P2. It confirmed the WeakSet registry
rejects plain/spread forgeries, structured clones, prototype wrappers, and
second-module wrappers before adapter invocation, and confirmed freeze/copy
behavior. This review did not approve the still-pending schema/catalog split or
browser execution.

2026-07-26T18:01:57Z — FAIL — independent review of `50bb394` found 0 P0, 3
P1, and 2 P2: uint64 overflow accepted by schema/runtime regex, order-sensitive
canonical-state comparison, echoable pre-encoded password inputs, stale pending
references, and prose-only pending outcomes. This remediation is limited to
those findings.

2026-07-27T01:57:04Z — PASS with coordination follow-up — independent review
of `720c440` found all bounded code/security remediation passing, but identified
one P1: the Task 0005 blocker omitted password/state work and left Task-0004
authenticated-state ownership implicit. This follow-up remediates only that
coordination finding.
