# Neutron session handoff

Updated: 2026-07-28
Branch: `main`
Reviewed checkpoint commit: `d2a5b13`

This is a navigation checkpoint, not a substitute for task records or accepted
ADRs. Verify it against the repository before acting.

## Resume here

1. Read `AGENTS.md` and its required project documents in order.
2. Run `git status --short` and `git log -5 --oneline`. The expected starting
   state is a clean `main` with `d2a5b13` at or immediately below the handoff
   documentation commit.
3. Read `docs/coordination/tasks/0019-react-vault-shell.md`, ADR 0001, ADR 0008,
   and `docs/security/web-delivery.md`.
4. Confirm Task 0019 is `done`. There is no active implementation task at this
   checkpoint; claim a new bounded task before changing product code.
5. Update this handoff again before the next session stops, even if the next task
   is blocked or remains in review.

## Checkpoint outcome

Task 0019 is complete and independently security-reviewed.

- Implementation checkpoint: `571f43c feat(web): add static React vault shell`.
- Remediation and closure: `d2a5b13 test(web): close vault shell security review`.
- Independent final review by `/root/task_0017_reviewer`: PASS, P0 0, P1 0,
  P2 0. The reviewer edited no files.
- The prior review's four P1 and two P2 findings are all closed.

The static React/Vite shell now:

- Withholds password inputs until the required base APIs and a real module
  worker protocol round trip succeed.
- Uses the reviewed worker broker for enrollment, exact recovery confirmation,
  unlock, bounded summaries, explicit point reads, and lock.
- Clears rendered secrets immediately, rejects late UI completions by operation
  epoch, and terminates even a hung lock worker after a fixed deadline.
- Moves focus on screen transitions and has a verified 320px keyboard path.
- Recursively checks every emitted window and worker chunk for trust-boundary
  violations and rejects unaccounted JavaScript chunks.
- Verifies the closed production artifact set, local resource references,
  absence of source maps/inline execution/blob workers, and the single hashed
  worker binding.
- Runs the emitted shell and real emitted worker in Chromium under the exact ADR
  0008 CSP and response-header policy, including enrollment, reload/unlock,
  encrypted point-read, lock, worker shutdown, MIME/cache checks, and a strict
  same-origin request allowlist.

## Verification actually run

The implementer and independent reviewer both ran the relevant gates. The final
implementation pass recorded:

```text
pnpm install --frozen-lockfile               # already up to date
pnpm typecheck                               # pass
pnpm lint                                    # 99 files, pass
pnpm format:check                            # 99 files, pass
pnpm test                                    # 9 files, 74 tests, pass
pnpm build                                   # pass
pnpm --filter @neutron/web test:browser      # 3 files, 9 tests, pass
pnpm --filter @neutron/web test:production   # exact-policy Chromium flow, pass
git diff --check                             # pass
```

The reviewer additionally reproduced a silent module-worker probe timeout, a
swallowed lock acknowledgment, and a secret-bearing point read resolving after
lock. All failed closed. One initial reviewer browser setup saw a transient
blocked IndexedDB deletion while other browser activity shared the workspace;
an isolated rerun passed all nine tests.

## Deliberately unfinished

- The shell has no item create/update/delete forms, password generator, TOTP
  display, bounded local search, import/export, passkeys, sync, or recovery
  unlock UI.
- ADR 0008's service-worker cache/update state machine and deployable static
  header configuration are not implemented. The test server proves the policy;
  it is not a deployment adapter.
- No deployment has occurred. Do not use real credentials; the Stage 5 dogfood
  gate remains far in the future.
- Tasks 0004, 0006, 0008, and 0009 remain blocked. Task 0010 remains proposed.
  Do not silently treat their designs as complete.

## Next safe direction

Create and claim a new Task 0020 for conflict-bound item create/update/delete UI
through the existing public worker broker. Keep password generation, TOTP,
search, service-worker delivery, import/export, and sync in separate later tasks.
The task should depend on 0017, 0018, and 0019; reserve only its task file and
the narrow `apps/web/**` paths it needs; include stale-generation conflict tests,
post-lock plaintext clearing, stable redacted errors, keyboard/mobile coverage,
and a separate security review.

Suggested prompt for the next implementation agent:

> Resume Neutron from `docs/coordination/HANDOFF.md`. Verify the clean checkpoint
> and read all documents required by `AGENTS.md`. Create and claim Task 0020 for
> conflict-bound item create/update/delete forms through the existing
> `VaultWorkerClient` only. Do not add raw storage, crypto, repository, sync, or
> service-worker access to the window. Keep password generation, TOTP, search,
> import/export, and deployment out of scope. Implement deterministic component
> and real-Chromium tests for create/update/delete, stale-generation conflicts,
> immediate lock clearing, late-completion suppression, redacted errors,
> keyboard use, and 320px layout. Run every repository and web production gate,
> move the task to independent review, resolve all P0/P1 findings, commit a clean
> checkpoint, and update this handoff before stopping. If scope or a security
> invariant requires a new decision, stop and propose an ADR instead of guessing.

## Mandatory next-session stop protocol

Before the next session ends, update this file with repository-verifiable task
status, reviewer outcome, exact commits, dirty paths, commands actually run,
remaining blockers/non-goals, and the next safe action. Prefer a clean committed
checkpoint. Never use the handoff to self-approve a security-sensitive task.
