# Neutron session handoff

Updated: 2026-08-01
Branch: `main`
Last committed checkpoint before Task 0024: `6d83747`
Current checkpoint: TASK-0031 implementation commit `fb2f458` passed code and
gate review but is not done. Independent review recorded one documentation P1
in `e81fdd1`: this handoff had not recorded the internal worker protocol v2
compatibility rule and still described TASK-0031 as unfiled. The appended
TASK-0031 checkpoint at the end is the current resumption authority; historical
queue statements remain evidence of earlier states, not current instructions.

This is a navigation checkpoint, not a substitute for authoritative task files
or accepted ADRs. Verify it against the repository before acting.

## Resume here

1. Read `AGENTS.md` and every document it requires, in order. `CLAUDE.md` is
   practical guidance only and cannot override repository instructions.
2. Run `git status --short` and `git log -12 --oneline`.
3. Read `docs/coordination/reviews/2026-08-01-multi-agent-integrity-audit.md`
   before reading any task file. It states what this repository can and cannot
   demonstrate, and several records read differently once you know.
4. Read `docs/coordination/tasks/0028-coordination-integrity-repair.md`. Its
   final review closes the documentation repair at P0 0 / P1 0 / P2 0.
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
- Task 0024's `Status` field is untouched. TASK-0028's final reviewer left it
  `done` because changing the field cannot reconstruct the missing artifact;
  the header evidence caveat is the authoritative warning.

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
the work is queued under the TASK-0030 label below, but no task file exists yet.

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

## Session continuation — 2026-08-01T05:53:00Z

The three P2 residuals listed in the preceding checkpoint have now been
remediated, so its "Outstanding" list is historical rather than current:

- F8 now describes the actual append-only property: no character that existed
  at `de8b259` changed, and the total Task 0024 diff remains zero deletions.
- The TASK-0029 and TASK-0030 references each say locally that no corresponding
  task file exists.
- The F2 wording now says why an unscoped `task_0024` grep count keeps rising.

No product path changed and no build or test was run. `git diff --check` passed;
the Task 0024 diff against `de8b259` is 78 insertions and 0 deletions. TASK-0028
remains in `review` until an independent reviewer confirms the exact committed
remediation artifact. Do not create TASK-0029 before that review closes
TASK-0028.

## TASK-0028 closure — 2026-08-01T05:56:16Z

An independent final reviewer examined exact commit `8186c3d`, re-derived the
three residual fixes, and returned **PASS — P0 0 / P1 0 / P2 0**. No build,
test, browser, or production gate was run or claimed by that review. Task 0028
is `done`; its earlier checkpoint and continuation sections remain as history.

The working tree was clean before the closure record was added. TASK-0029 may
now be filed as the next task in the queue, but no TASK-0029, TASK-0030, or
TASK-0031 task file exists yet. Do not edit product code until the orchestrator
creates, preflights, and assigns the next task.

## TASK-0029 implementation checkpoint — 2026-08-01T09:46:17Z

TASK-0029 is now filed and in `active`. Its bounded implementation closes the
Task 0024 busy-navigation race, clears stale navigation intent after successful
save/delete, disables both editor confirmation groups while busy, replaces
selector-only secret-reset evidence with value/surface checks, and adds masked
selected-item scans to the exact-CSP production flow.

All required commands passed in the implementation session: frozen install,
typecheck, lint and format across 109 files, 12 unit files / 102 tests, root
build, browser tests (4 files / 35 Chromium tests plus 3 files / 3 TOTP matrix
tests), production build verification and exact-CSP Chromium flow, and
`git diff --check`.

No persistence, protocol, worker, crypto, dependency, metadata, or network path
changed. This is not approval: the implementation must be committed, moved to
`review`, and independently reviewed at that exact commit before TASK-0029 can
close. TASK-0030 and TASK-0031 remain queue labels without task files.

## TASK-0029 closure — 2026-08-01T09:50:36Z

