# Stage 2 forward-plan review — 2026-08-01

Reviewer: `/root` (orchestrator), reviewing the plan rather than a diff.
Inputs: `docs/MASTER_PLAN.md`, `docs/ROADMAP.md`, `docs/SECURITY_MODEL.md`,
accepted ADRs 0001–0013, all task files, and `docs/coordination/HANDOFF.md` at
commit `0f6d9f8`.

This review exists because the handoff proposed exactly one next milestone and
proposing one option is not the same as having weighed the alternatives. It
records what the plan gets right, what I am changing, and why. It changes no
accepted ADR and no completed task.

## 1. What the handoff proposed

The `0f6d9f8` handoff proposed a passphrase-generator milestone gated on an ADR
covering wordlist, license, provenance, normalization, entropy, bounds,
unbiased selection, update/rollback, plaintext lifetime, protocol shape, and
deterministic tests — with an explicit instruction to stop without code if
licensing or policy could not be made repository-verifiable.

That gate was correct to demand, and it is satisfiable. The verification is
recorded in ADR 0014 rather than here: the upstream file, its retrieval date and
digest, the derived list and its digest, the license statement and its source
URL, and the entropy arithmetic are all facts I checked directly rather than
recalled.

## 2. Assessment of the proposed sequencing

Stage 2 in `docs/ROADMAP.md` still owes three things: passphrase generation,
bounded local search, and the PWA service-worker install/update/rollback state
machine. Recovery unlock is separately blocked and is not a Stage 2 roadmap gap.

Ranking them as "smallest next safe independently reviewable checkpoint":

| Candidate | Scope | New protocol surface | Blocking unknowns |
| --- | --- | --- | --- |
| Passphrase generator | Small | One operation, one result kind | None once ADR 0014 lands |
| Bounded local search | Medium | New query/summary shape and index policy | Needs an ADR on what an index shard may leak and how much plaintext is decrypted per query |
| Service-worker delivery | Large | Update/rollback state machine | Needs its own ADR and changes the delivery trust story in ADR 0008 |

The handoff's choice is the right one and I am keeping it. Passphrase generation
is the only remaining Stage 2 item whose entire risk surface is a data asset plus
one worker operation that clones an already-reviewed pattern. The other two
each open a question that deserves its own decision record first, and starting
any of them now would mean writing an ADR about a subject nobody has preflighted.

## 3. What I am adding to the plan, and why

### 3.1 A functional UI/UX remediation milestone (Task 0024)

The plan has no task for the usability of what has already shipped. Five
implementation checkpoints (Tasks 0017–0022) each added a surface to the same
two screens under a strict "stay in your allowed paths" rule, which is correct
for review isolation and guarantees that cross-cutting interaction problems
accumulate unowned. Nobody has been allowed to look at the whole screen.

I am adding one bounded task at the *end* of the sequence, explicitly scoped to
function over form:

- It fixes defects that stop a user completing a task, mislead them about the
  security state, or make the app unusable by keyboard or at 320 pixels.
- It does not restyle, rebrand, animate, add an icon set, add a font, add a
  component library, or introduce any third-party asset. ADR 0008 forbids the
  last of those outright, and the rest are cost without a security or usability
  argument.
- Anything that changes what plaintext is displayed, persisted, or logged is
  treated as a security change and needs the same adversarial review as a crypto
  change, because it is one.

It runs last for a specific reason, not out of politeness to feature work: it
touches the widest set of files of anything remaining in Stage 2, so it collides
with every other task's allowed paths. Doing it last means it collides with
nothing, and it means the usability pass covers the passphrase UI too instead of
being immediately invalidated by it.

### 3.2 Explicit ownership of the "detail view shows every field as plaintext"
question

`apps/web/src/app.tsx` renders every non-metadata field of a decrypted item as
visible text, including a login password and a TOTP seed. ADR 0013 already noted
the seed exposure as accepted-but-undesirable and called reducing it "separate
future work". No task owned that sentence, so it was on track to be inherited
forever. Task 0024 now owns the display half of it — whether a secret field is
revealed by default — while the protocol half, narrowing what `get-item` returns
to the window, stays out of scope and remains future work. Splitting it this way
keeps the change reviewable: the display fix needs no protocol change at all.

### 3.3 A recorded rule about dictionary bundling and leakage tests

Bundling a 7,776-word dictionary is safe for the existing leakage tests only
because they assert on the exact generated value. That is currently an accident
of how someone wrote `assertNoSentinels`, not a stated rule. ADR 0014 now states
it, so a future test author cannot "improve" the scan into a per-word search and
quietly make it vacuous.

