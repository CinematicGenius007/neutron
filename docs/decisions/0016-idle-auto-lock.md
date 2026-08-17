# ADR 0016 — Idle auto-lock and unlocked-session lifetime

- Status: Proposed
- Date: 2026-08-15
- Owners: `/root`
- Supersedes:
- Superseded by:

## Context

`docs/SECURITY_MODEL.md` lists "short unlock lifetime" among the controls for a
compromised unlocked client. No such control exists. An unlocked vault stays
unlocked until the tab closes or the person presses **Lock now**. The gap
between the stated model and the shipped code is the largest one in Stage 2.

While unlocked, the vault worker holds the account root key, the vault key, and
transiently derived item keys. ADR 0003 already records that JavaScript cannot
guarantee erasure of immutable strings, so "lock" means: drop every reference
Neutron owns, zeroize every byte buffer it owns, and stop being able to answer.
It does not mean the process memory is provably clean.

Three properties make the naive implementation wrong:

1. A window-side `setTimeout` is the weakest possible place for a security
   control. Background tabs are throttled, frozen, or discarded, and the timer
   may simply not fire. A countdown that can be starved is not a deadline.
2. Background revalidation already exists. `TotpCodeDisplay` recomputes on
   `focus`, on `visibilitychange`, and on a freshness watchdog. If any worker
   traffic counted as activity, an open TOTP item would hold a vault unlocked
   forever.
3. `Date.now()` is attacker- and user-adjustable and moves backward across
   suspend, timezone changes, and NTP correction. Elapsed time measured by
   subtracting wall clocks is not trustworthy.

A time limit also engages
[WCAG 2.2 SC 2.2.1 Timing Adjustable](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable).
That criterion explicitly contemplates limits set for security reasons and is
satisfied when the user is warned, given at least 20 seconds to extend with a
simple action, and allowed to extend at least ten times.

## Decision

Introduce a worker-owned, deadline-evaluated unlocked-session lifetime with two
independent limits. Both are enforced in the vault worker. The window may
request an extension; it may never grant one, compute a deadline, or decide that
a session is still valid.

### Two limits

```text
idleDeadline     = lastQualifyingActivity + idleLimit
absoluteDeadline = unlockedAt             + absoluteLimit
sessionDeadline  = min(idleDeadline, absoluteDeadline)
```

Version-one constants, compiled in and not configurable:

```text
idleLimit      =  5 minutes
absoluteLimit  =  8 hours
warningLead    = 30 seconds
extendCooldown = 15 seconds
```

