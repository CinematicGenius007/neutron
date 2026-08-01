# UI/UX research and staged plan — 2026-08-01

Author: `/root`
Scope: current Stage 2 local-vault UI at commit `69572de`
Evidence: primary-source review plus a real Chromium audit at 1440×1000,
390×844, and 320×640 using synthetic local-vault data only

## Outcome

Neutron's visual language is already coherent: restrained color, strong focus
indicators, plainly worded safety boundaries, and large controls make the
current shell feel trustworthy rather than promotional. The largest usability
gap is information hierarchy, not styling. The desktop master/detail layout is
useful, but the same two contexts are stacked on compact screens. A person who
chooses **Create item** must scroll past an inactive empty list and pagination
before reaching the editor, while an empty vault offers no primary first-item
action in its main content.

The first implementation tranche therefore preserves desktop master/detail and
uses one active compact pane. It also turns the empty state into a next step and
removes pagination when there is nowhere to navigate. This is a layout and
navigation change only; it does not change which plaintext is rendered, any
crypto or persistence behavior, recovery claims, or session lifetime.

## Research applied

- WCAG 2.2 requires visible keyboard focus and establishes a 24 by 24 CSS-pixel
  target-size floor (or sufficient spacing). Neutron's existing three-pixel
  focus outline and generously padded controls are retained.
  Sources: [WCAG 2.2](https://www.w3.org/TR/WCAG22/),
  [Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible),
  [Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum).
- W3C guidance favors clear page regions, headings, grouping, and consistent
  navigation. The compact UI should expose the current task as one region and
  return focus to the item-list heading when leaving it.
  Sources: [Clear page structure](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o2p03-page-structure/),
  [Consistent Navigation](https://www.w3.org/WAI/WCAG22/Understanding/consistent-navigation.html).
- Material's responsive-layout guidance recommends a single hierarchy below
  roughly 600 dp and permits master/detail at wider sizes. Neutron uses its
  existing 760-pixel CSS breakpoint because that is already tested at the
  supported 320-pixel floor; this is an application-specific adaptation, not a
  claim that Material is normative.
  Source: [Responsive UI](https://m1.material.io/layout/responsive-ui.html).
- Error handling should identify the problem in text and point to the affected
  field; destructive data changes should be reversible, checked, or confirmed.
  The current inline error and delete/discard confirmations remain intact.
  Sources: [Error Identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html),
  [Error Prevention](https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html).
- GOV.UK recommends masking password inputs by default, allowing paste, and
  offering a show/hide control. Neutron already applies that pattern to item
  passwords. Applying it to the master-password enrollment screen, or removing
  confirmation there, would change a security-sensitive interaction and is
  deliberately not authorized by this research note.
  Source: [Password input](https://design-system.service.gov.uk/components/password-input/).
- GOV.UK's error-summary pattern is a useful later direction for longer forms:
  focus a concise problem summary and link each entry to its field. The current
  editor has only one active validation error, so adopting a new summary model
  is deferred until schema-driven forms justify it.
  Source: [Error summary](https://design-system.service.gov.uk/components/error-summary/).

## Browser observations

### What already works

- The safety notice remains prominent on locked, enrollment, and unlocked
  screens without resembling a transient toast.
- Keyboard focus is visible; controls have clear accessible names; 320-pixel
  layouts do not overflow horizontally.
- Secrets remain masked until explicit reveal, and the lock action is visually
  distinct from ordinary primary actions.
- Desktop master/detail supports rapid scanning without losing list context.

### Priority findings

1. **P1 usability — compact stacked contexts.** On 390×844, the create editor
   begins below the whole empty item-list card and its disabled pagination.
   Selected details similarly retain an inactive list above the active task.
2. **P1 usability — first-use dead end.** The desktop empty-detail panel says
   only “Choose an item” when no item exists. The real next step is visually
   confined to a secondary button in the list header.
3. **P2 clarity — inert pagination.** “Page 1 · 0 shown”, an empty message, and
   two disabled navigation buttons spend substantial space without offering an
   action. Pagination is useful only when a previous or next page exists.
4. **P2 truthfulness — first screen assumes a vault.** “Welcome back” precedes
   discovery that no local vault exists. Fixing this honestly requires a
   storage/worker capability result rather than a visual guess and is not a
   UI-only change.
5. **Existing security P1, not remediated here.** The enrollment copy calls the
   recovery kit an offline recovery path, but fresh-profile recovery unlock is
   not implemented. Prior audit already requires an ADR decision; layout work
   must not silently rewrite recovery semantics.

## Staged experience plan

### UX-1 — responsive task hierarchy and first-use state

Implement now as TASK-0032. Use one active pane at compact widths, provide a
clear return to the list from item detail, add an actionable empty-vault state,
and hide unusable pagination. Preserve desktop master/detail and all secret
reset/focus behavior.

### UX-2 — honest enrollment and recovery journey

After the recovery ADR/protocol is ready, distinguish “no local vault”, “locked
vault”, and “recover on this device” states. Correct the unsupported recovery
claim and test the full first-run/recovery journey. Do not fake readiness from
window-side storage inspection.

### UX-3 — scalable forms for novice and expert users

Deliver the roadmap's schema-driven item types through a registry of field
definitions, progressive disclosure for optional fields, concise field-level
errors, and an error summary only when multiple errors can coexist. Preserve
plain-language labels and keyboard order. Usability-test with both a first-time
password-manager user and an experienced keyboard user before freezing the
schema vocabulary.

### UX-4 — retrieval efficiency

Design bounded worker-side search and sorting under their required privacy ADR.
Then add a clearly labelled search entry point, recent-query-free behavior, and
documented keyboard shortcuts discoverable from the UI. No persisted plaintext
index or shortcut should precede the search/metadata decision.

### UX-5 — session conveniences with explicit security policy

Implement idle auto-lock first under ADR-0016, then separately decide clipboard
copy/clear behavior. Each control must say what Neutron can and cannot erase;
neither belongs in a cosmetic bundle.

### UX-6 — release usability evidence

Before Stage 5, repeat task-based testing at 320 px and desktop widths in the
supported engine matrix, keyboard-only and reduced-motion modes. Add forced
colors/high-contrast inspection, screen-reader smoke tests, and small moderated
tests covering enrollment, create/find/edit, TOTP use, lock, corruption, and
recovery. Record failures and completion rates without telemetry in the app.

## Explicit non-decisions

This research does not authorize changes to cryptography, persisted or worker
protocols, recovery semantics, master-password reveal, clipboard access, idle
locking, search, service workers, dependencies, fonts, telemetry, or network
behavior. It adds no claim that Neutron is ready for real credentials.
