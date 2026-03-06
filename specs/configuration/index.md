# Configuration

## Central Server Config (`feliz.yml`)

Lives in Feliz's data directory (e.g., `/data/feliz.yml` or `~/.feliz/feliz.yml`). Defines global settings and project-to-repo mappings. Secrets are referenced via environment variables.

```yaml
# feliz.yml

linear:
  oauth_token: $LINEAR_OAUTH_TOKEN   # OAuth app token (actor=app)

webhook:
  port: 3421

tick:
  interval_ms: 5000

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

**Configuration schema**:

| Field | Type | Default | Description |
|---|---|---|---|
| `linear.oauth_token` | string (env ref) | required | Linear OAuth app token (`actor=app`). Supports `$ENV_VAR` indirection. |
| `webhook.port` | number | `3421` | Port for receiving Linear webhook events. |
| `tick.interval_ms` | number | `5000` | Tick interval in milliseconds for background orchestration. |
| `storage.data_dir` | string | `~/.feliz` | Root directory for Feliz data (DB, logs). |
| `storage.workspace_root` | string | `{data_dir}/workspaces` | Root directory for repo clones and worktrees. |
| `agent.default` | string | `claude-code` | Default agent adapter name. |
| `agent.max_concurrent` | number | `5` | Max concurrent agent runs across all projects. |
| `projects[]` | array | required | List of project definitions. |
| `projects[].name` | string | required | Human-readable project identifier (used internally by Feliz). |
| `projects[].repo` | string | required | Git remote URL to clone. |
| `projects[].linear_project` | string | required | Linear project name. One Linear project maps to one repo. |
| `projects[].branch` | string | `main` | Default base branch for worktrees. |

## Per-Repo Config (`.feliz/` directory + `WORKFLOW.md`)

Repo-level configuration uses two locations with distinct roles:

- **`.feliz/`** directory — structured YAML configs for machine-readable settings
- **`WORKFLOW.md`** in repo root — the general workflow prompt template (markdown)

```
repo-root/
  .feliz/
    config.yml              # Repo settings: agent, hooks, specs, gates, concurrency
    pipeline.yml            # Multi-step execution pipeline definition
    prompts/
      write_tests.md        # Per-step prompt templates
      write_code.md
      review.md
      fix_review.md
  WORKFLOW.md               # Default/fallback prompt template
  specs/                    # Spec directory (if specs.enabled)
    index.md
    ...
```

### `.feliz/config.yml`

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

**Config schema**:

| Field | Type | Default | Description |
|---|---|---|---|
| `agent.adapter` | string | from central config | Default agent adapter for this repo. |
| `agent.approval_policy` | `auto` \| `suggest` \| `gated` | `auto` | Agent approval mode (see section 7.4). |
| `agent.max_turns` | number | `20` | Max conversation turns per agent invocation. |
| `agent.timeout_ms` | number | `600000` | Max wall-clock time per agent invocation (10min default). |
| `hooks.after_create` | string | none | Shell command after worktree creation. |
| `hooks.before_run` | string | none | Shell command before each pipeline step. |
| `hooks.after_run` | string | none | Shell command after each pipeline step. |
| `hooks.before_remove` | string | none | Shell command before worktree removal. |
| `specs.enabled` | boolean | `false` | Enable spec-driven development for this repo. Specs are system design documents with behavioral cases. When `false`, Feliz has no concept of specs: no spec drafting, no spec review states, no spec artifacts, no decomposition-to-spec flow. |
| `specs.directory` | string | `specs` | Directory in repo root where specs are stored. Only used when `specs.enabled: true`. |
| `specs.approval_required` | boolean | `true` | Whether spec drafts require human approval before execution. Only used when `specs.enabled: true`. |
| `gates.test_command` | string | none | Command to run tests. |
| `gates.lint_command` | string | none | Command to run linter. |
| `concurrency.max_per_state` | map<string, number> | none | Per-issue-state concurrency limits. |

### `.feliz/pipeline.yml`

Defines the multi-step execution pipeline as a sequence of **phases**, each containing **steps**. Steps within a phase run sequentially. Phases run sequentially. A phase can repeat (loop) for convergence patterns like review cycles.

```yaml
phases:
  - name: implement
    steps:
      - name: write_tests
        agent: claude-code
        prompt: .feliz/prompts/write_tests.md
        success:
          command: "npm test -- --bail"
      - name: write_code
        agent: claude-code
        prompt: .feliz/prompts/write_code.md
        success:
          command: "npm test"
        max_attempts: 5

  - name: review_cycle
    repeat:
      max: 3
      on_exhaust: pass    # auto-pass after 3 cycles, flag for human review
    steps:
      - name: review
        agent: codex
        prompt: .feliz/prompts/review.md
        success:
          agent_verdict: approved
      - name: fix_issues
        agent: claude-code
        prompt: .feliz/prompts/fix_review.md
        success:
          command: "npm test"

  - name: publish
    steps:
      - name: final_check
        agent: claude-code
        prompt: .feliz/prompts/final_check.md
        success:
          command: "npm run lint && npm test"
      - name: create_pr
        agent: claude-code
        prompt: .feliz/prompts/publish.md
