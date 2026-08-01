# TASK 0032 — Responsive vault hierarchy and empty state

Status: done
Owner: unassigned (implementation and remediation by `/root`)
Claimed: 2026-08-01T20:06:00Z
Worktree/branch: shared-worktree (`main`)
Reviewer: `/root/task_0032_review`
Review claimed: 2026-08-01T20:47:19Z
Depends on: 0029, 0031
Blocks: —
Security-sensitive: yes

## Outcome

The unlocked vault preserves its efficient desktop master/detail layout while
compact screens show one active list, detail, or editor context. An empty vault
presents one obvious first-item action and omits unusable pagination.

## Context

The primary-source and real-browser evidence is recorded in
`docs/coordination/reviews/2026-08-01-ui-ux-research-and-plan.md`. At the current
compact breakpoint, the list and detail regions stack even when one is inactive.
This makes the create flow begin below a full screen of irrelevant content.

This task is marked security-sensitive because navigation away from a decrypted
detail or editor must preserve Task 0024's reveal clearing, dirty-draft guard,
and immediate-lock behavior even though the change is primarily responsive UX.
No ADR is required because no cryptographic, authentication, recovery, privacy,
persisted, transmitted, or public API decision changes.

## Allowed paths

- This task file
- `docs/coordination/reviews/2026-08-01-ui-ux-research-and-plan.md`
- `docs/coordination/HANDOFF.md`
- `apps/web/src/app.tsx`
- `apps/web/src/styles.css`
- `apps/web/test/browser/app.browser.tsx`
- `apps/web/scripts/test-production.mjs`

## Out of scope

- Crypto, packages, storage, worker/protocol, network, dependency, or metadata changes.
- Recovery semantics or the inaccurate recovery-path copy; that remains an ADR decision.
- Master-password reveal, password-confirmation policy, clipboard, idle auto-lock,
  search, sorting, shortcuts, schema-driven item types, service-worker delivery,
  theming, font/icon dependencies, telemetry, or deployment.
- Changing which decrypted values are returned to the window or rendered by default.

## Acceptance criteria

- [x] At widths through the existing 760-pixel breakpoint, the item list is the
      only vault-grid pane visible until a create editor or selected detail is
      active; then only the detail/editor pane is visible.
- [x] A compact selected detail offers a keyboard-operable **Back to items**
      action that clears per-field reveal state and restores focus to the Items
      heading. Editors retain their existing guarded cancel behavior.
- [x] Wider screens continue to show both master and detail regions.
- [x] The first empty page says that the vault has no items and presents a
      prominent **Create your first item** action; a genuinely empty later page
      retains page-specific wording.
- [x] Pagination is absent when neither a previous nor next page exists and
      remains present and operable otherwise.
- [x] Compact pane switching never bypasses dirty-draft confirmation, leaves a
      revealed secret rendered after return, or changes immediate lock behavior.
- [x] Real-browser evidence at 320 pixels verifies list → create → list and
      list → selected detail → list visibility, focus, and no horizontal overflow;
      desktop evidence verifies master/detail remains visible.
- [x] Existing browser and production leakage checks remain passing with
      synthetic data only.
- [x] No dependency, persistence, worker/protocol, crypto, recovery, metadata,
      or network behavior changes.
- [x] A separate reviewer reviews an identifiable committed artifact and records
      P0/P1/P2 findings before closure.

