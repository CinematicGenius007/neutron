# TASK 0024 — Functional UI remediation

Status: ready
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
- `docs/coordination/HANDOFF.md` (checkpoint facts only)

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
  pagination changes beyond D1/D15, and any new item type — each needs its own
  decision

## Acceptance criteria

- [ ] Every enumerated functional defect in the "Findings" section below is
      either fixed or explicitly recorded as deferred with a reason.
- [ ] Decrypted detail fields classified as secret are absent from the rendered
      DOM on arrival: login password and notes; secure-note body; TOTP
      `secretBase32`; backup codes and notes; and JSON value. Username, URL,
      tags, TOTP algorithm/digits/period/issuer/account name may remain visible
      after explicit item selection. Revealing each secret is an explicit,
      labelled, keyboard-operable Show/Hide action whose state is announced
      without the value. Reveal state and plaintext DOM clear on item or
      revision change, editor open, generic or TOTP error, cancel, delete, and
      lock. The editor login password starts masked and has the same explicit
      announced Show/Hide behavior.
- [ ] No change adds persistence, a URL parameter, a log line, or a network
      request carrying plaintext. The only new plaintext DOM surfaces are the
      explicit active per-field reveal, the already-authorized editor input,
      and the named delete confirmation; every other DOM/status/navigation
      surface stays redacted. Production proves a secret is present only during
      reveal and absent after every required reset with the sentinel mechanism.
- [ ] Every interactive control has an accessible name. Redacted targeted
      statuses announce item/page loading, successful generation into the
      masked field, save/delete completion, and TOTP calculation/retry without
      placing a secret or title in status text. Repeating the same validation
      error is announced again. Every recoverable error offers an explicit way
      forward; initial/in-flight/failed list loads never claim an empty page.
- [ ] The unlocked vault, item detail, and item editor are fully operable by
      keyboard alone, with a visible focus indicator and no focus trap, verified
      by real-browser tests.
- [ ] No horizontal document overflow at 320 pixels on any screen, including the
      editor, the detail view, and the generator controls, verified by test.
- [ ] Destructive and irreversible actions state their consequence before they
      are taken and are not the default focus target.
- [ ] Create, item selection, pagination, type change, and cancel never silently
      erase a dirty draft. They either preserve it or require an inline,
      keyboard-operable, redacted discard decision. Lock remains immediate and
      unconfirmed, with an advance warning that it discards unsaved changes.
- [ ] One persistent warning across every supported application screen—locked,
      enrollment, recovery confirmation, and unlocked—states that this is a
      development build, accepts synthetic test data only, and has not passed
      the Stage 5 security review. Browser-check and unsupported screens may be
      excluded. No data-entry screen presents Neutron as ready for real
      credentials.
- [ ] Existing secure behavior covered by Tasks 0017 through 0023 keeps passing;
      no assertion is weakened or deleted merely to accommodate a UI change.
      Tests that currently require a recorded defect, especially silent draft
      destruction, are strengthened to require the remediated behavior.
- [ ] All repository gates and an independent adversarial review pass.

## Findings

Originally recorded by the independent read-only preflight of 2026-08-01 against
`0f6d9f8`, then independently reproduced and refreshed against `6d83747` before
claim. Each entry is an observable failure, not a preference.

- **D1 — Pagination is one way.** `apps/web/src/app.tsx:787-796` renders only
  "Next page", and `loadPage` at `:327-337` replaces the page without keeping a
  cursor history. After advancing past the first 24 items there is no way back
  except lock and unlock. Any fix must hold cursors in React state only, never
  in `sessionStorage`, `localStorage`, `history.state`, or the URL.
- **D2 — Item selection is silently dropped while an operation is in flight.**
  `run()` at `apps/web/src/app.tsx:343` returns early with no feedback, and the
  list buttons at `:772-779` are not disabled while `busy`.
  The click does nothing and announces nothing.
- **D3 — A recovery-kit typo destroys enrollment but leaves a live-looking
  form.** `apps/web/src/local-vault.ts:776-780` closes the pending enrollment on
  any mismatch, while `apps/web/src/app.tsx:389-399` leaves `screen` on
  `confirm-recovery` with the dead kit screen at `:687-720`, its output at
  `:694-696`, and an enabled submit that can never succeed. The fix is UI-only: the
  recovery secret must still be cleared, so do not retain it to allow a retry.
  On `confirmation-failed`, terminate the unusable broker, clear both kit
  strings, and return to a fresh enrollment form with a specific restart
  message; never imply the dead confirmation can be retried.
