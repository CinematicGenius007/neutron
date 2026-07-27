# ADR 0011 — Offline recovery-kit format

- Status: Accepted
- Date: 2026-07-28
- Owners: Neutron maintainers
- Supersedes: —
- Superseded by: —

## Context

ADRs 0002 and 0010 require a separate 32-byte recovery secret that can unwrap
the ARK, while the master plan says the emergency kit also carries a format
version, account identifier, and checksum. They do not define a portable text
format or what constitutes confirmation. Enrollment code cannot invent those
recovery-critical compatibility semantics.

The format must be offline, dependency-light, resistant to common transcription
errors, unambiguous across implementations, and bounded before allocation. A
checksum detects accidental corruption; it is not authentication and adds no
entropy.

## Decision

Version 1 recovery kits use Bech32m's checksummed base-32 construction from BIP
350, specialized as follows:

- Human-readable part: lowercase ASCII `ntrk`.
- Binary payload: `0x01 || accountId[16] || recoverySecret[32]`.
- Data conversion: payload octets converted from 8 to 5 bits with zero padding,
  then the six Bech32m checksum symbols using constant `0x2bc830a3`.
- Canonical text: lowercase only, exactly 90 ASCII characters, with no spaces,
  hyphens, line breaks, Unicode substitutions, or surrounding whitespace.
- Decoder: require the exact HRP, Bech32m rather than Bech32, canonical alphabet,
  valid checksum, exactly 79 data symbols, valid zero padding, exactly 49
  decoded octets, version `0x01`, and a nonzero account identifier. Unknown
  versions fail closed before any recovery or persistence operation.

The v1 payload has no extension fields. A future format requires a successor
ADR, a new leading version, and explicit migration. It must not reinterpret a
v1 payload or weaken the v1 parser to accommodate extra bytes.

Enrollment exposes only the canonical text representation, never a second raw
secret representation. Confirmation means parsing a user-supplied kit through
the canonical decoder and comparing its version, account identifier, and full
32-byte secret with the still-uncommitted enrollment ceremony. The comparison
must not short-circuit on secret bytes. A boolean asserted by the UI is not
confirmation. Mismatch, parse failure, cancellation, or reuse commits nothing.

Implementations return a single public `invalid-recovery-kit` failure for bad
HRP, length, alphabet, case, checksum, padding, version, or account identifier.
Logs and telemetry must not include the input, decoded payload, checksum
position, account identifier, or a secret-derived fingerprint. User interfaces
may say that the kit is invalid but must not attempt automatic correction.

## Alternatives considered

- **Unchecksummed base64url or hexadecimal:** simpler, but weaker for manual
  transcription and does not meet the existing checksum requirement.
- **A word list:** better for dictation but adds a large audited dependency,
  locale and normalization choices, and substantially more test surface.
- **Bech32:** rejected because BIP 350 documents an insertion weakness and
  replaces it with Bech32m.
- **A variable-length TLV inside Bech32m:** rejected for v1. The chosen payload
  already reaches Bech32's 90-character limit; implicit extensibility would make
  bounds and compatibility less clear.
- **QR as the normative format:** QR is a presentation channel, not a durable
  serialization. A later UI may encode the exact canonical text in a QR code.

## Security and privacy consequences

The kit remains a full alternative decryption authority: anyone with it and the
encrypted records can recover the ARK. The checksum provides error detection,
not secrecy, authentication, brute-force resistance, or theft mitigation.
`ntrk` and the fixed length reveal that a string is a Neutron v1 recovery kit;
the payload also contains the opaque account identifier. Users must be told to
store it offline and separately from an unlocked device.

The parser is deliberately strict to prevent multiple text representations and
downgrade ambiguity. Error correction is prohibited because BIP 350 warns that
correction reduces error-detection assurance. Memory clearing remains best
effort in JavaScript and must not be described as secure erasure.

This decision does not allocate keys or labels for Task 0009's future server
recovery authentication and does not send the kit or secret to any server.

## Operational and cost consequences

Encoding and validation are local and require no hosted service. A small
auditable implementation or maintained permissive dependency is sufficient.
The exact 90-character size is acceptable for copy/paste, print, and QR, but it
leaves no in-place extension room.

## Compatibility and migration

Version 1 is immutable after acceptance. Decoders accept only the exact v1
shape and reject all other versions. Future versions use their own normative
length and migration procedure. Existing v1 kits continue to identify their
account and unwrap only the matching recovery wrapper; rotating a recovery
secret must issue a new kit and revoke the old wrapper authority atomically.

## Verification

- Reproduce BIP 350 valid/invalid Bech32m vectors in the codec test suite.
- Add Neutron vectors for fixed-byte payloads, checksum mutations, every
  forbidden character/case/length/padding/version condition, and zero account
  identifiers.
- Independently reproduce these two valid 90-character vectors:

```text
accountId = 11 repeated 16 bytes
recoverySecret = 22 repeated 32 bytes
ntrk1qyg3zyg3zyg3zyg3zyg3zyg3zygjyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygsmgwd86

accountId = 0102030405060708090a0b0c0d0e0f10
recoverySecret = a0a1a2a3a4a5a6a7a8a9aaabacadaeafb0b1b2b3b4b5b6b7b8b9babbbcbdbebf
ntrk1qyqsyqcyq5rqwzqfpg9scrgwpug2pgdz5wj2tf484z5642av4kh2lv93k2emfddkk7utnw4mhj7ma0cnxxqfc
```

- Require an independent review before changing this ADR to Accepted.

Primary construction references: [BIP 173](https://bips.dev/173/) and [BIP
350](https://bips.dev/350/) (deployed, BSD-2-Clause), including the inherited
length/alphabet/conversion rules and Bech32m's checksum constant, error analysis,
padding checks, and vectors.
