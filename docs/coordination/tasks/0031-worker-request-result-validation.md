# TASK 0031 — Worker request/result validation

Status: done
Owner: unassigned (handoff remediated by `/root`)
Claimed: 2026-08-01T11:29:12Z
Worktree/branch: shared-worktree (`main`)
Reviewer: `/root/task_0031_review`
Review claimed: 2026-08-01T11:49:36Z
Depends on: 0030
Blocks: ADR-0016 idle auto-lock
Security-sensitive: yes

## Outcome

Every item operation validates its result against the worker's own parsed
request before the global response parser and window broker independently
validate it.

## Context

The 2026-08-01 integrity audit found that `compute-totp`, `generate-password`,
and `generate-passphrase` retain three distinct validation legs, while
`list-item-summaries`, `get-item`, `create-item`, `update-item`, and
`delete-item` omit the worker-local request/result leg. Global response parsing
cannot establish request identity, and the window broker is a separate trust
boundary rather than a substitute.

ADR 0008 already assigns encrypted storage orchestration and key-bearing
session work to the dedicated vault worker. This task makes that boundary fail
closed without changing the decision. Item-operation responses are an internal,
same-build window/worker contract; adding explicit vault and deletion identity
does not change persisted or network formats, public APIs, cryptography, or
server-visible metadata. The worker protocol moves from v1 to v2. Window and
worker artifacts are deployed atomically, no service worker or cross-build
compatibility exists yet, and mixed v1/v2 messages fail closed at the protocol
field rather than attempting migration.

## Allowed paths

- This task file
- `docs/coordination/HANDOFF.md`
- `CLAUDE.md`
- `apps/web/src/local-vault.ts`
- `apps/web/src/vault-worker-client.ts`
- `apps/web/src/vault-worker-protocol.ts`
- `apps/web/src/vault-worker-runtime.ts`
- `apps/web/test/local-vault.test.ts`
- `apps/web/test/vault-worker.test.ts`
- `apps/web/test/browser/vault-worker.browser.ts`
- `apps/web/scripts/test-production.mjs`

## Out of scope

- Crypto/envelope changes, persistence migrations, network protocols, or new
  dependencies.
- UI behavior, idle auto-lock, clipboard handling, recovery, search, sync, or
  service-worker delivery.
- Broad refactoring of the worker broker, repository, or domain model.
- Claiming stronger memory erasure or cross-vault support than currently exists.

## Acceptance criteria

- [x] The worker validates request-specific semantics for all five item
      operations before returning a response.
- [x] Item, revision, summary-page, and deletion responses bind the parsed
      `vaultId`; item/revision/deletion identities bind the relevant request
      fields.
- [x] Create accepts only generation 1 and key version 1; update accepts only
      the requested item, exact generation successor, and requested key version.
- [x] Summary pages reject excess rows, duplicate IDs, non-increasing order,
      cursor regressions, and a `nextCursor` that is not the greatest returned
      ID.
- [x] Deletion returns an actual repository/session deletion receipt and rejects
      a receipt that differs from the requested item, generation, or key version.
- [x] The global response parser remains a distinct exact-shape validation leg,
      and the window broker independently repeats request/result checks.
- [x] Adversarial tests prove each invalid worker result fails before it can be
      accepted; ordinary browser CRUD remains functional.
- [x] Persisted formats, network formats, emitted metadata, crypto behavior, and
      dependencies are unchanged; fixtures remain synthetic.
- [x] The internal worker protocol is v2; v1 messages fail closed, and the
      same-build compatibility rule is recorded in the handoff.
- [x] A separate reviewer attacks an identifiable committed artifact before
      closure.

