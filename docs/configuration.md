# Configuration

Feliz has two config layers: central server config and per-repo config.

## Central config (`feliz.yml`)

Default location: `~/.feliz/feliz.yml`. Override with `--config <path>`.

```yaml
linear:
  oauth_token: $LINEAR_OAUTH_TOKEN

webhook:
  port: 3421

storage:
  data_dir: ~/.feliz
  workspace_root: ~/.feliz/workspaces

agent:
  default: claude-code
  max_concurrent: 5

projects:
  - name: backend-api
    repo: git@github.com:org/backend-api.git
    linear_project: Backend API
    branch: main
```

| Field | Default | Description |
|---|---|---|
| `linear.oauth_token` | — | Required. Supports `$ENV_VAR` syntax. |
| `linear.app_user_id` | — | Bot user ID from Linear (set automatically by `feliz auth linear`). |
| `webhook.port` | `3421` | Port for receiving Linear webhook events. |
| `storage.data_dir` | `~/.feliz` | SQLite database and artifacts. |
| `storage.workspace_root` | `{data_dir}/workspaces` | Git clones and worktrees. |
| `agent.default` | `claude-code` | Default agent adapter. |
| `agent.max_concurrent` | `5` | Max parallel agent runs. |
| `projects[]` | — | Required. At least one project mapping. |

Each project requires `name`, `repo`, `linear_project`, and optionally `branch` (default: `main`).

## Repo config (`.feliz/config.yml`)

Lives in the target repository. Controls agent behavior for that repo.

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

| Field | Description |
|---|---|
| `agent.adapter` | Agent for steps without explicit `agent`. |
| `agent.approval_policy` | `auto`, `suggest`, or `gated`. |
| `hooks.*` | Shell commands run in worktree at lifecycle points. |
| `specs.enabled` | Enables spec drafting/review states. |
| `gates.*` | Default test and lint commands. |
| `concurrency.max_per_state` | Per-state concurrency caps. |

## Pipeline config (`.feliz/pipeline.yml`)

Defines the execution pipeline. See [Pipelines](pipelines.md).

## Prompt templates

The default prompt template is `WORKFLOW.md` in the repo root. Templates support variables:

- `project.name`, `issue.identifier`, `issue.title`, `issue.description`
- `specs`, `context`
- `step.name`, `phase.name`
- `attempt`, `previous_failure`, `cycle`, `previous_review`

## Environment variables

| Variable | Purpose |
|---|---|
| `LINEAR_OAUTH_TOKEN` | Linear OAuth access (obtain via `feliz auth linear`) |
| `GITHUB_TOKEN` | PR creation and repo access (needs `repo` scope) |
| `GIT_AUTHOR_NAME` | Git commit author name (e.g., `Feliz Bot`) |
| `GIT_AUTHOR_EMAIL` | Git commit author email |
| `ANTHROPIC_API_KEY` | Claude Code agent (fallback; prefer `claude login`) |
| `OPENAI_API_KEY` | Codex agent (fallback; prefer `codex login`) |

## Validation

```bash
bun run src/cli/index.ts config validate
bun run src/cli/index.ts config show
```
