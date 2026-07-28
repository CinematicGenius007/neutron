# TASK 0018 — Dedicated vault worker boundary

Status: done
Owner: unassigned
Claimed: 2026-07-28T02:20:00Z
Worktree/branch: shared-worktree (main)
Reviewer: `/root/task_0017_reviewer`
Review claimed: 2026-07-28T03:55:00Z
Depends on: 0007, 0016, 0017
Blocks: Stage 2 React vault shell
Security-sensitive: yes

## Outcome

Put enrollment, unlock, unlocked-session keys, envelope operations, and vault
IndexedDB orchestration behind a dedicated module worker with a closed versioned
message protocol and a narrow window broker.

## Allowed paths

- This task file
- `apps/web/**` for the message protocol, worker runtime/entry, broker, bounded
  session projections, and Node/Chromium tests
- `pnpm-lock.yaml` only if workspace dependency metadata changes

## Out of scope

- React UI, service-worker caching/update state, deployment headers, search
  indexes, password generation, clipboard integration, sync, or server APIs
- Generic encrypt/decrypt, raw record, random-byte, or key import/export messages
- Claims that worker isolation protects against a compromised authorized window

## Acceptance criteria

- [x] A dedicated module worker exclusively constructs the production crypto
      provider, encrypted repository, pending enrollment, and unlocked session.
- [x] Requests and responses are exact versioned operation-discriminated values
      with bounded inputs, canonical uint64 request/epoch fields, and independent
      validation on both sides of structured clone.
- [x] The protocol exposes only enrollment, unlock, lock, bounded item summaries,
      point reads, and conflict-bound item writes; it exposes no generic crypto,
      key, or raw-storage operation.
- [x] Duplicate/in-flight IDs, stale epochs, malformed values, unknown fields,
      hostile prototypes/accessors before send, and invalid worker responses fail
      closed before privileged dispatch or UI consumption.
- [x] Lock advances the epoch, invalidates late results, clears session state,
      rejects queued work, acknowledges, and causes the window broker to
      terminate the worker; a fresh worker is required for later unlock.
- [x] Real Chromium proves the production worker can enroll, confirm, create,
      page summaries, point-read, update, delete, reload/unlock, and lock without
      returning raw key material or accepting post-lock work.
- [x] All repository gates and independent security review pass.

## Verification plan

Use deterministic runtime tests with hostile messages/endpoints and a production
libsodium plus IndexedDB module-worker contract in real Chromium. Exercise exact
schema rejection, duplicate IDs, stale epochs, late completion after lock,
bounded paging, response forgery, worker termination, and all five item shapes.

## Progress log

- 2026-07-28T02:20:00Z — Claimed after accepted ADR 0008 and completion of
  Tasks 0016 and 0017. Chose the worker boundary before React so the visible
  shell cannot accidentally grow direct key or repository access.
- 2026-07-28T02:55:00Z — Implemented a closed worker protocol, independently
  validated broker, serialized authority operations with immediate lock, bounded
  title/type summary pages, point reads, revision-only writes, production worker
  bootstrap, and removal of raw session/storage exports. Moved to review after
  Node and real-Chromium contracts passed.
- 2026-07-28T03:05:00Z — Review found a P1 authority-resurrection race: delayed
  enrollment, unlock, or confirmation could commit its returned object after a
  concurrent lock advanced the epoch. Returned to active for epoch-bound
  authority commit checks, destruction of late objects, and race regressions.
- 2026-07-28T03:15:00Z — Remediated the race by binding authority commits to
  their starting epoch, cancelling late pending ceremonies, locking late
  sessions, and suppressing old results. Delayed begin, confirm, and unlock
  regressions prove lock leaves the worker at locked epoch 1. Returned to review
  after every gate passed.
- 2026-07-28T03:25:00Z — Review found a second P1: generic result kinds did not
  bind otherwise-valid responses to their originating operation or requested
  item/page constraints. Returned to active to echo the operation and enforce
  operation-specific ID, limit, ordering, uniqueness, and cursor expectations.
- 2026-07-28T03:40:00Z — Bound success and error frames to the echoed operation,
  enforced requested item IDs and summary page invariants in the broker, added
  schema-valid forgery, hostile nested input, mutation snapshot, stale/duplicate
  request, and post-lock real-worker regressions, then returned to review.
- 2026-07-28T03:50:00Z — Final review found a P1 zero-generation schema gap.
  Returned to active to require positive item generations on both sides and bind
  successful create/update revisions to their exact expected generation and key
  version.
- 2026-07-28T03:55:00Z — Enforced nonzero opaque IDs, positive item generations,
  incrementable update generations, exact write revisions, and scalar-valid
  1..1024-byte UTF-8 passwords before dispatch. Boundary and real-browser suites
  passed and the task returned to final review.

## Verification

Remediation pass: 72 Node tests, five real-Chromium contracts, typecheck, lint,
format check, build, and diff check.

## Handoff

The React shell must consume only the reviewed broker and must not import local
vault, crypto-provider, or encrypted-repository implementation modules.

## Review

PASS by `/root/task_0017_reviewer`: P0 0, P1 0. The review reproduced and
closed authority-resurrection, cross-operation correlation, zero-generation,
nonzero-ID, and UTF-8 password-boundary findings. Two non-blocking P2 follow-ups
remain for the React-shell milestone: reject duplicate vault IDs in otherwise
valid session metadata, and enforce the window/worker import boundary in the
production bundle graph.
