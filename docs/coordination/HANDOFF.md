# Neutron session handoff

Updated: 2026-08-01
Branch: `main`
Implementation tip: `d94b925`
Last independently reviewed and closed checkpoint: `0f6d9f8` (Task 0022)

This is a navigation checkpoint, not a substitute for authoritative task files
or accepted ADRs. Verify it against the repository before acting.

## Resume here

1. Read `AGENTS.md` and every document it requires, in order. `CLAUDE.md` adds
   practical operating notes and does not override `AGENTS.md`.
2. Run `git status --short` and `git log -8 --oneline`. Expect a clean `main`
   with this handoff commit on top of `d94b925`, above `921a963`, `bbe63c3`,
   `378a71b`, `b48653d`, `de69215`, and `0f6d9f8`.
3. Read accepted ADR 0014, the plan review at
   `docs/coordination/reviews/2026-08-01-stage-2-plan-review.md`, and Tasks 0023
   through 0026.
4. **Task 0025 is `review`, not `done`.** Its first independent review returned
   BLOCK; the remediation at `d94b925` was sent back for a final verdict. If no
   verdict is recorded in that task file, the review is unfinished. Do not close
   it, and do not treat `pnpm test` as a passing gate until Task 0026 lands.
5. Update this file before the next session stops, including if work is blocked
   or still in review.

## Checkpoint outcome

Three things happened this session: a decision was accepted, a dead security
control was found and repaired, and the Stage 2 remainder was replanned.

**ADR 0014 — passphrase generation policy — accepted** at `de69215` after an
independent adversarial review returned BLOCK with P0 0, P1 5, P2 9. Every
finding was remediated before acceptance. Two were substantive rather than
editorial:

- The byte-assembly rule permitted a sliding-window implementation in which one
  byte served as the low byte of one draw and the high byte of the next, making
  consecutive word choices dependent and falsifying the entropy claim. No test
  in the required set would have caught it. Replaced with a disjoint-pair
  discipline plus a test that pins the index sequence for a fixed byte stream.
- The required CC BY 4.0 attribution would not have survived the build. Verified
  against this repository's own pipeline: React's upstream `@license` banner
  does not reach the emitted bundle. Attribution is now an exported string
  rendered in the UI, plus `docs/third-party-notices.md`, plus a production-gate
  assertion.

Provenance is recorded honestly: EFF publishes no checksum, so the pinned
upstream digest attests to one TLS retrieval on 2026-08-01, not to upstream
authenticity, and the CC BY 4.0 reading depends on the list being original EFF
material, evidenced by EFF's own announcement rather than by an explicit grant.

**Task 0025 — vault-worker bundle boundary — implemented, in review.** The
worker half of the build-time boundary check in `apps/web/vite.config.ts` had
never executed. Vite bundles a `?worker&url` import in its own build and emits
it into the parent as an asset, while the plugin only inspected outputs of type
`chunk`, so the lookup always missed and the branch was skipped. ADR 0008 and
Task 0018 both treated that assertion as enforced. The independent reviewer
confirmed the defect by reproduction: the same violation builds cleanly at
`378a71b` and fails at HEAD.

A second instance of the same defect class was then found — predicates matched
directory-anchored substrings, so a worker-only module moved one directory
deeper stopped being matched — and fixed at `921a963` and `d94b925`.

**Stage 2 was replanned** in `docs/coordination/reviews/2026-08-01-stage-2-plan-review.md`,
which records the comparison the previous handoff did not make, and adds a
functional UI remediation task that no previous task owned.

## Verification actually run

At `d94b925`, run serially:

```text
pnpm install --frozen-lockfile               # already up to date
pnpm typecheck                               # pass
pnpm lint                                    # 106 files, pass
pnpm format:check                            # 106 files, pass
pnpm test                                    # 94 tests; see the caveat below
pnpm build                                   # pass
pnpm --filter @neutron/web test:browser      # 23 Chromium + 3 engine probes, pass
pnpm --filter @neutron/web test:production   # emitted exact-CSP flow, pass
git diff --check                             # pass
```

Emitted artifacts are byte-identical to the pre-change build: `index-BFSv1aBR.js`
237,586 bytes, `vault-worker-entry-CR0SpbvK.js` 596,854 bytes,
`index-Dz9C09xS.css` 4,759 bytes, 7 files.

