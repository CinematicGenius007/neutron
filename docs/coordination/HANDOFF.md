# Neutron session handoff

Updated: 2026-08-01
Branch: `main`
Last executable checkpoint: Task 0023, independently closed at `97b60af`

This is a navigation checkpoint, not a substitute for authoritative task files
or accepted ADRs. Verify it against the repository before acting.

## Resume here

1. Read `AGENTS.md` and every document it requires, in order. `CLAUDE.md` is
   practical guidance only and cannot override repository instructions.
2. Run `git status --short` and `git log -10 --oneline`. Expect clean `main` with
   this handoff commit above `97b60af`, `286782d`, `52de9e5`, and `c7fa704`.
3. Read accepted ADR 0015 together with superseded ADR 0014, then Tasks 0023 and
   0024. Task 0023 is `done`; Task 0024 is the only proposed Stage 2 task whose
   dependencies are all done.
4. No implementation task is active. Do not claim Task 0024 until an independent
   read-only preflight confirms its 14 findings against current line locations,
   allowed paths, testability, and readiness, then records any corrections and
   moves it from `proposed` to `ready`.
5. Update this file before the next session stops, including if work is blocked
   or under review.

## Task 0023 — completed passphrase generator

Task 0023 is done and independently reviewed.

- Implementation: `52de9e5 feat(vault): add worker passphrase generator`.
- Review assignment: `0c98408 docs(coordination): assign TASK-0023 review`.
- Review remediation: `286782d test(vault): close passphrase review precision gaps`.
- Closure: `97b60af docs(coordination): close TASK-0023 review`.
- Implementer: `/root`; reviewer: `/root/task_0023_review`.
- Initial review: PASS, P0 0 / P1 0 / P2 3.
- Final remediation review: PASS, P0 0 / P1 0 / P2 0.

The unlocked login editor now has two modes. Random-character password remains
the default. Random-word passphrase defaults to eight independently selected EFF
long-list words separated by `.`. Generation is unlocked-only, occurs inside the
existing vault worker through its reviewed CSPRNG provider, fills only the active
keyed login draft, and never saves without explicit user action.

The committed wordlist is a frozen 7,776-entry literal. Fresh TLS retrieval and
independent review reproduced:

```text
upstream bytes       108,800
upstream lines       7,776
upstream SHA-256     addd35536511597a02fa0a9ff1e5284677b8883b83e986e43f15a3db996b903e
canonical bytes      62,143
canonical SHA-256    abae49761b88f3f1ba31ef944bea1f61b795a3cd7e1cfb7d276ed45bf77967ba
first / last         abacus / zoom
```

Selection uses disjoint big-endian 16-bit pairs, cutoff 62,208, exact
`words * 32` maximum random bytes, positive even chunks no larger than 256, and
best-effort clearing in `finally`. Source review confirmed the selection path
retains only the output prefix and one current numeric index, overwritten before
the next draw; it creates no selected-index or selected-word collection.

Validation remains four separate layers: exact request parsing, standalone
global response/list-membership parsing, worker-local result validation, and an
immutable request-specific broker expectation. Lock/session epoch priority,
manual-edit/newer-request/type/target/cancel/lock invalidation, and no-auto-save
behavior have adversarial coverage.

The exact-CSP production gate extracts exactly one minified frozen wordlist from
the emitted worker, recomputes the literal canonical digest, validates a real
worker result against that extracted list, proves the complete EFF/CC notice is
emitted and rendered, and applies plaintext-sentinel checks before save, after
encrypted save, delete, cancel, lock, fresh unlock, network, console, origin
storage, runtime DOM, and static artifacts. The notice in
`docs/third-party-notices.md` now accurately names governing ADR 0015.

The first independent review's three P2s were all remediated: invariant tests now
use the exact interior-hyphen grammar plus separate 3–9 length checks; negative
word count and pending-enrollment passphrase rejection are explicit; and stale
notice wording is corrected. No P0 or P1 was found.

## Verification actually run

The final implementation and post-review remediation both ran the required gate
set without retry. The post-remediation results were:

