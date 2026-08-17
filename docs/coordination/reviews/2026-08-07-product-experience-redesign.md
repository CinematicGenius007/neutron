# Product experience redesign research and plan — 2026-08-07

Author: `/root`  
Baseline: clean `main` at `12a2ee6`  
Scope: Stage 2 local-vault experience, using synthetic data only

## Outcome

Neutron already communicates restraint and seriousness, but the interface gives
too many elements the same visual weight. The unlocked mobile header is cramped,
the development warning dominates every screen, list rows are harder to scan
than necessary, and login creation exposes the complete credential generator
before a person asks for it. These are hierarchy and progressive-disclosure
problems rather than a reason to replace the existing React/Vite architecture.

The redesign direction is a **quiet utility**: content first, calm surfaces,
one obvious action per state, compact persistent security context, and deeper
controls available without becoming the default reading path. It takes
inspiration from Apple and Notion without copying their branding or adding
third-party assets, fonts, component libraries, analytics, or network content.

## Evidence and interpretation

- Apple's design principles emphasize purpose, familiarity, clear feedback,
  simplicity that is not merely minimalism, hierarchy, inclusive input methods,
  and honest handling of people's information. Neutron applies these as a
  focused vault rather than adopting Apple-specific visual materials.
  Sources: [Apple design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles),
  [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines).
- Apple's layout guidance favors adapting navigation when a wide layout no
  longer fits, while its accessibility guidance calls for comfortably sized,
  well-spaced controls and restrained motion. Neutron keeps its already tested
  master/detail-to-single-pane adaptation and strengthens control spacing,
  reduced motion, and forced-colors behavior.
  Sources: [Apple layout](https://developer.apple.com/design/human-interface-guidelines/layout),
  [Apple accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility).
- Apple's feedback guidance says presentation should match significance.
  Neutron therefore keeps failures and corrupt-record warnings prominent while
  treating ordinary state and explanatory material more quietly.
  Source: [Apple feedback](https://developer.apple.com/design/human-interface-guidelines/feedback).
- Notion keeps a stable navigation context, makes frequently used destinations
  easy to scan, and exposes keyboard acceleration without requiring it. For the
  current single-vault scope, Neutron adopts the scanability and context
  principle but does not invent a sidebar, favorites, recents, or search before
  those features exist and their privacy decisions are accepted.
  Sources: [Notion sidebar navigation](https://www.notion.com/en-gb/help/navigate-with-the-sidebar),
  [Notion keyboard shortcuts](https://www.notion.com/help/keyboard-shortcuts).
- WCAG 2.2 requires reflow, visible and unobscured focus, text-described errors,
  keyboard operation, predictable changes, and at least the Level AA target-size
  model. The redesign preserves native controls and semantic regions and adds
  explicit high-contrast and reduced-motion treatment.
  Sources: [WCAG 2.2](https://www.w3.org/TR/WCAG22/),
  [Understanding WCAG 2.2](https://www.w3.org/WAI/WCAG22/Understanding/),
  [Error Identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification).
- Established password managers demonstrate that item creation and generation
  are related but distinct tasks. Neutron keeps generation next to a login's
  password while disclosing its options only when requested; it does not copy
  another product's account, sharing, or cloud model.
  Sources: [Bitwarden vault-item terminology](https://bitwarden.com/help/bitwarden-glossary/),
  [Bitwarden item creation](https://bitwarden.com/help/sharing/).

## Real-browser baseline

The requested `terminal-browser` command was attempted first. Its Ghostty pane
attachment failed because this shell's pane title was being rewritten, so the
compatible `agent-browser` Chromium driver was used against a local Vite server
on port 4175. No external application state or real credential was used.

Observed at 1440 by 1000 and 390 by 844 CSS pixels:

- Locked and enrollment cards are clear, keyboard-operable, and free of
  horizontal overflow. Automated axe checks found no WCAG A/AA violation; color
  contrast remained an incomplete manual check because the page uses gradients.
- The global development warning is truthful and prominent, but its visual mass
  competes with every screen's primary task and occupies several lines on mobile.
- The unlocked desktop empty state is understandable and has one settled primary
  action, confirming TASK-0032's behavior.
- The mobile unlocked toolbar places a large destructive button beside a long
  explanation, creating a cramped header before the active task.
- Login creation is 1,836 CSS pixels tall at 390 by 844. The full generator is
  present before the user expresses intent to generate a credential, and the
  empty list remains visually heavy on desktop while editing.
- List rows distinguish selection correctly but do little to help rapid type/title
  scanning. Detail metadata, content, and controls share nearly the same weight.

## Redesign stages

### PX-1 — interface foundation and progressive disclosure

Implement as TASK-0033. Establish local design tokens, refine the app/header and
surface hierarchy, compact the development notice without weakening its words,
improve list/detail scanability, make the unlocked toolbar responsive, and put
credential-generation options behind a native disclosure. Add reduced-motion,
forced-colors, zoom/reflow, and real-browser regression evidence.

### PX-2 — trustworthy session controls

Complete ADR-0016 and its separate idle auto-lock implementation. Design the
warning, extension, and lock transitions as part of the same session model.
Clipboard copy/clear remains a separate decision because browsers cannot promise
clipboard erasure.

### PX-3 — novice item models

Deliver the roadmap's schema-driven item registry and additional item types.
Use plain-language type descriptions, progressive disclosure for optional
fields, and an error summary only when multiple simultaneous errors exist.

### PX-4 — expert retrieval

After the search/index privacy ADR, add bounded local search and sorting with a
discoverable command entry point. Do not retain recent queries or plaintext
indices unless a later accepted decision explicitly authorizes them.

### PX-5 — honest recovery and portability

After recovery protocols exist, replace the unsupported recovery copy with a
complete no-vault, locked-vault, and recover-on-this-device journey. Pair import,
encrypted export, and restore with task-based usability tests.

### PX-6 — release evidence

Before Stage 5, test keyboard-only, screen-reader, 200% zoom, reduced motion,
forced colors, and supported-engine flows. Run small moderated task tests for a
first-time password-manager user and an experienced keyboard user. Keep research
local and consent-based; add no product telemetry.

## Explicit boundaries

TASK-0033 does not authorize a new dependency, remote font/icon, telemetry,
search, sorting, shortcut, clipboard operation, idle timer, recovery claim,
password-policy change, persisted preference, crypto/protocol/worker change, or
network behavior. It must not weaken lock priority, dirty-draft confirmation,
secret masking, reveal clearing, or the Stage 5 warning.
