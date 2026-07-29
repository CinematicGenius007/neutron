# ADR 0013 — RFC 6238 TOTP computation policy

- Status: Accepted
- Date: 2026-07-29
- Owners: `/root`
- Supersedes:
- Superseded by:

## Context

Neutron already stores canonical TOTP items containing an encrypted Base32
secret, algorithm, digit width, and period. Stage 2 requires
[RFC 6238](https://www.rfc-editor.org/rfc/rfc6238) output,
but no accepted decision selects the HMAC implementation, decoding policy,
clock semantics, or worker protocol. The existing `CryptoProvider` deliberately
does not expose SHA-1 or SHA-512 HMAC, and broadening the vault-crypto API for a
single item utility would enlarge a sensitive surface.

The seed must remain encrypted at rest and must not be sent from the window to a
calculation API. Computed codes are short-lived plaintext credentials and must
follow the existing lock and leakage rules.

## Decision

Implement TOTP as one narrowly scoped application-local worker utility using
worker-owned Web Crypto HMAC. Use `SubtleCrypto.importKey` with a raw,
non-extractable HMAC key and `sign` permission only. Map persisted algorithms
exactly:

```text
SHA1   -> SHA-1
SHA256 -> SHA-256
SHA512 -> SHA-512
```

This is an explicit exception limited to RFC 6238 item computation. It does not
change or supersede ADR 0003 for vault envelopes, key derivation, or randomness;
it adds no generic HMAC operation, dependency, or `packages/crypto` API.

Retain the existing version-one TOTP item policy: algorithms SHA1, SHA256, and
SHA512; 6 or 8 decimal digits; and integer periods from 15 through 300 seconds.
Use RFC 6238 with `T0 = 0` and the worker's production `Date.now()` clock:

```text
unixSeconds = floor(milliseconds / 1000)
counter = floor(unixSeconds / period)
```

The clock value must be a nonnegative safe-integer millisecond count. Encode the
counter as an unsigned 64-bit big-endian value. Apply
[RFC 4226](https://www.rfc-editor.org/rfc/rfc4226) dynamic
truncation to the final HMAC digest byte's low nibble, extract the 31-bit value,
reduce modulo `10 ** digits`, and preserve leading zeroes. At an exact period
boundary the new counter is active. A result's start is inclusive and its expiry
is exclusive.

Neutron performs no clock correction, adjacent-step validation, or network time
synchronization. Backward or forward local-clock movement causes recomputation,
and the UI must advise the user to check device time when a code appears wrong.
Browser scheduling is best effort. The client revalidates on result receipt,
the scheduled expiry, focus or visibility restoration, and target/revision
changes, and never intentionally retains a code it knows is expired.

The persisted Base32 representation remains
[RFC 4648](https://www.rfc-editor.org/rfc/rfc4648) uppercase `A-Z2-7`,
unpadded, 16 through 512 characters, with canonical unused trailing bits.
Lowercase, whitespace, separators, padding, invalid remainder lengths, nonzero
unused bits, and malformed decoded lengths fail closed. Decode into an owned
byte buffer. Clear the decoded secret, counter bytes, and returned HMAC bytes
best-effort on every path. Immutable source strings, `CryptoKey` internal copies,
and browser/runtime copies cannot be proven erased.

The internal vault-worker protocol gains one named, unlocked-only operation:

```text
operation: compute-totp
input: { vaultId, itemId, generation, keyVersion }
```

The window sends no seed, algorithm, period, digit width, timestamp, counter, or
HMAC input, and the operation never returns a seed. The worker point-reads the
exact record, rejects missing, corrupt, non-TOTP, or revisions already stale at
that point before HMAC use, and returns:

```text
{
  kind: "totp-code",
  itemId,
  generation,
  keyVersion,
  algorithm,
  digits,
  period,
  code,
  validFromUnixSeconds,
  expiresAtUnixSeconds
}
```

Validity boundaries are canonical unsigned-64 decimal strings. The standalone
response parser validates exact own-data shape, global algorithm/digit/period
bounds, exact decimal code width, interval arithmetic, aligned start, and expiry
exactly one period later. It cannot establish current freshness. The worker
validates its local result against the decrypted item and requested revision
before posting. The broker captures an immutable expectation from the selected
record before sending and validates the exact item ID, generation, key version,
algorithm, digits, and period plus request, operation, and session epoch. Before
resolving, the broker also uses local `Date.now()` to require receipt within the
inclusive-start, exclusive-expiry interval. The UI repeats that freshness check
before rendering and after focus or visibility restoration.

A different client may commit a replacement immediately after the worker's
point read. The code remains explicitly bound to the requested revision, but an
old-revision code can then remain displayed until its exclusive expiry. The next
refresh must clear it and fail with `conflict`; no transaction currently holds
revision freshness through HMAC and display.

The operation is queued like other non-lock work. Lock retains priority,
advances the epoch, rejects pending window work, clears displayed item/code
plaintext, and terminates the worker. Switching item, opening an editor or
create flow, receiving a newer calculation, revision change, error, expiry, or
lock invalidates older results. Only one calculation is pending per displayed
target. Codes are never persisted or saved into the item.

## Alternatives considered

- Expand `CryptoProvider` with generic HMAC. Rejected because TOTP would enlarge
  the versioned vault-crypto surface and require unrelated provider/vector work.
- Use an additional JavaScript HMAC dependency. Rejected because supported
  browsers already provide the required non-extractable worker-local primitive.
- Compute in the window or send the seed/time from it. Rejected because the
  worker already owns decryption authority and its clock must define validity.
- Send only a seed and policy from the worker to the window. Rejected because it
  unnecessarily extends the seed's plaintext lifetime and duplicates HMAC code.
- Accept `otpauth://` URIs or padded/lowercase Base32. Deferred to a separately
  reviewed import task; persisted v1 items remain strict and canonical.

## Security and privacy consequences

For `compute-totp`, the TOTP seed is decrypted and consumed only inside the
already trusted vault worker; the request and result neither accept nor return
it. This does not remove or narrow the existing reviewed `get-item` behavior,
which already returns the complete TOTP item, including `secretBase32`, to the
active detail/editor window. Reducing that broader point-read exposure is
separate future work. The code, item revision, algorithm, digit width, period,
and validity boundaries cross to the active window. The latter fields are
already item or short-lived display state; no field is sent to a server. A
malicious or compromised web client remains able to read active plaintext under
the existing web-delivery limitation.

Neutron must not place the seed or code in URLs, requests, logs, errors, history
state, telemetry, static artifacts, screenshots it captures, or
Neutron-controlled origin-visible persistence. Codes may appear only in the
active rendered view and normal JavaScript memory until invalidated or locked.
Best-effort buffer clearing cannot erase strings or implementation-internal
`CryptoKey` and HMAC copies.

The worker trusts the local device clock. Incorrect device time produces an
incorrect code without weakening encrypted storage. Timing, algorithm, period,
digits, and active-item behavior are visible to the already trusted active
window but add no server metadata.

## Operational and cost consequences

The change uses standards-based
[Web Crypto](https://www.w3.org/TR/webcrypto/) already required by the supported
browser baseline. It adds no dependency, hosted service, network request, or
recurring cost. Failure of HMAC SHA-1, SHA-256, or SHA-512 in the supported
real-browser matrix blocks implementation rather than silently reducing
algorithm support. HMAC-SHA-1 is authorized only for RFC 6238 interoperability,
not as a generic SHA-1 primitive.

## Compatibility and migration

There is no item-schema, encrypted-envelope, IndexedDB, server, network, or
package-protocol format change. The internal window/worker v1 union grows by one
named operation and result; both sides ship atomically in one static build.
Rollback removes the display and operation without changing stored data.

## Verification

Acceptance requires:

- all 18 RFC 6238 Appendix B vectors using the corrected algorithm-specific
  20-, 32-, and 64-byte secrets identified by verified
  [Erratum 2866](https://www.rfc-editor.org/errata/eid2866), plus the ten RFC
  4226 Appendix D six-digit SHA-1 values through equivalent counters;
- RFC 4648 decode vectors and exhaustive canonical remainder/trailing-bit
  rejection; before/at/after boundaries, leading zeroes, periods 15 and 300,
  invalid clocks, counter encoding, Web Crypto import/sign failures, and owned
  buffer clearing on success and failure;
- hostile request/response prototypes, accessors, extra and cross-operation
  fields, forged algorithms/digits/periods/codes/boundaries, stale revisions,
  wrong item type, mutation, and request/operation/epoch/post-lock attacks;
- real Web Crypto HMAC vector probes for SHA-1, SHA-256, and SHA-512 in the
  pinned Chromium, Firefox, and WebKit automation matrix; actual Safari/iOS
  validation remains required by the release gate, and inability to run any
  automated engine blocks this implementation checkpoint;
- real-worker browser tests for calculation, expiry refresh, target switching,
  focus/visibility revalidation, redacted errors, immediate lock clearing, fresh
  worker unlock, keyboard use, and 320-pixel layout; and
- an emitted exact-CSP flow that computes through the built worker, independently
  verifies the output using Node HMAC, and proves seed/code absence from network,
  URLs, logs, static artifacts, Cache Storage, local/session storage, history
  state, and raw IndexedDB, plus DOM/runtime absence after lock.

Clipboard/copy actions, QR handling, `otpauth://` import, search, passphrases,
clock synchronization, sync, server work, service-worker delivery, deployment,
and item/storage/provider schema changes remain out of scope.

Errors are stable and redacted: missing item is `item-not-found`; wrong item type
is `invalid-item-reference`; a tuple stale at point read is `conflict`;
authenticated item failure uses the existing corruption code; invalid clock,
Base32/HMAC, or Web Crypto failure is `internal`. No failure echoes seed or code
material.
