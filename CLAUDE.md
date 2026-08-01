# CLAUDE.md — operating notes for Claude in this repository

`AGENTS.md` is the binding contract for every agent. This file adds only the
practical, Claude-specific context that `AGENTS.md` does not spell out: what to
read first, how this codebase is actually written, which commands are the real
gates, and the failure modes previous sessions hit. Where the two disagree,
`AGENTS.md` wins.

## What Neutron is

A personal, self-hostable, zero-knowledge secrets vault. The server is an
untrusted ciphertext store. Vault plaintext, vault keys, and the master password
never leave the client. Email aliases and mail are a later, separate, weaker
trust domain and must never be described as zero-knowledge.

Current position: Stage 2 (offline single-device vault). Stages 3+ (passkeys,
sync, server, import/export, delivery hardening) are not started. There is no
server, no network call, and no deployment in this repository yet.

## Read before touching anything

The order in `AGENTS.md` is mandatory, not advisory:

1. `README.md`
2. `docs/MASTER_PLAN.md`
3. `docs/SECURITY_MODEL.md`
4. `docs/ARCHITECTURE.md`
5. `docs/ROADMAP.md`
6. `docs/decisions/README.md` plus every accepted ADR relevant to the task
7. `docs/coordination/README.md`
8. `docs/coordination/HANDOFF.md` and the task file being claimed

Precedence when documents conflict: security invariants → accepted ADRs →
master plan → roadmap. A conflict touching cryptography, authentication,
recovery, privacy, or a public API stops work and becomes an ADR proposal.

## The rules that most often catch a session out

- Never self-approve a security-sensitive task. Implementation and review are
  separate roles and must be separate agents. The handoff may never be used to
  mark unreviewed security work done.
- Every lasting decision needs an ADR **accepted before** implementation starts.
  ADRs are append-only; supersede, never rewrite.
- Stay inside the task's declared allowed paths. Expanding scope means editing
  the task file first, or writing a new task.
- One coherent concern per commit, and one task ID.
- Synthetic data only. No real credentials anywhere, including in a dev browser
  profile, before the Stage 5 gate.
- No third-party runtime asset, font, script, analytics, or telemetry may enter
  an unlocked vault context. No new production dependency without an ADR.
- Say what is unknown. Never upgrade an assumption into a security claim; the
  ADRs in this repository deliberately record what cannot be proven (for
  example, that JavaScript string erasure is impossible to guarantee).

## Repository map

```text
apps/web/          static React 19 + Vite PWA; the only trusted client today
  src/vault-worker-*.ts        window/worker boundary: protocol, runtime, client
  src/local-vault.ts           enrollment, unlock, item CRUD (worker-only)
  src/indexeddb-repository.ts  encrypted record storage (worker-only)
  src/app.tsx, item-editor.tsx window UI
  scripts/verify-build.mjs     static-artifact policy assertions
  scripts/test-production.mjs  emitted exact-CSP browser flow + leakage scan
apps/api/          placeholder; no server work has begun
packages/crypto/       CryptoProvider API + libsodium WASM provider
packages/protocol/     canonical envelopes, bech32m, recovery kit, migration
packages/vault-domain/ plaintext item schemas; trusted clients only
packages/test-vectors/ cross-runtime known-answer fixtures
docs/decisions/        ADRs (binding)
docs/coordination/     task files (authoritative state) + HANDOFF.md
```

Boundary rules enforced by `apps/web/vite.config.ts` at build time: the window
bundle must not contain `packages/crypto`, `local-vault.ts`,
`indexeddb-repository.ts`, or the worker runtime; the worker bundle must not
contain React or the UI modules.

Know exactly which command enforces this. Root `pnpm build` is
`tsc --build`; it does not run Vite, does not run the boundary plugin, and does
not run `apps/web/scripts/verify-build.mjs`. A boundary violation therefore does
**not** fail root `pnpm build`. It fails:

```bash
pnpm --filter @neutron/web build   # vite build && verify-build.mjs
pnpm --filter @neutron/web test:production
```

Nothing in `.github/workflows/ci.yml` runs either of those, so this control and
the exact-CSP leakage scan are local-only evidence today. Wiring them into CI is
queued but not yet filed as a task; the remediation queue in
`docs/coordination/HANDOFF.md` is the authority on what is next.

## House style (match it; do not introduce a second dialect)

