# TASK 0024 — Functional UI remediation

Status: proposed
Owner: unassigned
Claimed: —
Worktree/branch: —
Reviewer: unassigned
Review claimed: —
Depends on: 0019, 0020, 0021, 0022, 0023
Blocks: Stage 2 completeness review
Security-sensitive: yes

## Outcome

The shipped vault screens can be completed by a keyboard-only user at 320
pixels, never strand a user in an unrecoverable state, never silently discard
their input, and never display secret material the user did not ask to see.
Function only: no restyling, no new assets, no new dependencies.

## Context

Tasks 0017 through 0023 each added one surface to the same two screens under
strict path isolation. That isolation is correct for review, and its cost is
that no task has ever owned the whole screen, so cross-cutting interaction
defects have accumulated without an owner. `docs/coordination/reviews/2026-08-01-stage-2-plan-review.md`
section 3 records why this task exists and why it runs last.

This task is security-sensitive despite being UI work. Deciding whether a
decrypted field is rendered on arrival is a decision about plaintext exposure,
and ADR 0013 explicitly left the display half of that question unowned.

## Allowed paths

- This task file
- `apps/web/src/app.tsx`
- `apps/web/src/item-editor.tsx`
- `apps/web/src/styles.css`
- `apps/web/test/browser/app.browser.tsx`
- `apps/web/scripts/test-production.mjs`

## Out of scope

- `packages/*`, the worker protocol, runtime, client, storage, envelopes, and
  every network, server, and package-protocol format
- Narrowing what `get-item` returns to the window; that is a protocol change and
  remains future work
- Any new dependency, font, icon set, component library, stylesheet, image, or
  third-party asset; ADR 0008 forbids third-party runtime content outright
- Visual redesign, theming, animation, dark/light switching, and layout rewrites
  that are not required to fix a stated functional defect
- Idle auto-lock, clipboard or copy actions, search, sorting, filtering,
  pagination redesign, and any new item type — each needs its own decision

## Acceptance criteria

- [ ] Every enumerated functional defect in the "Findings" section below is
      either fixed or explicitly recorded as deferred with a reason.
- [ ] Secret fields of a decrypted item are not rendered as visible text on
      arrival. Revealing one is an explicit, labelled, keyboard-operable user
      action whose state is announced, and the revealed value clears on item
      change, editor open, error, and lock.
- [ ] No change adds persistence, a URL parameter, a log line, a network
      request, or any new surface carrying plaintext. The emitted-production
      leakage flow proves it with the existing sentinel mechanism.
- [ ] Every interactive control has an accessible name; every asynchronous state
      change a user waits on is announced; every error state offers a way
      forward rather than a dead end.
- [ ] The unlocked vault, item detail, and item editor are fully operable by
      keyboard alone, with a visible focus indicator and no focus trap, verified
      by real-browser tests.
- [ ] No horizontal document overflow at 320 pixels on any screen, including the
      editor, the detail view, and the generator controls, verified by test.
- [ ] Destructive and irreversible actions state their consequence before they
      are taken and are not the default focus target.
- [ ] Existing behavior covered by Tasks 0017 through 0023 keeps passing
      unchanged; no test is weakened or deleted to accommodate a UI change.
- [ ] All repository gates and an independent adversarial review pass.

## Findings

Recorded by the independent read-only preflight of 2026-08-01 against commit
`0f6d9f8`. Line references are to that commit. Each entry is an observable
failure, not a preference.

- **D1 — Pagination is one way.** `apps/web/src/app.tsx:778-787` renders only
  "Next page", and `loadPage` at `:325-335` replaces the page without keeping a
  cursor history. After advancing past the first 24 items there is no way back
  except lock and unlock. Any fix must hold cursors in React state only, never
  in `sessionStorage`, `localStorage`, `history.state`, or the URL.
- **D2 — Item selection is silently dropped while an operation is in flight.**
  `run()` at `apps/web/src/app.tsx:341` returns early with no feedback, and the
  list buttons at `:765` are not disabled while `busy`, unlike `:747` and `:782`.
  The click does nothing and announces nothing.
- **D3 — A recovery-kit typo destroys enrollment but leaves a live-looking
  form.** `apps/web/src/local-vault.ts:776-780` closes the pending enrollment on
  any mismatch, while `apps/web/src/app.tsx:387-398` leaves `screen` on
  `confirm-recovery` with the dead kit still rendered at `:685-687` and an
  enabled submit at `:698-700` that can never succeed. The fix is UI-only: the
  recovery secret must still be cleared, so do not retain it to allow a retry.
