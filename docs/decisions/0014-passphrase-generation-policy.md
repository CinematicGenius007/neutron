# ADR 0014 — Passphrase generation policy

- Status: Superseded
- Date: 2026-08-01
- Owners: `/root`
- Supersedes:
- Superseded by: ADR 0015

## Context

ADR 0012 accepted a CSPRNG-backed random-character password generator and
explicitly deferred a passphrase mode until a wordlist, normalization policy,
provenance, update process, and entropy treatment received their own decision.
`docs/ROADMAP.md` lists a "password/passphrase generator" among the Stage 2
deliverables, so the deferral has to be resolved before Stage 2 can be called
complete.

A passphrase generator differs from ADR 0012 in exactly one structural way: it
depends on a bundled data asset that Neutron did not author. That asset carries
provenance, licensing, redistribution, build-size, and tamper questions that a
hard-coded 85-character alphabet does not. Everything else — worker-owned
randomness, rejection sampling, unlocked-only operation, triple-validated
protocol, lock priority, editor-only insertion, and plaintext-lifetime honesty —
should stay identical to ADR 0012 rather than becoming a second dialect.

## Decision

### Wordlist

Neutron bundles the Electronic Frontier Foundation "long" passphrase wordlist as
an immutable application asset.

```text
Upstream URL:  https://www.eff.org/files/2016/07/18/eff_large_wordlist.txt
Retrieved:     2026-08-01 over TLS
Upstream size: 108,800 bytes, 7,776 lines, LF endings, one trailing newline,
               no carriage returns
Line format:   five dice digits, one TAB, one word
SHA-256 of the retrieved bytes, computed by Neutron and not published by EFF:
  addd35536511597a02fa0a9ff1e5284677b8883b83e986e43f15a3db996b903e
```

EFF publishes no checksum or signature for this file, on either the copyright
page or the announcement post. That digest therefore establishes only that
Neutron's copy is byte-identical to what one TLS retrieval returned on the
recorded date. It does not establish upstream authenticity, and no independent
second source was consulted. This is a trust-on-first-use acceptance of a single
download, recorded as a known limitation rather than as a verified provenance
chain. From this point on the digest is tamper-evidence against accidental or
malicious edits inside the repository only.

The bundled form is derived by taking the second tab-separated field of each
line in file order and discarding the dice indices, which Neutron does not use;
the single trailing newline is discarded rather than producing an empty final
entry. The derived list is the canonical artifact and is itself digest-pinned:

```text
Words: 7,776
Canonical form: the 7,776 words joined by U+000A, with no trailing newline
Canonical size: 62,143 bytes
Canonical SHA-256:
  abae49761b88f3f1ba31ef944bea1f61b795a3cd7e1cfb7d276ed45bf77967ba
```

The list ships as a TypeScript source module compiled into the JavaScript
chunks. It must not be emitted as a separate build artifact: the production
artifact allowlist admits only `index.html`, `icon.svg`,
`manifest.webmanifest`, `.vite/manifest.json`, and hashed `assets/*.js` and
`assets/*.css`, and fetching a list at runtime is already forbidden by ADR 0008.

The following properties of the derived list are verified facts, not
assumptions. Each is asserted by a deterministic test, so tampering or an
accidental edit fails `pnpm test` rather than silently weakening generation:

- exactly 7,776 entries;
- every entry matches `^[a-z]+(?:-[a-z]+)*$`, so the list is pure ASCII
  lowercase with interior hyphens only (four entries contain a hyphen);
- entry lengths are 3 through 9 characters;
- entries are strictly increasing in JavaScript code-unit order, so membership
  may be decided by binary search and duplicates are impossible;
- no entry contains the passphrase separator;
- the canonical SHA-256 above matches the list as loaded.

Because unit tests inspect source rather than artifacts, the emitted-production
flow additionally recomputes the canonical SHA-256 from the list as loaded by the
real built vault worker and compares it against the literal digest recorded
above. A build whose emitted wordlist does not match the pinned digest fails that
gate. The Node side of that check must load the list and recompute the digest
against a literal transcribed into the test rather than importing the module the
application ships, or it is not independent.

### Licensing and attribution

