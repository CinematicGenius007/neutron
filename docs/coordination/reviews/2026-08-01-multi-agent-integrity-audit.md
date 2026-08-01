# Multi-agent integrity audit — 2026-08-01

Scope: the whole repository at commit `de8b259`, on branch `main`, with a clean
working tree. The audit covered coordination records, the Task 0024 product
code, every declared gate, ADR conformance, the window/worker bundle boundary
and leakage controls, and the Stage 2 plan.

Method: six independent read-only agents, none of which wrote product code.

1. Coordination truth — task lifecycle, commit history, and ownership.
2. Task 0024 adversarial code review — a fresh review of the shipped diff.
3. Gate verification — every command in `CLAUDE.md`, run and counted.
4. ADR conformance — accepted ADRs against the code and documents.
5. Bundle boundary and leakage — emitted artifacts and forbidden APIs.
6. Stage 2 planning — roadmap deliverables against what exists.

Recorded by: `task_0028_implementer`, under TASK-0028. This record states what
the repository can and cannot demonstrate. Where something is unproven it is
labelled unproven rather than softened.

This document changes no accepted ADR, no task status, and no product code.

## 1. What the audit confirmed sound

A record of only defects is a dishonest record. The following held.

**Attribution and evidentiary weight.** The recorder of this document ran none
of the commands below. Each block is attributed to the audit agent that produced
it, and each is **a single unreplicated run on one machine**, reported here
rather than reproduced here. Treat them as one agent's observation, not as
independently confirmed fact.

This limitation is not incidental — it is finding B4 in operation. Because
`.github/workflows/ci.yml` runs neither `test:browser` nor `test:production`,
these results exist only as claims inside one session and leave no artifact any
later agent can inspect. A reader who wants certainty must re-run them; nothing
in the repository will do it for them.

**All nine gates pass at `de8b259`.** Produced by audit agent 3, gate
verification. One run; not replicated.

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

**Emitted sizes are byte-identical to the figures recorded in `HANDOFF.md`:**
window JavaScript 314,769 B, vault-worker JavaScript 661,361 B, CSS 5,922 B,
with a worker delta of 0 B against the Task 0023 checkpoint. Produced by audit
agent 5, bundle boundary and leakage. The handoff's numbers were not taken on
trust by that agent; they were rebuilt and measured. One run; not replicated.

**Both published 90-character recovery-kit test vectors reproduced
byte-exactly.** Produced by audit agent 4, ADR conformance.

**ADR 0015's corrected constants were recomputed and confirmed:** derived
wordlist SHA-256 `abae4976…67ba`; mean word length 6.991769; global exhaustion
probability 1.11917e-128, which is correctly *not* below 1e-128, the point ADR
0015 exists to correct; and 8 words = 103.398 bits. Produced by audit agent 4,
ADR conformance. These are deterministic arithmetic and digest checks, so they
are the most cheaply re-derivable claims in this section and the least dependent
on machine state.

**Production dependencies are exactly `react`, `react-dom`, and
`libsodium-wrappers-sumo`.** No unauthorized production dependency has entered
the tree. Produced by audit agent 5.

**No forbidden runtime API appears in `apps/web/src` or `packages/*/src`:**
zero occurrences of `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`,
dynamic `import()`, `console.*`, `localStorage`, `sessionStorage`,
`document.cookie`, `history.*`, `innerHTML`, or `eval`. Produced by audit agent
5. This is a static source scan, re-derivable with `grep` at any time.

**Task 0024's per-field secret absence is real, not cosmetic.** Produced by
audit agent 2, the adversarial code review; see section 5. The hidden
field is a conditional mount that returns `null`; the secret does not exist in
the DOM before reveal. It is not a CSS or visibility trick. The detail
renderer's `switch` over item type is exhaustive, so adding a new item type is
a compile error rather than a silently unmasked field — the failure mode is
loud by construction.

