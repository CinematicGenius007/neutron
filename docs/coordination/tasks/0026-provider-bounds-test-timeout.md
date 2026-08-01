# TASK 0026 — Provider upper-bounds test timeout margin

Status: ready
Owner: unassigned
Claimed: —
Worktree/branch: —
Reviewer: unassigned
Review claimed: —
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
- `packages/crypto/vitest.config.ts` if a new one is required
- A root Vitest configuration file if the chosen approach needs one

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

- [ ] `pnpm test` passes on at least ten consecutive full-gate runs on an idle
      machine.
- [ ] The chosen approach is recorded with its measurement, stating the margin
      between observed worst-case runtime under the parallel gate and the limit.
- [ ] Every input bound listed in "Out of scope" is byte-for-byte unchanged, and
      every assertion is unchanged. The diff is shown in the task file.
- [ ] The recorded root cause matches a measurement, not a plausible-sounding
      attribution.
- [ ] CI wall-clock impact is measured and recorded.
- [ ] All repository gates pass.

## Verification

Record the timing distribution before and after across at least ten runs of the
full gate, not just the single file, because the contended case is the one that
fails. Record per-test durations with `--reporter=verbose` so the attribution is
evidenced rather than asserted.

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

## Handoff

Summarize the chosen approach, its measurement, and any residual flake.

## Review

Reviewer, date, findings, and disposition. Required; the implementer must not
self-approve.