**`pnpm test` is not a reliable gate right now.** The implementer first recorded
its failure as machine load; the independent review refuted that by measurement.
`packages/crypto/test/provider.test.ts > accepts exact upper bounds and rejects
wrong associated data` runs 21.58 s isolated but 32.5 s inside the ordinary
parallel gate, against a 30 s timeout, and fails about one run in five on an
idle machine. Task 0026 owns it. Until that lands, a green `pnpm test` is weak
evidence and a red one must be diagnosed rather than retried.

Boundary control proven by deliberate violation, reverted immediately and not
committed:

```text
worker imports UI      -> vault worker build contains forbidden module: …/react.production.js
window imports storage -> window build contains forbidden module: …/src/storage/local-vault.ts
```

## Deliberately unfinished

- Task 0025 has no recorded review verdict yet. It is `review`, not `done`.
- Task 0023, the passphrase generator, is `proposed` and not started. Its two new
  modules were drafted but deliberately not committed, because ADR 0014's
  acceptance and Task 0025's shared build file had to settle first.
- Task 0024, functional UI remediation, is `proposed` with 14 enumerated defects
  and runs after 0023 so that the usability pass covers the passphrase UI.
- Task 0026, the Argon2id timeout margin, is `ready` and unclaimed.
- Stage 2 still lacks bounded encrypted local search and the service-worker
  install/update/rollback state machine. Neither is preflighted. Bounded search
  needs an ADR that either changes a persisted format or explicitly defers index
  shards; `INDEX_PAYLOAD 0x12` is reserved in the envelope but unused.
- The roadmap does **not** list offline recovery unlock as Stage 2 work, contrary
  to what the previous handoff said. It is also blocked: its governing ADR
  filename is reserved by the blocked Task 0009. Do not start it.
- Idle auto-lock and clipboard copy are deliberately deferred. Both are security
  decisions needing their own ADRs, not usability tweaks.
- Clipboard/copy, QR generation and scanning, `otpauth://` parsing, adjacent-step
  TOTP validation, and clock synchronization remain absent.
- Browser, OS, password-manager, and extension handling of plaintext remains part
  of the documented client TCB. Neutron cannot prove erasure of immutable strings.
- Tasks 0004, 0006, 0008, and 0009 remain blocked; Task 0010 remains proposed.
- Do not use real credentials before the Stage 5 dogfood gate.

## Next safe direction

Finish the Task 0025 review first. If the verdict is PASS, the reviewer closes
it; if it blocks again, remediate before anything else, because every remaining
task depends on that build file.

Then Task 0026, which is small and unblocks trustworthy gating, followed by Task
0023 and then Task 0024 in that order.

Suggested prompt for the next agent:

> Resume Neutron from `docs/coordination/HANDOFF.md`. Read every document
> required by `AGENTS.md`, then verify `git status` is clean at `d94b925` and
> that the referenced commits exist. First, determine whether Task 0025 has a
> recorded independent review verdict. If it does not, obtain one from an agent
> that did not implement it, and remediate every P0 and P1 before starting new
> work. Do not mark it done yourself. Next, claim Task 0026 and give the
> Argon2id upper-bounds test real margin without touching ADR 0010 parameters,
> skipping the test, or adding retry-on-failure; prove it with ten consecutive
> green full-gate runs. Then claim Task 0023 and implement the ADR 0014
> passphrase generator exactly as specified — digest-pinned wordlist, disjoint
> big-endian pair sampling with cutoff 62208, no index or word array anywhere,
> attribution as an exported string rendered in the UI, and the emitted-production
> flow recomputing the canonical digest from the built worker. Run every gate,
> obtain separate adversarial review, remediate every P0/P1, commit a clean
> checkpoint, and update this handoff. Do not bundle Task 0024, bounded local
> search, recovery unlock, clipboard, TOTP import, service worker, sync, server,
> or deployment work.

## Manual UI smoke test

From the repository root, run `pnpm --filter @neutron/web dev`, open the printed
local URL, and use a fresh browser profile/origin. Enrollment, recovery-kit
confirmation, lock/unlock, item CRUD, password generation, and TOTP display are
available for synthetic test data. The current dev build is not a dogfood or
production security release; do not enter real credentials.

## Mandatory next-session stop protocol

Before the next session ends, record repository-verifiable task/review status,
exact commits, dirty paths, commands actually run and results, unresolved
findings, next safe action, and explicit non-goals here. Prefer a clean committed
checkpoint. Never use the handoff to self-approve a security-sensitive task.

One process note worth carrying forward: review separation was previously
attested only by prose, since every commit shares one Git author and closed
tasks clear `Owner`. Task 0025 records both implementer and reviewer identities
and retains them. Keep doing that.