- **D4 — Generated secrets are unreadable before save and unmasked after.** The
  password field at `apps/web/src/item-editor.tsx:272-279` is `type="password"`
  with no reveal control, and `apps/web/src/app.tsx:226-234` renders every field
  of a decrypted item as visible text at `:231`, including `password` and
  `secretBase32`. Both halves are functional failures in opposite directions.
  Treat as security-sensitive: see the constraints below.
- **D5 — Generation success is never announced.** `apps/web/src/item-editor.tsx:280`
  sets `aria-busy` but there is no live region, and the value lands in a masked
  input, so a screen-reader user gets no signal. The TOTP path does this
  correctly at `apps/web/src/app.tsx:186-194`.
- **D6 — The selected item is not identifiable.** `apps/web/src/app.tsx:763-770`
  has no `aria-current`, `aria-pressed`, or selected styling; `styles.css:218-228`
  gives every row the same background.
- **D7 — The TOTP error state is a dead end.** `apps/web/src/app.tsx:195-199`
  renders a terminal alert with no retry control once the bounded retry budget
  at `:127-132` and `:144-148` is spent.
- **D8 — Programmatic focus targets have no visible focus indicator.**
  `apps/web/src/styles.css:37-43` scopes the outline to
  `button, input, select, textarea`, but focus is moved onto `tabIndex={-1}`
  headings and paragraphs at `app.tsx:216, 554, 568, 601, 636, 681, 718, 730`
  and `item-editor.tsx:220, 225, 535`.
- **D9 — The detail panel is a live region wrapping an entire form.**
  `apps/web/src/app.tsx:789` wraps the editor and detail view in
  `aria-live="polite"`, causing wholesale announcement that collides with the
  deliberate focus move at `item-editor.tsx:220`.
- **D10 — Changing Type silently destroys entered data.**
  `apps/web/src/item-editor.tsx:194-203` resets the draft to
  `initialDraft()`, keeping only title and tags, with no warning or undo.
- **D11 — Delete confirmation never names the item.**
  `apps/web/src/item-editor.tsx:534-538`. Naming it places a decrypted title in
  a new DOM location, which must clear on lock and cancel like every other
  plaintext surface.
- **D12 — A repeated identical validation failure produces no new feedback.**
  `apps/web/src/item-editor.tsx:205-215` sets the same error string, so React
  bails out, `role="alert"` at `:225` does not re-announce, and the ref-based
  focus move does not re-fire. Existing tests miss this because every case edits
  a field between submits.
- **D13 — Corrupt-item warnings are unidentified and non-actionable.**
  `apps/web/src/app.tsx:773-777` renders a generic sentence per issue without
  the id, a count, or any remediation, and the affected item is absent from the
  list.
- **D14 — "Lock now" discards an open editor draft without warning.**
  `apps/web/src/app.tsx:722-724` and `:314-323`. Recorded as a trade-off, not a
  defect to fix blindly: lock priority is a documented invariant and no fix may
  delay, gate, or confirm before locking.

Viewport note: the preflight could not reproduce a 320-pixel failure. The
production gate already asserts no horizontal overflow at 320 pixels on the
locked screen, the create form, and the TOTP detail view
(`apps/web/scripts/test-production.mjs:363-368`, `:495-501`, `:547-556`).
Genuinely untested at that width: the editor with the delete-confirmation
fieldset open, and the item-detail list for `json` and `backup-code` items. This
task adds those cases rather than claiming a break that was not observed.

### Security constraints on these fixes

- **D4 is the dangerous one and is partly out of scope.** A reveal control turns
  a masked field into rendered DOM text, and
  `apps/web/scripts/test-production.mjs:203-205` captures `formValues` and
  `document.documentElement.outerHTML`, which are sentinel-scanned after cancel,
  delete, and lock at `:433`, `:447`, and `:461`. Any reveal control must
  therefore be proven to clear on those same events. Masking the detail view's
  stored password and TOTP seed changes what ADR 0013 deliberately retained and
  what Task 0022 listed as out of scope; the *display default* may change under
  this task, but narrowing what `get-item` returns may not.
- Additive ARIA for D5 and D9 carries no plaintext risk provided no status text
  ever contains a generated or decrypted value.
- No fix may add persistence, a URL parameter, a log line, or a network request.

## Verification

Record exact results for the full gate set, including
`pnpm --filter @neutron/web test:browser` and
`pnpm --filter @neutron/web test:production`, plus the keyboard and 320-pixel
checks and any retry with its cause.

## Progress log

- 2026-08-01T00:00:00Z — Created from the Stage 2 forward-plan review. Not
  claimable until Task 0023 is done, so that the usability pass covers the
  passphrase UI instead of being invalidated by it.

## Handoff

Summarize changed behavior, important files, decisions, risks, and follow-up work.

## Review

Reviewer, date, findings, and disposition. Required; the implementer must not
self-approve.
