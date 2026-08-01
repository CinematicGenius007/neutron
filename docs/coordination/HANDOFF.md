# Neutron session handoff

Updated: 2026-08-01
Branch: `main`
Implementation tip: this handoff/acceptance commit, above `8055962`
Last executable checkpoint: Task 0026, independently reviewed at `0fac69c`

This is a navigation checkpoint, not a substitute for authoritative task files
or accepted ADRs. Verify it against the repository before acting.

## Resume here

1. Read `AGENTS.md` and every document it requires, in order. `CLAUDE.md` contains
   Claude-specific practical notes and cannot override `AGENTS.md`.
2. Run `git status --short` and `git log -10 --oneline`. Expect clean `main` with
   this commit above `8055962`, `df3f550`, `0fac69c`, `59a0c11`, and `d94b925`.
3. Read accepted ADR 0015 together with superseded ADR 0014, the takeover review
   at `docs/coordination/reviews/2026-08-01-adr-0014-takeover-review.md`, and
   Tasks 0023 through 0027.
4. Confirm Tasks 0025, 0026, and 0027 are `done`; Task 0023 is `ready` and
   unclaimed; Task 0024 remains `proposed` behind it. No implementation task is
   active at this checkpoint.
5. Update this file before the next session stops, including if work is blocked
   or under review.

## Takeover review outcome

The previous session made useful progress and did not wrongly implement the
passphrase feature. Its Task 0025 product fix is sound: the vault-worker bundle
boundary had silently never executed, and the repair now fails closed for
worker/UI violations and relocation probes without changing emitted artifacts.
This session independently reintroduced a worker-to-React violation, observed
the expected build failure, reverted it, rebuilt successfully, and restored a
clean tree.

The plan and policy record did contain material gaps. A fresh named audit of ADR
0014 at `59a0c11` returned BLOCK with P0 0, P1 4, P2 5:

- selected-index collections were forbidden, but selected-word collections with
  the same secret-reconstruction authority were not;
- Task 0023 reduced the minification-surviving attribution contract to an
  insufficient source header and omitted the full production assertion;
- Task 0023 omitted the gate-restoring Task 0026 dependency;
- the prior ADR reviewer identity was not retained;
- exhaustion probability and expected output-length text were slightly wrong;
- the Stage 2 recovery-unlock plan contradicted the roadmap;
- pre-implementation documents claimed nonexistent exports/tests/rendering; and
- Task 0025's block metadata was incomplete.

Task 0027 and successor ADR 0015 remediate every finding. Independent re-review
of `8055962` passed with P0 0, P1 0, P2 0. ADR 0015 is accepted and ADR 0014 is
retained as superseded history rather than silently rewritten. Task 0023 is now
ready but has no product implementation.

The prior session also wrote several Asia/Kolkata wall times with a `Z` suffix.
Task 0026 records the uncertainty instead of inventing UTC minutes; Task 0025's
recoverable times were converted using the repository timezone and its exact
creation commit. Continue using `date -u` for lifecycle timestamps.

## Task 0026 — trustworthy root test gate

Task 0026 is done and independently reviewed.

- Implementation: `0fac69c test(crypto): give provider bounds check real margin`.
- Closure: `df3f550 docs(coordination): close provider bounds timeout repair`.
- Review: PASS, P0 0, P1 0, P2 1; the timestamp-only P2 was remediated.

The only executable change raises the explicit timeout on
`accepts exact upper bounds and rejects wrong associated data` from 30 to 60
seconds. All 4,096-byte HKDF inputs, 8,160-byte output, 16,777,216-byte random/
AEAD inputs, 16,777,232-byte ciphertext, assertions, and provider source remain
byte-identical. No skip, retry, global timeout, worker-count, pool, or scheduling
change exists.

Ten pre-change and ten corrected post-change full parallel gates passed all 94
tests locally. Post-change target maximum was 23.264 seconds, leaving 36.736
seconds local margin; the conservative margin over the previously observed 32.5
second contended run is 27.5 seconds. Successful-run median wall clock remained
22 seconds. Three independent reviewer gates also passed. Actual CI timing is
unknown because this checkout has no Git remote or observable CI run; do not
present local M5 measurements as CI evidence.

During implementation, a context-free patch initially changed the earlier
Argon2id test's identical timeout literal. Final diff inspection caught and
reverted it before commit; the invalid measurements were discarded and the
post-change series was repeated on the correct line. This is retained because it
demonstrates why exact diff review is a gate.

