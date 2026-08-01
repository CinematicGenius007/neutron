# TASK 0032 — Responsive vault hierarchy and empty state

Status: review  
Owner: unassigned (implemented by `/root`)  
Claimed: 2026-08-01T13:30:34Z  
Worktree/branch: shared-worktree (`main`)  
Reviewer: unassigned  
Review claimed: —  
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
- [ ] A separate reviewer reviews an identifiable committed artifact and records
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

## Handoff

Compact screens now render only the active item-list or detail/editor pane;
desktop keeps both. Empty first-use state and pagination are conditional on real
page state. **Back to items** clears selected detail and its reveal component
before returning focus to Items. No dependency, persistence, worker/protocol,
crypto, recovery, metadata, or network path changed.

Awaiting independent review of the committed candidate. Do not start ADR-0016
idle auto-lock concurrently; it overlaps the same UI paths.

## Review

Pending independent review of a committed candidate.
