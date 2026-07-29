# Neutron session handoff

Updated: 2026-07-29
Branch: `main`
Reviewed implementation tip: `d483224`

This is a navigation checkpoint, not a substitute for authoritative task files
or accepted ADRs. Verify it against the repository before acting.

## Resume here

1. Read `AGENTS.md` and its required project documents in order.
2. Run `git status --short` and `git log -6 --oneline`. The expected state is a
   clean `main` with this handoff/task-closure commit above `d483224`,
   `f153ee6`, and accepted ADR commit `4ee1f96`.
3. Read ADRs 0003, 0008, and 0012; Tasks 0018 through 0021; and
   `docs/security/web-delivery.md`.
4. Confirm Task 0021 is `done`. There is no active implementation task at this
   checkpoint. Begin any next milestone with a separate read-only preflight and
   exact path reservation.
5. Update this file before the next session stops, including when work is
   blocked or still under review.

## Checkpoint outcome

Task 0021, CSPRNG-backed password generator, is complete and independently
security-reviewed.

- ADR commit: `4ee1f96 docs(adr): accept password generation policy`.
- Implementation commit: `f153ee6 feat(web): add CSPRNG password generator`.
- Review-remediation commit: `d483224 test(web): prove generated secret cleanup`.
- Independent preflight: PASS, P0 0, P1 0; it required ADR 0012 before code.
- ADR review: initial BLOCK P0 0/P1 2/P2 1, final PASS P0 0/P1 0/P2 0.
- Implementation review: initial BLOCK P0 0/P1 1/P2 0, final PASS P0 0/P1 0/P2 0.

The reviewed implementation now:

- Generates random-character login passwords only through the named,
  unlocked-only `generate-password` vault-worker operation. No generic random
  bytes, caller entropy, deterministic production hook, `Math.random`, provider
  API change, or package-level crypto change was added.
- Implements ADR 0012's exact four disjoint ASCII sets, fixed ordering, length
  range 16 through 128, integer-checked 80-bit floor, default length 20/all
  sets, and independent uniform characters without promising each enabled class
  will occur.
- Uses byte-cutoff rejection sampling with a `length * 16` requested/consumed
  byte ceiling. It validates exact provider return type/length, accumulates into
  an owned byte buffer, returns no partial candidate, and clears owned random
  and output buffers best-effort on success and failure.
- Separates request validation, context-free global response validation, local
  worker result validation, and the client's immutable request-specific pending
  expectation. Forged length/alphabet/operation/session results fail closed.
- Fills only the active keyed login editor and never saves automatically.
  Manual password edits, option changes, a newer request, type/target changes,
  cancellation, and lock suppress older results. Lock remains immediately
  available, clears the window, advances the epoch, and terminates the worker.
- Provides accessible length and character-set controls, keyboard operation,
  honest allowed-class help text, redacted errors, and a 320-pixel layout.

The exact-policy emitted-production flow now generates through the real built
worker and proves:

- immediately before Save, the generated value is absent from raw IndexedDB,
  Cache Storage request/response contents, localStorage, sessionStorage, and
  history state;
- after explicit Save it appears only inside the encrypted item record and is
  retained unchanged through direct deletion, after which persistence and
  runtime surfaces are clean;
- a separate unsaved generated value is removed by cancellation;
- another generated value remains active until Lock, after which DOM/runtime
  and origin-persistence scans are clean, the worker terminates, and a reload
  plus unlock creates a distinct fresh worker; and
- generated values are absent from requests, URLs, headers, logs, static
  responses/artifacts, and other checked application surfaces.

## Verification actually run

Implementation and remediation gates passed:

```text
pnpm install --frozen-lockfile               # already up to date
pnpm typecheck                               # pass
pnpm lint                                    # 102 files, pass
pnpm format:check                            # 102 files, pass
pnpm test                                    # 10 files, 83 tests, pass
pnpm build                                   # pass
pnpm --filter @neutron/web test:browser      # 3 files, 20 tests, pass
pnpm --filter @neutron/web test:production   # emitted exact-CSP flow, pass
git diff --check                             # pass
```

One combined remediation run hit `IndexedDB deletion blocked` during Chromium
cleanup before the affected test body. The immediate isolated browser rerun
passed all 20 tests, followed by another passing production flow. The final
reviewer independently reran all 20 Chromium tests, production build/flow, and
diff check successfully with a clean worktree.

## Deliberately unfinished

- Stage 2 still lacks passphrase/wordlist generation, RFC 6238 code computation,
  bounded encrypted local search, offline recovery unlock UI, and the service
  worker/update state machine.
- Browser/OS/password-manager/extension handling of form plaintext remains part
  of the documented client TCB/residual risk; Neutron cannot prove erasure of
  immutable strings or engine-internal copies.
- The checked production policy server is not a deployable `_headers` adapter;
  no deployment occurred.
- Import/export, passkeys, sync, server adapters, backup/restore drills, release
  provenance, and open-source release automation belong to later stages.
- Tasks 0004, 0006, 0008, and 0009 remain blocked; Task 0010 remains proposed.
  Do not treat those designs as complete.
- Do not use real credentials before the Stage 5 dogfood gate.

## Next safe direction

Do not start implementation from this suggestion alone. Begin with an
independent preflight for one narrowly bounded Stage 2 milestone. The most
natural candidate is Task 0022 for RFC 6238 TOTP code computation/display using
the existing encrypted TOTP item and worker boundary. The preflight must decide
whether a new ADR is required for the time source, accepted algorithms/digit
widths, clock-step behavior, secret decoding, worker-to-window result contract,
and test vectors. Stop for an ADR rather than inventing those details.

Keep TOTP computation separate from clipboard, QR parsing, URI import, search,
passphrases, service-worker delivery, sync, server work, and deployment. An
alternative is a passphrase-policy ADR/preflight, but no wordlist may be chosen
silently and it should not be bundled with TOTP.

Suggested prompt for the next agent:

> Resume Neutron from `docs/coordination/HANDOFF.md` and verify the clean reviewed
> Task 0021 checkpoint above `d483224`. Read every document required by
> `AGENTS.md`. Before any edit, assign a separate read-only agent to preflight one
> narrow Task 0022 for RFC 6238 TOTP computation through the existing vault
> worker. Require an explicit ADR decision covering algorithms, digits, time
> source/step behavior, secret decoding, named protocol shape, plaintext/lock
> semantics, and authoritative vectors. If preflight requires an ADR, draft and
> independently review it before claiming product paths. Keep clipboard, QR/URI
> import, search, passphrases, service worker, sync, server, and deployment out
> of scope. Run all root, Chromium, emitted-production, leakage, and exact-policy
> gates; obtain independent adversarial review; remediate every P0/P1; commit a
> clean checkpoint; and update this handoff before stopping.

## Mandatory next-session stop protocol

Before the next session ends, record repository-verifiable task/review status,
exact commits, dirty paths, commands actually run and results, unresolved
findings, next safe action, and explicit non-goals here. Prefer a clean committed
checkpoint. Never use the handoff to self-approve a security-sensitive task.
