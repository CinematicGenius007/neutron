# TASK 0028 — Coordination integrity repair

Status: done
Owner: unassigned (implemented by `task_0028_implementer`)
Claimed: 2026-08-01T05:15:25Z
Worktree/branch: shared-worktree (main)
Reviewer: `task_0028_reviewer` (initial and confirmation passes),
`/root/task_0028_final_review` (exact-commit closure)
Review claimed: 2026-08-01T05:22:43Z; final review
2026-08-01T05:56:16Z
Review scope: documentation only; no gate, build, or test was re-run by the
reviewer. Section 1 of the audit record ("confirmed sound") was NOT
independently re-verified by anyone; it records a single unreplicated run.
Depends on: —
Blocks: 0029, 0030, 0031 (none of these task files exists yet; the orchestrator
reserves task IDs)
Security-sensitive: yes

## Outcome

The repository's own records state what it can actually demonstrate. A durable
audit record exists for the six-agent read-only audit of 2026-08-01. Task 0024's
review evidence gap is recorded in Task 0024 itself without altering a
character of its existing text. `docs/coordination/HANDOFF.md` no longer asserts
an independent approval the repository cannot show, names the correct baseline
commit, points only at records that exist, and carries the outstanding
remediation queue. `CLAUDE.md`'s three unsupported claims say what is true.

## Context

A six-agent read-only audit completed on 2026-08-01 against commit `de8b259`.
It confirmed that all nine gates pass, that the emitted artifacts match the
recorded figures byte for byte, that the published recovery-kit vectors
reproduce, that ADR 0015's corrected constants are arithmetically right, and
that the shipped secret-hiding behaviour is a real conditional mount rather
than a cosmetic one.

It also found that the repository holds no evidence of Task 0024's independent
review that is separable from the implementer's own commit; that `CLAUDE.md`
makes three claims the codebase does not support; and that four Stage 2 scope
and record gaps are tracked nowhere.

This task is security-sensitive because it changes what the repository asserts
about security review, and because `CLAUDE.md` corrections change what a future
agent will believe a gate has verified. Under `AGENTS.md` it must therefore be
reviewed by an agent other than its implementer, and its implementer may not
close it.

Full findings, with severities and evidence, are in
`docs/coordination/reviews/2026-08-01-multi-agent-integrity-audit.md`.

## Allowed paths

- This task file
- `docs/coordination/reviews/2026-08-01-multi-agent-integrity-audit.md` (new)
- `docs/coordination/tasks/0024-functional-ui-remediation.md` (append only; a
  single new dated section, no edit to any existing character)
- `docs/coordination/HANDOFF.md`
- `CLAUDE.md`

## Out of scope

- Every file under `apps/`, `packages/`, and `scripts/`. This task writes no
  product code, no test, and no build script.
- Running builds or tests. No gate result in this repository changes as a
  result of this task, so none is re-run under it.
- Changing Task 0024's `Status`, or any other task's status. The status
  question raised by the audit is stated and deferred, not decided.
- Rewriting, reflowing, or correcting any existing task file, review record, or
  ADR. Retroactive rewriting of a completed record is itself audit finding A11.
- `AGENTS.md`. Amending the binding contract needs its own task and its own
  review; audit finding A10 exists because that was not done before.
- Remediating the Task 0024 code findings (TASK-0029), wiring CI
  (TASK-0030), restoring the missing worker validation leg (TASK-0031), or
  drafting ADR-0016.
- Repairing the ADR register gaps C3 and C4. They are recorded so a later task
  can own them; unblocking Tasks 0004 and 0006 is not authorized here.

## Acceptance criteria

- [x] `docs/coordination/reviews/2026-08-01-multi-agent-integrity-audit.md`
      exists, follows the format of the existing records in that directory, and
      names the scope, the six-agent method, and every finding in sets A, B, and
      C with its severity and its file/line or commit evidence.
- [x] That record also states what the audit confirmed sound: the nine gate
      results, the byte-identical emitted sizes, the reproduced recovery-kit
      vectors, ADR 0015's recomputed constants, the exact production dependency
      set, the absence of every forbidden runtime API, the conditional-mount
      secret absence with its exhaustive switch, and the unguarded lock path.
- [x] Each confirmed-sound block in that record is attributed to the audit
      agent that produced it, is scoped as a single unreplicated run that the
      recorder did not perform, and cross-references finding B4 as the reason
      those results leave no artifact outside one session.
- [x] `docs/coordination/tasks/0024-functional-ui-remediation.md` gains one new
      section, `## Review record correction (2026-08-01)`, appended at the end,
      plus one `Review evidence:` line inserted into its header metadata block
      pointing at that section. `git diff --numstat` for that file shows a
      deletion count of exactly `0`.
- [x] That section states plainly that no review evidence separable from
      `de8b259` exists, that the commit performed implementation plus both
      verdicts plus closure, that no reviewed commit hash was recorded, that all
      commits share one Git identity, that the `AGENTS.md` independent-review
      requirement is therefore not demonstrated by the repository, and that an
      independent code re-review on 2026-08-01 returned P0 0 / P1 1 / P2 6 with
      the zero-knowledge claim upheld.
- [x] Neither the appended section nor the header insertion alters any
      pre-existing character of the file. `Status: done` is untouched, the
      `## Review` section is untouched, and the correction states that the
      status question is deferred to the TASK-0028 reviewer and the
      orchestrator.