## Verification

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
pnpm --filter @neutron/web test:browser
pnpm --filter @neutron/web test:production
git diff --check
```

The reviewer must additionally inspect compact computed visibility, focus return,
secret reset after **Back to items**, dirty-editor behavior, and desktop parity.

## Progress log

- 2026-08-01T13:30:34Z — Orchestrator verified clean `main` at `69572de`, no
  active or review task, dependencies 0029 and 0031 done, and no path overlap.
  Reserved and claimed TASK-0032 after primary-source research and a real-browser
  desktop/compact audit with synthetic data only.
- 2026-08-01T13:46:00Z — Implemented explicit list/detail pane state at the
  existing responsive breakpoint, compact **Back to items** with reveal reset
  and focus return, an actionable empty state, and conditional pagination. Live
  Chromium inspection at 390×844 and 1440×1000 confirmed the intended hierarchy.
- 2026-08-01T13:47:00Z — The first production run failed only because its new
  cancel-flow assertion expected focus on the Items heading, while the existing
  and intended create-cancel behavior restores focus to **Create item**. The test
  expectation was corrected without changing product behavior; the complete
  exact-CSP flow then passed.
- 2026-08-01T13:48:00Z — Verification passed: frozen install; typecheck; lint
  and format over 110 files; 13 unit files / 110 tests; root build with 7
  verified production files; browser tests with 4 files / 36 Chromium tests and
  3 files / 3 engine-matrix tests; exact-CSP production Chromium flow; and
  `git diff --check`. The root unit test and build commands overlapped briefly
  because both yielded sessions; both completed successfully without retry.
- 2026-08-01T13:48:00Z — Implementation finished. Ownership cleared and task
  moved to `review`; the orchestrator will commit an identifiable candidate,
  assign a separate reviewer, and leave the review criterion unchecked.
- 2026-08-01T19:53:33Z — Candidate committed as `99e4c9f`. The commit tool call
  remained pending for approximately six hours before returning success; no
  commands, edits, or new task work were started during that interval.
  Orchestrator assigned `/root/task_0032_review` to review that exact commit.
- 2026-08-01T20:06:00Z — Independent review BLOCK on `99e4c9f` accepted in
  full (P0 0 / P1 1 / P2 2). Orchestrator returned the task to `active`, cleared
  review ownership, and claimed the bounded corrupt-only predicate, CTA
  prominence, adversarial-test, and exact-diff whitespace remediation.
- 2026-08-01T20:23:44Z — Remediation uses one named first-use predicate that
  requires zero valid items and zero corrupt-record issues. An adversarial
  corrupt-only page keeps its warning and ordinary page wording. Desktop now
  has one primary first-item action; compact CSS promotes the only visible list
  action. Production assertions wait for settled computed styles at 320 and
  1280 pixels. All candidate whitespace diagnostics were removed.
- 2026-08-01T20:23:44Z — Remediation verification passed: frozen install;
  typecheck; lint/format over 110 files; 13 unit files / 110 tests; root build
  with 7 verified production files; browser tests with 4 files / 37 Chromium
  tests and 3 files / 3 engine-matrix tests; exact-CSP production Chromium flow;
  and exact `git diff --check` against both `99e4c9f` and `69572de`. Two earlier
  production attempts caught misplaced/immediate new style assertions; only the
  test locations/timing were corrected, and the complete flow then passed.
- 2026-08-01T20:23:44Z — Remediation finished. Ownership cleared and task
  returned to `review`; the confirmation criterion remains unchecked pending a
  committed artifact and reassignment to the independent reviewer.
- 2026-08-01T20:33:29Z — Remediation committed as exact `783ba59`; the commit
  tool call remained pending for approximately nine minutes before returning
  success, with no concurrent task work. Exact `git diff --check 99e4c9f
  783ba59` and `git show --check 783ba59` pass. Orchestrator reassigned
  `/root/task_0032_review` for confirmation of this exact artifact.
- 2026-08-01T20:37:52Z — User requested the goal stop at the nearest checkpoint.
  Orchestrator interrupted the running confirmation review. No confirmation
  verdict or review evidence was returned or recorded, so the task remains
  `review`, the separate-review criterion remains unchecked, and reviewer
  ownership is cleared for a fresh assignment. No new task was started.
- 2026-08-01T20:47:19Z — Continuation verified clean `main` at stop-checkpoint
  `0644d4b`, exact remediation `783ba59`, no other active/review task, and clean
  exact diff checks. Orchestrator reassigned `/root/task_0032_review` for a
  fresh confirmation of exact `783ba59`; no implementation or later task began.

## Handoff

Compact screens now render only the active item-list or detail/editor pane;
desktop keeps both. Empty first-use state and pagination are conditional on real
page state. **Back to items** clears selected detail and its reveal component
before returning focus to Items. No dependency, persistence, worker/protocol,
crypto, recovery, metadata, or network path changed.

Initial exact commit `99e4c9f` is blocked by the review below. Complete bounded
remediation is committed at exact `783ba59` and awaits independent confirmation.
The prior confirmation attempt was interrupted at the user's stop request and
has no verdict; a new reviewer claim must be recorded before resumption.
Do not start ADR-0016 idle auto-lock concurrently; it overlaps the same UI paths.

## Review

Pending independent review of a committed candidate.

### 2026-08-01T20:03:52Z — BLOCK on exact commit `99e4c9f`

Reviewer: `/root/task_0032_review` (did not implement the candidate)

Verdict: **BLOCK — P0 0 / P1 1 / P2 2**.

#### P1 — corrupt-only first pages are represented as an empty vault

The new empty-vault predicate checks `page.items.length === 0`, first-page
history, and absence of `nextCursor`, but does not require
`page.issues.length === 0`. A first page containing one or more authenticated
`corrupt-item` issues and no decryptable summaries therefore renders **Your
vault has no items yet**, both first-item actions, and **Create your first
encrypted item** while the corruption warning says encrypted records were
skipped. The same page cannot truthfully be both a new empty vault and a vault
with unreadable encrypted records. The prominent first-use treatment can cause
a person to proceed as if no prior data exists, and it fails the task's
"genuinely empty" boundary.

Use one named predicate for the true first-use state and include zero issues in
it. Reuse that predicate for the page subtitle, button treatment, empty-list
copy, pagination decision where applicable, and empty-detail action. Add an
adversarial browser case with zero summaries and at least one synthetic
`corrupt-item` issue that proves the corruption warning remains, the ordinary
**No items on this page.** wording is used, and neither empty-vault claim is
rendered.

#### P2 — desktop presents two equally prominent first-item actions

At a genuine empty first page, the list-header **Create item** button loses its
`secondary` class while the simultaneously visible desktop detail pane adds a
second primary **Create your first item** button. This does not satisfy the task
outcome's "one obvious first-item action" as cleanly as claimed. Preserve one
primary action on wide master/detail screens while keeping the only visible
compact action prominent, and cover the distinction with computed-style or
class assertions rather than text presence alone.

#### P2 — the committed candidate fails an exact diff whitespace check

`git diff --check 69572de 99e4c9f` and `git show --check 99e4c9f` report eleven
diagnostics: Markdown trailing spaces in the new task/research metadata and a
blank line at the research file's EOF. The progress log's bare `git diff
--check` could return success after staging because it examines only unstaged
changes; it is not evidence that the identifiable candidate itself is clean.
Remove the reported whitespace and record an exact parent-to-candidate check
for the remediation artifact.

#### Controls independently confirmed

- At 320 and 760 CSS pixels, computed styles expose only the list before
  selection and only the editor/detail after activation; at 761 pixels both
  panes are `block`. The tested layouts had no horizontal overflow.
- Create cancellation returns the compact UI to the list and focuses **Create
  item**. A selected synthetic login remained masked until explicit reveal;
  **Back to items** removed the synthetic secret from the complete HTML,
  restored `#items-title` focus, and exposed only the list pane.