```text
pnpm install --frozen-lockfile               pass; already up to date
pnpm typecheck                               pass
pnpm lint                                    pass; 109 files
pnpm format:check                            pass; 109 files
pnpm test                                    pass; 12 files, 102 tests
pnpm build                                   pass
pnpm --filter @neutron/web test:browser      pass; 7 files, 27 tests
pnpm --filter @neutron/web test:production   pass; exact-CSP Chromium flow
git diff --check                             pass
```

Independent review separately reran targeted tests, typecheck, lint, formatting,
the full unit gate, build, browser tests, production flow, diff check, and a
fresh upstream/digest probe.

Bundle measurements:

| Emitted asset | Before Task 0023 | After Task 0023 | Delta |
|---|---:|---:|---:|
| Window JavaScript | 237,586 B | 303,516 B | +65,930 B |
| Vault worker JavaScript | 596,854 B | 661,361 B | +64,507 B |
| CSS | 4,759 B | 4,759 B | 0 B |

Duplication into the window and worker is intentional: both sides independently
validate list membership. No persistence format, protocol version, provider,
crypto package, dependency, server, or network format changed.

## Deliberately unfinished

- Task 0024, functional UI remediation, remains `proposed`. Its dependencies are
  now done, but its recorded line references predate Task 0023 and require a
  fresh independent preflight before readiness or claim.
- Task 0024 owns 14 enumerated interaction/accessibility issues, including
  secret reveal/masking lifecycle, draft-loss warnings, focus/live-region
  behavior, pagination return, actionable error states, and untested 320-pixel
  surfaces. It is functional remediation only: no visual redesign or dependency.
- Stage 2 still lacks bounded encrypted local search and the service-worker
  install/update/rollback state machine. Neither is preflighted. Search requires
  an ADR for index-shard leakage and persisted-format policy.
- Idle auto-lock and clipboard copy remain ADR-worthy security decisions, not UI
  tweaks. QR handling, `otpauth://` import, adjacent-step TOTP validation, and
  clock synchronization remain absent.
- Tasks 0004, 0006, 0008, and 0009 remain blocked; Task 0010 remains proposed.
- There is no deployment, connected CI evidence, dogfood approval, or production
  release. Do not use real credentials before the Stage 5 gate.

## Next safe direction

Preflight Task 0024 only. Reproduce or correct each D1–D14 finding against the
current Task 0023 UI, verify the six allowed product/test paths are sufficient,
and identify any policy conflict before moving the task to `ready`. Pay special
attention to D4: reveal controls create new plaintext DOM surfaces and must clear
on item change, editor open, error, cancel, delete, and lock without narrowing
the worker's `get-item` protocol. Lock priority may never wait for confirmation.

Suggested prompt for the next agent:

> Resume Neutron from `docs/coordination/HANDOFF.md`. Read every document required
> by `AGENTS.md`; verify clean `main` and the checkpoint commits. Independently
> preflight proposed Task 0024 against the current Task 0023 UI before changing
> status or claiming it: reproduce/correct D1–D14, refresh stale line references,
> prove allowed paths and tests are sufficient, and stop for an ADR if any fix
> changes plaintext exposure policy beyond the task's accepted constraints. If
> ready, claim only Task 0024 and implement functional remediation without a
> visual redesign, dependency, persistence, URL, log, network, worker, protocol,
> or crypto change. Preserve lock priority and every Task 0017–0023 behavior; add
> keyboard, live-region, stale-result, secret-clearing, and 320-pixel real-browser
> proofs; run all root/browser/production gates; obtain independent adversarial
> review; remediate findings; close the task only on reviewer PASS; and update
> this handoff. Do not start search, service worker, recovery, clipboard, idle
> auto-lock, sync, server, deployment, or styling work.

## Manual UI smoke test

Run `pnpm --filter @neutron/web dev` from the repository root and use a fresh
browser profile/origin with synthetic data only. Enrollment, recovery-kit
confirmation, lock/unlock, item CRUD, random-character password generation,
EFF passphrase generation, and TOTP display are available. This is not a dogfood
or production security release.

## Mandatory next-session stop protocol

Before the next session ends, record repository-verifiable task/review status,
exact commits, dirty paths, commands actually run and results, unresolved
findings, next safe action, and explicit non-goals here. Prefer a clean committed
checkpoint. Never use the handoff to self-approve security-sensitive work, and
retain implementer/reviewer identities in the task record.