- [x] The caveat is discoverable from where a reader starts. A reader who stops
      at the `## Review` section, which is the final section in
      `TASK_TEMPLATE.md`, still sees the `Review evidence:` line in the header
      metadata block.
- [x] `docs/coordination/HANDOFF.md` contains no assertion that Task 0024 is
      independently approved. It states the accurate position: implemented, all
      gates pass, independent code re-review P0 0 / P1 1 / P2 6, original review
      not repository-verifiable.
- [x] `docs/coordination/HANDOFF.md` names `6d83747` as the prior checkpoint
      (A12) and directs the reader to the audit record rather than to a
      nonexistent review record (A13).
- [x] `docs/coordination/HANDOFF.md` lists the remediation queue in order:
      TASK-0029, TASK-0030, TASK-0031, then ADR-0016 idle auto-lock followed by
      its task; and records that the emitted-wordlist delimiter finding and the
      recovery-copy finding each need their own ADR decision and separate
      sequencing.
- [x] No document directs a reader to a task file that does not exist. The
      queue in `docs/coordination/HANDOFF.md` states that none of TASK-0029,
      TASK-0030, or TASK-0031 is filed yet, and `CLAUDE.md` and the audit record
      describe that work as queued rather than tracked, naming the handoff queue
      as the authority. Creating those files is the orchestrator's to do, since
      it reserves task IDs.
- [x] `docs/coordination/HANDOFF.md` retains its existing "Deliberately
      unfinished" content with C1, C2, C3, and C4 added, and retains the
      mandatory next-session stop protocol section verbatim in substance.
- [x] `CLAUDE.md` states which commands actually enforce the bundle boundary and
      that root `pnpm build` does not (B1).
- [x] `CLAUDE.md` names which worker operations have all three validation legs
      and which lack the worker-side leg, and points at the handoff remediation
      queue for restoring it (B2).
- [x] `CLAUDE.md`'s comment-style rule is marked as the standard for new code,
      with the fact recorded that the named reference file does not follow it
      (B3).
- [x] No new claim is added to `CLAUDE.md` that this task did not verify.
- [x] No file under `apps/`, `packages/`, or `scripts/` is modified.
- [x] No real secrets in any changed file.
- [x] Independent review by an agent other than the implementer.

## Verification

This is a documentation-only task. It changes no source, no test, no build
configuration, and no dependency, so no gate result can change and none was
re-run under it. The gate results quoted in the audit record are the results the
audit itself observed at `de8b259`; they are reported, not re-derived here.

The reviewer should confirm, without running builds or tests:

```sh
git status --short
git diff --stat
git diff --numstat docs/coordination/tasks/0024-functional-ui-remediation.md
grep -n "independently approved" docs/coordination/HANDOFF.md
grep -n "605b196" docs/coordination/HANDOFF.md
ls docs/coordination/reviews/
```

Expected: no path under `apps/`, `packages/`, or `scripts/` appears in the
diff; the Task 0024 numstat shows a deletion count of exactly `0`; the only
`independently approved` hit is the line instructing the reader not to repeat
the claim; `605b196` no longer appears as the prior checkpoint; and the new
audit record is present.

The reviewer should also independently re-derive at least a sample of the
audit's factual claims rather than accepting this record. The three cheapest and
most load-bearing:

```sh
grep -n '"build"' package.json            # B1: expect "tsc --build"
git grep -n "task_0024" de8b259 | wc -l   # A2: expect exactly 3
git show --numstat --format="" de8b259    # A1/F1: 2,094 product + 185 coord
```

Note on the second command: it must be scoped to `de8b259`. An unscoped
`grep -rn "task_0024"` over the working tree returns more, and the count keeps
rising as documents cite the string. That was a defect in an earlier draft of
these instructions, found by the TASK-0028 reviewer.

## Progress log

- 2026-08-01T05:15:25Z — Claimed as `task_0028_implementer` under an
  orchestrator assignment. Read `AGENTS.md`, `CLAUDE.md`,
  `docs/coordination/README.md`, `docs/coordination/TASK_TEMPLATE.md`,
  `docs/coordination/HANDOFF.md`, Task 0024, and the three existing review
  records for format before writing anything.
- 2026-08-01T05:15:46Z — Confirmed the two claims that the `CLAUDE.md`
  corrections rest on, rather than taking them from the audit brief: the root
  `package.json` defines `"build": "tsc --build"` while
  `apps/web/package.json` defines `"build": "vite build && node
  scripts/verify-build.mjs"`, and `docs/decisions/` contains no `0007-*` and no
  `0009-*` file while Tasks 0004 and 0006 reserve filenames `0011-*` and
  `0012-*` that accepted ADRs already occupy.
- 2026-08-01T05:17:05Z — Wrote
  `docs/coordination/reviews/2026-08-01-multi-agent-integrity-audit.md`,
  recording the confirmed-sound section first and all three finding sets with
  severities and evidence, then created this task file from
  `docs/coordination/TASK_TEMPLATE.md`.
- 2026-08-01T05:20:59Z — Between the preceding anchor and this one: appended
  `## Review record correction (2026-08-01)` to Task 0024, additions only, with
  `git diff --numstat` confirming 63 insertions and 0 deletions and
  `Status: done` untouched; rewrote `docs/coordination/HANDOFF.md` to the
  accurate position, fixing A12 and A13, adding the remediation queue, and
  extending "Deliberately unfinished" with C1 through C4 while retaining the
  existing entries and the stop protocol; and corrected B1, B2, and B3 in
  `CLAUDE.md` without adding any claim not verified in this session.