## Verification

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
pnpm --filter @neutron/web test:browser
pnpm --filter @neutron/web test:production
git diff --check
```

## Progress log

- 2026-08-01T11:29:12Z — Verified clean TASK-0030 checkpoint `362ed38`, no
  active/review task overlap, and read the required project documents, ADR 0008,
  TASK-0030, runtime/protocol audit finding, and relevant implementation paths.
  Reserved and claimed TASK-0031.
- 2026-08-01T11:38:53Z — Added worker-local item result validation, vault-bound
  item responses, an actual deletion receipt, independent client checks, and
  adversarial unit coverage. Bumped the internal worker contract to v2 so the
  response-shape change is explicit; mixed v1/v2 messages fail closed. Focused
  typecheck, format check, and 27 tests across the worker/local-vault files pass.
- 2026-08-01T11:40:14Z — Full ordinary gates and browser tests passed, but the
  production flow timed out because its intentional external-worker conflict
  probe sent five hard-coded v1 requests. Expanded the allowed paths before
  remediation; this is required harness compatibility coverage for the explicit
  v2 contract, not a product or policy change.
- 2026-08-01T11:44:09Z — Final candidate gates passed without retry: frozen
  install; typecheck; lint/format across 110 files; 13 files / 110 unit tests;
  root build with seven-file verification; browser tests 4 files / 35 Chromium
  and 3 files / 3 engine-matrix tests; production exact-CSP Chromium flow; and
  `git diff --check`. Emitted assets are `index-DM6_k2C4.js` (315,355 bytes),
  `vault-worker-entry-BSdqlPuJ.js` (663,184 bytes), and `index-uH94Wcke.css`
  (5,922 bytes). Cleared implementation ownership and assigned independent
  review of the committed candidate to `/root/task_0031_review`.
- 2026-08-01T11:49:36Z — Accepted the review BLOCK recorded in `e81fdd1` and
  applied its documentation-only remedy. Updated the handoff opening and
  appended a current TASK-0031 checkpoint naming `fb2f458`, the atomic
  same-build v2 rule, unconditional v1/mixed rejection, actual gate evidence,
  current BLOCK, and next safe action. No product code changed. Returned the
  task to the same independent reviewer for confirmation of the exact committed
  remediation.
- 2026-08-01T11:51:06Z — Independent confirmation of exact documentation
  remediation commit `dfc226b` returned PASS with P0 0 / P1 0 / P2 0. Closed
  TASK-0031.

## Handoff

The five item operations now bind worker results to their parsed request before
the response crosses the worker boundary. The exact-shape parser and window
broker repeat distinct checks. Delete returns a receipt built from the matched
record after the conditional deletion succeeds. The internal worker contract is
v2; v1 messages and mixed-build traffic fail closed, and the production conflict
probe uses v2.

No persisted/network format, crypto operation, dependency, UI behavior, or
server-visible metadata changed. Independent review and documentation-only
remediation confirmation are complete.

## Review

### 2026-08-01T11:48:02Z — BLOCK on exact commit `fb2f458c`

Reviewer: `/root/task_0031_review` (did not implement the candidate)

Verdict: **BLOCK — P0 0 / P1 1 / P2 0**.

#### P1 — checked handoff criterion is false and the handoff contradicts the candidate

Acceptance criterion 9 requires the v2 same-build compatibility rule to be
recorded in `docs/coordination/HANDOFF.md`, and the candidate marks that
criterion complete. Exact commit `fb2f458c` does not change the handoff at all:
its SHA-256 is byte-identical to the parent (`d04d22f60e68742dce4136c4e07fb90a19cfe25786385bc7cb4e3ebe5d536525`).
The latest handoff checkpoint instead says TASK-0031 does not exist, must not
change worker validation, and may only now be planned. It contains no v2
same-build/fail-closed compatibility rule. This leaves a security-sensitive
internal protocol change with a falsely checked transfer criterion and an
authoritative session checkpoint that directly contradicts repository state.

Remediation is documentation-only: append a current TASK-0031 implementation
checkpoint to `docs/coordination/HANDOFF.md` naming exact commit `fb2f458c`, the
v2 same-build deployment rule, unconditional v1/mixed-version rejection, actual
gate evidence, current review BLOCK, and the next safe action. Preserve the old
handoff sections as history. Then return this task to review for a fresh
independent confirmation; do not alter product code to address this finding.

#### Controls independently confirmed

The implementation itself held against the requested attacks:

- `validateItemOperationResult` is a worker-runtime function distinct from
  `parseVaultWorkerResponse` and the client broker. Each of the five dispatch
  branches calls it before returning; `#send` applies the global parser later,
  and `VaultWorkerClient.#receive` checks pre-send expectations after parsing.
