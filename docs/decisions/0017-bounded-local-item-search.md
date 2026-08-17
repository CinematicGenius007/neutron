# ADR 0017 — Bounded local item search and index policy

- Status: Proposed
- Date: 2026-08-15
- Owners: `/root`
- Supersedes:
- Superseded by:

## Context

The vault presents 24 items per page with cursor pagination and no search or
sort. The local record ceiling is 20,003 (`apps/web/src/local-vault.ts:109`). A
vault becomes unnavigable long before that ceiling: finding one item means
paging through the whole vault by hand.

`docs/ROADMAP.md` places bounded encrypted local search in Stage 2, and
`docs/coordination/HANDOFF.md` records that it is blocked on "an ADR for
index-shard leakage and persisted-format policy". That blocker is real and this
ADR does not pretend to resolve it. ADR 0010 already reserves envelope kind
`0x12` for an index shard payload, and a persisted index is exactly the artifact
that leaks vault structure to whoever reads local storage today and to the
server once sync exists.

The blocker has been treated as blocking *all* search. It only blocks
*persisted* search. Search that never leaves worker memory raises none of the
questions the reserved envelope kind exists to answer.

## Decision

Version-one search is an in-memory, worker-computed filter over item summaries.
Nothing is indexed, nothing is persisted, nothing is transmitted, and no query
is retained.

### What is searched

Matching is performed against `title` and `type`. Secret-classified fields —
passwords, secure-note bodies, TOTP seeds, backup codes, JSON values, and notes —
are **never** matched.

The reason is **not** decryption cost. `LocalVault.listItemSummaries` already
calls `#loadItem` for every listed record, and `#loadItem` performs the full
unwrap-and-decrypt of the complete item; a summary is a projection applied after
the whole plaintext item exists in worker memory
(`apps/web/src/local-vault.ts:502-518`). Any search must examine records it
cannot pre-filter, so it decrypts them regardless of which fields it then
inspects. **Matching additional already-decrypted fields is free.** An earlier
draft of this ADR claimed otherwise and was wrong.

The real reason to exclude secret fields is that substring matching against a
secret is a **disclosure oracle**. If a query matches a stored password, the
result set confirms that the typed string is a substring of that password —
one character at a time, without ever revealing it on screen, and without the
explicit reveal action every other secret path requires. A search box is also
somewhere people paste things by accident. Excluding secret fields from matching
removes the oracle entirely rather than bounding it.

Non-secret, non-summary fields such as a login's `username` and `url` are
neither included nor excluded by this ADR. They are free to match and carry no
oracle, but returning them would change what the list renders. That is a
user-interface decision, not a search decision, and is deferred.

### Where it runs

In the vault worker, over records it decrypts to build summaries. The window
sends a query string and receives a bounded page of summaries. The window never
receives the full record set to filter locally, because that would enlarge the
plaintext held in the least-protected context.

### Exact matching semantics

Specified precisely so the behaviour is testable rather than emergent:

- The query is a sequence of Unicode scalar values, at most **128 UTF-8 bytes**
  measured after encoding. Longer input fails closed before any decryption.
- Unpaired UTF-16 surrogates are rejected before conversion, matching the
  password-input rule in `docs/protocol/crypto-envelope.md`.
- **JavaScript exposes no case-folding operation.** `String.prototype.toLowerCase`
  implements Unicode Default Case Conversion, which is a different function from
  Unicode case folding. An earlier draft of this ADR specified "case folding" and
  was therefore unimplementable as written.

  Version one matches by applying `normalize("NFKC")` and then `toLowerCase()` to
  both the query and the title, and testing substring containment on the
  resulting code-point sequence. The type label is compared the same way.

  This has consequences a reader must be able to predict, measured across the
  pinned Chromium 151, Firefox 153, and WebKit 26.5 engines:

  | Query | Title | Matches | Why |
  | --- | --- | --- | --- |
  | `strasse` | `Straße` | **no** | `ß` lowercases to `ß`; only folding maps it to `ss` |
  | `οδοσ` | `ΟΔΟΣ` | **no** | word-final `Σ` lowercases to `ς`, not `σ` |
  | `ffi` | `ﬃ` | yes | NFKC decomposes the ligature |
  | `k` | `K` (U+212A Kelvin) | yes | NFKC maps Kelvin sign to `K` |
  | `i` | `İ` | **no** | `İ` lowercases to `i` plus a combining dot |

  These are accepted version-one limitations, stated rather than discovered.
  Correcting them requires a case-folding table, which is data this project would
  have to carry, review, and pin — a separate decision with its own cost.

- Note that `docs/protocol/crypto-envelope.md` forbids **any** normalization of a
  master password. That rule protects an authentication input, where normalizing
  would silently merge distinct secrets. Search is not authentication and matches
  no secret, so NFKC is appropriate here. The two rules are not in conflict, and
  neither may be cited to relax the other.

- No accent stripping, tokenisation, stemming, regular expressions, glob syntax,
  fuzzy distance, or relevance ranking.
- An empty query is not a search; it is the ordinary unfiltered listing.
- Results preserve the existing deterministic identifier order. There is no
  scoring, so there is no scoring to leak or to explain.