- **D4 — Generated secrets are unreadable before save and unmasked after.** The
  password field at `apps/web/src/item-editor.tsx:295-303` is `type="password"`
  with no reveal control, and `apps/web/src/app.tsx:207-241` renders every field
  of a decrypted item as text at `:233`. The exact default-hidden detail fields
  are bound in acceptance above; CSS hiding does not count because the secret
  must not mount in the DOM until explicit reveal.
- **D5 — Generation success is never announced.** The generator at
  `apps/web/src/item-editor.tsx:304-402` sets `aria-busy`, but its request path at
  `:197-215` has no dedicated success status and the value lands masked.
- **D6 — The selected item is not identifiable.** `apps/web/src/app.tsx:772-779`
  has no `aria-current`, `aria-pressed`, or selected styling; `styles.css:218-228`
  gives every row the same background.
- **D7 — The TOTP error state is a dead end.** `apps/web/src/app.tsx:118-160`
  reaches the terminal alert at `:197-201` with no retry control.
- **D8 — Programmatic focus targets have no visible focus indicator.** CSS
  `:37-43` scopes the outline to controls, while focus moves to static targets at
  `app.tsx:563,577,610,645,690,727,739` and
  `item-editor.tsx:244,249,611`.
- **D9 — The detail panel is a live region wrapping an entire form.**
  `apps/web/src/app.tsx:798` wraps the editor and detail view in
  `aria-live="polite"`, causing wholesale announcement that collides with the
  deliberate focus move at `item-editor.tsx:244`.
- **D10 — Changing Type silently destroys entered data.**
  `apps/web/src/item-editor.tsx:218-227` resets the draft to
  `initialDraft()`, keeping only title and tags, with no warning or undo.
- **D11 — Delete confirmation never names the item.**
  `apps/web/src/item-editor.tsx:609-630` uses a generic legend at `:612`. Naming
  it places a decrypted title in
  a new DOM location, which must clear on lock and cancel like every other
  plaintext surface.
- **D12 — A repeated identical validation failure produces no new feedback.**
  `apps/web/src/item-editor.tsx:229-250` sets the same error string, so React
  bails out, the alert does not re-announce, and the ref-based
  focus move does not re-fire. Existing tests miss this because every case edits
  a field between submits.
- **D13 — Corrupt-item warnings are unidentified and non-actionable.**
  `apps/web/src/app.tsx:782-786` renders a generic sentence per issue. The
  allowed APIs cannot repair or delete an unauthenticated record, so the honest
  in-scope way forward is: show total count and opaque record ID, state it was
  skipped and not modified, offer Retry current page, and advise locking if the
  warning persists. Do not imply recovery or deletion occurred.
- **D14 — "Lock now" discards an open editor draft without warning.**
  `apps/web/src/app.tsx:419-435` and `:731-733`. Recorded as a trade-off, not a
  defect to fix blindly: lock priority is a documented invariant and no fix may
  delay, gate, or confirm before locking. Add an advance warning only.
- **D15 — Ordinary navigation silently destroys dirty drafts.** Clicking Create
  item, another item, or Cancel editing can unmount an open draft without a
  redacted inline discard decision. The new Previous/Next controls must either
  preserve the open editor or use the same guard rather than introducing another
  loss path. Existing browser coverage around
  `apps/web/test/browser/app.browser.tsx:740-778` positively expects Create to
  erase a draft and must be strengthened. Hold no draft plaintext in the guard;
  retain only the intended non-secret navigation action.
- **D16 — Unknown or failed list state is presented as verified empty.**
  `apps/web/src/app.tsx:768-770` uses the same message for `page === undefined`
  and a resolved empty page. Save/delete set the page undefined before refresh,
  and failures at `:489-495` and `:543-549` have no list retry. Render distinct
  loading, load-failed/retry, and resolved-empty states.
- **D17 — The UI looks production-ready despite the mandatory release warning.**
  No supported data-entry screen states that Stage 5 has not passed or that only
  synthetic test data is allowed, while the repository forbids real credentials
  before that gate. Add one persistent, non-secret warning across locked,
  enrollment, recovery-confirmation, and unlocked screens and prove it survives
  the production build.
- **D18 — Draft validation gives no actionable correction.** The single
  `"Check the item fields and limits."` alert does not identify whether title,
  tags, JSON syntax, TOTP policy, or backup-code uniqueness failed. Add redacted,
  type/field-specific messages for the locally knowable constraints already
  enforced by `itemFromDraft`/`parseVaultItem`, without echoing the rejected
  value. Presentation-only classifiers may mirror those current rules to choose
  advice, but `parseVaultItem` remains the sole acceptance authority: advisory
  checks may reject early and focus a field, while no draft is dispatched unless
  the domain parser accepts it.