**The lock path clears state before its first `await`, with no guard, no
confirmation, and no early return.** Immediate lock remains a real invariant in
the shipped code, as ADR 0013 and Task 0024 both require. Produced by audit
agent 2; source inspection, re-derivable by reading `apps/web/src/app.tsx`.

## 2. Finding set A — coordination integrity

### A1 (P0) — one commit did implementation, both verdicts, and closure

Commit `de8b259` simultaneously:

- flipped Task 0024 `Status: ready` to `done`;
- wrote `Claimed`, `Review claimed`, and the reviewer identity;
- added 2,094 insertions of implementation across five product and test files;
- added the entire `## Review` section carrying **both** the initial BLOCK and
  the remediation PASS verdicts; and
- rewrote `docs/coordination/HANDOFF.md` to assert approval.

The two figures, from `git show --numstat de8b259`: 2,094 insertions across the
five product and test files (`test-production.mjs` 410, `app.tsx` 417,
`item-editor.tsx` 677, `styles.css` 95, `app.browser.tsx` 495), plus 185 across
the two coordination files (`HANDOFF.md` 87, the task file 98), for a
whole-commit total of 2,279 insertions and 595 deletions. An earlier draft of
this record used the 2,279 total to describe the product change alone; the
product figure is 2,094.

The repository never held Task 0024 in `active` or in `review`. The lifecycle
that `docs/coordination/README.md` defines, and that `AGENTS.md` steps 9 and 10
require, left no trace in version control.

### A2 (P0) — no committed review record exists for Task 0024

At commit `de8b259`, `grep -rn "task_0024"` returned exactly three string hits:
`docs/coordination/HANDOFF.md:27`,
`docs/coordination/tasks/0024-functional-ui-remediation.md:7`, and
`docs/coordination/tasks/0024-functional-ui-remediation.md:353`.
`docs/coordination/reviews/` contained no Task 0024 file.

Re-run that grep against a later tree and the count will be higher, because
this record and the TASK-0028 files also contain the string. To reproduce the
finding, scope it: `git grep -n "task_0024" de8b259`. The load-bearing fact is
not the number but that every hit is either the task file's own metadata or a
handoff assertion — none is a review artifact.

Task 0024's `## Review` section names no reviewed commit hash. Every comparable
task does: 0022 names `4e0c979`, 0025 names `d94b925`, 0026 names `0fac69c`,
0027 names `8055962`. Because the pre-review state was never committed, the
artifact that was allegedly reviewed is unidentifiable in principle — not
merely unrecorded. No later agent can reconstruct it.

All 55 commits in this repository share one Git identity, so authorship cannot
distinguish implementer from reviewer either.

**What this does and does not mean.** It does not mean the review did not
happen. It means the repository holds no evidence of it that is separable from
the implementer's own commit, and `AGENTS.md` requires evidence, not assertion.
The audit cannot confirm or refute the review; it can only report that the
record is absent.

### A3 (P1) — nine security-sensitive tasks created and closed in one commit

Tasks 0011, 0012, 0013, 0014, 0015, 0016, 0017, 0018, and 0020 were each
created **and** marked `done` in the same commit that carried their
implementation. Tasks 0001 and 0002 arrived already `done` in the squashed
baseline `1834f95` and cannot be assessed at all.

The same objection as A1 applies to each: the task record and its closure are
not separable from the implementation.

### A4 (P1) — four task files record timestamps later than their own commit

| Task | Field and value | Commit | Commit time |
| --- | --- | --- | --- |
| 0007 | `Claimed` 02:00:00Z | `3311a2b` | 01:38:39Z |
| 0007 | `Review claimed` 02:50:00Z | `3311a2b` | 01:38:39Z |
| 0017 | `Review claimed` 01:45:00Z | `d12404e` | 01:08:08Z |
| 0018 | `Review claimed` 03:55:00Z | `2a9d3b6` | 02:22:43Z |
| 0019 | `Claimed` 04:05:00Z | `d2a5b13` | 03:02:28Z |

A timestamp that describes an event later than the commit recording it was
written in advance, not observed. These are narrative timestamps.

