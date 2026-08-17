# TASK 0033 — Product experience foundation

Status: active  
Owner: `/root`  
Claimed: 2026-08-07T16:30:54Z  
Worktree/branch: shared-worktree (`main`)  
Reviewer: unassigned  
Review claimed: —  
Depends on: 0032  
Blocks: —  
Security-sensitive: yes

## Outcome

The Stage 2 vault has a calmer, more legible, responsive visual system and a
shorter novice editing path while preserving every established secret-rendering,
navigation, and lock invariant.

## Context

The evidence, design rationale, and staged experience plan are recorded in
`docs/coordination/reviews/2026-08-07-product-experience-redesign.md`. This is a
bounded implementation of PX-1, not authorization for the later stages.

The task is security-sensitive because it changes markup and styling around
decrypted item details, explicit reveal controls, the lock action, and the
credential generator. It changes no lasting cryptographic, authentication,
recovery, privacy, persisted, transmitted, or public-API decision, so no ADR is
required. A separate reviewer must inspect an exact committed artifact.

## Allowed paths

- This task file
- `docs/coordination/reviews/2026-08-07-product-experience-redesign.md`
- `docs/coordination/HANDOFF.md`
- `apps/web/src/app.tsx`
- `apps/web/src/item-editor.tsx`
- `apps/web/src/styles.css`
- `apps/web/test/browser/app.browser.tsx`
- `apps/web/scripts/test-production.mjs`

## Out of scope

- Crypto, protocol, worker, persistence, recovery, metadata, network, service
  worker, dependency, font, icon-package, telemetry, or deployment changes.
- Search, sorting, recents, favorites, folders, command palettes, shortcuts,
  clipboard access, idle auto-lock, or persisted UI preferences.
- Changing password policy, item schemas, which plaintext reaches the window,
  which values are secrets, or what is rendered before explicit reveal.
- Removing or weakening the Stage 5 warning, immediate lock, reveal clearing,
  dirty-draft confirmation, corruption handling, or focus restoration.

## Acceptance criteria

- [ ] A documented token-based visual hierarchy distinguishes page background,
      navigation, content surfaces, inset controls, selected rows, warnings,
      errors, and destructive actions without a third-party asset or dependency.
- [ ] Locked, enrollment, recovery-confirmation, empty-vault, list, detail, and
      editor states retain one clear primary task and truthful security context.
- [ ] The compact unlocked toolbar does not crowd the active pane; at 320 CSS
      pixels it reflows without horizontal overflow and keeps **Lock now** easy
      to locate and operate.
- [ ] Vault rows make title, item type, and selection easy to scan without
      exposing an additional plaintext field or adding a stored preference.
- [ ] Login credential-generation options use a native, keyboard-operable
      disclosure. The password remains masked after generation, and generation
      errors/status retain their existing accessible behavior.
- [ ] Focus remains visible and unobscured, controls meet the existing target
      floor, 200% zoom/reflow remains usable, and forced-colors plus
      reduced-motion preferences receive explicit treatment.
- [ ] Compact list/detail switching, Back to items, dirty-draft navigation,
      cancel/delete confirmation, secret reveal reset, corruption presentation,
      pagination, and immediate lock remain behaviorally unchanged.
- [ ] Real-browser evidence covers 320, 390, 760, 761, and desktop widths plus
      a masked selected item and the collapsed/expanded generator.
- [ ] Browser and production leakage checks pass with synthetic data only.
- [ ] No dependency, crypto, protocol, worker, persistence, recovery, metadata,
      network, telemetry, or deployment behavior changes.
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

The reviewer must also inspect computed focus, overflow, disclosure state,
selected-row treatment, secret masking/reveal removal, and high-contrast and
reduced-motion behavior in a real browser.

## Progress log

- 2026-08-07T16:30:54Z — Verified clean checkpoint `12a2ee6`, no active/review
  task, TASK-0032 done, and no path overlap. Reserved and claimed TASK-0033.
- 2026-08-07T16:30:54Z — Reviewed current primary guidance from Apple, Notion,
  W3C, and established password-manager documentation. Audited the real local
  app at desktop and compact sizes with synthetic data. The requested
  `terminal-browser` pane attachment failed on the rewritten Ghostty pane title;
  its compatible Chromium driver supplied the recorded browser evidence.
- 2026-08-08T04:11:28Z — Candidate implementation is present but uncommitted.
  It adds the local token hierarchy, responsive toolbar/warning treatment,
  scannable item rows, human-readable type labels, native credential-generator
  disclosure, forced-colors/reduced-motion CSS, and corresponding browser/
  production assertions. No product behavior outside the declared scope was
  changed. Verified on this exact tree: `tsc --build` pass; targeted Biome check
  pass; root Vitest pass (13 files / 110 tests); direct Vite production build
  pass; `verify-build.mjs` pass (7 files); and `git diff --check` pass.
  The browser Vitest attempt could not bind its ephemeral IPv6 listener in the
  sandbox (`EPERM`); the user then stopped the escalated rerun, so no browser or
  exact-CSP production result is claimed. No commit or independent review
  exists yet.

