# Neutron session handoff

Updated: 2026-07-28
Branch: `main`
Checkpoint implementation commit: `571f43c`

This file is a navigation checkpoint, not an approval record. Task files remain
authoritative. Verify every statement against the repository before acting.

## Resume here

1. Read `AGENTS.md` and its required documents in order.
2. Run `git status --short` and `git log -3 --oneline`.
3. Read `docs/coordination/tasks/0019-react-vault-shell.md` and accepted ADRs
   0001 and 0008.
4. Assign an agent other than `/root` to independently review Task 0019. Do not
   continue product implementation until its P0/P1 findings are resolved and its
   task record is updated through the normal review lifecycle.

Suggested reviewer prompt:

> Independently review TASK 0019 at checkpoint commit 571f43c. Read AGENTS.md,
> ADR 0001, ADR 0008, docs/security/web-delivery.md, Task 0018, and Task 0019.
> Treat Task 0019 as security-sensitive and read-only. Attempt to disprove every
> acceptance criterion. In particular test the Trusted Types worker URL under
> the accepted CSP, browser feature gating before password/storage access,
> enrollment and exact recovery confirmation, async lock/plaintext clearing,
> redacted errors, paging and point-read boundaries, keyboard/mobile behavior,
> the Vite window/worker module graph, emitted worker bundling, absence of remote
> runtime resources/source maps, and real Chromium reload/unlock/post-lock
> behavior. Run frozen install, Node, Chromium, typecheck, lint, format, root
> build, app production build, and diff checks. Report P0/P1/P2 findings with
> exact reproductions and do not edit implementation files.

## Completed and independently reviewed

- Task 0017 encrypted item CRUD — commit `d12404e`.
- Task 0007 web delivery policy / ADR 0008 — commit `3311a2b`.
- Task 0018 dedicated vault module-worker boundary — commit `2a9d3b6`.
  Independent final review: P0 0, P1 0. Its task file is `done`.

Task 0018 keeps provider, IndexedDB repository, pending enrollment, and unlocked
session authority in a module worker. The public web package exports the broker,
not raw storage/session constructors. Its closed protocol covers enrollment,
unlock/lock, bounded summaries, point reads, and conflict-bound writes.

## Current review checkpoint

Task 0019 is `review`, with no reviewer assigned. Implementation commit:
`571f43c feat(web): add static React vault shell`.

Implemented:

- Pinned React 19.2.8, React DOM 19.2.8, Vite 8.1.5, and plugin-react 6.0.4.
- Static external-script/external-CSS shell, local manifest and SVG icon.
- Browser capability gate before broker creation or password entry.
- Enrollment, exact recovery-kit re-entry, unlock, explicit lock, bounded
  title/type summaries, and explicit point-item rendering through the broker.
- Immediate rendered-secret clearing at lock initiation.
- Narrow `neutron-static-script-url` Trusted Types policy for the emitted worker
  URL; Vite emits a hashed JavaScript worker rather than a blob/data worker.
- Vite module-graph gate that rejects crypto, local-vault, IndexedDB, worker
  runtime, or worker entry implementation modules from the window entry chunk.
- An item-only `@neutron/vault-domain/items` export to avoid pulling the protocol
  and crypto barrel into the window chunk.
- Duplicate vault-ID response rejection carried forward from Task 0018 review.
- Node feature-gate tests and real-Chromium component plus worker contracts.

Checkpoint verification actually run and passing:

```text
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test                         # 9 files, 73 tests
pnpm --filter @neutron/web test:browser  # 3 files, 7 tests
pnpm build
pnpm --filter @neutron/web build
git diff --check
```

The production build emitted a local HTML document, external hashed CSS/window
JavaScript, and a hashed `vault-worker-entry-*.js` worker. Source maps are
disabled. The module-graph gate passed. These are implementation checks, not an
independent security approval.

## Deliberately unfinished

- Task 0019 has not received independent review and must not be marked `done`
  yet. Its acceptance boxes intentionally remain unchecked.
- The CSP/Trusted Types behavior has not yet been exercised against a
  production-like static server applying every ADR 0008 response header.
- The React shell has no item create/update/delete editor, password generator,
  TOTP display, local search, import/export, passkeys, sync, or recovery unlock.
- There is no service-worker cache/update state machine and no checked-in
  production `_headers` implementation yet. The current manifest alone does not
  make the release an offline-installable PWA.
- No deployment has occurred. Do not use real credentials; the Stage 5 dogfood
  gate remains far in the future.

## Next safe direction after review

Resolve Task 0019 review findings first. If it passes, mark it `done` and commit
that lifecycle update. Then create bounded, separately reviewed tasks in this
order:

1. Conflict-bound item create/update/delete forms through the existing broker,
   followed by password generation, TOTP vectors/display, and bounded local
   search as separate concerns.
2. ADR 0008 service-worker build identity, exact cache allowlist, crash-safe
   update barrier, locked activation, and rollback implementation.
3. Checked-in Cloudflare Pages `_headers` plus production-response/CSP/Trusted
   Types tests and reproducible static release checks.

Do not start Stage 3 passkeys/sync until the Stage 2 offline-vault acceptance
criteria are satisfied or an ADR explicitly permits overlap.

## Before the next session stops

Update this file with the new task status, reviewer, exact commits, dirty paths,
commands actually run, unresolved findings, and the next safe command. Keep
security review outcomes in the corresponding task file as well. Prefer a clean,
committed checkpoint; if that is impossible, state exactly why and what remains
uncommitted.
