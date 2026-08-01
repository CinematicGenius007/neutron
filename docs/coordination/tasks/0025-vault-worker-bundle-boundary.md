# TASK 0025 — Restore vault-worker bundle boundary enforcement

Status: done
Owner: unassigned (implemented by `/root/task_0025_implementer`)
Claimed: 2026-08-01T04:45:00Z
Worktree/branch: shared-worktree (main)
Reviewer: `/root/task_0025_reviewer`
Review claimed: 2026-08-01T05:10:00Z
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
- [x] The window-side assertion still fires, and the existing "unaccounted
      chunk" check still fires, verified by forcing a second entry chunk. Its
      matching semantics did change; see "Semantic delta" below.
- [x] No emitted artifact, filename, hash scheme, or artifact allowlist entry
      changes as a result of the fix.
- [~] Every gate except `pnpm test` passes reproducibly, with before-and-after
      emitted file lists and sizes recorded. `pnpm test` is **not** reproducibly
      green: it fails roughly one run in five on an idle machine for a reason
      that predates this task and is unaffected by it. Task 0026 owns that.
      This criterion is deliberately left unchecked rather than qualified into
      looking satisfied.
- [x] Independent review confirms the control now fails closed, by reproducing
      the deliberate violation rather than by reading the diff.

## Verification

The fix registers the worker-side check through `worker.plugins`, the mechanism
Vite documents for applying a plugin to its separate worker build, confirmed
empirically here. Vite 8 also exposes `applyToEnvironment`, which was not
tested, so this is the mechanism that works rather than provably the only one.
Both checks now throw when the entry chunk they are supposed to walk is absent;
silently skipping is exactly how the defect hid.

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
this task exists to fix: a rule that silently does not apply.

### Semantic delta

The implementer originally claimed, in this file and in the `921a963` commit
message, that the change altered only whether the rules match and left the rule
set unchanged. The independent review refuted that, and the correction is
recorded here rather than by rewriting the commit. Matching by file name is a
genuine semantic change in both directions:

| Module id | Before | After |
| --- | --- | --- |
| `…/src/storage/local-vault.ts` | allowed | forbidden — intended |
| any `node_modules` file named `local-vault.ts` | allowed | forbidden — broader |
| `…/src/local-vault.tsx` | forbidden | allowed — narrower |
| a path containing `?` before the file name | forbidden | allowed — narrower |

The broadening is the intent. The two narrowings are accepted deliberately: the
old behaviour matched `/src/local-vault.ts` as a *substring*, so it caught
`local-vault.tsx` by accident rather than by rule, and a different file
extension is a different module that the rule never named. The review scanned
`node_modules` and every workspace package and found no third-party file bearing
any of the six reserved names, so the broadening has no live false positive
today; a future dependency introducing one would fail the build loudly rather
than silently.

The task's "out of scope" entry above forbids changing *what* the boundary
protects — the set of modules the window and worker may not contain. That
intent is intact: no module that ADR 0008 and Task 0018 meant to forbid became
permitted, and no new category of module was added. What changed is the matching
rule's precision. Recording this correction is preferable to leaving a claim in
the record that measurement contradicts.

### Known constraint on additional workers

`worker.plugins` applies to every worker build, and this check identifies its
own entry by file name, so it cannot distinguish "this is a different worker
build" from "the vault worker entry has moved". Introducing a second worker —
the service worker contemplated by ADR 0008, for instance — currently fails the
build with `vault worker build entry chunk is absent, so its boundary could not
be checked`. That is fail-closed and loud, not a hole, but the check will have
to be keyed on each build's own declared input before a second worker can ship.
Recorded here so that whoever hits it is not left guessing.

Known limitation, recorded rather than left implicit: the check inspects
`chunk.modules`, so a module whose contents are entirely tree-shaken
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
pnpm test                                    # NOT reproducibly green; see below
pnpm build                                   # pass
pnpm --filter @neutron/web test:browser      # 23 Chromium + 3 engine probes, pass
pnpm --filter @neutron/web test:production   # emitted exact-CSP flow, pass
git diff --check                             # pass
```

`pnpm test` is not reproducibly green, and the reason recorded here initially
was wrong.

`packages/crypto/test/provider.test.ts > accepts exact upper bounds and rejects
wrong associated data` fails with `Test timed out in 30000ms`. The implementer
first observed this while production builds were running concurrently and
recorded the cause as machine load. The independent review refuted that by
measurement: running the gate serially on an idle machine with nothing else
running, the test still failed on 1 run in 5, and clearing the Vite cache did
not change it.

The measured behaviour is that the file exceeds its own timeout unaided under
the ordinary parallel gate:

```text
isolated single-file run          21.58 s
inside the ordinary parallel gate 32.5  s
default timeout                   30    s
observed failure rate             1 in 5, no concurrent load
```

`packages/crypto` is untouched by this task and cannot be affected by a Vite
config change: there is no root Vitest configuration and Vitest never loads the
web Vite config for that package. The defect is pre-existing and is now owned by
**Task 0026** (`0026-provider-bounds-test-timeout.md`), which must land before anyone treats `pnpm test` as a reliable
gate. It is recorded here as an open failure rather than as a passed gate with a
footnote.

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


- 2026-08-01T05:30:00Z — Independent review returned BLOCK with P0 0, P1 1,
  P2 3. Both claims under review were confirmed by reproduction at both commits.
  The P1 was against this record, not the diff: the `pnpm test` failure was
  attributed to concurrent load, and measurement on an idle machine refuted that
  at a 1-in-5 rate. Corrected above, the gate criterion un-checked, and Task 0026
  created to own it. P2-2 remediated by matching the remaining directory-anchored
  predicates by file name as well; P2-1 and P2-3 recorded above as a known
  constraint and a semantic delta rather than silently dropped.

## Handoff

Summarize changed behavior, important files, decisions, risks, and follow-up work.

## Review

Initial independent review by `/root/task_0025_reviewer`: **BLOCK**, P0 0, P1 1,
P2 3. Both claims under review were confirmed by reproduction at both commits —
the same violation builds cleanly at `378a71b` and fails at `921a963`, and the
relocated crypto-free module evaded the rule at `bbe63c3` and is named at
`921a963`. The sole P1 was against this task's record rather than its diff: the
`pnpm test` failure had been attributed to concurrent build load, and serial
measurement on an idle machine refuted that at a 1-in-5 rate.

Final independent re-review of remediation commit `d94b925`: **PASS**, P0 0,
P1 0 against this task, P2 0 outstanding. The reviewer constructed the relocated
vault-worker case and confirmed it now builds, then confirmed the check had not
merely gone quiet by re-introducing a violation into the relocated worker and
observing it still throw. It also attacked the widened predicates with a rogue
worker entry, a decoy second `main.tsx`, and a forced extra chunk; all held,
because the unaccounted-chunk invariant means every chunk is either walked and
scanned or the build fails. Emitted artifacts were verified byte-identical to
`378a71b` twice.

Both P2s from the re-review are applied above: the progress log is now in
chronological order, and the claim that `worker.plugins` is the only mechanism
that reaches Vite's worker build is softened to what was actually tested.

The re-review raised one P1 against **Task 0026**, not this task, and it was
correct: that task's stated root cause was itself an unmeasured attribution. It
has been rewritten and renamed; see `0026-provider-bounds-test-timeout.md`.

The reviewer edited no committed file and confirmed a clean working tree after
every one of its seventeen destructive probes across both rounds.