- 2026-08-15T00:00:00Z — The user explicitly authorized a complete visual
  redesign, including a different theme, in a later session. The candidate was
  therefore extended within the same allowed paths:
  - The palette is now defined **light-first** with a dark inversion under
    `prefers-color-scheme`, replacing the previous dark-only
    `color-scheme: dark`. `--accent` is deliberately identical in both schemes
    so a promoted primary control resolves to one value regardless of scheme;
    `--accent-text` is the separate scheme-dependent token for accent-coloured
    text on the canvas.
  - The accent moved from mint `#72dfc1` to indigo `#3d4bc7` with white ink.
    `apps/web/scripts/test-production.mjs` now asserts `rgb(61, 75, 199)` for
    the same compact-promotion / desktop-secondary intent; the assertion was
    retargeted, not relaxed.
  - **Lock now** is no longer styled as a destructive control. Locking is a safe
    and encouraged action; destructive styling is now reserved for delete and
    discard. The button, its immediate behaviour, and its accessible name are
    unchanged.
  - `font-family: Inter` was removed. Inter was named but never loaded — no
    `@font-face` and no network request — so it only produced inconsistent
    typography between machines that happen to have it installed and those that
    do not. The stack is now purely system fonts.
  - Vault rows gained a decorative per-type monogram (`aria-hidden`), derived
    from the already visible type label, adding no new plaintext field and no
    stored preference.
  - `Tags, one per line` moved below the type-specific fields in the editor, so
    an optional organisation aid no longer outranks the credential itself.
  - Item detail no longer renders an absent optional list as `[]`, and renders
    string arrays as one entry per line instead of a JSON literal. Secret
    classification, masking, and reveal behaviour are unchanged.
  - The recovery kit is now set in monospace at a larger size with wider
    tracking and line spacing to support accurate manual transcription. No copy,
    download, or print affordance was added; clipboard handling remains an
    undecided security question.

  Measured on this tree at 390 CSS pixels, unlocked with an open editor: the
  toolbar fell from 131.6 px to 58.6 px, the safety notice from 78.1 px to
  69.0 px, and total document height from 1,346 px to 1,179 px. No horizontal
  overflow at 320 or 390 px. The Stage 5 warning keeps its exact wording and
  remains visible on every screen.

  Complete declared gate set run on this exact tree, without retry:
  `pnpm typecheck`, `pnpm lint` (110 files), `pnpm format:check` (110 files),
  `pnpm test` (13 files / 110 tests), `pnpm build`,
  `pnpm --filter @neutron/web test:browser` (4 files / 37 Chromium tests plus
  3 files / 3 engine-matrix tests),
  `pnpm --filter @neutron/web test:production` (`Verified 7 production files.`,
  `Production CSP Chromium flow passed.`), and `git diff --check`. Emitted
  artifacts: window JavaScript 317.41 kB, vault-worker JavaScript 663.18 kB
  (byte-identical to the previous checkpoint, consistent with no worker change),
  CSS 14.04 kB.

  Still uncommitted, still unreviewed. This entry is implementer evidence, not
  approval.

- 2026-08-15T00:00:00Z — The user rejected the preceding entry as cosmetic and
  asked for a structural change. The layout was reworked rather than restyled:
  - **One persistent application header.** Brand, the `Your vault` heading, the
    session indicator, the lock control, and the Stage 5 warning now share a
    single sticky region. The separate `.vault-toolbar` / `.vault-heading`
    stack was removed. `Your vault` remains a heading with that accessible name
    and remains the post-unlock focus target; **Lock now** keeps its accessible
    name, its `aria-describedby` warning, and its immediate behaviour.
  - The lock warning is visible above 1,099 CSS pixels and visually hidden below
    it. It is never removed from the accessibility tree.
  - **The list pane sizes to its content.** The former `min-height: 30rem` on
    both panes produced a tall empty rectangle for an empty or short vault; only
    the detail pane keeps a reduced floor.
  - **Duplicated first-use messaging removed.** The list pane keeps the required
    `Your vault has no items yet.` line; the actionable guidance and item-type
    list now live once, in the detail pane. At compact widths the promoted list
    action carries it, because the detail pane is hidden there.
  - **Editor restructured.** Type and title share one row where there is room and
    stack below it. Each type carries a plain-language description bound with
    `aria-describedby`. This is descriptive copy only; the schema-driven item
    registry remains PX-3 and unstarted.

  Measured at 390 CSS pixels, unlocked with an open editor: persistent header
  chrome 144 px against roughly 270 px before this task, and document height
  1,158 px against 1,346 px at the previous entry and 1,836 px pre-TASK-0033.
  No horizontal overflow at 320 or 390 px.

  Complete declared gate set rerun on this exact tree, without retry:
  typecheck; lint and format over 110 files; 13 files / 110 unit tests; root
  build; 4 files / 37 Chromium tests plus 3 files / 3 engine-matrix tests;
  exact-CSP production flow (`Verified 7 production files.`,
  `Production CSP Chromium flow passed.`); and `git diff --check`.

  Still uncommitted and unreviewed.

## Handoff

The PX-1 implementation is present in the shared worktree but has not been
committed or reviewed. Changed product/test paths are `apps/web/src/app.tsx`,
`apps/web/src/item-editor.tsx`, `apps/web/src/styles.css`,
`apps/web/test/browser/app.browser.tsx`, and
`apps/web/scripts/test-production.mjs`; the research record and this task file
are also new/changed. ADR-0016 and every other staged experience item remain
separate.

## Review

Pending: commit an identifiable candidate, run the declared browser and exact
CSP production gates when explicitly resumed, then assign an independent
reviewer. TASK-0033 is not done and has no review verdict.