### A5 (P1) — Task 0019's review claim precedes its implementation claim

Task 0019 records `Review claimed` at 02:55:51Z and `Claimed` at 04:05:00Z: the
review is claimed 70 minutes before the implementation. Its progress log runs
backwards in time.

### A6 (P1) — Task 0013 claims implementation and review in the same second

Task 0013 records `Claimed` and `Review claimed` both at
2026-07-27T23:23:21Z — the identical second. Independent review did not occupy
measurable time.

### A7 (P1) — Task 0024 made a lasting plaintext-exposure decision with no ADR

Task 0024 changed the default rendering of decrypted secret fields to
absent-from-DOM with an explicit per-field reveal. That is a lasting decision
about plaintext exposure and needed an accepted ADR **before** implementation,
per `AGENTS.md` and `CLAUDE.md`.

The task file says so itself. At `:243-245` it states the change "changes what
ADR 0013 deliberately retained", and at `:30` that "ADR 0013 explicitly left the
display half of that question unowned". Recognising that an accepted ADR left
the question unowned is precisely the trigger for writing one.

The three immediately preceding tasks each had an ADR accepted first: 0021 under
ADR 0012, 0022 under ADR 0013, 0023 under ADRs 0014 and 0015. Task 0024 is the
exception, and nothing in its file explains why.

The change itself reduces exposure and the audit found no defect in it. The
finding is the missing decision record, not the behaviour.

### A8 (P2) — allowed-path overruns

- `d94b925` (Task 0025) created
  `docs/coordination/tasks/0026-argon2id-test-timeout-margin.md`.
- `59a0c11` touched `docs/coordination/HANDOFF.md` and renamed task 0026.
- `c7fa704` (Task 0027) edited
  `docs/coordination/tasks/0024-functional-ui-remediation.md:269`.
- `7d9447c` (Task 0005) created `docs/coordination/tasks/0010-*.md`.

Each wrote outside its declared allowed paths without first amending the task.

### A9 (P2) — commit/task traceability is weak

38 of 55 commits carry no task ID. Two commits carry more than one
(`59a0c11`, `b48653d`). `AGENTS.md` asks for one task ID and one coherent
concern per commit.

### A10 (P2) — the binding contract was amended without a task, ADR, or review

Commit `da3f975` amended `AGENTS.md`, the document that governs every agent,
with no task ID, no ADR, and no review.

### A11 (P2) — a review record was retroactively rewritten

Commit `8055962` rewrote factual content of an existing review record at
`docs/coordination/reviews/2026-08-01-stage-2-plan-review.md:26-47` with no
amendment marker. That path was inside Task 0027's declared allowed paths, so
the edit was authorized. The finding is structural: `reviews/` is not
append-only, and nothing in the repository prevents a completed review's
findings from being altered after the fact.

This is why the Task 0024 correction in this remediation was appended rather
than merged into the existing text.

### A12 (P2) — `HANDOFF.md` mislabels its own baseline

`docs/coordination/HANDOFF.md:5` named `605b196` as the "last committed
checkpoint before this task". `605b196` is itself a Task 0024 commit. The
correct prior checkpoint is `6d83747`.

### A13 (P2) — `HANDOFF.md` directed the next agent to a nonexistent record

`docs/coordination/HANDOFF.md:18` instructed the next agent to read Task 0024's
"initial BLOCK plus remediation PASS review record". No such record exists
(A2).

## 3. Finding set B — documentation claims the repository does not support

### B1 (P1) — "A violation fails `pnpm build`, not a test" is false as written

`CLAUDE.md` stated that a bundle-boundary violation fails `pnpm build`. The root
`package.json` defines `"build": "tsc --build"`. `tsc` does not run Vite, does
not run the `enforceWindowBoundary` plugin, and does not run
`apps/web/scripts/verify-build.mjs`.