Licensing is recorded rather than assumed, and its residual uncertainty is
recorded too. EFF's copyright policy at <https://www.eff.org/copyright>
(retrieved 2026-08-01) states that any and all **original** material on the EFF
website may be distributed under the Creative Commons Attribution 4.0
International license unless otherwise noted, and separately that material *not*
original to EFF may require permission from its copyright holder. The wordlist
file carries no notice of either kind, so the CC BY 4.0 conclusion depends on the
list being original EFF material. The supporting evidence is EFF's own
announcement, "Deep Dive: EFF's New Wordlists for Random Passphrases" (Joseph
Bonneau, 2016-07-19,
<https://www.eff.org/deeplinks/2016/07/new-wordlists-random-passphrases>), which
describes EFF constructing these lists. Neutron has obtained no explicit written
grant for this specific file. This is a documented legal reading, not legal
advice and not a verified grant, and Task 0008 must re-check it when open-source
governance is unblocked.

Neutron therefore redistributes the derived list under CC BY 4.0 and must carry,
in a form that survives minification, all of: attribution to the Electronic
Frontier Foundation as creator; the identifier `CC-BY-4.0`; a URI to
<https://creativecommons.org/licenses/by/4.0/>; the upstream URL and retrieval
date; an explicit statement that Neutron modified the material by discarding the
dice indices and re-joining the remaining words with U+000A; and retention of the
CC BY disclaimer of warranties.

A source-file comment header does not satisfy this. The production build strips
comments, including `@license` legal comments, from emitted JavaScript — verified
against this repository's own pipeline, in which React's upstream `@license`
banner does not survive into the emitted bundle. The obligation is therefore
satisfied by all three of:

1. a checked-in `docs/third-party-notices.md` carrying the full notice;
2. an attribution string exported from the wordlist module as a string constant
   and rendered in the application's generator surface, so the credit reaches the
   person actually using the list; and
3. the same text in project documentation.

This is compatible with the AGPL/permissive split accepted in ADR 0006 — CC BY
4.0 permits redistribution inside a copyleft-licensed work provided attribution
survives — and Task 0008 must list the asset when open-source governance is
unblocked.

Replacing, extending, filtering, or reordering the list is a new ADR, a new set
of digests, and a new review. The generator must never assemble a list at
runtime, fetch one, or accept one from the window.

### Parameters

The only version-one option is the word count. The input is an exact own-data
object with one property:

```text
{ words }
```

`words` is an integer from 7 through 24. The 7-word minimum is derived, not
chosen: ADR 0012's 80-bit ideal-search-space floor applied to this list requires
`7776 ** words >= 2 ** 80`, and implementations must check that with bounded
integer arithmetic rather than rounded floating-point entropy text. Six words
yield roughly 77.55 bits and are rejected; seven yield roughly 90.47 bits. The
24-word ceiling bounds worker work and output size; a 24-word passphrase is at
most 239 characters.

The UI default is 8 words, roughly 103.4 bits of ideal search space. The
criterion is one word of margin above the derived floor, capped by transcription
cost — a passphrase exists to be typed or read aloud by a human, and each
additional word costs about seven characters for about 12.9 bits that no
threat in this model needs. This is deliberately below ADR 0012's 20-character,
roughly 128.2-bit default, and reaching parity would require 10 words and about
14 more characters. The UI must present the random-character generator as the
default choice for machine-stored credentials and must not claim that a
passphrase is stronger than an equivalent random password.

Words are selected independently and uniformly with replacement. Repeated words
are possible and are not an error; forbidding repetition would make the entropy
claim wrong. The rendered passphrase is the selected words joined by a single
`.` (U+002E, ASCII full stop). The separator is fixed, not configurable, and was
chosen because no list entry contains it, which makes splitting an exact inverse
of generation and therefore makes independent validation trivial and total.
Splitting is `String.prototype.split` with the one-character string `"."`, with
no regular expression and no limit argument, so repeated, leading, and trailing
separators produce empty tokens that fail membership. A hyphen separator was
rejected for exactly this reason: four list entries contain a hyphen, so
hyphen-joined output cannot be re-split into words unambiguously without a
parsing grammar inside a security validator.

No Unicode normalization is applied, because no input or output of this
operation can contain a non-ASCII character; the validator rejects any character
outside the list alphabet and the separator. There is no case folding, no
capitalization, no digit or symbol insertion, and no user-supplied padding. Any
of those would either change the entropy accounting or invite the caller to
influence the output, and both are out of scope for version one.

### Randomness

Generation uses only the existing worker-owned `CryptoProvider.randomBytes`, as
in ADR 0012. It does not expose generic random bytes, accept caller randomness,
or use `Math.random`.

The list size does not divide 65,536, so index selection uses 16-bit rejection
sampling over big-endian byte pairs:

```text
value  = (high << 8) | low
cutoff = floor(65536 / 7776) * 7776 = 62208
discard value >= cutoff
index  = value % 7776
```

Since `62208 = 8 * 7776`, each of the 7,776 residues has exactly eight accepted
preimages, so accepted values are uniform. Approximately 94.92 percent of pairs
are accepted.

The worker requests positive bounded chunks and consumes no more than
`words * 32` random bytes, which is sixteen attempts per word and mirrors ADR
0012's per-character budget. Every request length is even and at most 256 bytes;
because the budget is even, `min(256, budget remaining)` is always even. Bytes
are consumed strictly in order in disjoint pairs: within a chunk, byte `2k` is
the high byte and byte `2k+1` the low byte of attempt `k`. No byte may
participate in more than one pair, no byte of a rejected pair may be reused in
any later pair — a rejected pair is discarded whole — and no pair may span a
chunk boundary. An implementation that would leave an unpaired trailing byte
fails closed rather than carrying it forward. This is not a stylistic
constraint: a sliding window that reused one byte as the low byte of attempt `k`
and the high byte of attempt `k+1` would make consecutive word indices
statistically dependent and would falsify the entropy claim below, while passing
any test that only exercises the 16-bit mapping domain.

No array, list, or buffer of selected indices may exist. Each accepted index is
consumed into the output immediately and is never retained, because a tuple of
indices reconstructs the passphrase exactly while containing none of its
characters, and would therefore pass every leakage assertion described in this
repository. Closing that channel structurally is cheaper and more reliable than
teaching a leakage scan to look for it, which would require the scan itself to
hold the indices.

Every provider return must be a `Uint8Array` of exactly the requested positive
length. Overlong, short, or otherwise malformed returns, and failure to complete
inside the byte budget, fail closed without producing or returning a partial
candidate. Random chunks are cleared best-effort in `finally`, including on
failure paths. The selected words themselves are immutable bundled strings and
the joined result is an immutable string; neither can be erased, and this
decision does not claim otherwise.

### Protocol

The internal vault-worker protocol gains one named, unlocked-only operation:

```text
operation: generate-passphrase
input:     { words }
result:    { kind: "generated-passphrase", passphrase }
```

Validation is layered exactly as ADR 0012 requires, and none of the three layers
may be collapsed into another:

- The request parser validates the prototype, own data properties, the single
  integer field, its 7-through-24 bounds, and the entropy floor. Invalid options
  reach no provider call.
- The standalone response parser validates the exact result shape, then the
  global policy without reference to any particular request: the passphrase is a
  string of 27 through 239 characters, splitting it on the separator yields
  between 7 and 24 tokens, and every token is a member of the digest-pinned
  list. Membership is decided against the loaded list, so a forged response
  containing a plausible but non-list word fails, as do empty, leading, and
  trailing tokens.
- The worker validates its own result against its own parsed request before
  posting, and the window broker captures the requested word count as an
  immutable expectation *before* sending, then independently checks the exact
  token count plus operation, request ID, and session epoch before resolving.

Failures collapse to the existing stable internal failure. No failure echoes
random bytes, an index, a word, or a candidate passphrase. The operation adds no
new error code.

### Lifecycle

Generation is available only while a vault session is unlocked and is queued
like other non-lock work. Lock retains priority: it advances the session epoch,
rejects pending window work, clears active plaintext UI state, and terminates
the worker. A stale result must not overwrite a manual edit, a newer request, a
different editor target or item type, a cancellation, or a lock. The generated
passphrase fills only the password field of the currently keyed login editor and
is never saved without an explicit user save.

## Alternatives considered

- **Ship no wordlist and derive words from an existing in-repository asset.**
  Rejected: no suitable asset exists, and inventing a word source would be worse
  provenance than a widely reviewed published list.
- **Fetch the wordlist at runtime or build time.** Rejected: the application is
  offline-first and statically delivered, a runtime fetch would violate the
  web-delivery policy in ADR 0008, and a build-time fetch would make builds
  non-reproducible and network-dependent.
- **Use a hyphen separator, as most consumer generators do.** Rejected because
  four list entries contain a hyphen, so validation could not invert the join
  without a grammar. Correctness of the independent validator outranks matching
  another product's cosmetics.
- **Filter the four hyphenated entries so a hyphen separator becomes safe.**
  Rejected: it deviates from the published, digest-pinned list for a cosmetic
  gain and would require Neutron to justify a derived 7,772-word list.
- **Validate only the shape in the window and skip list membership there.**
  Rejected: it would save roughly 62 KB in the window bundle but would remove
  the only window-side check that a returned token is actually a list word,
  which is the same class of check ADR 0012 performs with its alphabet test.
- **Validate membership in the window against a compact oracle** — truncated
  per-word hash prefixes at roughly 23 KB, or a shared-prefix trie — rather than
  the full list. Not rejected on the merits; deferred. It preserves a genuine
  membership check at a fraction of the size, but it introduces a second
  representation of the list that must itself be derived, pinned, and proven
  equivalent, and a truncated-hash oracle accepts collisions by construction. If
  the measured bundle cost recorded by the implementation task proves
  unacceptable, this is the successor decision to write, not an undocumented
  deviation to make.
- **Guarantee one occurrence of each word or forbid repeats.** Rejected: it
  breaks the uniform independent selection the entropy claim depends on.
- **Make the separator, capitalization, or digit insertion configurable.**
  Rejected as option bloat that complicates validation and entropy accounting
  without a security gain; the random-character generator already covers callers
  who need a mixed alphabet.
- **Reuse `passwordByteIndex` for index selection.** Rejected: that function is
  a reviewed byte-domain primitive that hard-fails for values above 255 or
  alphabets above 256 symbols. Widening it would change the meaning of an
  already-reviewed function; a separate 16-bit selector with the same structure
  and its own exhaustive test is safer than a generalization.

## Security and privacy consequences

Entropy is `words * log2(7776)` bits of ideal uniform search space, roughly
12.92 bits per word, and depends on the reviewed provider CSPRNG, the rejection
sampler removing modulo bias, and the disjoint-pair byte discipline specified
above keeping successive selections independent. The 80-bit floor prevents a
syntactically valid but weak configuration. Bounded consumption makes a faulty
or adversarial provider fail closed rather than loop; exhaustion within the
budget is not a practical availability concern, since its probability is below
`10 ** -128` at the 7-word minimum.

The wordlist is public. Bundling it reveals nothing: an attacker is assumed to
know the list, which is why the entropy claim counts only word choices. The
bundle does, however, interact with leakage testing in ways that must be stated
plainly.

The emitted-production flow proves absence by searching artifacts and storage
for the exact generated value as a sentinel, so a bundled dictionary does not
weaken it — but a test that searched for individual words would become
meaningless, and no test may be written that way. Neither may any future test
fixture be a single dictionary word.

Separately, the bundled canonical form is joined by U+000A while generated
output is joined by `.`, so a generated passphrase can never appear as a literal
substring of the shipped list. That is what keeps the static-artifact scan from
failing spuriously on a passphrase whose words happen to be consecutive in the
list, and it is a requirement, not a coincidence: any future change to either
delimiter must preserve the property that they differ.

The generated passphrase crosses from worker to window as plaintext because the
active login editor needs it, exactly as in ADR 0012, and may persist in that
form control and in ordinary JavaScript memory until the editor is cleared or
the vault locks. It must not be placed in URLs, network requests, logs, errors,
history state, Neutron-controlled origin-visible persistence, static artifacts,
telemetry, or screenshots Neutron captures. After an explicit save it may persist
only inside the existing encrypted item envelope. This decision adds no
server-visible metadata and authorizes no server request.

The unresolved limitation is unchanged and is restated rather than quietly
dropped: best-effort clearing cannot erase immutable strings or engine-internal
copies, and browser, operating-system, password-manager, extension, and user
screenshot behavior remains part of the client TCB or residual risk.

## Operational and cost consequences

The change adds no dependency, service, hosted resource, network request, or
recurring cost. It does add a data asset: 62,143 bytes of word text, about 24 KB
standalone under `gzip -9` (24,499 bytes measured 2026-08-01, and a figure that
varies with toolchain). That text is expected to appear in both the window and
the vault-worker bundles, because Vite emits the worker as a separate artifact
and both sides validate membership.

The measured baseline before this change, recorded so the implementation task
can report a real delta rather than an estimate:

```text
dist/assets/index-<hash>.js               237,586 bytes (71,572 gzip)
dist/assets/vault-worker-entry-<hash>.js  596,854 bytes
dist/assets/index-<hash>.css                4,759 bytes
emitted files                                     7
```

The implementation task must measure and record the actual built sizes after the
change. If the measured cost is judged unacceptable, the correct response is the
deferred compact-oracle decision above, not an undocumented deviation.

## Compatibility and migration

There is no encrypted-envelope, item-schema, IndexedDB, server, network, or
package-protocol format change. A generated passphrase is stored, if at all, as
an ordinary login password inside the existing encrypted item. The internal
window/worker v1 operation union grows by one named operation and one result
kind; both sides ship atomically in the same static build, so mixed-version
operation is unsupported and no persisted migration exists. Rollback removes the
UI, the operation, and the asset without touching stored vault data. Changing the
bundled list later does not invalidate any previously generated passphrase,
because nothing persisted references the list.

## Verification

Acceptance requires:

- deterministic tests asserting every stated wordlist property, including the
  canonical SHA-256 recomputed from the loaded list, the exact count, the
  alphabet, the length range, strict sort order, and separator absence;
- exhaustive 16-bit domain tests proving equal accepted residue counts for all
  7,776 indices and rejection of every value at or above the cutoff; plus a test
  proving that the sequence of selected indices for a fixed injected byte stream
  is exactly the disjoint-pair mapping of that stream, so byte reuse across
  pairs and cross-chunk pairing are detected;
- instrumentation proving every provider request is positive, even, and bounded,
  that aggregate requested and consumed bytes never exceed `words * 32`, that
  every return is a `Uint8Array` of exactly the requested length, and that
  malformed, short, or overlong returns and budget exhaustion fail closed with
  no partial candidate and with every owned buffer cleared on success and
  failure;
- boundary tests for 7, 8, and 24 words, rejection of 6 and 25, non-integer,
  negative, `NaN`, and out-of-range values, hostile prototypes, accessors, and
  extra or missing fields, with zero provider calls on invalid input;
- adversarial protocol and client tests for forged and cross-operation
  responses, non-list words, wrong token counts, wrong or repeated separators,
  empty, leading, and trailing tokens, mutation, locked and pending states,
  request/operation/session-epoch correlation, and late post-lock results;
- real-browser component tests covering the default, accessible controls,
  keyboard operation, current-editor-only insertion, invalidation by manual
  edits, a newer request, a target or type change, cancel and lock, a fresh
  worker after unlock, redacted errors, and a 320-pixel layout;
- an emitted exact-CSP production flow that generates through the real built
  worker, independently re-validates the output by loading the list and
  recomputing the canonical digest against a literal transcribed into the test,
  and proves the exact generated value is absent from network, URLs, console,
  static artifacts, Cache Storage, local and session storage, history state, and
  raw IndexedDB before save, absent as plaintext from raw IndexedDB after save
  with the item readable only through the worker's decryption path, and cleared
  from the DOM and origin-visible storage after cancel, delete, and lock;
- an assertion in that same flow that the built window bundle, the built vault
  worker, or a checked-in notice file served with the application contains the
  exact attribution string — EFF, `CC-BY-4.0`, the license URI, the upstream
  URL, and the modification notice — so that a minifier configuration change
  cannot silently drop a license obligation; and
- recorded measurements of the built window and worker bundle sizes before and
  after the change.

Clipboard and copy actions, strength meters, passphrase history, `otpauth://`
and QR handling, bounded local search, recovery unlock UI, master-password or
recovery-secret generation, service-worker delivery, sync, server work, and
deployment remain out of scope.
