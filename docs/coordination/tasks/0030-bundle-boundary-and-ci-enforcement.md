# TASK 0030 — Bundle boundary and CI enforcement

Status: review
Owner: unassigned (implemented and remediated by `/root`)
Claimed: 2026-08-01T10:50:31Z
Worktree/branch: shared-worktree (`main`)
Reviewer: `/root/task_0030_remediation_reviewer`
Review claimed: 2026-08-01T11:12:06Z (remediation re-review)
Depends on: 0029
Blocks: 0031
Security-sensitive: yes

## Outcome

The window/vault-worker boundary fails closed on renamed, moved, split, or
unclassified application modules; root `pnpm build` executes the production web
boundary; and CI reproduces the browser and exact-CSP production security gates.

## Context

Audit findings B1 and B4 show that root `pnpm build` runs only TypeScript and CI
runs neither web security gate. A separate boundary audit constructed a real
bypass: rename `local-vault.ts` to an unlisted basename and import it into the
window. The present basename denylist does not recognize the renamed module and
the build passes when no transitive crypto module exposes it.

Task 0025 repaired dead worker-plugin execution and relocation-sensitive
matching, but a list of forbidden names remains open to new names. This task
replaces that assumption with a closed classification of application source
paths and positive inventory validation. This changes enforcement, not the ADR
0008 trust boundary.

## Allowed paths

- This task file
- `docs/coordination/HANDOFF.md`
- `CLAUDE.md`
- `package.json`
- `.github/workflows/ci.yml`
- `apps/web/vite.config.ts`
- `apps/web/test/bundle-boundary.test.ts` (new)

## Out of scope

- TASK-0031 worker request/result validation.
- Product UI, worker runtime/protocol behavior, persistence, cryptography, or
  dependencies.
- Service-worker delivery, its artifact allowlist, or any ADR 0008 deferral.
- Reproducible releases, SBOMs, provenance, deployment, `_headers`, or connected
  GitHub evidence; this task writes the workflow but cannot claim a remote run.
- Widening which modules or packages may cross either boundary.

## Acceptance criteria

- [x] Every bundle-relevant file under `apps/web/src` has one explicit class:
      window-only, vault-worker-only, shared, or non-bundle; an unknown source
      path fails configuration before bundling.
- [x] Window and worker graph checks use normalized source paths rather than
      basenames, so a rename, directory move, or split creates an unclassified
      failure instead of silently widening access.
- [x] The window build permits only its window/shared application modules and
      its required workspace-package surface; the worker permits only its
      worker/shared modules and required package roots.
- [x] The exact `vault-worker-entry.ts?worker&url` reference remains the sole
      window-side exception and cannot authorize another query or file.
- [x] Unit tests reject renamed worker modules, new unclassified files,
      cross-boundary modules, forbidden workspace packages, and forged worker
      URL aliases; allowed current modules remain accepted.
- [x] Real deliberate window, worker, and unclassified-file violations each
      fail `pnpm --filter @neutron/web build`; probes are removed before commit.
- [x] Root `pnpm build` runs TypeScript and the production web build, including
      `verify-build.mjs` and both Vite boundary plugins.
- [x] CI installs the pinned Chromium, Firefox, and WebKit engines and runs both
      `test:browser` and `test:production` after the ordinary root gates.
- [x] `CLAUDE.md` names the new enforcement commands and does not claim a
      connected CI result that has not occurred.
- [x] Existing emitted artifact policy and current application behavior remain
      unchanged.
- [x] No real secrets appear in code, tests, logs, workflow, or history.
- [ ] A separate reviewer attacks an identifiable committed artifact, including
      at least one real deliberate boundary violation, before closure.

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

Also record the exact non-zero output from temporary window, worker, and
unclassified-path probes, then restore and verify every probe path is clean.

## Progress log

- 2026-08-01T10:50:31Z — Verified TASK-0029 is done and the tree is clean.
  Read ADR 0008, its normative web-delivery policy, Task 0025, audit B1/B4, the
  Vite boundary code, root/web scripts, and CI. Reserved and claimed TASK-0030.
- 2026-08-01T10:56:39Z — Replaced basename denial with a closed source-path
  classification and explicit per-build workspace surfaces. The first normal
  build exposed that workspace runtime imports resolve through `dist`; added
  only `vault-domain/dist/items.js`, the compiled counterpart of the already
  allowed source module. Normal build then passed.
- 2026-08-01T10:56:39Z — Three temporary real probes failed non-zero and were
  removed: importing `local-vault.js` from `main.tsx` failed the window build on
  `packages/crypto/dist/provider.js`; importing `app.js` from the vault-worker
  entry failed the worker build on `react.production.js`; adding an unimported
  `unclassified-boundary-probe.ts` stopped Vite configuration with
  `apps/web/src classification is incomplete`. The four probe edits/paths are
  absent from the candidate tree.
- 2026-08-01T10:56:39Z — All required commands passed: frozen install;
  typecheck; lint and format across 110 files; root tests, 13 files / 108 tests;
  root build including the web boundary and seven-file artifact verification;
  browser tests, 4 files / 35 Chromium plus 3 files / 3 engine-matrix tests;
  production build and exact-CSP Chromium flow; and `git diff --check`. Emitted
  names remain `index-C3y-6n8v.js`, `vault-worker-entry-DDLJAMuT.js`, and
  `index-uH94Wcke.css`, at 314,822, 661,361, and 5,922 bytes respectively.
- 2026-08-01T10:56:39Z — Implementation complete. Cleared implementation
  ownership, assigned `/root/task_0030_reviewer`, and moved the task to
  `review`; the reviewer must attack the committed candidate, not this mutable
  tree.
