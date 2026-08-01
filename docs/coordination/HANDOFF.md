# Neutron session handoff

Updated: 2026-08-01
Branch: `main`
Last committed checkpoint before Task 0024: `6d83747`
Current checkpoint: Task 0024's code is implemented and every gate passes. Its
original review is **not** repository-verifiable. TASK-0028 records that gap and
is itself in `review`.

This is a navigation checkpoint, not a substitute for authoritative task files
or accepted ADRs. Verify it against the repository before acting.

## Resume here

1. Read `AGENTS.md` and every document it requires, in order. `CLAUDE.md` is
   practical guidance only and cannot override repository instructions.
2. Run `git status --short` and `git log -12 --oneline`.
3. Read `docs/coordination/reviews/2026-08-01-multi-agent-integrity-audit.md`
   before reading any task file. It states what this repository can and cannot
   demonstrate, and several records read differently once you know.
4. Read `docs/coordination/tasks/0028-coordination-integrity-repair.md`. It is
   in `review` and needs an independent reviewer who is not its implementer.
5. Read Task 0024 including its appended `## Review record correction
   (2026-08-01)` section. Do not look for a separate Task 0024 review record;
   none exists, and that is the finding.
6. Do not use real credentials. The UI persistently states that Stage 5 has not
   passed and accepts synthetic test data only.
7. Claim no new task until its dependencies, allowed paths, ADR requirements,
   and overlap are independently preflighted.

## Task 0024 — implemented, gates pass, original review not verifiable

The accurate position, stated plainly:

- The code is implemented and all nine gates pass at `de8b259`.
- An independent adversarial **code** re-review on 2026-08-01 returned
  **P0 0 / P1 1 / P2 6**, with the zero-knowledge claim upheld.
- The **original** review has no repository-verifiable evidence. Commit
  `de8b259` performed the implementation, both review verdicts, and closure in
  one write. No reviewed commit hash was recorded, no review record file exists,
  and all 55 commits share one Git identity.
- Under `AGENTS.md`, the independent-review requirement is therefore not
  demonstrated by the repository for this task. That is a statement about
  evidence; the audit can neither confirm nor refute that the review happened.
- Task 0024's `Status` field is untouched. Whether it should change is deferred
  to the TASK-0028 reviewer and the orchestrator.

Do not repeat the earlier claim that Task 0024 is independently approved.

What the shipped local UI does is unchanged and is described in Task 0024's own
`## Handoff` section; it is not restated here, because the task file is the
authority and duplicating it is how the two drifted apart in the first place.

Product paths stayed limited to `app.tsx`, `item-editor.tsx`, and `styles.css`;
the browser and production tests plus coordination records were the only other
changed paths. No dependency, persistence, URL, protocol, worker, crypto,
network, server, or third-party runtime-content change was made.

## Verification actually run

Reproduced by the 2026-08-01 audit at `de8b259`, not taken from the prior
handoff:

```text
pnpm install --frozen-lockfile               pass
pnpm typecheck                               pass
pnpm lint                                    pass; 109 files
pnpm format:check                            pass; 109 files
pnpm test                                    pass; 12 files, 102 tests
pnpm build                                   pass
pnpm --filter @neutron/web test:browser      pass; 7 files, 35 tests
pnpm --filter @neutron/web test:production   pass
git diff --check                             pass
```

Emitted sizes were reproduced byte for byte: window JavaScript 314,769 B,
vault-worker JavaScript 661,361 B, CSS 5,922 B, worker delta 0 B against the
Task 0023 checkpoint.

Note what these gates do **not** cover. `.github/workflows/ci.yml` runs neither
`test:browser` nor `test:production`, so the bundle-boundary control and the
entire exact-CSP leakage scan are local-only evidence. See audit finding B4;
TASK-0030 owns it.

The exact-CSP production flow uses the real built worker and encrypted
IndexedDB. It covers every classified secret field, redacted TOTP failure and
retry after authenticated-record corruption/restore, repeated validation,
current selection, keyboard traversal, forward/back pagination over 25 real
encrypted items, named deletion, and the complete 320-pixel screen matrix. It
sentinel-scans storage, runtime DOM/form values, network requests, console,
origin state, and static emitted artifacts after required resets.

## Deliberately unfinished

- Tasks 0004, 0006, 0008, and 0009 remain blocked; Task 0010 remains proposed.
- Stage 2 still lacks bounded encrypted local search and a service-worker
  install/update/rollback state machine. Search requires an ADR for index-shard
  leakage and persisted-format policy.
- Idle auto-lock and clipboard copy remain ADR-worthy security decisions.
- QR handling, `otpauth://` import, adjacent-step TOTP validation, clock
  synchronization, deployment, connected CI evidence, dogfood approval, and a
  production release remain absent.
- Do not treat Task 0024 completion as Stage 5 approval.
- **C1 — Stage 2 deliverable D5 is missing and untracked.**
  `docs/ROADMAP.md:52-60` requires schema-driven forms for additional item
  types. No schema registry exists; `apps/web/src/item-editor.tsx` hand-writes a
  `switch (draft.type)` branch per type. D5 is absent from the codebase, from
  this handoff before today, and from the Stage 2 remainder list in the
  2026-08-01 plan review. Stage 2 cannot be called complete while it is missing.
- **C2 — Stage 2 acceptance criterion A3, "offline reload works", is
  structurally impossible today.** No service worker exists, and the artifact
  allowlist at `apps/web/scripts/verify-build.mjs:37` would fail the build if
  `/service-worker.js` were emitted. Satisfying A3 requires changing that
  allowlist, which is a delivery-trust change under ADR 0008 and needs its own
  decision. This is stronger than "untested".