An independent reviewer examined exact implementation commit `7aa8a18` and
returned **PASS — P0 0 / P1 0 / P2 0**. TASK-0029 is `done`. The reviewer
re-ran typecheck, the complete browser suite (4 files / 35 Chromium tests plus
3 files / 3 TOTP matrix tests), the production build and exact-CSP Chromium
flow (`Verified 7 production files`), and `git diff --check`; all passed.

The review confirmed that dirty-navigation decisions and both standalone
editor confirmation groups are disabled while busy, stale navigation intent is
cleared only after successful epoch-valid save/delete completion, lock remains
immediate, secret-reset browser assertions no longer rely on detail element
IDs, and selected masked items are scanned through `runtimeSurfaceDump` in the
production flow. The implementation changed no persistence, protocol, worker,
crypto, dependency, metadata, or network path.

The next safe action is to preflight and file TASK-0030 for boundary-enforcement
hardening and CI gate wiring. No TASK-0030 file exists yet. Do not begin its
implementation until the orchestrator has reserved, bounded, and assigned it.

## TASK-0030 implementation checkpoint — 2026-08-01T10:56:39Z

TASK-0030 is filed and in `review`. The candidate replaces basename denial with
a closed classification of every bundle-relevant application source path,
restricts workspace packages by build, makes root `pnpm build` execute the web
boundary, and configures CI to install pinned Playwright engines and run both
browser and exact-CSP production gates. This records workflow configuration,
not a connected GitHub run.

Temporary live probes proved that window-to-worker, worker-to-window, and new
unclassified source paths all fail the web build; every probe was removed. All
required local commands passed: frozen install, typecheck, lint/format across
110 files, 13 unit files / 108 tests, root build with seven-file production
verification, 38 browser checks, the production CSP Chromium flow, and diff
check. The final combined browser run required one documented cleanup-flake
retry (`IndexedDB deletion blocked`); the isolated worker test and complete
rerun both passed. Emitted asset names and bytes remain unchanged from the Task
0029 state.

No product behavior, persistence, protocol, worker runtime, cryptography,
dependency, or public policy changed. TASK-0030 must be committed and reviewed
adversarially at that exact commit before closure. TASK-0031 remains an unfiled
queue label and must not start yet.

## TASK-0030 independent review BLOCK — 2026-08-01T11:07:26Z

Independent review of exact implementation commit `37a655a` returned
**BLOCK — P0 0 / P1 1 / P2 1**. TASK-0030 is back in `active` awaiting an
orchestrator-assigned remediator; TASK-0031 must not be filed or started.

The P1 is a reproduced repository-local relocation bypass. The classifier
searches for the last `/apps/web/src/` or `/packages/` marker instead of
anchoring to the canonical roots. A temporary module at
`probe/apps/web/src/vault-worker-protocol.ts` was therefore treated as the
allowed shared module and entered the window bundle; the filtered production
build passed. The P2 is a reproduced query-exactness gap:
`vault-worker-entry.ts?raw?worker&url` passed because the exception checks only
the query-stripped basename plus an `endsWith("?worker&url")` suffix. All probe
edits and paths were removed.

The reviewer separately confirmed that direct window-to-worker and
worker-to-window violations fail non-zero. After restoration, frozen install,
typecheck, lint/format across 110 files, root tests, the focused 6-test boundary
suite, root build, 35 Chromium browser tests plus 3 engine-matrix tests,
production CSP flow, and diff check passed without retry. Baseline asset names
and exact sizes remained 314,822 / 661,361 / 5,922 bytes. This is local evidence
only; no connected CI run was claimed.

The next safe action is to assign TASK-0030 remediation. Anchor both classifiers
to exact canonical roots, make the worker URL comparison exact, and add both
regressions. Do not create TASK-0031 until a different reviewer passes the
remediation commit.

## TASK-0030 remediation checkpoint — 2026-08-01T11:12:06Z

Both independent-review findings are remediated and TASK-0030 is back in
`review`. Application/package recognition is anchored to exact normalized
canonical roots, and the worker URL exception compares the complete module ID
to the one literal allowed query. Unit regressions cover decoy root markers and
prefixed, reordered, duplicated, and suffixed query forms.