This code is written defensively on purpose. Before writing anything new, read
`apps/web/src/password-generator.ts` and `apps/web/src/vault-worker-protocol.ts`
as the reference style.

- **Exact-shape parsing at every boundary.** Reject unknown keys, non-`Object`
  prototypes, getters/setters, and non-enumerable descriptors. `exact()` in
  `vault-worker-protocol.ts` is the canonical helper.
- **Fail closed, with one opaque failure.** Errors are stable codes that never
  echo input. Never return a partial result on a failure path.
- **Freeze what you return.** `Object.freeze` on parsed records and constants.
- **Validate the same fact independently on both sides.** The intended design is
  three legs: the worker checks its result against its own request, the
  standalone response parser checks it against the global schema, and the client
  broker checks it against an expectation captured *before* the request was
  sent. Do not collapse these, and do not remove one because it looks redundant.

  All three legs exist today for only three of the fourteen worker operations:
  `compute-totp`, `generate-password`, and `generate-passphrase`. The worker's
  own leg is **absent** for `get-item`, `list-item-summaries`, `create-item`,
  `update-item`, and `delete-item`. Treat the rule as binding on new code, and
  do not describe the existing code as fully triple-validated. Restoring the
  missing leg is queued but not yet filed as a task; see the remediation queue
  in `docs/coordination/HANDOFF.md`.
- **Clear owned byte buffers in `finally`, on success and failure**, and say in
  comments that this is best effort.
- Strict TypeScript, no `any` at a trust boundary, no non-null assertions.
- Comments should explain security intent and invariants, never restate the
  code. This is the standard for new code, not a description of what is there:
  `apps/web/src/vault-worker-protocol.ts`, named above as a reference for
  parsing style, contains no comments at all. Copy its parsing discipline, not
  its comment density.
- Numbers use `_` separators (`1_024`). Biome enforces 100-column width, 2-space
  indent; run `pnpm format` rather than hand-aligning.

## Gates — run all of them, record exact results

From the repository root:

```bash
pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build && git diff --check
```

Anything touching `apps/web` also runs:

```bash
pnpm --filter @neutron/web test:browser && pnpm --filter @neutron/web test:production
```

`test:browser` drives real Chromium (plus pinned Firefox/WebKit probes for the
TOTP matrix). `test:production` builds the app, serves it under the exact
production CSP, drives the real emitted worker, and scans network, console,
static artifacts, IndexedDB, Cache Storage, local/session storage, history
state, and the live DOM for plaintext sentinels.

Known flake, already documented in Tasks 0021 and 0022: a combined browser run
can fail teardown with `IndexedDB deletion blocked`. Rerun the browser suite in
isolation, confirm it passes, and record the retry honestly in the task file.
Never paper over a real failure.

## Session protocol for Claude

1. Verify `git status` is clean and the commits named in `HANDOFF.md` exist.
2. Do not implement before the independent read-only preflight and the accepted
   ADR the handoff requires. Preflight and adversarial review must run as
   separate agents that do not write product code.
3. Claim exactly one task; set `Status`, `Owner`, `Claimed`, `Worktree/branch`.
4. Implement inside the allowed paths, adding timestamped progress notes.
5. Run every gate; record exact counts and any retry.
6. Move the task to `review`, obtain independent adversarial review, remediate
   every P0/P1, then let the reviewer close it.
7. Update `docs/coordination/HANDOFF.md` and commit before the session ends.
   This is mandatory, including when work is blocked or still in review.

## Writing style

Commit messages, ADRs, task files, code, and comments are written in normal,
precise English — Conventional Commits, imperative subject, one concern. Any
compressed chat persona applies to chat only and never to repository content.

Commit trailer:

```text
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

## Things not to do here

- Do not add a dependency, service, hosted resource, or recurring cost casually;
  every ADR so far explicitly records "no new dependency or cost".
- Do not run a repository-wide formatter or dependency upgrade inside a feature
  task; that needs its own task because it collides with every other one.
- Do not weaken or "simplify" a validator that looks redundant. The redundancy
  is the design.
- Do not introduce plaintext persistence, URLs, logs, telemetry, or screenshots
  containing secret material — the production leakage scan will catch it, and
  the reviewer will treat it as a P0.
- Do not mark Tasks 0004, 0006, 0008, 0009 (blocked) or 0010 (proposed) as
  designed; they are not.
