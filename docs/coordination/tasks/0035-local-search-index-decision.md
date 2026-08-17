# TASK 0035 — Local item search and index policy decision

Status: review  
Owner: —  
Claimed: 2026-08-15  
Worktree/branch: shared-worktree (`main`)  
Reviewer: unassigned  
Review claimed: —  
Depends on: —  
Blocks: bounded local search implementation  
Security-sensitive: yes

## Outcome

An accepted, independently reviewed decision on local item search, so that the
Stage 2 roadmap item stops being blocked on a question nobody has written down.

## Context

`docs/ROADMAP.md` places bounded encrypted local search in Stage 2.
`docs/coordination/HANDOFF.md` records it as blocked pending "an ADR for
index-shard leakage and persisted-format policy". ADR 0010 reserves envelope
kind `0x12` for an index shard payload, and that reservation is the source of
the blocker.

The blocker has been treated as blocking all search. It blocks **persisted**
search. Search that never leaves worker memory writes no shard and raises none
of the questions kind `0x12` exists to answer. This task separates the two so
the cheap half can proceed and the expensive half stays honestly deferred.

This task produces a **decision only**. It writes no product code.

## Reserved ADR filename

`docs/decisions/0017-bounded-local-item-search.md`

ADR number 0017 was confirmed free before reservation.

## Allowed paths

- This task file
- `docs/decisions/0017-bounded-local-item-search.md`
- `docs/decisions/README.md`
- `docs/coordination/HANDOFF.md`

## Out of scope

- Any change under `apps/`, `packages/`, `infra/`, or `.github/`.
- Implementing search, the query input, or the protocol operation.
- Writing, specifying, or authorising envelope kind `0x12` index shards.
- Sorting by decrypted fields, folders, favorites, recents, or saved searches.
- Any server-visible or sync-visible search behaviour.
- Full-text search over item bodies.
- Superseding or amending ADR 0010.

## Acceptance criteria

- [x] The ADR states one testable decision and distinguishes in-memory search
      from persisted indexing.
- [x] The ADR states explicitly that it does **not** authorise envelope kind
      `0x12` and leaves that reservation unused.
- [x] The ADR names exactly which fields are searched and states the cost that
      searching more would impose, rather than leaving the boundary implicit.
- [x] Matching semantics are specified precisely enough to be pinned by fixed
      vectors, including input limits and invalid-Unicode handling.
- [x] Result, byte, and time bounds are stated, and truncation is truthful.
- [x] The ADR states that no query, history, or index is retained anywhere.
- [x] The timing side channel is stated rather than silently mitigated or
      silently ignored.
- [x] The ADR states its protocol-version consequence, its lack of any
      persisted-format consequence, and that it grants sync nothing.
- [x] The ADR lists verification required before acceptance and before the
      implementing task closes.
- [ ] An independent reviewer who did not write the ADR records P0/P1/P2
      findings against the exact committed artifact and accepts or rejects it.

## Verification

This task changes no code. The applicable check is:

```sh
git diff --check
```

The reviewer must independently confirm: that ADR 0017's filename was free; that
ADR 0010 was not edited; that the claim "kind `0x12` remains unused" is
consistent with ADR 0010's text; that no searched-field claim contradicts
security invariant 7; and that no path outside the allowed list changed.

## Progress log

- 2026-08-15 — Claimed TASK-0035 and reserved
  `docs/decisions/0017-bounded-local-item-search.md` after confirming 0017 free.
- 2026-08-15 — ADR 0017 drafted at status `Proposed`. Version-one search is
  in-memory, worker-computed, over title and type only, deterministic and
  unranked, with byte/result/time bounds and no retained query. Persisted index
  shards are deferred with their leakage question left open rather than answered
  in passing. Moved to `review`; implementation ownership is cleared.

## Handoff

ADR 0017 exists at status `Proposed` and is binding on nobody. Do not implement
search, do not add `search-item-summaries`, and do not increment the worker
protocol until an independent reviewer accepts it. The pre-acceptance
verification item — cross-engine agreement on default case folding — has not
been run.

If both this ADR and ADR 0016 are accepted, their protocol increments must be
sequenced, not merged. Two decisions arriving in one protocol version is how a
security decision gets approved by a review that was not looking for it.

## Review

Pending. No reviewer assigned, no verdict recorded. The author of the ADR may
not accept it.