- 2026-08-01T05:20:59Z — Note on this log's own timestamps, since audit
  finding A4 is about this exact failure. Only the values 05:15:25Z, 05:15:46Z,
  05:17:05Z, and 05:20:59Z were read from `date -u`. An earlier draft of this
  log carried three interpolated times, two of which postdated the events they
  described — the same defect A4 records against Tasks 0007, 0017, 0018, and
  0019. They were removed rather than adjusted. Every timestamp above is now an
  observed clock reading, and work spanning two readings is stated as a span.
- 2026-08-01T05:20:59Z — Verified scope and formatting without running builds
  or tests: `git status --short` shows only the five declared paths and no path
  under `apps/`, `packages/`, or `scripts/`; `git diff --check` is clean; and no
  line added by this task exceeds 80 columns. Set `Status: review`. This
  implementer may not close a security-sensitive task and has not attempted to.
- 2026-08-01T05:35:18Z — Independent review by `task_0028_reviewer` returned
  **PASS conditional on F6**, with P0 0, P1 0, and P2 7. The reviewer re-derived
  every load-bearing claim from the repository and all held, and confirmed the
  append-only constraint on Task 0024 was honoured exactly. All seven findings
  were remediated in this session, before any commit, so no correction here
  rewrites committed history:
  - **F1** — corrected a factual error I introduced. `git show --numstat
    de8b259` gives 2,094 insertions across the five product and test files
    (`test-production.mjs` 410, `app.tsx` 417, `item-editor.tsx` 677,
    `styles.css` 95, `app.browser.tsx` 495) and 185 across the two coordination
    files, totalling 2,279. I had used the 2,279 whole-commit figure to describe
    the product change alone. Both figures now appear distinctly in the audit
    record and in the Task 0024 correction, with the earlier error named.
  - **F2** — my reviewer instructions were falsified by my own output. All
    `grep -rn "task_0024"` expectations are now scoped to
    `git grep -n "task_0024" de8b259`, which reproduces exactly 3, with a note
    that an unscoped grep over the working tree returns more because the
    TASK-0028 files contain the string.
  - **F3** — section 1 of the audit record now attributes each confirmed-sound
    block to the audit agent that produced it, states that the recorder ran none
    of the commands, scopes each as a single unreplicated run, and
    cross-references B4 as the reason those results leave no artifact.
  - **F4** — removed the reintroduced A13 defect. `CLAUDE.md` and the audit
    record no longer name TASK-0030 or TASK-0031 as owning or tracking work;
    they describe it as queued but not filed and name the handoff queue as the
    authority. The handoff itself now states that none of TASK-0029, TASK-0030,
    or TASK-0031 exists yet. No task file was created; the orchestrator reserves
    task IDs.
  - **F5** — assigned severities to finding set C rather than weakening the
    criterion: C1 P1, C2 P1, C3 P2, C4 P2, each with its reasoning stated.
  - **F6**, the PASS condition — inserted a `Review evidence:` line into Task
    0024's header metadata block pointing at the correction section, so a reader
    who stops at `## Review` still sees the caveat. Insertion only.
  - **F7** — re-rated B4 from P2 to P1, with the reasoning recorded: a control
    whose entire evidentiary basis is an unverifiable self-report is closer to
    absent than to working. Explicitly not P0, because the controls do function
    when invoked and no actual leak or boundary violation was found.
- 2026-08-01T05:35:18Z — Re-verified after remediation:
  `git diff --numstat` on Task 0024 shows 75 insertions and **0 deletions**, so
  pre-existing content remains untouched; `git grep -n "task_0024" de8b259`
  returns 3; `git diff --check` is clean; no path under `apps/`, `packages/`, or
  `scripts/` is modified; and the reviewer's `## Review` section is unaltered.
  `Status` remains `review`.
- 2026-08-01T05:35:18Z — Two items for the orchestrator to resolve, recorded
  here rather than decided by me.
  1. **The remediated tree has not been reviewed.** The `## Review` section
     pins the artifact reviewed as the uncommitted working tree on top of
     `de8b259` — correctly, and in direct response to finding A2. The F1 to F7
     remediation changed that tree afterwards, so the reviewer's PASS attaches
     to a state that no longer exists. Recording a PASS against an artifact
     while silently changing the artifact is the shape of A1. The reviewer
     should confirm the remediation, or the record should state that the PASS
     predates it.
  2. **`Reviewer:` is still `unassigned`** while a named `## Review` section
     exists. `AGENTS.md` step 9 gives that field to the orchestrator, so I have
     not set it. Leaving it as-is reproduces in miniature the reviewer-identity
     gap that finding A2 documents.

## Handoff

Five files are touched and no product code is. The audit record is the durable
artifact; the other four changes make the live records agree with it.

The single most important thing for the reviewer to understand: this task does
not repair the process failures it records. A1, A2, and A7 describe evidence
that was never created, and evidence cannot be created after the fact. The only
honest remedy available was to state the gap where a reader will encounter
it: in Task 0024 itself, in the handoff, and in a durable review record.

Two judgement calls the reviewer should check rather than accept:

