# Offline recovery-kit protocol v1

This document is normative for Neutron's offline recovery-kit serialization and
confirmation ceremony. ADR 0011 records why the format was selected. The ARK
wrapper itself remains governed by the v1 crypto-envelope protocol.

## Canonical serialization

Let `accountId` be the nonzero 16-byte opaque account identifier and
`recoverySecret` be the independently generated 32-byte recovery authority.

```text
payload = 0x01 || accountId || recoverySecret
data    = convertbits(payload, 8, 5, pad=true)
text    = bech32m_encode(hrp="ntrk", data)
```

The payload is exactly 49 octets. Conversion produces exactly 79 five-bit data
symbols, including three zero padding bits. The six-symbol Bech32m checksum makes
the complete lowercase string exactly 90 ASCII characters.

Bech32m uses the BIP 350 alphabet
`qpzry9x8gf2tvdw0s3jn54khce6mua7l`, HRP expansion and polymod generator, with
final constant `0x2bc830a3`. It is not Bitcoin's witness-address application:
Neutron uses only the generic checksummed encoding and its own fixed HRP and
payload.

## Strict decoder

Before allocating proportional to input, require a primitive string of exactly
90 UTF-16 code units and reject any code unit outside lowercase ASCII. Then:

1. Require the only separator at offset 4 and the exact prefix `ntrk1`.
2. Map the remaining 85 characters through the Bech32m alphabet.
3. Require the polymod result to equal `0x2bc830a3`; Bech32's constant is invalid.
4. Separate 79 data symbols from the final six checksum symbols.
5. Convert 5 to 8 bits with `pad=false`; reject excess padding or nonzero
   discarded bits.
6. Require exactly 49 octets, version `0x01`, and a nonzero 16-byte account ID.
7. Return owned copies of `accountId` and `recoverySecret`.

No whitespace, grouping delimiter, uppercase or mixed case, Unicode confusable,
extra separator, alternate HRP, extra field, or trailing byte is canonical.
Decoders must not trim, normalize, case-fold, guess, or correct an input.

Every decoder rejection exposed outside the codec is `invalid-recovery-kit`.
Internal tests may classify causes, but production messages and logs must not
echo the text or decoded bytes.

## Enrollment confirmation

Initialization stays uncommitted while the user exports the canonical kit. A
confirmation submission must be the complete kit text, decoded by the strict
parser. The implementation compares version and account binding and compares
all secret bytes without early exit. Only an exact match permits one atomic
repository initialization containing the password ARK wrapper, recovery ARK
wrapper, and initial ARK child wrappers.

Failed, cancelled, concurrent, or repeated confirmation persists nothing and
invalidates or retains the pending ceremony according to its explicit state
machine; it must never turn a UI boolean into proof that recovery material was
saved. Pending recovery material must never be persisted.

## Metadata and custody

The text exposes the `ntrk` marker, v1 fixed length, and opaque account ID. It
also contains the complete recovery secret and must be treated as sensitive.
It must not appear in logs, analytics, crash reports, URLs, browser history,
clipboard telemetry, screenshots, server requests, or test artifacts containing
real user material. Synthetic deterministic vectors are permitted.

Printing or QR encoding must preserve the exact canonical text. Applications
may add visual grouping around it, but copied/scanned data passed to the decoder
must be the unmodified 90-character value; grouping is never part of the wire
format.

## Compatibility

V1 has no extension bytes. Unknown versions and lengths fail closed. A future
version requires a successor ADR and protocol document with explicit coexistence
and migration behavior. A replacement recovery secret creates a new kit and
wrapper authority; retaining the old active wrapper would retain the old kit's
decrypting power.

## Required vectors

Implementations must pass BIP 350's generic valid and invalid Bech32m vectors
plus ADR 0011's Neutron vectors. Adversarial cases must cover every text length
boundary, checksum/data mutation, Bech32 constant, case variant, forbidden
character, separator/HRP change, padding failure, unknown version, zero account
ID, caller mutation, and aliased/SharedArrayBuffer inputs where applicable.

References: [BIP 173](https://bips.dev/173/) defines the inherited generic
Bech32 alphabet, length, case, conversion, and checksum rules; [BIP
350](https://bips.dev/350/) changes the checksum constant and analyzes Bech32m.