- Pagination remains present for first pages with a next cursor and later pages
  with a previous cursor. Existing dirty-draft, busy-decision, immediate-lock,
  and secret-surface regressions remain green.
- The production diff changes no dependency, persistence, worker/protocol,
  crypto, recovery, metadata, or network implementation. The research note is
  scoped to its Chromium observations, distinguishes normative WCAG material
  from an application-specific Material breakpoint adaptation, and its cited
  primary-source claims were independently checked.

Reviewer commands and results against exact implementation commit `99e4c9f`:

```text
pnpm typecheck
  pass
pnpm --filter @neutron/web test:browser
  sandbox attempt: infrastructure failure before tests; listen EPERM on ::1
  approved local-listen rerun: pass; 4 files / 36 Chromium tests and
  3 files / 3 engine-matrix tests
pnpm --filter @neutron/web test:production
  pass; Verified 7 production files; Production CSP Chromium flow passed
agent-browser --session neutron-task0032-review <local 320/760/761 probes>
  pass; computed single-pane/desktop parity, create-cancel focus, reveal-reset
  back navigation, target size, and horizontal-overflow checks
git diff --check 69572de 99e4c9f
  fail; 11 whitespace diagnostics in the two new Markdown records
```

The task remains in `review`. Remediation must be committed as an identifiable
artifact and returned for independent confirmation; this review changes no
product code or handoff state.

### 2026-08-01T20:48:01Z — remediation confirmation on exact commit `783ba59`

Reviewer: `/root/task_0032_review` (same independent reviewer; did not implement
the candidate or remediation)

Verdict: **PASS — P0 0 / P1 0 / P2 0**.

The remediation discharges every prior finding. A single named
`isFirstUseEmptyPage` predicate requires a loaded page, zero summaries, zero
corrupt-record issues, first-page history, and no next cursor. The page label,
list copy, explanatory copy, compact button treatment, and desktop empty-detail
action all consume that predicate rather than independently approximating the
state. The new corrupt-only adversarial case returns one synthetic
`corrupt-item` issue with zero summaries and proves the warning and ordinary
**No items on this page.** wording remain while both empty-vault claims and the
compact-primary treatment are absent.

The list-header action is now always semantically secondary. Only the
`compact-primary` media-query rule promotes it at widths through 760 pixels,
where the desktop empty-detail action is hidden; above the breakpoint the list
action settles to a transparent secondary background and the visible
**Create your first item** action remains the sole primary CTA. The exact-CSP
flow waits for and asserts both settled computed-style states instead of relying
only on class names.

The original compact/desktop hierarchy, create-cancel focus, selected-detail
return focus, revealed-secret removal, dirty-draft guards, pagination, immediate
lock, and complete runtime leakage controls remain covered by the passing full
browser and exact-CSP flows. The remediation adds no dependency or change to
protocol, worker, persistence, crypto, recovery, metadata, or network behavior.
Its changed paths remain within TASK-0032's declared scope.

Independent confirmation commands against exact remediation commit `783ba59`:

```text
pnpm typecheck
  pass
pnpm --filter @neutron/web test:browser
  pass; 4 files / 37 Chromium tests and 3 files / 3 engine-matrix tests
pnpm --filter @neutron/web test:production
  pass; Verified 7 production files; Production CSP Chromium flow passed
git diff --check 99e4c9f 783ba59
git diff --check 69572de 783ba59
git show --check --format= 783ba59
  pass; no diagnostics from any exact check
git diff --name-status 99e4c9f 783ba59
  pass; only the seven TASK-0032 allowed paths changed
```

TASK-0032 is closed. This confirmation changed only the task's review record,
final criterion, and lifecycle status; it did not modify product code or
`docs/coordination/HANDOFF.md`.