1. **Task 0024's `Status` was left `done`.** Changing it is a lifecycle
   decision, and this implementer is not the reviewer of Task 0024 nor the
   orchestrator. The correction section says the status question is open and
   names who decides it. A reviewer may reasonably conclude the status should
   change; that conclusion belongs to them.
2. **Task 0024 was appended to, not corrected in place.** This makes the file
   internally tense: its `## Review` section asserts an approval that the new
   section says the repository cannot demonstrate. That tension is deliberate
   and is preferable to the alternative, which is finding A11.

Follow-up work, none of it authorized here: TASK-0029 (Task 0024 P1/P2 code
remediation), TASK-0030 (boundary-enforcement hardening plus CI gate wiring),
TASK-0031 (restore the missing worker validation leg for the five item
operations), ADR-0016 (idle auto-lock) and its task, and a later task to own
the ADR register gaps C3 and C4.

## Review

Reviewer: `task_0028_reviewer`, independent of `task_0028_implementer`. I wrote
no product code and no document in this task other than this section.

Date: 2026-08-01 (UTC, from `date -u` at 05:22:43Z).

State reviewed: working tree, **uncommitted**, on top of `git rev-parse HEAD` =
`de8b25916bde32283018948834708c957ec4b529`. `git status --short` shows exactly
five paths and no sixth:

```text
 M CLAUDE.md
 M docs/coordination/HANDOFF.md
 M docs/coordination/tasks/0024-functional-ui-remediation.md
?? docs/coordination/reviews/2026-08-01-multi-agent-integrity-audit.md
?? docs/coordination/tasks/0028-coordination-integrity-repair.md
```

Method: no build and no test was run, per the review constraint. Every factual
claim below was re-derived from version control and file contents rather than
taken from the implementer's account.

### What I verified and confirms sound

**The append-only constraint on Task 0024 was honoured absolutely.**
`git diff --numstat` reports `63  0` — sixty-three insertions, **zero
deletions**. The new section begins at line 374, after the existing `## Review`
section, and no character above it differs. This is the single most important
property of the task and it is clean.

**The load-bearing factual claims all hold.** I re-derived each independently:

- `de8b259` changed 7 files. In that one commit Task 0024's `Status` went
  `ready` -> `done`, and `Claimed`, `Reviewer`, and `Review claimed` were all
  written from `—`. At `605b196` the file reads `Status: ready`; the repository
  therefore never held it in `active` or `review`. A1 confirmed.
- `git rev-list --count HEAD` = 55; `git log --format="%an <%ae>" | sort -u`
  returns exactly one identity. `docs/coordination/reviews/` holds no Task 0024
  record. Comparable tasks do name a reviewed hash — I confirmed `4e0c979` in
  0022:138, `0fac69c` in 0026:179 and 0026:195, `8055962` in 0027. A2 confirmed.
- Root `package.json` line 11 is `"build": "tsc --build"`; the full root script
  set contains no Vite invocation. `apps/web/package.json` line 9 is
  `"build": "vite build && node scripts/verify-build.mjs"` and line 13 is
  `"test:production": "vite build && node scripts/verify-build.mjs && node
  scripts/test-production.mjs"`. B1 confirmed exactly as written.
- `.github/workflows/ci.yml` runs `install`, `typecheck`, `lint`,
  `format:check`, `test`, `build` and nothing else. B4 confirmed.
- `vault-worker-runtime.ts` has fourteen `case` arms. `compute-totp` calls
  `validateTotpComputation`, `generate-password` calls
  `validateGeneratedPassword`, `generate-passphrase` calls
  `validateGeneratedPassphrase`. `get-item` (:166), `list-item-summaries`
  (:147), `create-item` (:212), `update-item` (:223), and `delete-item` (:240)
  return their results with no self-check against the request. B2 confirmed
  exactly, including the "3 of 14" count.
- `vault-worker-protocol.ts` is 703 lines and contains zero comment lines.
  B3 confirmed.
- A4's four commit times convert exactly from the recorded `+05:30` values:
  `3311a2b` 01:38:39Z, `d12404e` 01:08:08Z, `2a9d3b6` 02:22:43Z, `d2a5b13`
  03:02:28Z. Each named task field postdates its own commit. I checked all four
  rather than the two required. The table is exemplary work.
- A5: Task 0019 records `Review claimed` 02:55:51Z against `Claimed` 04:05:00Z.
  A6: Task 0013 records both at 2026-07-27T23:23:21Z, the identical second.
- A7's citations resolve: 0024:243-245 and 0024:30 say what is quoted.
- A8: all four commits verified. `c7fa704` did edit
  `0024-functional-ui-remediation.md`, and 0024 is **not** in Task 0027's
  declared allowed paths. A9: 38 of 55 commits carry no task ID — exact.
  A10: `da3f975` amended `AGENTS.md` (+12) with no task ID in its subject.
  A11: `8055962` rewrote `2026-08-01-stage-2-plan-review.md:26-47`, changing
  "four things" to "three things" and deleting a table row. The record's
  admission that this path *was* authorized under Task 0027 is correct and is
  the honest framing.
- A12: `605b196` is itself a Task 0024 commit; `6d83747` immediately precedes
  it. The new baseline is right.
