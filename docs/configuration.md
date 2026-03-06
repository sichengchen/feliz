# Configuration Guide

Feliz uses central config + per-repo config.

## Central config (`feliz.yml`)

Default path: `~/.feliz/feliz.yml` (override with `--config`).

```yaml
linear:
  api_key: $LINEAR_API_KEY

polling:
  interval_ms: 30000

storage:
  data_dir: /path/to/feliz/data
  workspace_root: /path/to/feliz/workspaces

agent:
  default: claude-code
  max_concurrent: 5

projects:
  - name: backend-api
    repo: git@github.com:org/backend-api.git
    linear_project: Backend API
    branch: main
```

### Fields

- `linear.api_key` (required): supports `$ENV_VAR` syntax.
- `polling.interval_ms` (default `30000`).
- `storage.data_dir` (default `~/.feliz`).
- `storage.workspace_root` (default `{data_dir}/workspaces`).
- `agent.default` (default `claude-code`).
- `agent.max_concurrent` (default `5`).
- `projects[]` (required, at least one).

Each project needs:

- `name`
- `repo`
- `linear_project`
- `branch` (default `main`)

## Repo config (`.feliz/config.yml`)

```yaml
agent:
  adapter: codex
  approval_policy: auto
  max_turns: 20
  timeout_ms: 600000

hooks:
  after_create: bun install
  before_run: bun run lint
  after_run: bun test
  before_remove: echo cleanup

specs:
  enabled: true
  directory: specs
  approval_required: true

gates:
  test_command: bun test
  lint_command: bun run lint

concurrency:
  max_per_state:
    Todo: 1
```

### Repo config behavior

- `agent.adapter`: default adapter for steps without explicit `agent`.
- `agent.approval_policy`: `auto | gated | suggest`.
- `hooks.*`: shell hooks executed in worktree.
- `specs.enabled`: toggles spec states (`spec_drafting/spec_review`).
- `gates.*`: default quality commands.
- `concurrency.max_per_state`: optional state-level caps.

## Pipeline config (`.feliz/pipeline.yml`)

```yaml
phases:
  - name: execute
    steps:
      - name: run
        prompt: WORKFLOW.md
        success:
          command: "bun test"
      - name: create_pr
        builtin: publish
```

See [Pipelines](pipelines.md) for full schema.

## Prompt templates

Default template file is `WORKFLOW.md` in repo root.

Supported variables include:

- `project.name`
- `issue.identifier`, `issue.title`, `issue.description`
- `specs`
- `attempt`, `previous_failure`
- `cycle`, `previous_review`
- `step.name`, `phase.name`
- `context`

## Environment variables

### Runtime

- `LINEAR_API_KEY` (required if referenced by config)
- `GITHUB_TOKEN` (recommended for publish/auth checks)
- Agent credential vars as needed (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`)

### E2E testing

Recommended location: `scripts/e2e.env` (local copy created from example).

```bash
cp scripts/e2e.env.example scripts/e2e.env
bash scripts/e2e-smoke.sh --env-file scripts/e2e.env
```

In CI, set the same values as secret environment variables.

## Validation

```bash
bun run src/cli/index.ts config validate
bun run src/cli/index.ts config show
```
