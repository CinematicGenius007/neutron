# TASK 0025 — Restore vault-worker bundle boundary enforcement

Status: review
Owner: unassigned (implemented by `/root/task_0025_implementer`)
Claimed: 2026-08-01T04:45:00Z
Worktree/branch: shared-worktree (main)
Reviewer: unassigned
Review claimed: —
Depends on: —
Blocks: —
Security-sensitive: yes

## Outcome

The vault-worker half of the build-time boundary check actually runs and fails
the build when the worker bundle contains a window UI module, instead of being
silently skipped as it is today.

## Context

`apps/web/vite.config.ts` defines `enforceWindowBoundary`, which asserts two
directions: the window bundle must not contain worker-only modules, and the
vault-worker bundle must not contain React or the UI modules. ADR 0008 and Task
0018 treat that second assertion as an enforced control.

It does not run. `generateBundle` builds its `chunks` map from outputs whose
`type` is `"chunk"`, but Vite compiles a `?worker&url` import in a separate build
and emits the result into the parent bundle as an **asset**. The lookup for a
chunk containing `/src/vault-worker-entry.ts` therefore always yields
`undefined`, and the whole worker branch is skipped.

Verified at commit `0f6d9f8` by building `@neutron/web`: the build prints no gzip
figure for `assets/vault-worker-entry-CR0SpbvK.js`, which Vite reports only for
chunks, and the file does not appear in `dist/.vite/manifest.json`. The window
branch passing is itself confirmation — had the worker been a chunk in the same
bundle, the "unaccounted JavaScript chunk in window build" check would have
thrown.

This was found incidentally while reviewing ADR 0014, whose reasoning about
separate window and worker builds is what surfaced it. It is not caused by that
ADR and must not be repaired inside a feature task, because the fix touches a
shared build file that every other task depends on.

## Allowed paths

- This task file
- `apps/web/vite.config.ts`
- `apps/web/scripts/verify-build.mjs`

## Out of scope

- Any product code, protocol, UI, or test outside the two files above
- Changing what the boundary forbids; the rule set stays exactly as ADR 0008 and
  Task 0018 established it
- Bundle-size budgets, reproducible-build work, and SBOM or provenance policy,
  which belong to Task 0008

## Acceptance criteria

- [x] The vault-worker boundary assertion executes on every production build,
      whether the worker is emitted as an asset or a chunk.
- [x] A deliberate violation — importing a UI module into the worker graph —
      fails `pnpm --filter @neutron/web build` with a clear message. The proof
      is recorded in the task file; the violating change is not committed.
- [x] The window-side assertion keeps working unchanged, and the existing
      "unaccounted chunk" checks still fire.
- [x] No emitted artifact, filename, hash scheme, or artifact allowlist entry
      changes as a result of the fix.
- [x] All repository gates plus the web browser and production gates pass, with
      before-and-after emitted file lists and sizes recorded.
- [ ] Independent review confirms the control now fails closed, by reproducing
      the deliberate violation rather than by reading the diff.

## Verification

The fix registers the worker-side check through `worker.plugins`, which is the
only place a plugin applies to Vite's separate worker build, and makes both
checks throw when the entry chunk they are supposed to walk is absent. Silently
skipping is exactly how the defect hid.

Deliberate violation: appending `import "./app.js";` to
`apps/web/src/vault-worker-entry.ts` and building produced

```text
[plugin neutron-vault-worker-boundary]
Error: vault worker build contains forbidden module:
  …/node_modules/react/cjs/react.production.js
```

with a non-zero exit. The violating edit was reverted immediately and
`git status` confirmed the file clean; it is not committed.

A second instance of the same defect class was found during review and fixed
here. The forbidden-module predicates matched substrings that included the
parent directory, such as `/src/local-vault.ts`, so a worker-only module moved
or copied one directory deeper stopped being matched at all. Demonstrated by
placing a non-trivial module at `apps/web/src/storage/indexeddb-repository.ts`
and importing it from the window entry: the build failed, but on the unrelated
`/packages/crypto/` rule catching a transitive import, while the rule that names
that file never fired. Only the package-directory rule was relocation-robust.