- C1: `docs/ROADMAP.md` Stage 2 deliverables include "Schema-driven forms for
  additional item types"; no schema registry exists. C2: `verify-build.mjs:37`
  is precisely the artifact allowlist regex, and `/service-worker.js` cannot
  match it. C3: Task 0004 reserves `0011-sync-and-server-schema.md` and Task
  0006 reserves `0012-infrastructure-port-contracts.md`, while ADR 0011 and ADR
  0012 are both `Status: Accepted`; Tasks 0008 and 0009 reserve 0009 and 0007,
  which are free. C4: `docs/decisions/` has no `0007-*` and no `0009-*`, and
  `README.md` carries no row for either. `AGENTS.md:115-116` reads exactly as
  cited.
- Confirmed-sound items I could check without building: third-party production
  dependencies are exactly `react`, `react-dom`, and `libsodium-wrappers-sumo`;
  a grep for `fetch(`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `console.`,
  `localStorage`, `sessionStorage`, `document.cookie`, `innerHTML`, and `eval(`
  across `apps/web/src` and `packages/*/src` returns zero hits.

I found **no false claim** in any of the five changed files. Every assertion I
tested resolved to the evidence cited. `CLAUDE.md` introduced no new unverified
claim while correcting B1, B2, and B3.

**Process conformance.** The task file matches `TASK_TEMPLATE.md` heading for
heading. `Status: review`, not `done`. The independent-review criterion is left
`[ ]`. No self-approval was attempted. Declared allowed paths match the changed
set exactly. All four progress-log timestamps precede `date -u` and are
consistent with file mtimes; no future-dated timestamp survives.

### Findings

**F1 (P2) — the "2,279 lines" figure is attributed to the wrong file set.**
`git show --numstat de8b259` gives 410 + 417 + 677 + 95 + 495 = **2,094**
insertions across the five product and test files. 2,279 is the whole-commit
total, which includes `HANDOFF.md` (87) and the Task 0024 file itself (98). The
audit record (A1) and the appended Task 0024 section both say "all 2,279 lines
of implementation across five product and test files". In a document whose
thesis is evidentiary precision, an inflated count is a real defect. It is now
inside an append-only section and cannot be corrected in place without
repeating A11 — the audit record can be fixed, and the 0024 section can only be
superseded.

**F2 (P2) — the task's own reviewer instructions are falsified by its own
output.** Lines 148-151 direct the reviewer to re-derive `grep -rn "task_0024"`
returning "only three string hits". In the shipped working tree it returns
**five**: the two new files added by this task also mention the string. The
claim is true at `de8b259` and the audit record scopes itself to that commit
correctly, but a verification instruction must be executable against the state
it ships with. A reviewer following it literally hits an apparent contradiction.

**F3 (P2) — section 1 asserts unreproduced results without per-claim
attribution.** "The following were checked directly rather than recalled, and
held" introduces a nine-gate pass table, byte-exact emitted sizes, reproduced
recovery-kit vectors, and recomputed ADR 0015 constants. The recording agent ran
none of it, as this task file's own Verification section (:127-130) states.
Section 5 correctly attributes the code re-review to "an independent adversarial
agent"; section 1 has no equivalent attribution, and no cross-reference to its
own finding B4, which says the browser and production gates are local-only
evidence that no independent runner reproduces. The audit record is explicitly
the durable standalone artifact; a future agent reading it alone will take "All
nine gates pass at `de8b259`" as established. The header's "six independent
read-only agents" is a partial mitigation, which is why this is P2 and not P1.
Remedy is one sentence.

**F4 (P2) — the repair reintroduces finding A13.** `CLAUDE.md` now states
"TASK-0030 owns wiring them into CI" and "Restoring the missing leg is tracked
as TASK-0031", and `HANDOFF.md` lists TASK-0029/0030/0031 as an ordered queue.
No `0029-*`, `0030-*`, or `0031-*` file exists. A13 is the finding that
`HANDOFF.md` directed the next agent to a nonexistent record; the present tense
of "owns" and "is tracked as" repeats that pattern in the file every session
reads first. This task file's `Blocks: 0029, 0030, 0031` also reserves three IDs
with no backing files, which is structurally what C3 records against Tasks 0004
and 0006. Either create stub task files or reword to "reserved, not yet
written".

**F5 (P2) — a checked acceptance criterion is not met.** The first criterion
(:75-78) claims the record names "every finding in sets A, B, and C with its
severity", and is marked `[x]`. C1, C2, C3, and C4 carry no severity rating.
Either rate them or narrow the criterion. A checked box that is not met is the
precise failure mode this task exists to correct.

**F6 (P2) — the correction is undiscoverable from the section it corrects.**
Task 0024 is 435 lines. `## Review` at :351 still ends "Final disposition:
approved and closed." The correction starts at :374 with no forward marker
anywhere above it, and `## Review` is the last section in the template, so
stopping there is the normal reading behaviour. The implementer's judgement call
(2) is right that appending beats rewriting — but "internally inconsistent by
design" is only defensible if the inconsistency is discoverable. A pointer line
inserted in the header metadata block deletes and rewords nothing, still yields
zero deletions in `numstat`, and puts the caveat where every reader starts. This
is the one finding I would require before the task is closed.

**F7 (P2, calibration) — B4 is under-rated.** It is labelled P2 while its own
text concludes that, combined with A2, "the two strongest security controls in
the repository produce no evidence that survives outside one agent's session."
That is a P1-shaped conclusion carrying a P2 label. A11 is similarly P2 despite
being the structural precedent the entire task is built on. Both are defensible;
I recommend the orchestrator re-rate B4 to P1.

