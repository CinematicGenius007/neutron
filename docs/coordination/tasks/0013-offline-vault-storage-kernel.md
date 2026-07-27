# TASK 0013 — Offline vault storage kernel

Status: done
Owner: `/root`
Claimed: 2026-07-27T23:23:21Z
Worktree/branch: shared-worktree (main)
Reviewer: `/root/task_0013_storage_reviewer`
Review claimed: 2026-07-27T23:23:21Z
Depends on: 0002, 0012
Blocks: Stage 2 enrollment, unlock, and item workflows
Security-sensitive: yes

## Outcome

Implement bounded client-only vault item models, an encrypted-record repository
contract, and a real IndexedDB adapter that persists no item plaintext.

## Context

Stage 2 requires an offline single-device vault. The threat model permits only
opaque IDs, revisions, padded sizes, and ciphertext envelopes at rest; item
type, title, username, URL, notes, tags, filenames, TOTP seeds, backup codes,
and arbitrary JSON all remain inside authenticated item payload envelopes.

## Allowed paths

- This task file for lifecycle metadata
- `packages/vault-domain/**`
- `apps/web/**` for the IndexedDB adapter and browser contract tests only
- `packages/protocol/src/index.ts` only to expose the explicitly unauthenticated
  structural envelope-header parser needed at the persistence boundary
- `pnpm-lock.yaml` if package metadata requires a lockfile update

## Out of scope

- React UI, service worker, install manifest, and visual design
- Enrollment, recovery-kit confirmation, unlock, lock, or in-memory key session
- Item encryption orchestration and key hierarchy creation
- Server sync, WebAuthn, API, Cloudflare, import, and export
- Persisting plaintext summaries or search indexes

## Acceptance criteria

- [x] Login, secure-note, TOTP, backup-code, and JSON item payloads have strict,
      bounded runtime validation with unknown fields rejected.
- [x] The repository boundary accepts only structurally valid encrypted records
      containing opaque IDs, versions/revisions, and canonical envelope bytes.
- [x] IndexedDB writes, reads, lists, deletes, and atomic batches preserve byte
      equality and isolate malformed/corrupt records.
- [x] A real-Chromium persistence scan contains none of the synthetic plaintext
      fixture strings, item types, URLs, usernames, tags, seeds, or codes.
- [x] Reload/reopen behavior works offline and no ARK, item key, password, or
      plaintext item is accepted by the persistence API.
- [x] Inputs and returned records are cloned so caller mutation cannot alter
      persisted or cached state.
- [x] Tests, typecheck, lint, format check, build, diff check, real-browser
      contract, and independent security review pass.

## Verification plan

Run domain boundary and mutation tests in Node, a shared repository contract
against an in-memory adapter and real IndexedDB, raw database scans in Chromium,
all repository gates, and an independent read-only security review.

## Progress log

- 2026-07-27T23:23:21Z — Claimed after Task 0012 final PASS and commit
  `1ba86b8`. Scoped persistence separately from enrollment and UI.
- 2026-07-27T23:38:00Z — Implemented five canonical bounded item payloads,
  encrypted-record contracts, an in-memory repository, and the IndexedDB v1
  adapter with atomic batches, clone safety, fail-closed schema handling, and
  corruption isolation.
- 2026-07-27T23:40:00Z — Initial review found overridden typed-array and array
  methods could retain aliases or bypass validation, and that decoding accepted
  noncanonical JSON. Replaced dynamic dispatch with owned byte normalization and
  indexed traversal, rejected exotic arrays, and required exact canonical bytes.
- 2026-07-27T23:42:46Z — Remediation review passed with no remaining findings.

## Verification

Passed `pnpm test` (41 Node tests), `pnpm --filter @neutron/web test:browser`
(one real-Chromium contract), `pnpm typecheck`, `pnpm lint`,
`pnpm format:check`, `pnpm build`, and `git diff --check` on
2026-07-27T23:42:46Z.

## Handoff

After PASS, enrollment can generate the initial encrypted records and commit
them only after recovery-kit confirmation.

## Review

Initial result: FAIL with two P1 and one P2 findings covering hostile
`Uint8Array.slice`, hostile `Array.map`, and noncanonical JSON decoding.

Final result: PASS. `/root/task_0013_storage_reviewer` independently reproduced
the fixes and reported zero remaining P0/P1/P2 findings.
