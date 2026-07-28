# Multi-agent coordination

This directory makes project state durable across agents, sessions, and tools.
Chat messages are useful for immediate coordination but are not the project
record.

`HANDOFF.md` is the single current session checkpoint. Read it when taking over
the repository and refresh it before transferring or stopping work; task files
remain authoritative for lifecycle status and acceptance criteria.

## Why one file per task

A shared checkbox list becomes a write hotspot. Neutron instead assigns each
unit of work one file under `tasks/`. The file records ownership, paths,
dependencies, decisions, progress, verification, and handoff.

Scan task state with:

```sh
rg '^Status:|^Owner:|^Depends on:' docs/coordination/tasks
```

## Task lifecycle

```text
proposed -> ready -> active -> review -> done
                \-> blocked -/
```

- `proposed`: needs refinement or a decision.
- `ready`: bounded, dependencies done, acceptance criteria testable.
- `active`: one named owner is changing the declared paths.
- `blocked`: cannot progress; blocker and required decision are recorded.
- `review`: implementation is complete and awaits verification/review.
- `done`: acceptance criteria and required review are complete.

## Claiming

In a shared workspace, the orchestrating agent assigns claims. This is
intentional: checking status and then editing a file is not atomic, so agents
must not independently claim work. Independent Git worktrees still coordinate a
claim through the orchestrator or human owner.

After assignment, the agent edits only that task file first:

```text
Status: active
Owner: <agent identifier>
Claimed: <UTC timestamp>
Worktree/branch: <value or shared-worktree>
```

The orchestrator checks dependencies and path overlap before assignment. A claim
with missing ownership metadata or no assignment is invalid.

## Shared-worktree operation

Some agent systems share one filesystem. In that mode:

- Select disjoint path ownership.
- Route every implementation and review claim through one orchestrator.
- Do not run repository-wide formatters while another task is active.
- Do not discard or rewrite unrecognized changes.
- Assign one integration owner for unavoidable shared files.
- Record a handoff instead of editing an active owner's files.

With independent Git worktrees, agents should still use task claims because Git
alone does not communicate architectural ownership.

## Review separation

Security-sensitive implementation cannot be marked done by its implementer. The
orchestrator sets `Reviewer` and `Review claimed` for independent review. The
reviewer should either:

- Claim a linked review task, or
- Add a named `Review` entry to the implementation task if no code changes are
  necessary.

If findings require changes, record them, return the task to `active`, clear
review metadata, and let the orchestrator reassign an implementer or create
bounded remediation tasks. Review is read-only except for the task file unless
remediation paths are explicitly assigned.

## Creating tasks

Copy `TASK_TEMPLATE.md`, have the orchestrator reserve the next four-digit ID and
any ADR filenames, and make the task small
enough for one coherent change. Good tasks declare exact paths and observable
acceptance criteria. A task should not combine cryptography, UI, infrastructure,
and documentation unless it is explicitly an integration task.

## Agent roles

- Orchestrator: refines dependencies, assigns shared ownership, integrates stages.
- Implementer: owns one bounded task and its tests/docs.
- Reviewer: attempts to disprove security and correctness claims independently.
- Researcher: records current primary-source evidence in an ADR or research note.

Roles are per task, not permanent identities. The same agent may take different
roles on different tasks, but not implement and approve the same sensitive task.

Completed cross-cutting audits may be recorded under `reviews/` so later agents
can see both the findings and how the plan or implementation responded.
