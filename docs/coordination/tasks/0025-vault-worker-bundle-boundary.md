# TASK 0025 — Restore vault-worker bundle boundary enforcement

Status: ready
Owner: unassigned
Claimed: —
Worktree/branch: —
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

- [ ] The vault-worker boundary assertion executes on every production build,
      whether the worker is emitted as an asset or a chunk.
- [ ] A deliberate violation — importing a UI module into the worker graph —
      fails `pnpm --filter @neutron/web build` with a clear message. The proof
      is recorded in the task file; the violating change is not committed.
- [ ] The window-side assertion keeps working unchanged, and the existing
      "unaccounted chunk" checks still fire.
- [ ] No emitted artifact, filename, hash scheme, or artifact allowlist entry
      changes as a result of the fix.
- [ ] All repository gates plus the web browser and production gates pass, with
      before-and-after emitted file lists and sizes recorded.
- [ ] Independent review confirms the control now fails closed, by reproducing
      the deliberate violation rather than by reading the diff.

## Verification

Record exact results for the full root gate set plus
`pnpm --filter @neutron/web build`, `test:browser`, and `test:production`, and
record the exact error text produced by the deliberate violation.

## Progress log

- 2026-08-01T00:00:00Z — Created after confirming the dead branch against a real
  build at `0f6d9f8`. Ready to claim; deliberately independent of Tasks 0023 and
  0024 because it owns a shared build file that both of them rely on.

## Handoff

Summarize changed behavior, important files, decisions, risks, and follow-up work.

## Review

Reviewer, date, findings, and disposition. Required; the implementer must not
self-approve.