- **C3 — two stale ADR filename reservations collide with accepted ADRs.**
  Task 0004 reserves `docs/decisions/0011-sync-and-server-schema.md`, but ADR
  0011 is the accepted offline recovery kit format. Task 0006 reserves
  `docs/decisions/0012-infrastructure-port-contracts.md`, but ADR 0012 is the
  accepted password generation policy. Both would, on unblocking, try to write
  an accepted append-only filename. Tasks 0008 (reserving 0009) and 0009
  (reserving 0007) remain valid; those numbers are free.
- **C4 — ADR numbers 0007 and 0009 are unexplained gaps.** `docs/decisions/`
  contains no `0007-*` and no `0009-*` file, and `docs/decisions/README.md` does
  not record either as reserved, withdrawn, or never allocated, despite
  `AGENTS.md:115-116` requiring filename reservation.

C3 and C4 need an owning task. None is authorized yet.

## Next safe direction

The outstanding remediation queue, in this order.

**None of these task files exists yet.** The numbers below are proposed
positions in the queue, not records that can be read. The orchestrator reserves
task IDs and must create each file before it is claimed. This list is the
authority on sequence; nothing else in the repository should be read as
asserting that these tasks are filed.

1. **TASK-0029 — Task 0024 P1/P2 code remediation.** Closes the one P1 and six
   P2 findings from the independent code re-review.
2. **TASK-0030 — boundary-enforcement hardening plus CI gate wiring.** Makes
   the bundle-boundary control and the exact-CSP leakage scan produce evidence
   outside one developer machine (audit finding B4, rated P1).
3. **TASK-0031 — restore the missing worker validation leg.** The worker's
   "validate my result against my own request" check is absent for `get-item`,
   `list-item-summaries`, `create-item`, `update-item`, and `delete-item`. It is
   present for `compute-totp`, `generate-password`, and `generate-passphrase`
   (audit finding B2).
4. **ADR-0016 — idle auto-lock**, accepted after independent review, and only
   then its implementation task.

Sequenced separately, because each needs its own ADR decision before any code:

- The emitted-wordlist delimiter finding.
- The recovery-copy finding.

Do not bundle either into one of the four items above. Bundling a decision into
a remediation task is how a security decision gets approved by a review that was
not looking for one.

Neither bounded encrypted search nor service-worker delivery should start ahead
of this queue, and neither is authorized by any current task.

## Manual UI smoke test

Run `pnpm --filter @neutron/web dev` from the repository root and use a fresh
browser profile/origin with synthetic data only. Enrollment, recovery-kit
confirmation, lock/unlock, all five item types, CRUD, password/passphrase
generation, secret reveal, pagination, and TOTP display are available. This is
not a dogfood or production-security release.

## Mandatory next-session stop protocol

Before the next session ends, update this file with repository-verifiable task
status, exact commits, dirty paths, commands actually run, unresolved findings,
next safe action, and explicit non-goals. Prefer a clean committed checkpoint.
Never use a handoff to self-approve security-sensitive work.

## Session checkpoint — 2026-08-01T05:45Z — read this first

This session ran a six-agent read-only audit, then opened TASK-0028 to record
its findings. The session ended on a token-budget limit with **TASK-0028 still
in `review` and not complete**. This section states the true state.

### Committed in this checkpoint

Working tree at the time of commit contained exactly five changed paths:

```text
M  CLAUDE.md
M  docs/coordination/HANDOFF.md
M  docs/coordination/tasks/0024-functional-ui-remediation.md   (75 ins, 0 del)
?? docs/coordination/reviews/2026-08-01-multi-agent-integrity-audit.md
?? docs/coordination/tasks/0028-coordination-integrity-repair.md
```

No file under `apps/`, `packages/`, or `scripts/` was touched. No product code
changed. No gate was re-run in the second half of this session.

### What was verified, and by whom

Six independent read-only agents audited the repository at `de8b259`. All nine
gates passed in a single unreplicated run: 109 files lint and format, 12 files
and 102 unit tests, 7 files and 35 browser tests, production CSP flow pass, and
emitted sizes byte-identical to the recorded figures (window 314,769 B, worker
661,361 B, CSS 5,922 B, delta 0). Both published recovery-kit vectors reproduced
byte-exactly. ADR 0015's corrected constants recomputed and confirmed.

TASK-0028 was reviewed twice by `task_0028_reviewer`, an agent that did not
implement it. First pass: PASS conditional on F6, no P0, no P1, seven P2.
Confirmation pass after remediation: PASS conditional on the new F8, with F1
through F7 each confirmed discharged.

### Outstanding — TASK-0028 is NOT done

Three P2 findings are open and unfixed. Full text is in the
`## Orchestrator checkpoint` section of
`docs/coordination/tasks/0028-coordination-integrity-repair.md`.

- **F8** — Task 0024's correction opens by claiming nothing above it was
  altered; the F6 remedy later inserted three header lines above it. Deletions
  are still zero, so the discipline held, but the sentence overclaims.
- **F4 residual** — this file near line 83 still says "TASK-0030 owns it", and
  Task 0024 says "queued as TASK-0029" without a local qualifier. Neither task
  file exists.
- **F2 wording** — state that the `task_0024` grep count rises as documents
  cite the string, rather than implying a fixed number.

### Next safe action

1. Apply F8, the F4 residual, and the F2 wording. Then obtain an independent
   confirmation before any closure. TASK-0028's implementer may not close it.
2. Only then start TASK-0029. None of TASK-0029, TASK-0030, or TASK-0031 has
   been filed; the orchestrator reserves those IDs.

### Non-goals for the next session

Do not mark TASK-0028 or Task 0024 done on the strength of this file. Do not
create the queued task files while TASK-0028 is open. Do not treat the single
unreplicated gate run above as independent verification — finding B4 records
that these controls leave no evidence outside one agent's session.