- 2026-08-01T11:00:10Z — A final adversarial pass closed repository-local paths
  outside `apps/web/src` as another relocation route, allowing only the exact
  `apps/web/index.html` window entry. Re-ran the full gate sequence. Install,
  typecheck, lint, format, 13 files / 108 unit tests, root build, and artifact
  verification passed. The first combined browser run hit the documented
  `IndexedDB deletion blocked` cleanup flake; the isolated worker test passed,
  then the complete browser suite passed 35 + 3, followed by the production CSP
  flow and diff check. This retry is recorded per `CLAUDE.md`; no product or
  test file involved in the flake changed.
- 2026-08-01T11:00:54Z — The earlier reviewer assignment preceded the final
  repository-local-path hardening, so it was not retained as the claim time.
  Assigned `/root/task_0030_reviewer` now, after the final candidate and gates,
  using this observed UTC timestamp.
- 2026-08-01T11:08:49Z — Orchestrator accepted the independent BLOCK and
  claimed bounded remediation. Scope is limited to canonical-root anchoring,
  exact full worker-query comparison, their regression tests, and records.
- 2026-08-01T11:12:06Z — Anchored application, package, and repository
  classification to their normalized canonical roots and changed the worker URL
  exception to equality with the complete normalized module ID. Added decoy
  root and prefixed/reordered/duplicated/suffixed query regressions.
- 2026-08-01T11:12:06Z — Reproduced both original exploits after remediation.
  The retained decoy module at
  `probe/apps/web/src/vault-worker-protocol.ts` failed non-zero naming that exact
  forbidden module; `vault-worker-entry.ts?raw?worker&url` failed non-zero
  naming that exact forbidden ID. Removed both imports, the probe file, and all
  empty probe directories before gates.
- 2026-08-01T11:12:06Z — Final remediation gates passed without retry: frozen
  install, typecheck, lint/format across 110 files, 13 files / 108 unit tests,
  root build and seven-file verification, 35 + 3 browser tests, production CSP
  Chromium flow, and diff check. Asset names and sizes remained unchanged.
  Cleared remediation ownership, assigned a fresh independent reviewer, and
  moved TASK-0030 to `review` for the exact committed remediation artifact.

## Handoff

`vite.config.ts` now treats the application source tree as a closed inventory
and applies explicit window/worker/shared classifications plus per-build
workspace surfaces. `package.json` makes root build execute that control.
The CI workflow installs the pinned Playwright engines and invokes both omitted
security gates; its 20-minute ceiling includes browser installation. `CLAUDE.md`
states this configuration without claiming that GitHub has run it.

No product behavior, persistence, protocol, worker runtime, cryptography,
dependency, emitted artifact, or public policy changed. Independent review is
pending against a committed artifact.

## Review

Independent review of exact implementation commit `37a655a` by
`/root/task_0030_reviewer`: **BLOCK — P0 0 / P1 1 / P2 1**.

### P1 — repository-local marker collision bypasses the closed boundary

`applicationSourcePath()` and `workspaceSourcePath()` identify roots with
`lastIndexOf()` on the strings `/apps/web/src/` and `/packages/`. They do not
require the module to be below the canonical `applicationSourceRoot` or the
repository's actual `packages` root. A repository-local path containing either
marker can therefore inherit an allowed classification or package identity.

The reviewer reproduced this with a temporary tracked-shape module at
`probe/apps/web/src/vault-worker-protocol.ts`. It exported a retained value and
was imported by `apps/web/src/main.tsx`. The module is outside the inventoried
source tree, but its suffix classified it as the allowed shared
`vault-worker-protocol.ts`; `pnpm --filter @neutron/web build` passed and emitted
the changed window asset `index-CsG3KObm.js`. Both edits and the probe file were
removed. This refutes the claimed relocation/split closure and the exact
repository-local window surface.

Remediation must anchor application and workspace classification to their exact
normalized canonical roots, then add regression cases for decoy marker segments
inside the repository. A later reviewer must reproduce this exact bypass as a
non-zero build.

### P2 — worker URL exception accepts a forged query prefix

The exception combines a query-stripped source classification with
`id.endsWith("?worker&url")`. Consequently
`vault-worker-entry.ts?raw?worker&url` is accepted even though it is not the
single exact `vault-worker-entry.ts?worker&url` reference. A temporary real
import using that query passed the production web build and emitted
`index-r3OeNI9H.js`; the edit was removed. This does not authorize a different
source file, but it contradicts the exact-query criterion and leaves Vite query
semantics broader than reviewed. Compare the complete normalized module ID to
the exact entry path plus literal query and add a regression test for prefixed,
duplicated, reordered, and suffixed query forms.

### Controls and gates independently reproduced

The reviewer also reproduced real non-zero controls before restoring the tree:

- window side-effect import of `local-vault.js` rejected on
  `packages/crypto/dist/provider.js`;
- worker side-effect import of `app.js` rejected on
  `react.production.js`.

After restoration, frozen install, typecheck, lint (110 files), format check
(110 files), root tests, the focused boundary suite (1 file / 6 tests), root
build, browser tests (4 files / 35 Chromium tests and 3 files / 3 engine-matrix
tests), production CSP flow, and `git diff --check` passed without a retry.
Root build again emitted `index-C3y-6n8v.js` (314,822 bytes),
`vault-worker-entry-DDLJAMuT.js` (661,361 bytes), and `index-uH94Wcke.css`
(5,922 bytes). The tree was clean before this documentation-only BLOCK record.

The root build now does invoke Vite and `verify-build.mjs`; the entry and
unaccounted-chunk controls remain live; the worker package set is bounded and
rejects React; the source inventory recognizes the declared TS/JS variants,
JSON, and CSS and throws on symlink-like directory entries. The CI workflow's
pinned action references, Playwright installation, and two security commands
are syntactically credible, but no connected GitHub run was inspected or
claimed.
