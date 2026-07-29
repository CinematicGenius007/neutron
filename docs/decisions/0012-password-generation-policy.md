# ADR 0012 — Password generation policy

- Status: Accepted
- Date: 2026-07-29
- Owners: `/root`
- Supersedes:
- Superseded by:

## Context

Neutron needs to generate login-item passwords without moving generic random
bytes into the browser window or weakening the dedicated vault-worker boundary.
ADR 0003 selects a reviewed CSPRNG provider, and ADR 0008 permits the active
window to hold the item plaintext it is editing, but neither decision defines a
password alphabet, entropy floor, randomness mapping, or generator protocol.
Those choices must be stable, testable, and independently reviewable.

This decision covers random-character passwords only. A passphrase generator
would require a separately reviewed wordlist and policy.

## Decision

The dedicated vault worker will expose one named, unlocked-only
`generate-password` operation. It will use only the existing worker-owned
`CryptoProvider.randomBytes` implementation. It will not expose a generic
random-byte operation, accept caller-provided randomness, or use `Math.random`.

The version-one options are an exact own-data object:

```text
{ length, lowercase, uppercase, digits, symbols }
```

`length` is an integer from 16 through 128. The four selection values are
literal booleans, and at least one must be true. Enabled sets are concatenated
in this fixed order; every character is unique:

```text
lowercase: abcdefghijklmnopqrstuvwxyz
uppercase: ABCDEFGHIJKLMNOPQRSTUVWXYZ
digits:    0123456789
symbols:   !@#$%^&*()-_=+[]{};:,.?
```

The selected alphabet and length must provide at least 80 bits of ideal uniform
search space. Implementations will check
`alphabetSize ** length >= 2 ** 80` with bounded integer arithmetic. They will
not use rounded floating-point entropy text as the authority. Consequently,
digits alone require at least 25 characters; either 26-character letter set or
the 23-character symbol set alone requires at least 18; the supported
multi-set combinations meet the floor at 16. The UI default is length 20 with
all four sets enabled, an 85-character alphabet and approximately 128.2 bits of
ideal search space.

Selection means that a class is allowed, not that every selected class must
occur. Each output character is independent and uniform over the concatenated
alphabet. For an alphabet of size `n`, generation uses byte rejection sampling:

```text
cutoff = floor(256 / n) * n
discard byte values greater than or equal to cutoff
map each accepted byte to alphabet[byte % n]
```

The worker requests positive bounded chunks and consumes no more than
`length * 16` random bytes. Accepted ASCII bytes accumulate in an owned
`Uint8Array(length)`; the implementation constructs an immutable string only
after the output buffer is complete. Every provider return must be a
`Uint8Array` of exactly the requested positive length. Overlong, short, or
otherwise malformed provider output, and failure to complete inside the byte
budget, fail closed without consuming or returning a partial candidate. Random
chunks (including malformed owned buffers) and the output byte buffer are cleared
best-effort in `finally`, including failure paths.

The internal vault-worker protocol gains the exact operation
`generate-password` with the options object as its input. Its only successful
result is the exact object `{ kind: "generated-password", password }`. The
request parser validates prototypes, own data properties, option bounds, and
the entropy policy. The standalone response parser validates the exact result
shape, the global 16-through-128 length bound, and ASCII membership in the
global 85-character union. The window broker captures an immutable expectation
before sending and independently validates the exact requested length and
alphabet plus operation, request ID, and session epoch before resolving. The
worker sender also validates its local result against its parsed request.
Invalid options are rejected before the provider is used. Provider and
exhaustion failures collapse to an existing stable internal failure and never
echo random bytes or a candidate password.

Generation is available only while a vault session is unlocked. It is queued
like other non-lock operations. Lock retains priority: it advances the session
epoch, rejects pending window work, clears active plaintext UI state, and
terminates the worker. Old generator results must not overwrite manual edits,
a new request, a different editor target or item type, cancellation, or lock.
Generation fills only the active login editor and does not persist until the
user explicitly saves the item.

