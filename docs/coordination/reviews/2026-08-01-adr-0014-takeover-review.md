# ADR 0014 takeover review — 2026-08-01

Reviewer: `/root/task_0022_reviewer`
Orchestrator/ADR 0015 drafter: `/root`
Reviewed commit: `59a0c1168205b09aaa912b07c76258121d86e09a`
Disposition: BLOCK — P0 0, P1 4, P2 5

The prior session recorded that ADR 0014 received independent review but did not
retain the reviewer identity. This fresh read-only audit restores a named,
repository-verifiable review boundary before Task 0023 begins. The reviewer
edited no file.

## Verified foundation

The official EFF source independently reproduced 108,800 bytes, 7,776 LF rows,
upstream SHA-256 `addd35536511597a02fa0a9ff1e5284677b8883b83e986e43f15a3db996b903e`,
and derived 62,143-byte SHA-256
`abae49761b88f3f1ba31ef944bea1f61b795a3cd7e1cfb7d276ed45bf77967ba`.
Count, alphabet, strict ordering, uniqueness, length, hyphen, separator, entropy
floor, cutoff, residue uniformity, and response bounds otherwise passed.

EFF's official copyright policy covers original EFF material under CC BY 4.0
while retaining a non-original-material caveat; EFF's announcement calls this
its own list. The existing legal/provenance uncertainty is therefore disclosed
honestly and was not a blocker.

## Findings and disposition

1. **P1 — selected-word collection gap.** ADR 0014 forbids selected-index
   collections but not selected-word collections with identical reconstructive
   authority. ADR 0015 requires incremental construction and prohibits both.
2. **P1 — attribution acceptance mismatch.** Task 0023 asks for a source header
   even though ADR 0014 proves it insufficient, and its production criterion
   omits the complete notice. ADR 0015 and Task 0023 bind every field and emitted
   rendered verification.
3. **P1 — missing Task 0026 dependency.** Task 0026 blocks a trustworthy root
   test gate. It is now independently reviewed and done; Task 0023 explicitly
   depends on it.
4. **P1 — prior reviewer identity absent.** This named audit, its successor-ADR
   review, and their retained task records remediate the process-integrity gap.
5. **P2 — exhaustion inequality.** The exact seven-word global-budget failure
   probability is approximately `1.1191703579 * 10 ** -128`, slightly above the
   old claim. ADR 0015 corrects it without changing the budget.
6. **P2 — output-length estimate.** Mean word length plus separator is about
   7.99177 characters per added word; two add about 15.98. ADR 0015 corrects it.
7. **P2 — recovery sequencing contradiction.** The plan review is aligned to the
   roadmap: recovery unlock is not outstanding Stage 2 work and remains blocked.
8. **P2 — false present tense.** Pre-implementation documents now distinguish
   binding future requirements from artifacts that do not yet exist.
9. **P2 — Task 0025 block metadata.** Task 0025 now records that it blocked Task
   0023, matching the dependency graph and historical sequencing.

ADR 0015 and these dispositions require independent re-review before acceptance.
