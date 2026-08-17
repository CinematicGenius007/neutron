# Pre-acceptance experiments for ADR 0016 and ADR 0017 — 2026-08-15

Author: `/root`
Scope: the two pre-acceptance verification items named by the proposed ADRs
Method: temporary local probe scripts run against the repository's pinned
Playwright 1.62.0 engines. No repository file was modified by the probes; each
probe file was created under `apps/web/`, executed, and deleted. `git status`
was checked afterwards and showed no probe artifact.

Both ADRs remain `Proposed`. Nothing here accepts either one.

## Experiment 1 — cross-engine case handling (ADR 0017)

**Question as originally posed:** does Unicode default case folding agree across
the supported engines?

**What was actually run:** a twelve-case sample lowercased in each engine, with
the resulting code points compared across engines, plus an idempotence check.

**Engines:** Chromium 151.0.7922.34, Firefox 153.0, WebKit 26.5.

**Result: complete agreement.** Every one of the twelve cases produced
byte-identical code-point output in all three engines.

```text
AGREE  ASCII                     -> 6e 65 75 74 72 6f 6e
AGREE  German sharp s (STRASSE)  -> 73 74 72 61 73 73 65
AGREE  sharp s literal (Straße)  -> 73 74 72 61 df 65
AGREE  capital sharp s U+1E9E    -> df
AGREE  Turkish dotted capital I  -> 69 307
AGREE  Turkish dotless i         -> 131
AGREE  Greek final sigma (Σ)     -> 3c3
AGREE  Greek word final (ΟΔΟΣ)   -> 3bf 3b4 3bf 3c2
AGREE  Cherokee                  -> ab70
AGREE  Deseret non-BMP           -> 10428
AGREE  ligature ff               -> fb00
AGREE  Kelvin sign               -> 6b
```

**The finding that mattered was not the agreement.** The sample exposed a defect
in the ADR draft itself: JavaScript has no case-folding operation.
`String.prototype.toLowerCase` implements Unicode Default Case Conversion, which
is a different function. The evidence is visible in the table above:

- `STRASSE` lowercases to `strasse`, but `Straße` lowercases to `straße`
  (`df` = `ß`). Case folding would map `ß` to `ss` and make the two match.
  Lowercasing does not, so **a query of `strasse` will not find an item titled
  `Straße`.**
- `ΟΔΟΣ` lowercases to `οδος` with word-final sigma (`3c2`), while a standalone
  `Σ` lowercases to `σ` (`3c3`). So **`οδοσ` will not match `ΟΔΟΣ`.**
- `İ` lowercases to `i` plus a combining dot above, so **`i` will not match
  `İ`.**
- The `ﬀ` ligature is unchanged by lowercasing alone, so `ff` would not match it
  without normalization.

ADR 0017 specified "Unicode default case-folded substring matching" and was
therefore not implementable as written. Its matching section has been rewritten
to specify `normalize("NFKC")` followed by `toLowerCase()`, with the residual
non-matches listed explicitly as accepted version-one limitations rather than
left for a user to discover.

**Verdict:** the stated pre-acceptance check passes. The ADR needed correcting
anyway, which is the argument for running an experiment instead of asserting its
outcome.

## Experiment 2 — dedicated-worker timers in a backgrounded tab (ADR 0016)

**Question:** do a dedicated worker's timers keep firing when its page is
backgrounded?

### Attempt A — driver-fronted second page: measured nothing

Opened a worker-bearing page, then opened and fronted a second page in the same
context, then counted ticks over six seconds.

```text
chromium 151.0.7922.34: visibility=visible  ticks 24/24 (ratio 1.00)
firefox  153.0:         visibility=visible  ticks 24/24 (ratio 1.00)
webkit   26.5:          visibility=visible  ticks 24/24 (ratio 1.00)
```

`document.visibilityState` remained `visible` in every engine. Headless
automation has no real window manager, so `bringToFront` did not background
anything. **The unanimous 1.00 ratio is not evidence of anything** and must not
be cited as a pass. Recorded here because a plausible-looking null result is
exactly the kind of false pass this repository's audit history warns about.

### Attempt B — Chromium CDP freeze, first try: confounded

Used `Page.setWebLifecycleState: frozen`, then read the tick counter after
thawing. Observed 24 of an expected 24 ticks.

This measurement is **invalid**. If the page were frozen, worker messages would
queue and drain on resume, producing the same count as a worker that never
stopped. The two hypotheses are indistinguishable by count.

### Attempt C — Chromium CDP freeze with per-tick timestamps: a real result

Changed the worker to stamp `Date.now()` on each tick, then classified stamps by
whether they predate the thaw instant.

```text
freeze window 6002ms, stamps captured 24
stamps dated BEFORE thaw: 23
RESULT: dedicated worker KEPT RUNNING through page freeze
```

**Result:** in headless Chromium 151, a dedicated worker's timers continued
through a CDP-induced page freeze.

**Why this does not close the question:**

- Headless Chromium only. Playwright exposes no equivalent lifecycle control for
  Firefox or WebKit, so two of three supported engines are untested.
- Headless browsers commonly disable background timer throttling, which is
  precisely the behaviour under test.
- A CDP-induced freeze is not an OS-backgrounded tab, a discarded tab, a
  bfcached page, a suspended mobile application, or a closed laptop lid.

**Verdict: open.** The ADR 0016 pre-acceptance item is not satisfied. A reviewer
should treat worker timers as unreliable.

This does not block the decision, because ADR 0016 already assigns the binding
role to the per-operation deadline check and treats the timer as an optimisation.
The experiment supports that structure: a design whose correctness depended on
the timer could not be justified on this evidence.

## Reproducing

Both probes were plain Node scripts importing `playwright` from the workspace,
run with `apps/web` as the working directory so the pinned engines resolve. They
were deleted after use. They were not added to the test suites, because a
throwaway measurement is not a regression test and neither belongs in a gate.