The idle limit sits between
[1Password's 10-minute system-idle default](https://support.1password.com/auto-lock/)
and a stricter reading of the same control, and below
[Bitwarden's 15-minute default](https://bitwarden.com/help/vault-timeout/).
These are product defaults chosen against comparable products. They are not
derived from a security proof, and this ADR does not claim they are.

The absolute limit has no equivalent in either product and exists because an
attacker who can synthesise activity can otherwise hold a session open
indefinitely.

### Deadlines are evaluated, not counted down

Elapsed time is measured with the worker's monotonic `performance.now()`, never
by subtracting wall clocks. The worker additionally records `Date.now()` at
unlock; if wall-clock movement and monotonic movement disagree by more than 60
seconds in either direction, the worker locks immediately and reports the
ordinary `locked` failure. A clock that jumps is treated as suspicious rather
than corrected.

The session deadline is checked at three points, in this order of authority:

1. **On every worker operation, before any other work.** An operation that
   arrives at or after the deadline performs no vault work and fails closed with
   the existing opaque `locked` code. This is the binding check; the timer below
   is an optimisation, not the control.
2. **On a coarse worker timer**, so that an idle tab locks without waiting for
   the next operation. The timer may be throttled or may not fire at all. That
   is tolerated precisely because check 1 is authoritative.
3. **On the window regaining focus or visibility**, which sends one
   `session-status` request. A tab that was frozen for an hour therefore locks
   on return rather than resuming an expired session.

### What counts as activity

Only an explicit `extend-session` request, sent by the window in direct response
to a real user interaction inside the application — `keydown`, `pointerdown`, or
application focus. The window sends at most one such request per
`extendCooldown`. Nothing else extends a session:

- TOTP recomputation, freshness watchdogs, and visibility revalidation do not.
- Page loads, list pagination, and item decryption do not, because they may be
  driven by retained timers rather than by a person.
- No worker-internal event extends a session.

An extension sets `lastQualifyingActivity`. It never moves `absoluteDeadline`.

### Warning and extension

At `sessionDeadline - warningLead` the worker reports the pending lock in its
`session-status` response. The window then shows a warning naming the remaining
time and offering one control that sends `extend-session`. The 30-second lead
exceeds SC 2.2.1's 20-second floor, and extension is available on every warning
until the absolute ceiling, satisfying the "at least ten times" condition for
every idle limit shorter than 48 minutes.

The warning is an ordinary in-page region, not a modal dialog, and never steals
focus from an open editor. Reaching the absolute ceiling warns identically but
the extend control is absent, because no extension is possible.

### What locking does

Auto-lock invokes exactly the existing manual lock path. There must remain one
lock implementation:

- The worker zeroizes every byte buffer it owns, drops the ARK, vault key, and
  any cached item keys, and refuses all subsequent operations.
- The window resets every state field that manual lock resets today, including
  the open editor draft, revealed secrets, and loaded summaries.
- **An unsaved draft is discarded, never persisted.** Persisting a draft to
  survive a lock would write plaintext to storage, which is prohibited.
- The window announces the lock through the existing status region so the
  transition is not silent for a screen-reader user.

## Alternatives considered

**Window-owned `setTimeout`.** Rejected. It places a security control in the
layer that holds no keys and cannot enforce anything, and browsers throttle,
freeze, or discard background timers. A starved countdown fails open.

**Locking on `blur` or `visibilitychange`.** Rejected as the primary trigger. It
fires on devtools focus, OS window switching, and notification overlays, and
would make ordinary use hostile. Visibility restoration is used only to *check*
an already-expired deadline.

**A configurable timeout stored as a preference.** Rejected for version one. A
persisted UI preference is its own decision, and a stored timeout is also a
stored assertion about how the vault is used. Constants first; configurability
is a later ADR if evidence warrants it.

**Service-worker-driven timing.** Rejected. No service worker exists, and
`apps/web/scripts/verify-build.mjs` would fail the build if one were emitted.
Adding one is a delivery-trust change under ADR 0008 and cannot be smuggled in
through a session-lifetime decision.

**`Date.now()` deltas.** Rejected. Backward clock movement would silently extend
a session.

**Biometric or passkey quick-unlock after auto-lock.** Out of scope. It belongs
with ADR 0002's authentication work, not here.

## Security and privacy consequences

- **Improves:** bounds the window in which a walked-up-to or backgrounded device
  exposes plaintext, which is the residual risk named for "Lost locked device"
  and partially for "Compromised unlocked client".
- **Does not improve:** an attacker who already has code execution in the origin
  or the machine. Auto-lock is a limit on exposure duration, not a defence
  against a compromised client. `SECURITY_MODEL.md` must not be edited to imply
  otherwise.
- **No new persisted data.** No timestamp, deadline, preference, or activity
  record is written to IndexedDB, local storage, session storage, Cache Storage,
  history state, or a URL.
- **No new transmitted data.** There is no server.
- **New observable:** a coarse worker timer produces periodic wakeups. It
  reveals nothing about vault contents.
- **Unknown:** whether zeroization is effective against a memory-dump adversary.
  It is not, and this ADR claims no improvement there.
- **Unknown:** exact browser behaviour for worker timers in frozen or
  bfcached tabs across engines. This is why the per-operation check is the
  binding control rather than the timer.

## Operational and cost consequences

None. No dependency, service, hosted resource, or recurring cost. The internal
window/worker protocol gains operations, which is a protocol-version change
under the existing rule that window and worker artifacts must come from one
atomic build.

## Compatibility and migration

The internal vault-worker protocol moves from v2 to v3 and gains two
unlocked-only operations:

```text
operation: extend-session
input:  {}
output: { lockAtMillisRemaining, warning }

operation: session-status
input:  {}
output: { lockAtMillisRemaining, warning }
```

Neither carries a vault identifier, item identifier, absolute timestamp, or any
vault-derived value. `lockAtMillisRemaining` is a bounded nonnegative integer
duration, not a clock reading. Mixed v2/v3 pairings are rejected unconditionally
at the exact `protocol` field, with no compatibility shim, exactly as the v1-to-v2
change was handled.

No persisted record, envelope, crypto format, or on-disk structure changes. No
migration or rollback of stored data is required; rolling back is a code
rollback.

## Verification

Required before this ADR is accepted:

- Confirm, per supported engine, whether a dedicated worker's timers fire in a
  fully backgrounded tab. **Attempted 2026-08-15; the question remains open.**
  A driver-fronted second page did not make the first page hidden under headless
  automation (`visibilityState` stayed `visible` in all three engines), so that
  run measured nothing. A Chromium-only CDP `Page.setWebLifecycleState: frozen`
  run did produce a real result — 23 of 24 worker ticks carried timestamps
  predating the thaw, so the worker kept running through that freeze — but this
  is headless Chromium under a synthetic freeze, background throttling is
  commonly disabled in headless mode, and Playwright exposes no equivalent
  control for Firefox or WebKit. It is weak positive evidence for one engine and
  no evidence for real-world backgrounding, tab discard, or bfcache eviction.
  Details in
  `docs/coordination/reviews/2026-08-15-adr-preacceptance-experiments.md`.

  This unresolved result **supports** the decision rather than blocking it: it is
  precisely because timer behaviour cannot be established across engines that the
  per-operation deadline check, not the timer, is the binding control. A reviewer
  should treat the timer as unreliable by default.

Required before the implementing task closes:

- Deterministic unit tests with an injected monotonic clock for: deadline
  arithmetic, `min` of the two limits, extension never exceeding the absolute
  ceiling, cooldown rejection, and warning-threshold boundaries.
- A unit test proving an operation submitted at exactly the deadline fails
  closed, and that it performs no repository read.
- A unit test proving a 61-second wall-clock/monotonic divergence locks, in both
  directions.
- A browser test proving an open TOTP item does **not** extend the session.
- Browser tests for warn-then-extend, warn-then-lock, and lock-on-return after a
  simulated freeze.
- A browser test proving auto-lock clears an open dirty editor draft and
  revealed secrets, and announces the transition.
- An exact-CSP production assertion that the existing plaintext sentinel scan
  finds nothing after an auto-lock, matching the existing post-manual-lock scan.
- Confirmation that no storage key, IndexedDB record, or history entry is
  created or modified by any session operation.