*Observation, not a rated finding:* the audit record's mtime (05:20:37Z) is
later than the 05:17:05Z log entry claiming it was written, and the 05:20:59Z
span entry itemises Task 0024, `HANDOFF.md`, and `CLAUDE.md` but not a revision
to the audit record. mtime is weak evidence and I do not raise it as a defect,
but the span entry presents itself as a complete account of the interval.

### On the implementer's four disclosures

(a) **Future-dated timestamps written, then removed and disclosed.** Adequate,
and the strongest good-faith signal in the submission. The earlier draft was
never committed so I cannot verify it externally; I can verify that no
future-dated timestamp survives and that all four readings are consistent with
file mtimes. The disclosure cost the agent something and gained it nothing,
which is the right shape for a self-report.

(b) **C3/C4 have no owning task.** Adequate as disclosure, weakest area as
remedy. `HANDOFF.md` says plainly "C3 and C4 need an owning task. None is
authorized yet." Combined with F4, the pattern across this repair is that gaps
are recorded and then pointed at with identifiers that do not resolve.

(c) **`reviews/` has no structural protection.** Correctly scoped as structural
rather than as misconduct (A11), and the mitigation was actually applied to this
task's own work. Adequate.

(d) **Task 0024 left internally inconsistent by design.** The right call.
Reconciling the two sections would mean rewriting a completed review record,
which is finding A11 committed while documenting A11. Git history would preserve
the original anyway, so a rewrite would buy nothing and cost the principle. The
call is correct *conditional on F6* — fix discoverability and the tension is a
feature, since a reader who sees both learns exactly what the repository can and
cannot show.

### Disposition

**PASS**, conditional on F6, with F1-F5 and F7 as recorded P2 remediation.

No P0. No P1. Nothing false was written into the repository. The append-only
constraint — the property whose violation would have invalidated the entire
record — was honoured exactly. Every claim I could independently re-derive,
re-derived. The seven findings are precision and discoverability defects in a
documentation task, not integrity failures.

### Recommendation on Task 0024's `Status`

**Leave `Status: done`. Do not revert it to `review`.** Fix F6 instead.

Reasoning:

1. Reverting would assert, in the opposite direction, something the repository
   also cannot support. An independent adversarial re-review on 2026-08-01
   returned P0 0 / P1 1 / P2 6 with the zero-knowledge claim upheld, and all
   nine gates pass. `review` would signal "unreviewed", which is not true.
2. The defect A2 identifies is not "this code is unreviewed" — it is "the
   artifact that was reviewed is unidentifiable". No value of a status field
   repairs that. Re-reviewing now would review `de8b259`, a different artifact
   from whatever was originally examined; it would create a second record, not
   recover the missing one.
3. Status fields drive agent behaviour. `review` instructs the next agent that a
   review must happen before dependent work proceeds. That instruction is wrong
   here: the code has been re-reviewed and the residue is P1/P2 remediation
   already queued as TASK-0029. Setting `review` would misdirect.
4. The honest instrument is the record, not the lifecycle field — which is what
   the implementer argued, and I independently reach the same conclusion.

If the orchestrator wants a stronger signal than the appended section, the
correct instrument is the header metadata block: insert a line such as
`Review evidence: not repository-verifiable; see "## Review record correction
(2026-08-01)"`. That is an insertion, preserves zero deletions, does not touch
the review record's substance, and puts the caveat where every reader begins. I
prefer this to any status change and it also discharges F6.

This reviewer does not set `Status`. TASK-0028 remains `review` pending the
orchestrator's disposition of F6.

## Review — confirmation pass

Reviewer: `task_0028_reviewer`, the same reviewer as the `## Review` section
above. Date: 2026-08-01, `date -u` = 05:38:06Z.

State reviewed: working tree, still uncommitted, still atop
`de8b259916bde32283018948834708c957ec4b529`. This is a **different tree** from
the one my `## Review` section pinned at 05:22:43Z; the F1-F7 remediation
changed it in between. That is why this pass exists, and the implementer flagged
the same problem itself in its 05:35:18Z log entry.

**Invariants re-confirmed first.** `git status --short` still shows exactly the
five declared paths and no sixth. `git diff --numstat` for Task 0024 is now
`75  0` — **deletions remain zero**. The added header lines appear as
`@@ -9,6 +9,9 @@` with three `+` lines and no `-` line, so the F6 remedy is a
pure insertion and nothing that existed at `de8b259` was altered. My own
`## Review` section is intact; I re-read F1, F2, and the Disposition verbatim
and no character was changed. The implementer correctly routed its disagreement
with my grep count through the orchestrator instead of editing my text.

### Discharge of F1-F7

**F1 — discharged.** Arithmetic independently recomputed:
410 + 417 + 677 + 95 + 495 = **2,094**; 87 + 98 = **185**; 2,094 + 185 =
**2,279** insertions against 595 deletions. Both the audit record's A1 and the
Task 0024 correction now state the product figure and the whole-commit figure
distinctly, with the per-file breakdown. Critically, the earlier error is
**disclosed rather than erased** — both locations carry a sentence naming that
an earlier draft used 2,279 to describe the product change alone. That is the
correct handling and it is what I asked for.

