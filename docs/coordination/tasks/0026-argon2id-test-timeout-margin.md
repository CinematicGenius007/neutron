# TASK 0026 — Argon2id test timeout margin

Status: ready
Owner: unassigned
Claimed: —
Worktree/branch: —
Reviewer: unassigned
Review claimed: —
Depends on: —
Blocks: a reproducibly green `pnpm test` gate
Security-sensitive: no

## Outcome

`pnpm test` passes reproducibly. The Argon2id upper-bounds test either has a
timeout with real margin or does not compete for CPU with the rest of the
suite, and the chosen approach is recorded.

## Context

`packages/crypto/test/provider.test.ts > accepts exact upper bounds and rejects
wrong associated data` exercises the ADR 0010 KDF profile — 64 MiB, three
iterations — which is expensive by design. It runs against Vitest's default
30-second timeout.

Measured during the Task 0025 review, on an idle machine with nothing else
running:

```text
isolated single-file run          21.58 s
inside the ordinary parallel gate 32.5  s  (11 test files in parallel)
default timeout                   30    s
observed failure rate             1 run in 5
```

The failure is therefore not caused by external load, and this task exists
because the Task 0025 record originally said it was. Under the ordinary gate the
file exceeds its own timeout unaided. A gate that fails roughly one run in five
trains agents and humans to retry until green, which is exactly how a real
regression gets waved through.

Nothing about the KDF profile is in question. ADR 0010 fixes those parameters
and this task must not change them, weaken them, or make the test skip them.

## Allowed paths

- This task file
- `packages/crypto/test/provider.test.ts`
- `packages/crypto/vitest.config.ts` if a new one is required
- A root Vitest configuration file if the chosen approach needs one

## Out of scope

- Changing Argon2id parameters, the KDF profile, or any ADR 0010 value
- Skipping, conditionally skipping, or reducing the coverage of the test
- Retry-on-failure configuration, which hides the problem rather than fixing it
- Any product code

## Acceptance criteria

- [ ] `pnpm test` passes on at least ten consecutive runs on an idle machine.
- [ ] The chosen approach is recorded with its measurement, and the resulting
      margin between observed worst-case runtime and the timeout is stated.
- [ ] The test still exercises the exact ADR 0010 parameters, with unchanged
      assertions and no skip condition.
- [ ] CI wall-clock impact is measured and recorded.
- [ ] All repository gates pass.

## Verification

Record the timing distribution before and after across at least ten runs of the
full gate, not just the single file, since the contended case is the one that
fails.

## Progress log

- 2026-08-01T05:30:00Z — Created from the Task 0025 independent review, which
  measured the failure with no concurrent load and refuted the original
  load-based explanation.

## Handoff

Summarize the chosen approach, its measurement, and any residual flake.

## Review

Reviewer, date, findings, and disposition.