## Verification actually run

Current takeover and Task 0026 work passed:

```text
pnpm install --frozen-lockfile               # already up to date
pnpm typecheck                               # pass
pnpm lint                                    # 106 files, pass
pnpm format:check                            # 106 files, pass
pnpm test                                    # 11 files, 94 tests, pass
pnpm build                                   # pass
git diff --check                             # pass
```

Task 0026 additionally has twenty recorded local full-gate measurements and
three independent reviewer runs. The takeover independently reproduced the EFF
source/derived digests and all list invariants. Task 0025's prior web gates remain
23 Chromium tests, three Chromium/Firefox/WebKit TOTP probes, and the emitted
exact-CSP production flow; no web executable changed in this takeover.

## Deliberately unfinished

- Task 0023, wordlist passphrase generation, is ready and unclaimed. No wordlist
  or generator module is committed. It must implement superseding ADR 0015 and
  the unchanged portions of ADR 0014.
- Task 0024, functional UI remediation, remains proposed behind Task 0023. It
  owns the 14 enumerated functional defects and must not be bundled into 0023.
- Stage 2 still lacks bounded encrypted local search and the service-worker
  install/update/rollback state machine. Neither is preflighted. Search requires
  an ADR for index-shard leakage/persisted-format policy.
- Recovery unlock is not an outstanding Stage 2 roadmap item and is separately
  blocked by Task 0009. Do not start it from an older handoff claim.
- Idle auto-lock and clipboard copy remain ADR-worthy security decisions, not UI
  tweaks. QR handling, `otpauth://` import, adjacent-step TOTP validation, and
  clock synchronization also remain absent.
- Tasks 0004, 0006, 0008, and 0009 remain blocked; Task 0010 remains proposed.
- There is no deployment, connected CI evidence, or production release. Do not
  use real credentials before the Stage 5 dogfood gate.

## Next safe direction

Claim only Task 0023. Its implementation must use the digest-pinned 7,776-word
EFF list, disjoint big-endian pairs with cutoff 62,208, and worker-owned CSPRNG.
It may retain only the actual output prefix plus one current numeric draw/index;
no selected-index or selected-word array, tuple, object, map, set, typed array,
encoded accumulator, closure collection, or join-later design is permitted.

The complete EFF/CC notice must be exported, rendered to the user, and proven in
emitted production with creator, `CC-BY-4.0`, license URI, source, retrieval
date, modification statement, and disclaimer reference. A source header alone
does not count. Preserve the existing triple validation, lock priority,
current-editor invalidation, no-auto-save rule, exact leakage scans, canonical
digest check, and before/after bundle measurements.

Suggested prompt for the next agent:

> Resume Neutron from `docs/coordination/HANDOFF.md`. Read every document required
> by `AGENTS.md`; verify clean `main` and the commits named in the handoff. Read
> superseded ADR 0014 together with governing accepted ADR 0015 and Task 0023.
> Assign a separate read-only preflight before claiming Task 0023, then claim only
> its exact allowed paths. Implement the digest-pinned EFF passphrase generator
> through the existing unlocked vault worker using disjoint 16-bit pairs and
> cutoff 62208. Construct output incrementally and retain no selected-index or
> selected-word collection of any representation. Export and render the complete
> attribution notice and prove it plus the canonical list digest in emitted
> production. Preserve triple validation, lock priority, stale-result suppression,
> no auto-save, leakage clearing, and exact bundle measurements. Run every root,
> browser, three-engine, and emitted-production gate; obtain independent
> adversarial review; remediate every P0/P1; commit a clean checkpoint; and update
> this handoff. Do not bundle Task 0024, search, recovery, clipboard, TOTP import,
> service worker, sync, server, or deployment work.

## Manual UI smoke test

Run `pnpm --filter @neutron/web dev` from the repository root and use a fresh
browser profile/origin with synthetic data only. Enrollment, recovery-kit
confirmation, lock/unlock, item CRUD, random-character password generation, and
TOTP display are available. Passphrase generation is not implemented yet. This
is not a dogfood or production security release.

## Mandatory next-session stop protocol

Before the next session ends, record repository-verifiable task/review status,
exact commits, dirty paths, commands actually run and results, unresolved
findings, next safe action, and explicit non-goals here. Prefer a clean committed
checkpoint. Never use the handoff to self-approve security-sensitive work, and
retain implementer/reviewer identities in the task record.
