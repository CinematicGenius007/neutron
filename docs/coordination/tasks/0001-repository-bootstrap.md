# TASK 0001 — Repository and monorepo bootstrap

Status: done  
Owner: unassigned  
Claimed: —  
Worktree/branch: —  
Reviewer: unassigned  
Review claimed: —  
Depends on: —  
Blocks: Stage 1 implementation tasks  
Security-sensitive: no

## Outcome

Initialize Git and a minimal strict TypeScript/pnpm monorepo matching the accepted
architecture, without implementing product or cryptographic behavior.

## Allowed paths

- This task file for lifecycle metadata
- Repository configuration files
- `apps/**`
- `packages/**`
- `infra/**`
- `.github/**`
- `README.md` only for setup-command corrections

## Out of scope

- Crypto implementation, authentication, schemas, UI, deployments, and secrets.

## Acceptance criteria

- [ ] Git is initialized with an intentional default branch and ignore rules.
- [ ] Workspace packages and dependency direction are represented.
- [ ] Strict typecheck, lint, format-check, and empty test commands pass.
- [ ] Runtime and package-manager versions are pinned.
- [ ] CI has minimal permissions and no deploy credentials.
- [ ] No real secrets or generated package artifacts are committed.

## Verification

Record exact install, typecheck, lint, format, test, and build results.

## Progress log

- 2026-07-26T00:00:00Z — Created from the accepted master plan.
- 2026-07-26T03:35:57Z — Claim assigned by the orchestrator after confirming no dependencies or active-path overlap.
- 2026-07-26T03:40:04Z — Initialized Git on the intentional `main` branch and added the pinned pnpm/strict TypeScript workspace, package-boundary graph, hygiene rules, and least-privilege CI workflow.
- 2026-07-26T03:40:04Z — Verification passed: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, and `pnpm build` all exited 0. `git diff --check` exited 0; generated `dist/`, `node_modules/`, and TypeScript build-info files are ignored.
- 2026-07-26T03:56:21Z — Remediation claim assigned by the orchestrator after independent review returned the task to active; no other active task owns these paths.
- 2026-07-26T03:58:12Z — Excluded generated `dist/`, `node_modules/`, and TypeScript build-info paths from Biome; `pnpm format:check` now passes after `pnpm typecheck` emits output. Replaced all CI action tags with reviewed, version-annotated 40-character commit SHAs.
- 2026-07-26T03:58:12Z — Clean-output verification passed: `pnpm exec tsc --build --clean`, then `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, and `pnpm build` all exited 0. The full sequence also passed in a fresh temporary source tree with no installed dependencies or generated output.

## Handoff

Remediation is complete and ready for re-review. Confirm Biome excludes generated
paths after TypeScript output exists, CI actions use the recorded immutable SHA
pins, the workspace graph follows `docs/ARCHITECTURE.md`, and CI retains no
write/deploy privileges.

## Review

2026-07-26T03:53:57Z — Independent review found two blocking deviations. The
repository's own required command sequence is not stable: after `pnpm build`,
`pnpm format:check` fails because `biome.json` includes generated `dist/**`
files even though `.gitignore` excludes them. Exclude generated build output
from Biome checks (or configure the build output so it is compliant), then
rerun the complete verification sequence from both a clean checkout and after
a build.

The CI workflow used mutable action tags (`actions/checkout@v4`,
`pnpm/action-setup@v4`, and `actions/setup-node@v4`) instead of immutable
commit SHA pins. This conflicts with the accepted supply-chain direction in
`docs/MASTER_PLAN.md`; pin each action to its reviewed full commit SHA. Reassign
an implementer for these bounded configuration fixes, then request a new review.

2026-07-26T03:58:12Z — Remediation submitted for re-review: generated paths are
excluded in `biome.json`; all three CI actions are pinned to full commit SHAs with
version comments; both clean-output and fresh-source-tree verification passed.

2026-07-26T03:59:50Z — Re-review passed. From the existing workspace, `pnpm
install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm
format:check`, `pnpm test`, and `pnpm build` all exited 0 in CI order after
generated outputs were present. `git diff --check` exited 0; `dist/` and
`*.tsbuildinfo` remain ignored. Each pinned CI action SHA resolved to its
annotated upstream release (`checkout` v4.2.2, `pnpm/action-setup` v4.1.0, and
`setup-node` v4.4.0). Reviewer: root.