Deterministic, unranked results are chosen so that the feature can be covered by
fixed test vectors in the same way every other Neutron behaviour is.

### Bounds

- The worker examines at most the existing record ceiling once per query.
- At most **100** matches are returned; reaching the cap is reported as a
  distinct, truthful state, never silently truncated.
- A per-query wall-clock budget aborts the scan and fails closed rather than
  holding the worker.
- Search requires an unlocked session and is subject to the session deadline in
  ADR 0016 like any other operation.

### What is not retained

- No persisted index of any kind. **This ADR does not authorise writing envelope
  kind `0x12`.** That reservation stays unused and its leakage question stays
  open.
- No query history, no recent searches, no saved searches, no "last query"
  restored on unlock.
- No query in a URL, history entry, storage key, or log. URLs already carry no
  state.
- The query lives in window component state and one worker call frame, and is
  cleared on lock exactly as every other window secret is.

## Alternatives considered

**Persisted encrypted index shards (envelope kind `0x12`).** Deferred, not
rejected. It is the right answer for a large synced vault and the wrong first
step: it requires deciding what an index reveals through shard count, shard
size, and update frequency — including to a future server — before a single byte
is written. Nothing in this ADR forecloses it.

**Window-side filtering of the current page.** Rejected as insufficient. It only
searches the 24 items already on screen, which is not search.

**Window-side filtering of all summaries.** Rejected. It would require shipping
every title in the vault into the window and holding it there, enlarging the
plaintext surface that the window/worker split exists to shrink.

**Full-text search over decrypted item bodies.** Rejected for version one. Cost
is proportional to vault size on every query, and it decrypts every item to
answer a question about one.

**Ranked or fuzzy matching.** Rejected. It adds behaviour that cannot be pinned
by fixed vectors and invites tuning that nobody can review.

**Server-side or sync-visible search.** Prohibited by security invariant 8. No
future server may receive a query or an index without a new accepted decision.

## Security and privacy consequences

- **No new persisted data**, and specifically no index artifact. The storage
  footprint of a vault is byte-identical whether or not anyone searches it.
- **No new transmitted data.** There is no server. This ADR grants sync nothing;
  when sync exists, search over synced state is a fresh decision.
- **Plaintext exposure is not enlarged.** Search decrypts the same summaries the
  list already decrypts, in the same place, and returns the same fields.
- **Timing:** query duration correlates with vault size and match count. No
  constant-time matching is attempted, because any adversary positioned to
  measure it is already executing inside the origin and can read the plaintext
  directly. This is stated rather than mitigated.
- **Denial of service:** the byte cap, result cap, and time budget bound a
  hostile or accidental query. A query that hits the budget fails closed.
- **Unknown:** whether case folding introduces engine-dependent behaviour across
  the supported browsers. Verification below requires a cross-engine vector run,
  and a divergence blocks acceptance rather than being papered over.

## Operational and cost consequences

None. No dependency, service, hosted resource, or recurring cost. Case folding
uses the platform's built-in Unicode support; no wordlist, table, or index
library is added.

## Compatibility and migration

No persisted record, envelope, crypto format, or on-disk structure changes. A
vault written before search is byte-identical to one written after, and rolling
back is a code rollback with no data implication.

The internal vault-worker protocol gains one unlocked-only operation, extending
the summary listing rather than replacing it:

```text
operation: search-item-summaries
input:  { vaultId, query, limit }
output: { items, truncated }
```

The response carries no score, no match offset, and no excerpt — only the
summary fields the list already receives. Match offsets would be a per-character
statement about plaintext and are deliberately absent. This is a protocol
version increment under the existing atomic-build rule, and it must be
sequenced with, not merged into, the ADR 0016 protocol change.

## Verification

Required before this ADR is accepted:

- ~~A cross-engine check that default case folding agrees on a fixed sample
  across the supported Chromium, Firefox, and WebKit versions.~~ **Run
  2026-08-15.** Chromium 151.0.7922.34, Firefox 153.0, and WebKit 26.5 agreed on
  every code point in a twelve-case sample including `ß`, `ẞ`, `İ`, `ı`, final
  sigma, Cherokee, a non-BMP Deseret pair, the `ﬀ` ligature, and the Kelvin
  sign. No divergence. The run is recorded in
  `docs/coordination/reviews/2026-08-15-adr-preacceptance-experiments.md`.
  The experiment also established that the operation available is lowercasing,
  not folding, which is why the matching semantics above were rewritten.

Required before the implementing task closes:

- Fixed vectors for case-folded matching, including a non-ASCII case pair, a
  scalar value outside the Basic Multilingual Plane, and the 128-byte boundary
  at, one below, and one above the limit.
- A test proving invalid Unicode input fails closed before any decryption
  occurs.
- A test proving the result cap reports truncation truthfully rather than
  silently dropping matches.
- A test proving the time budget aborts and fails closed.
- A test proving a search over a vault at the record ceiling stays within its
  bounds.
- An exact-CSP production assertion that a query string equal to a plaintext
  sentinel appears in **no** IndexedDB record, Cache Storage entry, local or
  session storage key, history entry, network request, console message, or
  emitted artifact — and that the set of storage keys is unchanged across a
  search.
- Confirmation that locking clears the query from window state along with every
  other secret.