## 4. What I am deliberately not adding

- **Idle auto-lock.** A genuine security-usability gap: the vault stays unlocked
  until the tab closes. It needs its own ADR (timeout policy, activity
  definition, interaction with in-flight worker operations, and what the timer
  may observe) and is not a UI tweak. Recorded here so it is not lost, deferred
  because bundling it into a usability pass would smuggle a security decision
  through a cosmetic review.
- **Clipboard copy for passwords, passphrases, and TOTP codes.** The single most
  requested convenience in any vault, and the one with the largest untested
  exposure — clipboard history, cross-application readers, and OS sync all read
  it. `docs/security/web-delivery.md` already reserves `clipboard-write=(self)`,
  so the policy anticipates it, but authorizing the permission is not the same as
  designing the lifetime, the clear-on-lock behavior, and the honest claim about
  what Neutron cannot erase. Separate ADR, separate task.
- **Anything from Stage 3 onward.** Sync, passkeys, and server work stay closed
  while Tasks 0004, 0006, 0008, and 0009 are blocked or proposed.

## 5. Adjustments to how the work is run

- ADR 0014 must be independently reviewed before Task 0023 is claimed, and Task
  0023's implementation must be independently reviewed before it is closed. This
  matches Tasks 0021 and 0022 and is not negotiable for security-sensitive work.
- Task 0024 inherits the same review requirement despite being a UI task,
  because its findings touch what secret material is rendered.
- The measured bundle-size effect of the wordlist is a recorded acceptance
  criterion rather than an estimate in an ADR, so that a future reader can see
  what it actually cost.

## 6. Preflight findings and my dispositions

An independent read-only agent preflighted the checkpoint. It confirmed the clean
state and reproduced every root gate exactly (`pnpm lint` and `format:check` 106
files, `pnpm test` 11 files and 94 tests, `typecheck`, `build`, and
`git diff --check` all clean at `0f6d9f8`). Its substantive findings and what I
decided:

**Licensing — proceed, with the reasoning stated rather than assumed.** The
preflight called this a hard blocker on the grounds that the repository has no
`LICENSE` or `NOTICE` file and the task owning them (0008) is blocked. I am
overruling that reading, and recording why so a reviewer can disagree with a
stated argument instead of a silent one. The handoff's gate was that *licensing
must be repository-verifiable*, and it is: the license, its source URL, the
retrieval date, the upstream digest, and the derived-list digest are all recorded
in ADR 0014 as checked facts. What Task 0008 owns is the *release* governance
mechanism — owner identity, headers, SBOM, signing — and CC BY 4.0's attribution
obligation binds on distribution, which cannot happen before the Stage 5 gate
that Task 0008 must clear anyway. Blocking a Stage 2 checkpoint on a Stage 5
mechanism would stall Stage 2 indefinitely.

That said, the preflight's underlying concern is real and I am adding a
requirement it did not state: **attribution must survive minification.** A source
comment does not; the bundler is free to strip it. Attribution is therefore
carried as an exported string constant that the generator UI renders, so the
credit reaches the person actually using the wordlist, plus a preserved legal
banner and `docs/third-party-notices.md`. Task 0008 must absorb that file when it
unblocks.

**Index-tuple leakage blind spot — accepted, and closed structurally.** The
preflight is right that a passphrase, unlike a password, has a compact equivalent
representation: the tuple of chosen indices reconstructs the secret exactly and
contains no sentinel substring, so it would pass every existing leakage
assertion. Extending the scan to search for index tuples would require the test
to *know* the indices, which creates the exposure it is meant to detect. ADR 0014
therefore closes it structurally instead: no index array may be materialized at
all. Each drawn index is consumed into the output immediately and never stored.

**Bundled-dictionary false-failure mode — already avoided, now stated as a
rule.** If the bundle's internal delimiter equalled the emitted separator, a
passphrase of consecutive-in-list words would be a literal substring of the
shipped bundle and the leakage gate would fail spuriously. The list is joined by
`U+000A` and the separator is `.`, so this cannot occur, but it was luck rather
than policy until now.

**Reviewer separation is not repository-verifiable.** Every checkpoint commit
shares one Git author and completed tasks clear `Owner`, so the separation of
implementer and reviewer rests on prose. This is a process-integrity gap, not a
reason to doubt the Task 0022 checkpoint. From Task 0023 onward both identities
are recorded in the task file and retained after closure.

