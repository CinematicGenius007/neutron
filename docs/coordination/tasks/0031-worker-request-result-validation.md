# TASK 0031 — Worker request/result validation

Status: review
Owner: unassigned (implemented by `/root`)
Claimed: 2026-08-01T11:29:12Z
Worktree/branch: shared-worktree (`main`)
Reviewer: `/root/task_0031_review`
Review claimed: 2026-08-01T11:44:09Z
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
- [ ] A separate reviewer attacks an identifiable committed artifact before
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

## Handoff

The five item operations now bind worker results to their parsed request before
the response crosses the worker boundary. The exact-shape parser and window
broker repeat distinct checks. Delete returns a receipt built from the matched
record after the conditional deletion succeeds. The internal worker contract is
v2; v1 messages and mixed-build traffic fail closed, and the production conflict
probe uses v2.

No persisted/network format, crypto operation, dependency, UI behavior, or
server-visible metadata changed. Independent review of the committed candidate
is still required before closure.

## Review

Pending independent review of a committed implementation artifact.