The boundary is enforced only by `pnpm --filter @neutron/web build` (which runs
`vite build && node scripts/verify-build.mjs`) and by
`pnpm --filter @neutron/web test:production`. Three separate agents confirmed
this independently.

The control is real; the sentence naming the command that triggers it was
wrong. An agent following `CLAUDE.md` literally would believe a root build had
checked the boundary when it had not.

### B2 (P1) — "triple validation" holds for 3 of 14 worker operations

`CLAUDE.md` states that a worker result is checked three times — by the worker
against its own request, by the standalone response parser against the global
schema, and by the client broker against an expectation captured before the
request was sent — and that these must not be collapsed.

All three legs are genuinely present for `compute-totp`, `generate-password`,
and `generate-passphrase`. The worker's own "validate my result against my own
request" leg is **absent** for `get-item`, `list-item-summaries`, `create-item`,
`update-item`, and `delete-item`.

The rule was written as a description of the codebase. It is a description of
part of it. Restoring the missing leg is queued in the remediation list in
`docs/coordination/HANDOFF.md`; no task file for it exists yet.

### B3 (P2) — the comment-style rule is aspirational, not descriptive

`CLAUDE.md` states that comments explain security intent and invariants. The
file it names as the reference dialect,
`apps/web/src/vault-worker-protocol.ts`, contains zero comments. The rule is a
standard for new code; it does not describe the reference files.

### B4 (P1) — CI runs neither browser nor production gates

`.github/workflows/ci.yml` runs neither
`pnpm --filter @neutron/web test:browser` nor
`pnpm --filter @neutron/web test:production`. The bundle-boundary control and
the entire exact-CSP leakage scan are therefore local-only evidence: they
pass on a developer machine and are never reproduced by an independent runner.

Combined with A2, this means the two strongest security controls in the
repository produce no evidence that survives outside one agent's session.

**Re-rated from P2 to P1 during TASK-0028 review.** The original P2 was not
defensible against this record's own conclusion. The exact-CSP leakage scan is
the only mechanism that checks whether plaintext reaches storage, the DOM, the
network, or a static artifact, and the boundary check is the only mechanism that
keeps `packages/crypto` and the vault worker out of the window bundle. Both are
accepted controls under ADR 0008. Neither runs anywhere except on the machine of
whoever chose to run it.

The consequence is concrete, not theoretical: a change that reintroduced a
plaintext leak, or collapsed the window/worker boundary, would be caught only if
an agent both remembered to run the filtered command and reported the result
honestly. A2 demonstrates that the repository cannot verify the second
condition. A control whose entire evidentiary basis is an unverifiable
self-report is closer to absent than to working, which is P1 territory.

It is not P0: the controls do exist and do function when invoked, and the audit
found no actual leak or boundary violation. The defect is that nothing forces
them to run.

## 4. Finding set C — scope and record gaps

Severities in this set were assigned during the TASK-0028 review, which
correctly noted that an earlier draft claimed severities for all three sets and
supplied them for only two. None of these is a security defect; they are
planning and register integrity gaps, rated by what a later agent would get
wrong by trusting the current records.

### C1 (P1) — Stage 2 deliverable D5 is absent from code and from every plan

`docs/ROADMAP.md:52-60` lists D5, schema-driven forms for additional item types,
as a Stage 2 deliverable. It is absent from the codebase, absent from
`HANDOFF.md`, and absent from the Stage 2 remainder list in
`docs/coordination/reviews/2026-08-01-stage-2-plan-review.md`.

`apps/web/src/item-editor.tsx` hand-writes a `switch (draft.type)` branch per
item type. No schema registry exists. Stage 2 cannot be declared complete while
a roadmap deliverable is missing from both the code and the plan that tracks
what remains.

P1 because this is the finding most likely to cause a wrong decision rather than
an inconvenience. An orchestrator reading the current remainder list would
conclude Stage 2 is two items from done, and could declare it complete with a
roadmap deliverable silently unbuilt.

### C2 (P1) — criterion A3, "offline reload works", is structurally impossible

