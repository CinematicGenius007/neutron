# TASK 0020 — Conflict-bound item editor UI

Status: done
Owner: unassigned
Claimed: 2026-07-28T16:36:52Z
Worktree/branch: shared-worktree (main)
Reviewer: `/root/task_0020_reviewer`
Review claimed: 2026-07-28T19:30:13Z
Depends on: 0017, 0018, 0019
Blocks: remaining Stage 2 password generator and bounded local search work
Security-sensitive: yes

## Outcome

Add accessible create, update, and delete UI for all five existing v1 item types,
using only the reviewed worker broker and exact conflict revisions.

## Context

Tasks 0017 and 0018 provide conflict-bound item mutations behind the dedicated
vault worker. Task 0019 provides the reviewed React shell and production delivery
gates. ADR 0008 permits the window to hold only the item plaintext needed for the
active view. A separate preflight reviewer passed the checkpoint with P0 0 and
P1 0 and confirmed this task needs no new ADR while schemas, protocol, storage,
and trust boundaries remain unchanged.

## Allowed paths

- This task file
- `apps/web/src/app.tsx`
- `apps/web/src/item-editor.tsx`
- `apps/web/src/styles.css`
- `apps/web/test/browser/app.browser.tsx`
- `apps/web/scripts/test-production.mjs`

## Out of scope

- Changes to item schemas, worker protocol/runtime/client, storage, crypto, or
  package manifests
- Cross-type item conversion or multiple-vault UI
- Password/passphrase generation, TOTP calculation/copy, search/sort, clipboard,
  attachments, import/export, recovery unlock, passkeys, sync, or tombstones
- Service-worker delivery, deployable headers, hosting, or deployment

## Acceptance criteria

- [x] Create and edit forms produce valid login, secure-note, TOTP, backup-code,
      and JSON v1 items with bounded common and type-specific fields; invalid
      drafts reject before broker dispatch and errors never echo field contents.
- [x] Window mutations use only broker `createItem`, `updateItem`, and
      `deleteItem`; updates/deletes send the exact selected ID, generation, and
      key version, and edit cannot silently change item type.
- [x] Conflicts never retry, overwrite, or advance a revision; update conflicts
      retain the unsaved draft with a stable redacted error. Delete requires an
      explicit confirm/cancel step and stale deletion fails safely.
- [x] Successful create/update projects only the locally validated item plus the
      broker-validated revision; successful delete immediately clears selected
      plaintext. Every success reloads only the first bounded summary page.
- [x] Cancel, delete, lock, failures, and screen transitions have explicit
      plaintext behavior. Lock clears drafts and selection immediately;
      operation epochs suppress late mutation completions without claiming an
      already-issued persistence transaction was rolled back.
- [x] An in-flight form dispatches at most one mutation while the Lock action
      remains immediately available.
- [x] Labels, focus transitions, error announcements, keyboard-only CRUD, and a
      320-pixel layout pass real-browser checks.
- [x] Component tests cover every item type, invalid JSON/bounds, exact conflict
      tuples, retained drafts, delete confirmation, duplicate submission, late
      post-lock completion, page-refresh failure, and redacted errors.
- [x] The emitted production shell under the exact CSP performs real-worker UI
      create/update/delete, induces stale update and delete, scans persistence
      and runtime surfaces for synthetic plaintext leakage, reloads/unlocks, and
      proves immediate lock clearing plus a fresh worker.
- [x] All repository gates and independent adversarial security review pass.

## Verification

Implementation pass: frozen install; typecheck; lint and format check across 100
files; 74 Node tests; root build; 18 real-Chromium tests; exact-policy emitted
production Chromium flow and build-output verification; and diff check all pass.
The independent reviewer reproduced the formerly failing transitions and reran
the same gates successfully.

## Progress log

- 2026-07-28T16:36:52Z — Claimed after independent preflight PASS. Kept all
  domain, protocol, storage, worker, crypto, and delivery changes out of scope.
- 2026-07-28T19:20:03Z — Implemented all five v1 item forms using the item-domain
  parser as final authority, presence-preserving optional fields, exact revision
  writes, explicit deletion, conflict-retained drafts, synchronous duplicate
  dispatch prevention, post-lock epoch suppression, and mutation-aware bounded
  page refresh. Added component and emitted-production Chromium coverage for
  stale update/delete races, keyboard CRUD, 320-pixel forms, raw encrypted
  persistence, runtime/network leakage, and fresh-worker lock behavior. Moved to
  independent review after every required gate passed.
- 2026-07-28T19:28:18Z — Independent review blocked with P0 0, P1 1, P2 1.
  Real Chromium proved an unkeyed editor retained an unsaved edit password when
  the always-visible Create action changed modes, risking accidental duplicate
  plaintext. Cancelling a blank create form also left focus on the document
  body. Returned to active for explicit editor-target identity, focus
  restoration, and exact regressions.
- 2026-07-28T19:30:13Z — Remediated both findings. Every create activation now
  receives a fresh editor identity, while edit identities bind opaque item ID and
  revision, so React cannot reuse hidden type-specific or optional plaintext
  across targets. Cancelling create restores focus to its initiating control.
  A real-Chromium regression covers edit-to-create and create-to-create secret
  clearing, pre-dispatch rejection, and focus. Returned to re-review after frozen
  install, 74 Node tests, 18 Chromium tests, all static gates, and the exact-policy
  emitted production flow passed.
- 2026-07-28T19:33:42Z — Independent re-review reproduced the prior failures and
  observed fresh default drafts for edit-to-create and create-to-create, local
  rejection with no dispatch, and focus restored to Create. The key audit found
  no secret-bearing or colliding reconciliation identity. Final review passed
  with P0 0, P1 0, and P2 0; all acceptance criteria are satisfied.

## Handoff

Do not proceed to generator/search work until this task is independently reviewed
and closed. Update `docs/coordination/HANDOFF.md` before stopping.

## Review

Initial independent review: BLOCK by `/root/task_0020_reviewer`, P0 0, P1 1,
P2 1. Final independent re-review: PASS by the same reviewer, P0 0, P1 0,
P2 0. The reviewer edited no files.
