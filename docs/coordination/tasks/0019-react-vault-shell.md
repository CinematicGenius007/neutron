# TASK 0019 — React vault shell

Status: review
Owner: unassigned
Claimed: 2026-07-28T04:05:00Z
Worktree/branch: shared-worktree (main)
Reviewer: unassigned
Review claimed: unassigned
Depends on: 0007, 0018
Blocks: Stage 2 item editor, local search, and hardened release build
Security-sensitive: yes

## Outcome

Ship the first static React/Vite vault shell using only the reviewed worker
broker for enrollment, unlock, lock, bounded item summaries, and explicit point
reads.

## Allowed paths

- This task file
- `apps/web/**` for the Vite application, static assets, tests, and build gates
- `packages/ui/**` for app-local reusable presentation components if needed
- `packages/vault-domain/package.json` for the item-only, side-effect-free export
  used by window request validation
- Root/package manifests and `pnpm-lock.yaml` for pinned React/Vite dependencies

## Out of scope

- Item create/update/delete UI, password generation, TOTP computation, search,
  import/export, sync, passkeys, recovery unlock, or account server APIs
- Service-worker caching/update orchestration and production response headers
- Server rendering, Pages Functions, remote assets, analytics, telemetry, fonts,
  or third-party runtime requests

## Acceptance criteria

- [ ] Vite emits a static React shell with external CSS, a same-origin manifest,
      local assets only, and no SSR/runtime server requirement.
- [ ] Boot feature-detects the concrete browser capabilities required by ADR 0008
      before password entry and presents an accessible unsupported-browser state.
- [ ] Enrollment requires password confirmation, displays the generated recovery
      kit, and requires exact re-entry before showing unlocked content.
- [ ] Unlock, explicit lock, bounded summary paging, and explicit point reads use
      only the public worker broker; rendered errors are stable/redacted.
- [ ] Lock clears rendered item/recovery/password state, closes the worker, and a
      new worker is required for the next unlock attempt.
- [ ] Automated graph/output checks prevent window code from importing worker-only
      crypto, repository, local-vault, envelope, or raw-storage modules and prove
      the production build contains no remote runtime resources or source maps.
- [ ] Responsive keyboard-accessible flows pass component tests and real Chromium
      enrollment, reload/unlock, point-read, and lock tests.
- [ ] All repository gates and independent security review pass.

## Verification plan

Add deterministic component state tests around an injected broker, inspect the
Vite module/output graph, deny unexpected browser requests, and run the exported
production worker through a real Chromium user flow using synthetic values.

## Progress log

- 2026-07-28T04:05:00Z — Claimed after Task 0018 commit `2a9d3b6`. Kept item
  writes and service-worker delivery out of scope so the initial window trust
  surface can be reviewed independently.
- 2026-07-28T04:25:00Z — The first production graph gate correctly failed
  because the vault-domain barrel pulled protocol/crypto modules into the window
  chunk. Added an explicit item-only package export rather than weakening the
  boundary.
- 2026-07-28T04:40:00Z — Completed the static React shell, exact Trusted Types
  worker URL policy, browser capability gate, enrollment/unlock/lock/read flows,
  external responsive styling, manifest/icon, component contracts, and a Vite
  module-graph boundary. Moved to review at the requested checkpoint.

## Verification

Passed frozen install, 73 Node tests, seven real-Chromium contracts, typecheck,
lint, format check, root build, Vite production build, and diff check at the
implementation checkpoint.

## Handoff

The next UI milestone may add conflict-bound editors through the existing broker;
the delivery milestone may add the accepted service-worker and header policy.

## Review

Awaiting independent review. Reviewer should especially verify CSP/Trusted Types
behavior against ADR 0008, React async lock races, production graph isolation,
DOM plaintext clearing, accessibility, and output/network policy. Do not mark
done solely from the implementer's verification.
