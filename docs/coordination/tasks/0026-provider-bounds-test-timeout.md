# TASK 0026 — Provider upper-bounds test timeout margin

Status: review
Owner: unassigned (implemented by `/root`)
Claimed: 2026-08-01T00:26:15Z
Worktree/branch: shared-worktree (main)
Reviewer: `/root/task_0026_reviewer`
Review claimed: 2026-08-01T00:40:50Z
Depends on: —
Blocks: a reproducibly green `pnpm test` gate
Security-sensitive: yes

## Outcome

`pnpm test` passes reproducibly. The provider upper-bounds test either has a
timeout with real margin or does not compete for CPU with the rest of the suite,
its exact input bounds are unchanged, and the chosen approach is recorded with
its measurement.

## Context

`packages/crypto/test/provider.test.ts > accepts exact upper bounds and rejects
wrong associated data` fails with `Test timed out in 30000ms` on roughly one run
in five, on an idle machine, inside the ordinary parallel gate.

The first version of this task attributed that to Argon2id and to a Vitest
default timeout. Both were wrong, and the correction is recorded here rather
than quietly applied, because asserting a plausible cause instead of measuring
one is the same mistake this task exists to clean up after.

Measured, per test, with `vitest --reporter=verbose`:

```text
matches the immutable HKDF and Argon2id known answers            407 ms
accepts exact upper bounds and rejects wrong associated data  18 724 ms
```

The failing test performs **no** Argon2id derivation. `deriveArgon2idKey` appears
only at `packages/crypto/test/provider.test.ts:41` and `:100-101`, in different
tests, and the Argon2id known-answer test is 46 times faster. The cost in the
failing test is `randomBytes(16_777_216)` at `:229` plus a 16 MiB
XChaCha20-Poly1305 encrypt and a failing decrypt at `:231-247`.

The 30 second limit is not a Vitest default either — Vitest's default is 5,000 ms
and no `testTimeout` is configured anywhere in this repository. It is an explicit
per-test literal at `packages/crypto/test/provider.test.ts:248`.

Timing:

```text
isolated single-file run          21.58 s
inside the ordinary parallel gate 32.5  s   (11 test files in parallel)
explicit per-test limit           30    s
observed failure rate             1 run in 5, no concurrent load
```

Under the ordinary gate the test exceeds its own limit unaided. A gate that
fails one run in five trains agents and humans to retry until green, which is
exactly how a real regression gets waved through.

## Allowed paths

- This task file
- `packages/crypto/test/provider.test.ts`

## Out of scope

- **Reducing the exercised input bounds.** The `16_777_216`-byte buffers at
  `packages/crypto/test/provider.test.ts:229` and `:237`, the 4,096-byte HKDF
  inputs, and the 8,160-byte output length encode the provider's exact
  documented upper limits. This test is the only thing proving the provider
  accepts them. Making the test faster by shrinking them silently deletes the
  coverage it exists to provide.
- Changing Argon2id parameters, the KDF profile, or any ADR 0010 value
- Skipping the test, adding a conditional skip, or weakening any assertion
- Retry-on-failure configuration, which hides the problem rather than fixing it
- Any product code, including `packages/crypto/src`

## Acceptance criteria

- [x] `pnpm test` passes on at least ten consecutive full-gate runs on an idle
      machine.
- [x] The chosen approach is recorded with its measurement, stating the margin
      between observed worst-case runtime under the parallel gate and the limit.
- [x] Every input bound listed in "Out of scope" is byte-for-byte unchanged, and
      every assertion is unchanged. The diff is shown in the task file.
- [x] The recorded root cause matches a measurement, not a plausible-sounding
      attribution.
- [x] Local full-gate wall-clock impact is measured and recorded. Actual CI
      timing remains explicitly unknown until the first connected CI run; the
      configured worst-case timeout impact is recorded without presenting it as
      observed CI behavior.
- [x] All repository gates pass.

## Verification

Record the timing distribution before and after across at least ten runs of the
full gate, not just the single file, because the contended case is the one that
fails. Record per-test durations with `--reporter=verbose` so the attribution is
evidenced rather than asserted.

Measured on macOS Darwin 25.5.0, Apple M5, 24 GiB memory, Node 26.5.0,
pnpm 11.10.0, and Vitest 4.1.10. Runs were serial at the shell level; each run
used the repository's ordinary parallel Vitest scheduling. Times are milliseconds
for the target test and seconds for Vitest/wall clock:

| Run | Before target | Before Vitest/wall | After target | After Vitest/wall |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 20,198 | 21.66 / 23 | 19,505 | 20.69 / 21 |
| 2 | 20,061 | 21.38 / 22 | 19,834 | 20.92 / 22 |
| 3 | 20,749 | 22.15 / 23 | 20,055 | 21.28 / 22 |
| 4 | 19,817 | 21.39 / 22 | 19,960 | 21.39 / 22 |
| 5 | 19,990 | 21.35 / 22 | 20,506 | 21.87 / 22 |
| 6 | 19,697 | 20.87 / 21 | 20,047 | 21.58 / 23 |
| 7 | 20,332 | 21.66 / 23 | 20,302 | 21.20 / 21 |
| 8 | 20,680 | 21.90 / 22 | 21,766 | 23.26 / 24 |
| 9 | 20,190 | 21.62 / 22 | 23,264 | 24.57 / 26 |
| 10 | 20,490 | 21.49 / 22 | 19,910 | 21.25 / 22 |

All twenty recorded gates passed 11 files and 94 tests. Before target minimum,
median, and maximum were 19,697 ms, 20,194 ms, and 20,749 ms; after they were
19,505 ms, 20,051 ms, and 23,264 ms. Median wall clock was 22 seconds both
before and after, so the timeout-only change has no measured successful-run cost.

The new 60-second limit leaves 36.736 seconds of local margin over the measured
post-change maximum (about 158 percent of that maximum). The more conservative
margin against the previously recorded 32.5-second contended observation is
27.5 seconds, about 85 percent. Actual CI runtime is unknown because this checkout
has no Git remote or observable CI run. The configured worst case for a genuinely
stalled target grows by 30 seconds; this is a bounded diagnostic trade-off, not
an observed successful-run cost.

The complete product/provider code, bounds, allocations, and assertions remain
byte-identical to `59a0c11`. The implementation diff is exactly:

```diff
-  }, 30_000);
+  }, 60_000);
```

on `accepts exact upper bounds and rejects wrong associated data`; there is no
skip, retry, global timeout, pool, worker-count, parallelism, or source change.

## Progress log

- 2026-08-01T05:30:00Z — Created from the Task 0025 independent review, which
  measured the failure with no concurrent load and refuted the load-based
  explanation.
- 2026-08-01T05:50:00Z — Rewritten after the same reviewer measured per-test
  durations and refuted this task's own root cause. The failing test contains no
  Argon2id call and the 30 second limit is an explicit literal, not a framework
  default. Retitled and renamed from `0026-argon2id-test-timeout-margin.md`,
  out-of-scope extended to protect the 16 MiB upper-bound inputs that nothing
  previously guarded, and reclassified `Security-sensitive: yes` because the
  allowed paths include a fail-closed bounds test in `packages/crypto`, which
  `AGENTS.md` treats as requiring separate review.
- 2026-08-01T00:26:15Z — Takeover preflight independently confirmed the exact
  16 MiB cost, explicit timeout, and absence of Argon2id work. It blocked the
  original task definition because this checkout has no remote or observable CI
  run, making measured CI impact impossible, and because configuration-file
  alternatives were not exact allowed paths. Narrowed implementation to this
  record plus the existing test, required honest local/configured-impact
  evidence, and claimed the corrected task. No primitive, bound, assertion,
  provider behavior, API, format, or ADR 0010 parameter may change.
- 2026-08-01T00:39:41Z — Collected ten pre-change and ten corrected post-change
  full-gate measurements, all green. An initial context-free patch matched the
  earlier Argon2id test's identical timeout literal; inspection of the actual
  diff caught it before commit, restored that line, and discarded the resulting
  measurements. Repeated the post-change series only after the diff proved the
  sole change was the upper-bounds test timeout. Recorded the raw measurements,
  local and conservative margins, unchanged successful-run median, and unknown
  CI timing above.
- 2026-08-01T00:40:50Z — Frozen install, typecheck, lint and format check over
  106 files, 94 Node tests, root build, and diff check all passed after the ten
  consecutive corrected post-change gates. Moved the exact two-file change to
  independent adversarial review.

## Handoff

Summarize the chosen approach, its measurement, and any residual flake.

## Review

Reviewer, date, findings, and disposition. Required; the implementer must not
self-approve.
