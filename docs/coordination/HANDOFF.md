# Neutron session handoff

Updated: 2026-07-28
Branch: `main`
Reviewed checkpoint commit: `595f884`

This is a navigation checkpoint, not a substitute for authoritative task files
or accepted ADRs. Verify it against the repository before acting.

## Resume here

1. Read `AGENTS.md` and its required project documents in order.
2. Run `git status --short` and `git log -5 --oneline`. The expected state is a
   clean `main` with Task 0020 commit `595f884` immediately below this handoff
   documentation commit.
3. Read Tasks 0017 through 0020, ADR 0008, and
   `docs/security/web-delivery.md`.
4. Confirm Task 0020 is `done`. There is no active implementation task at this
   checkpoint; begin the next session with an independent preflight before
   claiming product paths.
5. Update this file again before the next session stops, including when work is
   blocked or still under review.

## Checkpoint outcome

Task 0020, conflict-bound item editor UI, is complete and independently
security-reviewed.

- Commit: `595f884 feat(web): add conflict-bound item editor`.
- Independent preflight: PASS, P0 0, P1 0.
- Initial implementation review: BLOCK, P0 0, P1 1, P2 1.
- Final remediation review by `/root/task_0020_reviewer`: PASS, P0 0, P1 0,
  P2 0. The reviewer edited no files.

The reviewed React shell now:

- Creates and edits login, secure-note, TOTP-seed, backup-code, and arbitrary
  JSON v1 items using `parseVaultItem` as the final semantic authority.
- Preserves absent versus present-empty optional fields and does not normalize,
  trim, uppercase, or echo rejected field contents.
- Calls only the reviewed broker's named create/update/delete operations and
  binds updates and deletion to the selected opaque ID, generation, and key
  version.
- Retains unsaved drafts on conflicts without retrying or overwriting, requires
  explicit deletion confirmation, and distinguishes a committed mutation whose
  bounded list refresh failed from a retryable mutation failure.
- Prevents duplicate dispatch synchronously while leaving Lock immediately
  available. UI operation epochs suppress delayed create, update, and delete
  completions after lock without claiming already-issued persistence rolled back.
- Gives every Create activation a fresh React identity and each edit an exact
  public revision identity, preventing hidden or unsaved plaintext from moving
  between forms. Cancellation and deletion restore deterministic focus.
- Supports keyboard-activated CRUD and a 320-pixel form layout.

The exact-policy emitted-production Chromium flow now performs UI create,
conflicting update, conflicting delete, successful update, and successful delete
through the real built worker. A second independently unlocked built worker
advances revisions to create genuine stale races. The test scans raw IndexedDB
keys/rows/envelope bytes plus URLs, headers, post bodies, title, history, storage,
DOM/form values, console output, performance entries, and static responses for
synthetic plaintext. It also proves lock termination and a fresh worker on the
next unlock.

## Verification actually run

The implementer and final reviewer both ran the required gates successfully:

```text
pnpm install --frozen-lockfile               # already up to date
pnpm typecheck                               # pass
pnpm lint                                    # 100 files, pass
pnpm format:check                            # 100 files, pass
pnpm test                                    # 9 files, 74 tests, pass
pnpm build                                   # pass
pnpm --filter @neutron/web test:browser      # 3 files, 18 tests, pass
pnpm --filter @neutron/web test:production   # emitted exact-CSP flow, pass
git diff --check                             # pass
```

The final reviewer independently reproduced the original edit-to-create and
create-to-create plaintext transition attacks. Both produced fresh empty/default
drafts after remediation; blank submission dispatched nothing, and create
cancellation restored focus to the Create control.

## Deliberately unfinished

- Stage 2 still lacks password/passphrase generation, RFC 6238 code computation,
  bounded encrypted local search, offline recovery unlock UI, and the service
  worker/update state machine.
- The checked production policy test server is not a deployable `_headers`
  adapter and no deployment has occurred.
- Import/export, passkeys, sync, server adapters, backup/restore drills, release
  provenance, and open-source release automation belong to later stages.
- Tasks 0004, 0006, 0008, and 0009 remain blocked; Task 0010 remains proposed.
  Do not treat those designs as complete.
- Do not use real credentials before the Stage 5 dogfood gate.

## Next safe direction

Begin with an independent preflight for a narrowly named Task 0021 covering a
CSPRNG-backed password generator through the existing vault-worker boundary.
The preflight must decide whether generator parameters require a new ADR and
must reject implementation if it would expose generic random bytes, use
`Math.random`, weaken the worker boundary, or silently choose an unreviewed
passphrase wordlist. Keep passphrases, TOTP calculation, search, clipboard, and
service-worker delivery separate unless an accepted ADR explicitly permits a
larger scope.

If preflight passes, the likely Task 0021 should specify exact character sets,
length/entropy limits, unbiased rejection sampling, named request/response
schemas, locked/session behavior, redacted failures, post-lock late-result
suppression, deterministic distribution tests using an injected synthetic
provider, real-browser generation/insertion, and absence from storage/network/
logs. Any `packages/crypto` change requires the ADR and review discipline in
`AGENTS.md`.

Suggested prompt for the next agent:

> Resume Neutron from `docs/coordination/HANDOFF.md` and verify the clean
> `595f884` checkpoint. Read every document required by `AGENTS.md`. Before any
> edit, assign a separate read-only agent to preflight whether a bounded Task
> 0021 CSPRNG password generator is correctly sequenced and whether it requires
> an ADR. If and only if preflight passes, create and claim the exact task. Use a
> named vault-worker operation, never a generic random-byte API or `Math.random`;
> define exact character sets, limits, entropy behavior, unbiased sampling,
> lock/session semantics, and synthetic deterministic tests. Keep passphrases,
> TOTP, search, clipboard, service-worker delivery, sync, and deployment out of
> scope. Run all root, Chromium, emitted-production, and leakage gates; obtain an
> independent adversarial review; remediate every P0/P1; commit a clean
> checkpoint; and update this handoff before stopping. Stop for an ADR instead
> of inventing a cryptographic or public-protocol decision.

## Mandatory next-session stop protocol

Before the next session ends, record repository-verifiable task/review status,
exact commits, dirty paths, commands actually run, blockers/non-goals, and the
next safe action here. Prefer a clean committed checkpoint. Never use the handoff
to self-approve a security-sensitive task.
