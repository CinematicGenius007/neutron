# ADR 0015 — Passphrase policy audit corrections

- Status: Proposed
- Date: 2026-08-01
- Owners: `/root`
- Supersedes: ADR 0014 when accepted
- Superseded by:

## Context

ADR 0014 correctly pins the EFF wordlist, entropy floor, uniform 16-bit rejection
sampler, worker boundary, validation layers, plaintext lifetime, licensing basis,
and attribution obligation. Task 0023 has not started, so no product or persisted
state implements that decision yet.

An independent takeover audit found one security gap and several precision gaps
before implementation. ADR 0014 forbids retaining selected indices because they
reconstruct the passphrase while evading exact-string leakage scans, but it does
not forbid retaining the selected words themselves. A selected-word array or
tuple has the same reconstructive authority and the same scan blind spot.

The audit also found that Task 0023 reduced the binding attribution requirement
to a source header even though ADR 0014 proves headers do not survive this build,
and that two quantitative statements were slightly inaccurate. This successor
records corrections rather than rewriting an accepted decision's history.

## Decision

ADR 0014 remains binding except where this successor is more specific or corrects
it. On acceptance, this ADR supersedes ADR 0014 as the governing passphrase
policy and both records remain readable.

### Secret-equivalent intermediate state

The generator may retain only the output string or output prefix it is currently
constructing and the single current numeric draw/index needed to append one word.
After accepting a draw, it appends that word immediately to the output—prefixing
`.` for every word after the first—then overwrites the numeric variable before
examining another pair.

It must never create or retain an array, tuple, set, map, typed array, object, or
other collection of selected indices **or selected words**. It must not first
select all words and join them later. Either collection reconstructs the full
secret while containing no exact generated-passphrase sentinel. Incremental
string construction still creates immutable string prefixes that JavaScript
cannot erase; those prefixes are secret plaintext and inherit ADR 0014's ban on
logs, errors, URLs, network, persistence, telemetry, and screenshots. No prefix
or partial candidate may be returned on failure.

Deterministic tests must inject a fixed byte stream and prove the exact final
passphrase implied by disjoint pairs. Review must inspect the generator source
to confirm there is no selected-index or selected-word collection; a runtime
leakage scan alone cannot prove that negative.

### Corrected quantitative claims

At the seven-word minimum the byte budget is 224 bytes, or 112 disjoint pairs.
With pair acceptance probability `62208 / 65536`, exhaustion means fewer than
seven accepted pairs. Its probability is approximately
`1.1191703579 * 10 ** -128`. ADR 0014's statement that it is below
`10 ** -128` is slightly false; the corrected value remains operationally
negligible and does not justify changing the budget.

The verified mean EFF word length is approximately 6.99177 characters. After the
first word, each additional word adds one separator too, so its expected output
cost is approximately 7.99177 characters. Moving from the eight-word default to
ten words adds approximately 15.98 characters, not fourteen. The entropy values,
7-through-24 bounds, eight-word default, and maximum 239-character bound remain
unchanged.

### Attribution contract and timing language

Before Task 0023 ships the list, requirements must use binding future tense; no
wordlist module, exported attribution string, rendered notice, or production
assertion exists yet.

The implementation must export and render one complete notice containing:

- Electronic Frontier Foundation as creator;
- `CC-BY-4.0` and `https://creativecommons.org/licenses/by/4.0/`;
- `https://www.eff.org/files/2016/07/18/eff_large_wordlist.txt`;
- retrieval date 2026-08-01;
- that Neutron discarded dice indices and rejoined words with U+000A; and
- a reference to the CC BY disclaimer of warranties.

A source header is optional and never satisfies this requirement. The emitted
production gate must prove the complete notice is present in a checked-in notice
served with the application or in emitted application code and that the user-
visible generator surface renders the attribution. It must also retain ADR
0014's independent canonical-digest check against the built worker.

## Alternatives considered

- **Teach leakage tests to search selected-word tuples.** Rejected because the
  test would need to retain the same secret-equivalent tuple and could still miss
  a differently represented collection.
- **Permit a temporary word array and clear it.** Rejected because JavaScript
  words are immutable strings, collection clearing cannot prove erasure, and no
  collection is needed for incremental construction.
- **Edit ADR 0014 in place.** Rejected because accepted ADRs are historical
  records; a successor makes the audit and correction visible.
- **Change the byte budget to make the probability statement true.** Rejected
  because the existing probability is already negligible and the statement—not
  the reviewed bounded design—is wrong.

## Security and privacy consequences

The selected-word blind spot is closed structurally before code exists. The
remaining immutable-prefix lifetime is disclosed rather than called erased. No
cryptographic primitive, entropy floor, random distribution, worker authority,
metadata exposure, persistence rule, or server boundary changes.

## Operational and cost consequences

No dependency, hosted service, runtime fetch, deployment resource, or recurring
cost is added. Incremental concatenation is bounded to 24 words.

## Compatibility and migration

No implementation or stored passphrase format exists yet, so there is no data,
wire, envelope, storage, or protocol migration. Task 0023 must implement ADR
0014 plus these corrections atomically. Rollback removes an unimplemented policy
record only until that task begins.

## Verification

Before acceptance, a separate reviewer must recompute the probability and mean
length, attempt to construct a compliant implementation that retains a secret-
equivalent collection, verify every attribution field against ADR 0014 and the
official license conditions, and confirm Task 0023 cannot become ready before
Task 0026 and this ADR are complete.

Task 0023 verification must additionally prove the exact fixed-stream output,
inspect absence of both collection classes, render and assert the complete notice
in emitted production, and retain all ADR 0014 checks not corrected here.