## Alternatives considered

- Modulo-map every random byte. Rejected because alphabets whose size does not
  divide 256 would be biased.
- Force at least one character from each enabled class. Rejected because common
  placement/shuffle approaches complicate uniformity and the toggle can be
  expressed honestly as an allowed-character policy.
- Expose generic random bytes to the window. Rejected because it broadens a
  sensitive interface without a product need.
- Generate in the window with Web Crypto. Rejected because the existing worker
  already owns the reviewed provider and sensitive operations.
- Add a passphrase mode. Deferred until a wordlist, normalization policy,
  provenance, update process, and entropy treatment receive a separate ADR.

## Security and privacy consequences

The generator depends on the reviewed provider CSPRNG and removes modulo bias.
The 80-bit floor prevents weak but syntactically valid configurations. Bounded
consumption makes a faulty or adversarial provider fail closed instead of
looping forever. The distribution does not guarantee representation from each
enabled class, and the UI must not claim that it does.

The generated password crosses from worker to window as plaintext because it is
needed by the active login editor. It may exist in that form control and normal
JavaScript memory until the editor is cleared or the vault locks. Neutron must
not place it in URLs, network requests, logs, errors, history state,
Neutron-controlled origin-visible persistence (IndexedDB, Cache Storage,
localStorage, or sessionStorage), static artifacts, telemetry, or screenshots
captured by Neutron. After explicit Save it may persist only inside the existing
encrypted item envelope. This decision adds no server-visible metadata and
authorizes no server request.

The remaining unknown is the practical lifetime of copies made by browser and
JavaScript runtimes; best-effort clearing cannot prove erasure of immutable
strings or engine-internal copies. Browser, operating-system, password-manager,
extension, and user screenshot behavior is part of the existing client TCB or
residual risk and cannot be audited or erased by Neutron. Autocomplete hints do
not justify a claim that a browser will honor them.

## Operational and cost consequences

The change uses the existing provider, worker, static web build, and browser
tests. It adds no service, dependency, hosted resource, or recurring cost.

## Compatibility and migration

There is no encrypted-envelope, IndexedDB, server, network, or package-protocol
format change. The internal window/worker v1 operation union grows by one named
operation; the window and worker ship atomically in the same static build, so
mixed-version operation is unsupported and no persisted migration is required.
Rollback removes the UI and operation without touching stored vault data.

## Verification

Acceptance requires:

- deterministic tests for every nonempty set combination, all input and entropy
  boundaries, invalid prototypes/fields, and zero provider calls on invalid input;
- exhaustive byte-domain tests proving equal accepted residue counts for every
  reachable alphabet size and rejection of cutoff bytes; instrumentation must
  prove every provider request is positive and bounded, aggregate requested and
  consumed bytes never exceed `length * 16`, and every return is a `Uint8Array`
  of exactly the requested length; overlong, short, or otherwise malformed
  returns must fail closed without consumption or a candidate, exhaustion must
  return no partial candidate, and every returned owned random or output byte
  buffer must be cleared on success and failure;
- adversarial worker protocol and client tests for forged/cross-operation
  responses, wrong output length or alphabet, locked/pending states, mutation,
  epochs, and late results;
- real-browser component and emitted-production tests covering defaults,
  accessible controls, current-editor-only insertion, invalidation by manual
  edits/new requests/target changes/cancel/lock, a fresh worker after lock, and
  exact-CSP operation; and
- leakage tests proving the generated value is absent from Neutron-controlled
  origin-visible persistence before Save, encrypted after Save, absent from
  network/log/static surfaces, and removed from active DOM and origin-visible
  application storage surfaces after cancel, delete, or lock.

Passphrases, TOTP computation, search, clipboard, strength scoring, password
history, recovery/master-password generation, service-worker delivery, sync,
server work, and deployment remain out of scope.