**Roadmap and handoff disagree about recovery unlock.** The handoff lists
"offline recovery unlock UI" as outstanding Stage 2 work;
`docs/ROADMAP.md:50-70` lists only kit generation, confirmation, and wrapper
creation, all delivered by Tasks 0014 through 0016. The roadmap is the authority.
Recovery unlock is not a Stage 2 gap, which strengthens the sequencing in
section 2 — and it is additionally blocked, since its governing ADR filename is
reserved by the blocked Task 0009.

**Bounded local search is more blocked than it looks.** `INDEX_PAYLOAD 0x12` is
already reserved in the envelope but unused, and the master plan mandates index
shards, so a search milestone must either change a persisted format — which
requires a protocol version and migration story first — or write an ADR that
explicitly defers shards. That is a real decision, not a detail, and it confirms
that search should not have been chosen ahead of the passphrase generator.

## 7. ADR 0014 review outcome, and a dead security control it exposed

The independent adversarial review of ADR 0014 returned **BLOCK** with P0 0,
P1 5, P2 9. Every finding was accepted and remediated; the ADR was then accepted.
The five P1s are worth naming, because two of them were real defects rather than
documentation polish:

1. **The byte-assembly rule was self-contradictory and permitted an
   entropy-reducing implementation.** My original wording about carrying a
   leftover byte forward could be read as a sliding window in which one byte
   serves as the low byte of one draw and the high byte of the next, making
   consecutive word choices statistically dependent and falsifying the entropy
   claim — and no test in the required set would have caught it, because they
   exercise the 16-bit mapping, not the byte stream. Replaced with a strict
   disjoint-pair discipline plus a test that pins the index sequence for a fixed
   injected byte stream.
2. **The upstream digest was presented as provenance it does not establish.**
   EFF publishes no checksum, so the pinned hash attests to one TLS download,
   not to upstream authenticity. Now stated as trust-on-first-use.
3. **The license conclusion rested on an unstated premise.** EFF's policy grants
   CC BY 4.0 over material *original* to EFF and separately warns that other
   material may need permission; I had quoted only the favourable half. The
   inference now cites EFF's own announcement as the evidence that the list is
   theirs, and labels itself a documented reading rather than a grant.
4. **The required attribution provably would not survive the build.** Verified
   against this repository's own pipeline: React's upstream `@license` banner
   does not reach the emitted bundle. Attribution is now an exported string
   rendered in the UI, plus `docs/third-party-notices.md`, plus an assertion in
   the production gate so a minifier setting cannot silently drop a license
   obligation.
5. **"Tampering fails the build" was false.** A Vitest assertion fails
   `pnpm test`, not `pnpm build`, and it inspects source rather than artifacts.
   The emitted-production flow now recomputes the canonical digest from the list
   as loaded by the real built worker.

I also had one plain arithmetic error: the canonical list is 62,143 bytes, not
62,144.

**The review's incidental finding matters more than any of the above.** The
vault-worker half of the build-time boundary check in `apps/web/vite.config.ts`
has never run. Vite compiles a `?worker&url` import in a separate build and
emits it into the parent bundle as an asset, while the plugin only inspects
outputs whose type is `chunk`, so the lookup always yields `undefined` and the
branch is skipped. I reproduced this against a real build: Vite prints no gzip
figure for the worker file, which it reports only for chunks, and the file is
absent from `dist/.vite/manifest.json`. The window-side branch passing is itself
the proof — a worker chunk in the same bundle would have tripped the
"unaccounted chunk" throw.

That is an accepted ADR 0008 control that silently does nothing, and Task 0018
was closed on the understanding that it worked. **Task 0025** now owns it. It is
sequenced first, ahead of the passphrase work, for two reasons: it is a
regression in an existing security control rather than a new feature, and it
owns a shared build file that both remaining tasks depend on, so doing it later
would mean editing that file while another task is active.

## 8. Resulting order

1. Accept ADR 0014 after independent review. *(Done: reviewed, blocked,
   remediated, accepted.)*
2. Task 0025 — restore vault-worker bundle boundary enforcement; independent
   review that reproduces a deliberate violation rather than reading the diff.
3. Task 0023 — wordlist passphrase generator; independent adversarial review.
4. Task 0024 — functional UI remediation; independent adversarial review.
5. Re-preflight before choosing between bounded local search and service-worker
   delivery. Recovery unlock is not a Stage 2 gap and is separately blocked. Do
   not pick from this document; the evidence will be a session old by then.