```

**Pipeline schema**:

| Field | Type | Description |
|---|---|---|
| `phases[]` | array | Ordered list of execution phases. |
| `phases[].name` | string | Unique phase name for logging and status. |
| `phases[].repeat.max` | number | Max times this phase repeats (default: 1, no repeat). |
| `phases[].repeat.on_exhaust` | `pass` \| `fail` | Behavior when max cycles reached without success. `pass` = continue with warning. `fail` = abort run. |
| `phases[].steps[]` | array | Ordered list of steps within the phase. |
| `phases[].steps[].name` | string | Unique step name. |
| `phases[].steps[].agent` | string | Agent adapter to use (overrides repo default). Every step is an agent call. |
| `phases[].steps[].prompt` | string | Path to prompt template file (relative to repo root). Falls back to `WORKFLOW.md` if omitted. |
| `phases[].steps[].success` | object | Optional post-agent validation condition (see below). |
| `phases[].steps[].max_attempts` | number | Max retries for this individual step (default: 1). Step is re-run with failure context on each retry. |

**Success condition types**:

| Type | Schema | Description |
|---|---|---|
| Shell command | `{ command: "npm test" }` | Step succeeds if command exits 0 in the worktree. |
| Agent verdict | `{ agent_verdict: "approved" }` | Step succeeds if agent output contains the specified verdict keyword. |
| File exists | `{ file_exists: "path/to/file" }` | Step succeeds if the specified file exists after the step. |
| Always pass | `{ always: true }` | Step always succeeds (for intermediate/draft steps). |

If no `success` is specified, the step succeeds if the agent exits 0.

**Phase repeat semantics**: When a phase has `repeat`, the entire phase (all steps) re-executes from the first step if the last step's success condition is not met. Each cycle increments a `cycle` counter available in prompt templates. On the final cycle with `on_exhaust: pass`, the phase completes with a warning and Feliz posts a note to Linear indicating the review cycle was auto-passed.

**Default pipeline**: If `.feliz/pipeline.yml` does not exist, Feliz uses a single-phase default pipeline:

```yaml
phases:
  - name: execute
    steps:
      - name: run
        prompt: WORKFLOW.md
        success:
          command: "{gates.test_command}"  # from config.yml, if set
      - name: publish
        prompt: .feliz/prompts/publish.md
```

### `WORKFLOW.md`

The repo-root `WORKFLOW.md` serves as the **default prompt template**. It is a plain markdown file (no YAML front matter — all config lives in `.feliz/config.yml`). It uses Jinja2-style template syntax.

```markdown
# System Prompt

You are working on {{ project.name }}.

## Issue

**{{ issue.identifier }}**: {{ issue.title }}

{{ issue.description }}

{% if specs %}
## Specifications

{{ specs }}
{% endif %}

{% if attempt %}
## Previous Attempt

This is attempt {{ attempt }}. Previous run failed with:
{{ previous_failure }}
{% endif %}

{% if cycle %}
## Review Cycle {{ cycle }}

Previous review feedback:
{{ previous_review }}
{% endif %}

## Instructions

- Follow the coding conventions in this repository
- Write tests for new functionality
- Do not modify unrelated code
```

**Template variables** available in all prompt templates:

| Variable | Type | Description |
|---|---|---|
| `project.name` | string | Project name from central config. |
| `issue.identifier` | string | Linear issue identifier (e.g., "BAC-123"). |
| `issue.title` | string | Issue title. |
| `issue.description` | string | Issue description body. |
| `issue.labels` | string[] | Issue labels. |
| `issue.priority` | number | Issue priority (1=urgent, 4=low). |
| `specs` | string \| null | Rendered spec content relevant to this issue. |
| `attempt` | number \| null | Retry attempt number (null on first run). |
| `previous_failure` | string \| null | Failure reason from previous attempt. |
| `cycle` | number \| null | Review cycle number (within a repeating phase). |
| `previous_review` | string \| null | Review output from previous cycle. |
| `step.name` | string | Current pipeline step name. |
| `phase.name` | string | Current pipeline phase name. |
| `context` | object | Assembled context artifacts (history, memory, scratchpad). |