The exact P1 and P2 exploits now fail the filtered production build and name the
offending decoy path/query. All temporary imports, files, and directories were
removed. The complete required gate set passed without retry; artifact names
and sizes remain unchanged.

This remediation still needs independent review of its committed hash before
TASK-0030 may close. TASK-0031 remains unfiled and must not start.

## TASK-0030 closure — 2026-08-01T11:22:52Z

An independent final reviewer examined exact remediation commit `a01f6f3` and
returned **PASS — P0 0 / P1 0 / P2 0**. The previously assigned remediation
reviewer returned no verdict because of a tool-level refusal; it is not counted
as review evidence.

The final reviewer reproduced both remediated exploits with retained live
probes. A side-effectful decoy module below
`probe/apps/web/src/vault-worker-protocol.ts` and the literal worker query
`vault-worker-entry.ts?raw?worker&url` each made the filtered web build return
non-zero and name the exact forbidden module. All probe edits, files, and empty
directories were removed before gates.

Frozen install, typecheck, lint/format across 110 files, the focused 6-test
boundary suite, 13 files / 108 root tests, root build, 35 Chromium browser tests
plus 3 engine-matrix tests, production artifact/CSP verification, and diff check
all passed without retry. Emitted sizes remain 314,822 / 661,361 / 5,922 bytes.
No connected CI run, external system, or deployment was inspected or claimed.

TASK-0031 may now be planned and preflighted as the next queue item, but no
TASK-0031 file exists. Do not change worker validation until the orchestrator
creates, bounds, and assigns that task.

## TASK-0031 handoff remediation — 2026-08-01T11:49:36Z — read this first

TASK-0031 exists and implementation commit `fb2f458` is complete. It restores
the worker-local request/result validation leg for `list-item-summaries`,
`get-item`, `create-item`, `update-item`, and `delete-item`. Item-operation
responses bind `vaultId`; get/update/delete bind item identity; create and
update bind their generation/key-version invariants; summary pages enforce
limit, cursor, order, uniqueness, and greatest-returned-ID pagination. Delete
returns a receipt derived from the matched record after its conditional removal,
not a request echo. The exact-shape response parser and window broker remain
separate validation legs.

The internal window/vault-worker contract is now protocol v2. Window and worker
artifacts must come from the same atomic build. Protocol v1 requests/responses
and every mixed v1/v2 pairing are rejected unconditionally at the exact
`protocol` field; there is no compatibility shim or data migration. This
changes no IndexedDB/persisted record, network/server protocol, crypto format,
dependency, or server-visible metadata. The production harness's intentional
external-worker conflict probe also sends v2.

The latest implementation run passed frozen install, typecheck, lint/format across
110 files, 13 files / 110 unit tests, root build with seven-file verification,
browser tests (4 files / 35 Chromium and 3 files / 3 engine-matrix), production
exact-CSP Chromium flow, and `git diff --check`, without retry. It emitted
`index-DM6_k2C4.js` (315,355 bytes),
`vault-worker-entry-BSdqlPuJ.js` (663,184 bytes), and
`index-uH94Wcke.css` (5,922 bytes). Without retry, the reviewer independently
reran the focused 27 tests, typecheck, lint/format, all 110 root tests, root
build, both browser matrices, production exact-CSP flow, and diff check. The
review record does not claim a second frozen install.

Review of exact implementation commit `fb2f458` returned
**BLOCK — P0 0 / P1 1 / P2 0** only because this handoff was byte-identical to
its TASK-0030 parent and contradicted the checked handoff criterion. The code,
protocol attacks, deletion provenance, and gates held. Review evidence is in
TASK-0031 and committed at `e81fdd1`.

TASK-0031 is back in `review` for confirmation of this documentation-only
remediation. The next safe action is to have `/root/task_0031_review` inspect
the exact remediation commit and close the task only if the handoff now matches
the task and repository. Do not start ADR-0016, idle auto-lock, or any other new
task before TASK-0031 closes. No connected CI run, deployment, Stage 5 approval,
or permission to use real credentials is claimed.