Viewport note: independent real Chromium did not reproduce overflow on locked,
enrollment, login detail, or delete confirmation. Production currently checks
only initial password-mode create (`test-production.mjs:400-405`), TOTP detail
(`:553-558`), and locked (`:610-623`). Add passphrase mode, delete confirmation,
masked and revealed login detail, backup-code detail, and JSON detail at 320
pixels rather than claiming a failure that was not observed.

## Research basis

The preflight cross-checked fixes against current authoritative guidance:

- WCAG 2.2 requires keyboard focus visibility, logical focus order, programmatic
  names/roles/states, status messages, and reflow without two-dimensional
  scrolling at 320 CSS pixels:
  <https://www.w3.org/TR/WCAG22/>.
- WAI's status-message failure guidance treats results, waiting state, progress,
  and errors as targeted status messages when focus does not move:
  <https://www.w3.org/WAI/WCAG22/Techniques/failures/F103.html>.
- GOV.UK's password input hides by default, uses labelled Show/Hide buttons, and
  announces visible/hidden state without reading the password:
  <https://design-system.service.gov.uk/components/password-input/>.
- GOV.UK validation guidance preserves entered values, gives specific errors,
  and moves focus to a repeatable error summary:
  <https://design-system.service.gov.uk/patterns/validation/>.
- GOV.UK pagination provides both Previous and Next paths and identifies current
  position: <https://design-system.service.gov.uk/components/pagination/>.

These sources support the minimal functional repairs above; they do not justify
a visual redesign, modal framework, or new dependency. Neutron uses inline
guards instead of modal dialogs and never gates immediate lock.

### Security constraints on these fixes

- **D4 is the dangerous one and is partly out of scope.** A reveal control turns
  a masked field into rendered DOM text, and
  `apps/web/scripts/test-production.mjs` captures `formValues` and
  `document.documentElement.outerHTML`, which are sentinel-scanned after delete
  (`:484-485`), cancel (`:500-502`), lock (`:519-520`), and final TOTP lock
  (`:562-563`). Any reveal control must
  therefore be proven to clear on those same events. Masking the detail view's
  stored password and TOTP seed changes what ADR 0013 deliberately retained and
  what Task 0022 listed as out of scope; the *display default* may change under
  this task, but narrowing what `get-item` returns may not.
- Additive ARIA for D5 and D9 carries no plaintext risk provided no status text
  ever contains a generated or decrypted value.
- No fix may add persistence, a URL parameter, a log line, or a network request.
- Hidden secret detail values must not be present in DOM text, attributes, CSS,
  accessibility descriptions, status strings, or retained navigation guards.

## Verification

Record exact results for the full gate set, including
`pnpm --filter @neutron/web test:browser` and
`pnpm --filter @neutron/web test:production`, plus the keyboard and 320-pixel
checks and any retry with its cause.

Browser and production tests must explicitly cover repeated identical errors,
all dirty-draft exit paths, forward/back pagination, load failure/retry versus
empty state, generation success status, reveal/hide/reset for every secret item
type, TOTP retry, current-item semantics, focus indicators, keyboard-only
completion, persistent Stage 5 warning, and the expanded 320-pixel states above.
The existing invalid JSON, over-byte title, duplicate tags, malformed TOTP, and
duplicate backup-code cases must assert specific redacted correction text.

## Progress log

- 2026-07-31T23:14:01Z — Created from the Stage 2 forward-plan review. Not
  claimable until Task 0023 is done, so that the usability pass covers the
  passphrase UI instead of being invalidated by it.
- 2026-08-01T02:25:53Z — Independent current-code preflight and real-Chromium UI
  audit blocked readiness with P0 0, P1 4, P2 3, then found the additional
  release-warning defect D17 and non-actionable validation D18. Baseline browser
  (7 files / 27 tests) and exact-CSP
  production gates passed. Updated stale references, resolved the existing-test
  contradiction, defined exact secret fields and corrupt-record recovery limits,
  added dirty-navigation, false-empty/retry, and Stage 5 warning ownership,
  expanded the browser/320 matrix, and recorded authoritative research. Awaiting
  independent re-review before moving from proposed to ready.
- 2026-08-01T02:31:41Z — Independent task-text re-review passed with P0 0,
  P1 0, P2 0 after two correction rounds. All dependencies are done, no path
  overlap exists, allowed paths and tests are sufficient, and no ADR blocker
  remains. Moved to ready, unclaimed.

## Handoff

Summarize changed behavior, important files, decisions, risks, and follow-up work.

## Review

Reviewer, date, findings, and disposition. Required; the implementer must not
self-approve.