No service worker exists. Further, the artifact allowlist at
`apps/web/scripts/verify-build.mjs:37` would **fail the build** if
`/service-worker.js` were emitted.

This is stronger than "untested". The current build policy actively rejects the
artifact the criterion requires. Satisfying A3 means changing that allowlist,
which is a delivery-trust change under ADR 0008 and needs its own decision.

P1 for the same reason as C1: a Stage 2 acceptance criterion is recorded as
outstanding work when it is in fact blocked on an unmade delivery-trust
decision. Anyone scheduling it as ordinary remaining work has mis-scoped it.

### C3 (P2) — two stale ADR filename reservations collide with accepted ADRs

- Task 0004 reserves `docs/decisions/0011-sync-and-server-schema.md`. ADR 0011
  is the **accepted** offline recovery kit format.
- Task 0006 reserves `docs/decisions/0012-infrastructure-port-contracts.md`.
  ADR 0012 is the **accepted** password generation policy.

Both blocked tasks would, on unblocking, attempt to write a filename that is
already an accepted, append-only ADR.

Tasks 0008 (reserving 0009) and 0009 (reserving 0007) remain valid: those
numbers are free.

P2 because both tasks are blocked, so the collision cannot fire until one is
unblocked, and it would be caught immediately at that point by anyone who looked
at `docs/decisions/` before writing. The cost of leaving it is confusion, not a
wrong artifact.

### C4 (P2) — ADR numbers 0007 and 0009 are unexplained gaps

`docs/decisions/` contains no `0007-*` and no `0009-*` file, and
`docs/decisions/README.md` does not record either number as reserved,
withdrawn, or never allocated. `AGENTS.md:115-116` requires a task to reserve an
exact ADR filename before parallel work begins, which makes the state of a
number a fact the register should carry.

As it stands, 0007 is reserved by Task 0009 and 0009 is reserved by Task 0008
(C3), but a reader of `docs/decisions/README.md` alone cannot learn this.

P2 for the same reason as C3, and they share a fix: one edit to the ADR register
recording the state of every allocated and reserved number closes both.

## 5. Task 0024 code re-review

Audit agent 2, an independent adversarial reviewer, re-reviewed the Task 0024
product code on 2026-08-01 and returned **P0 0 / P1 1 / P2 6**, with the
zero-knowledge claim upheld. The last two confirmed-sound items in section 1 —
the conditional-mount secret absence and the lock path — come from this pass;
the gate, size, vector, constant, dependency, and API-scan items come from audit
agents 3, 4, and 5 as attributed there. The outstanding P1 and P2 items are
queued as TASK-0029.

This re-review is evidence about the *code*. It is not a substitute for the
missing original review record, and it does not retroactively satisfy the
`AGENTS.md` requirement that the reviewed artifact be identifiable.

## 6. Disposition

This document records findings. It closes nothing and approves nothing.

- A1, A2, and A7 concern process integrity that cannot be repaired
  retroactively; the honest remedy is to record accurately what the repository
  can demonstrate, which TASK-0028 does.
- A3 through A6 and A8 through A13 are recorded here as durable history. The
  individual task files are not being rewritten, because rewriting completed
  records is finding A11.
- B1, B2, and B3 are corrected in `CLAUDE.md` under TASK-0028. B2's underlying
  code gap and B4's CI gap are queued in the remediation list in
  `docs/coordination/HANDOFF.md`.
- C1 through C4 are added to the "Deliberately unfinished" list in
  `docs/coordination/HANDOFF.md` so they are not inherited silently.

**On the TASK-0029, TASK-0030, and TASK-0031 identifiers used in this record.**
No such task file exists. These are queue positions named in
`docs/coordination/HANDOFF.md`, not records that can be read, and the
orchestrator reserves task IDs. The handoff's remediation queue is the
authority; treat the numbers here as labels for work that is planned, not
filed.

The disposition of Task 0024's `Status` field is deferred to the TASK-0028
reviewer and the orchestrator. This implementer has no authority to change it.