**F2 — discharged.** `git grep -n "task_0024" de8b259` returns exactly **3**,
verified. Both documents now scope the expectation to the commit and explain why
an unscoped grep returns more.

*Adjudicating the disputed count:* the implementer is right that I am not, and I
am right that it was not 5 when it was 6. At 05:22:43Z the unscoped grep
returned **5**; my own `## Review` section then added a sixth; as of 05:38:06Z
it returns **11**. Neither figure was wrong when measured — the number is a
function of when you run it, which is precisely the defect F2 identified. The
remediation is therefore better than either number: it stops quoting a
tree-dependent count at all. One residual suggestion, non-blocking: where the
records mention the unscoped result, say "returns more, and the count keeps
rising as documents cite the string" rather than implying a fixed larger number.

**F3 — discharged, and this is the strongest of the seven fixes.** Section 1 now
opens with an attribution-and-weight block stating outright that the recorder
ran none of the commands, that each result is "a single unreplicated run on one
machine", and that this limitation *is finding B4 in operation*. Each result
block names its producing agent — gates to agent 3, sizes/deps/API-scan to agent
5, vectors and ADR 0015 constants to agent 4, secret absence and lock path to
agent 2. I checked for deletion-instead-of-attribution: all eight original
result blocks survive, none was dropped. Section 5's overclaim is properly
narrowed — it now says only the last two confirmed-sound items come from the
code re-review, and I verified that against section 1's own attributions. The
added notes on which claims are cheaply re-derivable (arithmetic, digests,
static greps) versus machine-dependent are more than I asked for and are
genuinely useful to a later agent.

**F4 — discharged, with a residual.** `CLAUDE.md` now contains zero
`TASK-0029/0030/0031` references and defers to the handoff queue. The queue
itself opens with "**None of these task files exists yet.**" and names the
orchestrator as the reserver of IDs. The audit record carries an equivalent
note. *Residual, non-blocking:* two bare references remain without a local
qualifier — `HANDOFF.md:83` ("TASK-0030 owns it"), which sits about fifty lines
above the disclaimer, and the Task 0024 correction's "queued as TASK-0029",
which has no qualifier in a file that is read standalone. Both are covered by a
disclaimer elsewhere in their own document, so the dangling-pointer defect is
substantially cured, but "anywhere in the five files" is not literally true.

**F5 — discharged, and the severities are defensible.** C1 P1, C2 P1, C3 P2,
C4 P2. I accept the reasoning as stated and reach it independently: C1 and C2
both cause a *wrong decision* by a reader acting in good faith — an orchestrator
reading the current records would conclude Stage 2 is nearly complete while a
roadmap deliverable is unbuilt and an acceptance criterion is blocked behind an
unmade delivery-trust decision. C3 and C4 are latent on tasks that are blocked
and cannot fire, and they share one register fix. That is the right axis to rate
on.

**F6 — discharged; this was my stated condition.** Task 0024 lines 12-14 now
read `Review evidence: not repository-verifiable; see "## Review record
correction (2026-08-01)" ... before relying on the "## Review" section or on
"Status: done"`. It is a pure insertion into the header metadata block, it names
both things a reader would otherwise trust, and it appears above every section
of the file. A reader who stops at `## Review` has now been warned upstream.
Condition met.

**F7 — discharged, and I accept the ceiling argument.** B4 is re-rated P1. The
reasoning is the one I would have written: not P0, because the controls do
function when invoked and no actual leak or boundary violation was found; P1,
because a control whose entire evidentiary basis is an unverifiable self-report
— in a repository where A2 demonstrates that self-reports here are exactly what
cannot be verified — is nearer to absent than to working. The handoff queue also
propagates the new rating.

### New finding introduced by the remediation

**F8 (P2) — the correction section's own opening sentence is now false.** Task
0024:379-380 still reads "This section is appended. Nothing above it has been
altered, including the `## Review` section." TASK-0028 has since inserted three
lines into the header metadata block at 12-14, which *is* above it. No
pre-existing character was changed and deletions remain zero, so the underlying
discipline holds — but the sentence as written claims more than that, and it is
contradicted by the same task's own diff.

I own the cause: this is a direct consequence of the remedy I prescribed in F6.
That does not make it acceptable in a document whose subject is records that
claim more than they can show.

The fix is cheap and is **not** A11: this text is new, uncommitted, TASK-0028's
own authorship, so correcting it is not retroactive rewriting of a completed
record. Reword to something like: "No pre-existing character above it has been
changed; deletions in this file's diff are zero. TASK-0028 inserted one
`Review evidence:` line into the header metadata block and nothing else."

### Disposition

**PASS**, conditional on F8 being corrected before commit.

F1 through F7 are all discharged; F3, F5, F6, and F7 are discharged well. No P0
and no P1 in the remediated tree. Deletions in Task 0024 remain zero, the file
set is unchanged, and my prior section was not touched. F8 is a one-sentence
correction to uncommitted text and I would not hold a commit for anything more.

My recommendation on Task 0024's `Status` is unchanged: **leave `done`**, for
the four reasons given above. The F6 header line now carries the caveat that a
status change would have communicated less precisely.

### On the `Reviewer:` field

`task_0028_reviewer` is the right value and I agree it should be set — leaving
it `unassigned` beside a named review section reproduces A2 in miniature, and
the implementer was right to flag it and right not to set it itself.