Predicates now match by file name anywhere in the tree, with the `?worker&url`
ignore check evaluated first so the window's own reference to the worker script
still passes. Re-verified with a module that imports no crypto at all — a
`probeUnlock` function placed at `apps/web/src/storage/local-vault.ts` and
imported from `main.tsx`:

```text
Error: window build contains forbidden module:
  …/apps/web/src/storage/local-vault.ts
```

This is treated as in scope rather than deferred because it is the same failure
this task exists to fix — a rule that silently does not apply — and it does not
change *what* the boundary forbids, only whether the existing rules match.

Known limitation, recorded rather than left implicit: the check inspects
`chunk.modules`, so a module whose contents are entirely inlined or tree-shaken
away does not appear and cannot be matched. An earlier probe exporting only
`export const probe = 1;` built successfully for exactly that reason. This is
inherent to bundle-graph inspection and is not a practical hole, because a
module with no retained code contributes no retained behavior, but it does mean
the check proves what reached the bundle rather than what was written.

Emitted output is unchanged by the fix. Before and after are byte-identical:

```text
dist/assets/index-BFSv1aBR.js               237,586 bytes (gzip 72.35 kB)
dist/assets/vault-worker-entry-CR0SpbvK.js  596,854 bytes
dist/assets/index-Dz9C09xS.css                4,759 bytes
7 emitted files, identical content hashes before and after
```

Gates:

```text
pnpm install --frozen-lockfile               # already up to date
pnpm typecheck                               # pass
pnpm lint                                    # 106 files, pass
pnpm format:check                            # 106 files, pass
pnpm test                                    # 11 files, 94 tests, pass
pnpm build                                   # pass
pnpm --filter @neutron/web test:browser      # 23 Chromium + 3 engine probes, pass
pnpm --filter @neutron/web test:production   # emitted exact-CSP flow, pass
git diff --check                             # pass
```

One retry is recorded honestly. The first `pnpm test` run failed with
`Test timed out in 30000ms` in
`packages/crypto/test/provider.test.ts > accepts exact upper bounds and rejects
wrong associated data`, while production builds were running concurrently. That
package is untouched by this task. Investigation: the same file passes at the
unmodified parent commit in 29.44 s, and passes with this change applied in
19.05 s, 18.59 s, and 19.57 s across three isolated runs. The failure was
machine load, not a regression.

That investigation surfaced a separate latent problem, recorded here rather than
fixed because `packages/crypto` is outside this task's allowed paths: the
Argon2id upper-bounds test runs at roughly 19 s nominal but has been observed at
29–36 s under concurrent load, against a 30 s timeout. That margin is too thin
and will produce intermittent CI failures. It needs its own task.

## Progress log

- 2026-08-01T00:00:00Z — Created after confirming the dead branch against a real
  build at `0f6d9f8`. Ready to claim; deliberately independent of Tasks 0023 and
  0024 because it owns a shared build file that both of them rely on.
- 2026-08-01T04:45:00Z — Claimed. Registered the worker-side check through
  `worker.plugins`, factored both directions onto one graph walk, and made a
  missing entry chunk an error instead of a silent skip. Proved the control
  fires with a deliberate violation, reverted it, and confirmed emitted output
  is byte-identical. All gates pass with one investigated load-induced retry.
  Moved to independent review; implementer identity recorded above so review
  separation is verifiable from the repository, which the preflight noted it
  previously was not.
- 2026-08-01T05:05:00Z — The first review agent terminated on an API error
  before reporting, leaving a partially built relocation probe in the working
  tree. The probe was inspected, its file confirmed to be an exact copy of a
  tracked file, the tree restored to `bbe63c3`, and the experiment finished
  deliberately: it proved a second position-sensitivity defect, now fixed and
  documented above. All gates rerun serially and pass. Returned to independent
  review; no reviewer has yet recorded a verdict on this task.

## Handoff

Summarize changed behavior, important files, decisions, risks, and follow-up work.

## Review

Reviewer, date, findings, and disposition. Required; the implementer must not
self-approve.