- Requests and responses require protocol 2 exactly; protocol 1 rejects. Item,
  revision, summary, and deletion results have exact v2 global shapes. The
  worker and client both bind `vaultId`; get/update/delete bind item identity;
  create binds generation 1/key version 1; update binds the exact successor and
  requested key version; deletion binds all three requested identity fields.
- Summary validation independently enforces the request limit, cursor floor,
  per-collection strict order, cross-collection uniqueness, and greatest-ID
  `nextCursor`; an empty page carrying a cursor rejects.
- `LocalVaultSession.deleteItem` constructs its frozen receipt from `current`
  only after `applyConditionalBatch` has deleted the exact matched wrapper and
  payload and the operation epoch has been rechecked. The runtime does not echo
  the request as the deletion receipt.
- The diff changes no dependency or lock file, package, crypto primitive,
  persisted record shape, network path, or server-visible metadata. The v2
  fields repeat identities already held by the requesting window.
- The production external-worker conflict probe sends protocol 2 and the exact
  CSP Chromium flow passed; ordinary unit and browser CRUD remained green.

Commands independently run against `fb2f458c` without retry:

```text
pnpm --filter @neutron/web exec vitest run test/vault-worker.test.ts test/local-vault.test.ts
  pass; 2 files / 27 tests
pnpm typecheck
  pass
pnpm lint
  pass; 110 files
pnpm format:check
  pass; 110 files
pnpm test
  pass; 13 files / 110 tests
pnpm build
  pass; Verified 7 production files
pnpm --filter @neutron/web test:browser
  pass; 4 files / 35 Chromium tests and 3 files / 3 engine-matrix tests
pnpm --filter @neutron/web test:production
  pass; Verified 7 production files; Production CSP Chromium flow passed
git diff --check
  pass
```

The review made no product-code edits. Its only working-tree change is this
task-file review record and lifecycle metadata.

### 2026-08-01T11:51:06Z — remediation confirmation on exact commit `dfc226b`

Reviewer: `/root/task_0031_review` (same independent reviewer; did not implement
the candidate or remediation)

Verdict: **PASS — P0 0 / P1 0 / P2 0**.

The documentation-only remedy fully discharges the prior P1. The handoff
opening names implementation `fb2f458` and the BLOCK record `e81fdd1`, says the
task is not yet done at the reviewed remediation commit, and directs readers to
the appended current checkpoint instead of treating old queue sections as live
instructions. The appended checkpoint accurately records:

- the atomic same-build protocol-v2 rule;
- unconditional protocol-v1 and mixed-v1/v2 rejection with no shim or data
  migration;
- the implementation and independent-review commands actually run, including
  the explicit statement that the reviewer did not repeat frozen install;
- implementation commit `fb2f458`, committed BLOCK record `e81fdd1`, current
  review status, and confirmation as the next safe action; and
- explicit non-claims for connected CI, deployment, Stage 5 approval, and real
  credentials.

The older TASK-0028 through TASK-0030 sections remain unchanged historical
records below the updated opening. Exact remediation commit `dfc226b` changes
only `docs/coordination/HANDOFF.md` and this task file; no product, test, build,
dependency, protocol implementation, crypto, persistence, or network path
changed.

Proportionate confirmation commands:

```text
git cat-file -t fb2f458
git cat-file -t e81fdd1
  pass; both resolve to commits and are ancestors of dfc226b
git diff --name-status dfc226b^ dfc226b
  pass; HANDOFF.md and TASK-0031 only
git diff --check dfc226b^ dfc226b
  pass
rg <TASK-0031 checkpoint and compatibility claims> docs/coordination/HANDOFF.md
  pass; opening and appended checkpoint contain every required claim
```

No implementation, unit, browser, or production gate was repeated for this
confirmation because `dfc226b` is documentation-only and the preceding review
already ran those gates against exact implementation commit `fb2f458`.