Two refinements, for the orchestrator:

1. **Set `Review claimed:` to a real timestamp** rather than `—`. A named
   reviewer with no claim time is the same species of metadata gap.
2. **Record the scope, because "reviewed" will otherwise be read as more than
   it was.** My review was documentation-only. I ran no build and no test; I did
   not re-verify any gate result, emitted size, recovery-kit vector, or ADR 0015
   constant; and I did not re-review Task 0024's product code. I verified
   version-control facts, file contents, arithmetic, and internal consistency.
   A future reader who sees only `Reviewer: task_0028_reviewer` may infer the
   gate table in section 1 was independently confirmed. It was not — by anyone.
   A `Review scope: documentation only; no gate re-run` line in the metadata
   block would close that gap, and refusing to let a review field imply more
   coverage than it had is the entire lesson of this task.

## Orchestrator checkpoint — 2026-08-01T05:45Z — TASK-0028 LEFT INCOMPLETE

Appended by the orchestrator. The session ended on a token-budget limit while
the F8 remediation pass was in flight; that agent was stopped before it wrote
anything. This section records the true state rather than a tidy one.

### Applied in this working tree

- The five declared files were created or edited as described above.
- Findings F1 through F7 from the first review were remediated and the reviewer
  independently confirmed each as discharged in the confirmation pass.
- Task 0024 diff is `75 insertions, 0 deletions`. No pre-existing character in
  that file was altered.
- The orchestrator set `Reviewer`, `Review claimed`, and `Review scope` in this
  file's metadata block, and qualified the `Blocks` field. These are the only
  orchestrator edits.

### NOT applied — outstanding and unfixed

- **F8 (P2), open.** Task 0024's correction still opens with "This section is
  appended. Nothing above it has been altered." The F6 remedy later inserted
  three lines at 12-14, which is above it. Deletions remain zero so the
  append discipline held, but that sentence claims more than the diff supports.
  Agreed replacement wording: "No pre-existing character above it has been
  changed; deletions in this file's diff are zero. TASK-0028 inserted one
  `Review evidence:` line into the header metadata block and nothing else."
- **F4 residual (P2), open.** `HANDOFF.md` near line 83 still reads
  "TASK-0030 owns it", and Task 0024's "queued as TASK-0029" carries no local
  qualifier for standalone reading. Neither may be read as pointing at an
  existing record; both need a short qualifier.
- **F2 wording (P2), open.** The reviewer suggested stating that the
  `task_0024` grep count keeps rising as documents cite the string, rather than
  implying any fixed number.

### Status

`Status: review`. This task is NOT done and must not be marked done. The next
session applies F8, the F4 residual, and the F2 wording, then obtains a further
confirmation from an independent reviewer before any closure. The implementing
agent may not close it.

## Residual remediation — 2026-08-01T05:51:34Z

The next session applied only the three residual documentation fixes recorded
in the checkpoint above: F8's exact-shape wording, local not-yet-filed
qualifiers for the TASK-0029 and TASK-0030 labels, and the F2 explanation that
an unscoped grep count rises as documents cite the string. The checkpoint's
"NOT applied" list remains as history of `c98b69f`; this section supersedes its
description of the current tree.

TASK-0028 remains in `review` pending independent confirmation of the exact
resulting artifact. The implementing agent has not closed it.

## Final review — exact committed artifact

Reviewer: `/root/task_0028_final_review`, independent of
`task_0028_implementer` and of the earlier reviewer. Review timestamp:
2026-08-01T05:56:16Z, read directly from `date -u`.

Reviewed artifact: commit
`8186c3d2a66177faa41fceffeb4855242d567a9e` on `main`, with a clean working
tree before this review record was written.

Scope: documentation and version-control evidence only. I ran no build, test,
browser, or production gate and did not treat the audit's single unreplicated
gate run as independently confirmed evidence.

I attempted to falsify each residual and the task's closure conditions:

- **F8 is discharged.** Against `de8b259`, Task 0024 has 78 insertions and
  zero deletions. Its diff contains only the three-line `Review evidence:`
  metadata field and the appended 75-line correction section. The replacement
  wording says no character that existed before TASK-0028 changed, says the
  deletion count is zero, and leaves the pre-existing `## Review` untouched.
- **The F4 residual is discharged.** The nearby HANDOFF reference says the work
  is only queued under the TASK-0030 label and that no task file exists. Task
  0024 likewise says its residue is queued under the TASK-0029 label and that
  no task file exists. No `0029-*`, `0030-*`, or `0031-*` task file exists.
- **The F2 wording is discharged.** The audit record, Task 0024 correction,
  and this task's verification note all say that an unscoped count rises as
  documents cite `task_0024`; `git grep -n "task_0024" de8b259 | wc -l`
  independently returns exactly 3.
- `git diff --check 8186c3d^ 8186c3d` is clean. The commit touches only the
  HANDOFF, the audit record, Task 0024, and Task 0028, all declared allowed
  paths. No product, package, script, dependency, ADR, or Task 0024 status
  changed.

Verdict: **PASS — P0 0 / P1 0 / P2 0.** Every acceptance criterion is
satisfied. TASK-0028 is closed. Task 0024 remains `done` with its evidence
caveat visible in the header; changing that status would not reconstruct the
missing original review artifact. TASK-0029 may now be filed by the
orchestrator, but no such task file exists at this review point.
