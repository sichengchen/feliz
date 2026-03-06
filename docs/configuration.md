# Configuration Guide

Feliz uses two levels of configuration:

1. **Central config** (`feliz.yml`) — global settings, project mappings
2. **Per-repo config** (`.feliz/` directory) — agent behavior, pipelines, prompts

## Central config (`feliz.yml`)

Located at `~/.feliz/feliz.yml` (or `/data/feliz/feliz.yml` in Docker). Passed via `--config <path>` flag.

### Full example

```yaml
linear:
  api_key: $LINEAR_API_KEY

polling:
  interval_ms: 30000

storage:
  data_dir: /data/feliz
  workspace_root: /data/feliz/workspaces

agent:
  default: claude-code
  max_concurrent: 5

projects:
  - name: backend-api
    repo: git@github.com:org/backend-api.git
    linear_project: Backend API
    branch: main

  - name: frontend-app
    repo: git@github.com:org/frontend-app.git
    linear_project: Frontend App
    branch: main
```

### Reference

| Field | Type | Default | Description |
|---|---|---|---|
| `linear.api_key` | string | **required** | Linear API key. Supports `$ENV_VAR` syntax for environment variable substitution. |
| `polling.interval_ms` | number | `30000` | How often Feliz polls Linear for issue changes (milliseconds). |
| `storage.data_dir` | string | `~/.feliz` | Root directory for Feliz data (database, logs, scratchpad). |
| `storage.workspace_root` | string | `{data_dir}/workspaces` | Root directory for git repo clones and worktrees. |
| `agent.default` | string | `claude-code` | Default agent adapter name. |
| `agent.max_concurrent` | number | `5` | Maximum concurrent agent runs across all projects. |
| `projects[]` | array | **required** | List of project definitions (at least one). |
| `projects[].name` | string | **required** | Internal project identifier. Used for directory naming and CLI references. |
| `projects[].repo` | string | **required** | Git remote URL. Feliz clones this repo on first run. |
| `projects[].linear_project` | string | **required** | Linear project name. Must match exactly. One Linear project = one repo. |
| `projects[].branch` | string | `main` | Default base branch for worktrees. |

### Environment variable substitution

String values starting with `$` are resolved from environment variables:

```yaml
linear:
  api_key: $LINEAR_API_KEY   # Reads process.env.LINEAR_API_KEY
```

Feliz throws an error at startup if a referenced environment variable is not set.

## Per-repo config (`.feliz/config.yml`)

Lives in each managed repo's `.feliz/` directory. Controls agent behavior, hooks, specs, and gates for that specific repo.

### Full example

```yaml
agent:
  adapter: claude-code
  approval_policy: auto
  max_turns: 30
  timeout_ms: 600000

hooks:
  after_create: npm install
  before_run: npm run lint -- --fix
  after_run: npm test
  before_remove: npm run clean

specs:
  enabled: true
  directory: specs
  approval_required: true

gates:
  test_command: npm test
  lint_command: npm run lint

concurrency:
  max_per_state:
    Todo: 3
    "In Progress": 5
```

### Reference

#### `agent` — Agent behavior

| Field | Type | Default | Description |
|---|---|---|---|
| `agent.adapter` | string | from central config | Agent adapter for this repo. Overrides the global default. |
| `agent.approval_policy` | `auto` \| `gated` \| `suggest` | `auto` | How the agent operates. `auto`: run freely, check gates after. `gated`: post plan to Linear, wait for approval. `suggest`: produce diff without committing, wait for approval. |
| `agent.max_turns` | number | `20` | Max conversation turns per agent invocation. |
| `agent.timeout_ms` | number | `600000` | Max wall-clock time per agent invocation (10 minutes). |

#### `hooks` — Lifecycle commands

Shell commands that run at specific points in the work item lifecycle. All commands execute in the worktree directory.

| Field | Description |
|---|---|
| `hooks.after_create` | After worktree is created (e.g., `npm install`). |
| `hooks.before_run` | Before each pipeline step. |
| `hooks.after_run` | After each pipeline step. |
| `hooks.before_remove` | Before worktree cleanup. |

#### `specs` — Spec-driven development

| Field | Type | Default | Description |
|---|---|---|---|
| `specs.enabled` | boolean | `false` | Enable spec-driven development. Specs are system design documents with behavioral cases (Given/When/Then). When `false`, Feliz skips all spec-related states and artifacts. |
| `specs.directory` | string | `specs` | Directory in repo root where spec files are stored. |
| `specs.approval_required` | boolean | `true` | Whether spec drafts need human approval (`@feliz approve`) before execution. |

#### `gates` — Verification commands

| Field | Type | Default | Description |
|---|---|---|---|
| `gates.test_command` | string | none | Command to run tests. Used as the default success condition in the default pipeline. |
| `gates.lint_command` | string | none | Command to run linter. |

#### `concurrency` — Per-state limits

| Field | Type | Default | Description |
|---|---|---|---|
| `concurrency.max_per_state` | map | none | Limit concurrent runs by Linear issue state. Keys are state names (e.g., `Todo`, `In Progress`). |

## Pipeline config (`.feliz/pipeline.yml`)

See the [Pipeline Guide](pipelines.md) for full documentation.

## Prompt templates

Prompt templates use Jinja2-style syntax and live in `.feliz/prompts/` or as `WORKFLOW.md` in the repo root.

### Template variables

| Variable | Type | Description |
|---|---|---|
| `project.name` | string | Project name from central config |
| `issue.identifier` | string | Linear issue ID (e.g., `BAC-123`) |
| `issue.title` | string | Issue title |
| `issue.description` | string | Issue description body |
| `issue.labels` | string[] | Issue labels |
| `issue.priority` | number | Priority (1=urgent, 4=low) |
| `specs` | string \| null | Rendered spec content for this issue |
| `attempt` | number \| null | Retry attempt number (null on first run) |
| `previous_failure` | string \| null | Failure reason from previous attempt |
| `cycle` | number \| null | Review cycle number (in repeating phases) |
| `previous_review` | string \| null | Review output from previous cycle |
| `step.name` | string | Current pipeline step name |
| `phase.name` | string | Current pipeline phase name |
| `context` | object | Assembled context (history, memory, scratchpad) |

### Template syntax

**Variables**: `{{ variable.path }}`

```markdown
Working on {{ project.name }}: {{ issue.title }}
```

**Conditionals**: `{% if variable %}...{% endif %}`

```markdown
{% if attempt %}
This is retry attempt {{ attempt }}. Previous failure:
{{ previous_failure }}
{% endif %}
```

## Validating configuration

```bash
# Validate central config
feliz config validate

# Print resolved config (with env vars expanded)
feliz config show
```
