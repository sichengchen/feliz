---
name: feliz-project-onboarding
description: Use this skill to add or repair a project in Feliz. It must run `/interview`, update project mapping in central config, and configure `.feliz/*` inside the managed project repository under the Feliz workspace (usually Docker path).
---

# Feliz Project Onboarding

Use this skill for project-level onboarding and repo `.feliz` configuration.

## Scope

In scope:
- Add/repair one project mapping in central config `projects[]`
- Configure repo-level `.feliz/config.yml`, `.feliz/pipeline.yml`, `WORKFLOW.md`
- Validate project config end-to-end

Out of scope:
- Full machine bootstrap
- Global environment provisioning

For machine bootstrap, use `feliz-machine-setup`.

## Hard requirement

Run `/interview` before any write.

Minimum interview topics:
- Project identity: `name`, `linear_project`, `repo`, `branch`
- Workspace root and target repo path
  - Docker default target: `/data/feliz/workspaces/<project>/repo`
  - Local default target: `~/.feliz/workspaces/<project>/repo`
- Repo workflow settings:
  - `agent.adapter`
  - `specs.enabled`
  - `specs.directory`
  - `specs.approval_required`
  - `gates.test_command`
  - `gates.lint_command`
- Auth mode for clone/push: SSH vs HTTPS credentials

## Repository target requirement

`.feliz` must be written in the managed project repository, not in the Feliz service repo.

Required repo outputs:
- `<repo_path>/.feliz/config.yml`
- `<repo_path>/.feliz/pipeline.yml`
- `<repo_path>/WORKFLOW.md`

## Workflow

1. Resolve and verify target paths
- Read central config to resolve `storage.workspace_root`.
- Compute `<workspace_root>/<project>/repo`.
- Ensure repo exists or clone it first.

2. Register project mapping
- Add or update project entry in central `feliz.yml`:
  - `name`, `repo`, `linear_project`, `branch`

3. Write repo `.feliz` config
- Generate `.feliz/config.yml` from interview answers.
- Generate `.feliz/pipeline.yml` (default execute pipeline unless user requests custom).
- Generate `WORKFLOW.md` with standard Feliz prompt structure.

4. Validate
- Run `bun run src/cli/index.ts --config <path> config validate`.
- Fix all failures before completion.

5. Optional push flow
- If user wants, commit and push `.feliz/` + `WORKFLOW.md` in the target repo.

## Repair mode

- If `project add` fails due to stale existing path, run `project remove` first, then verify `<workspace_root>/<project>` cleanup before retry.
- Preserve intentional existing repo config unless interview answers explicitly change it.

## Guardrails

- Do not skip `/interview`.
- Do not write `.feliz` to the wrong repository.
- Prefer deterministic validation over assumptions.
