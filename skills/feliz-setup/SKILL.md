---
name: feliz-setup
description: Use this skill to install and configure Feliz from scratch. Covers prerequisites, credentials, central config (`feliz.yml`), Linear OAuth app setup, and daemon startup. Does not configure individual project repos — use `feliz-add-project` for that.
---

# Feliz Setup

Install and configure the Feliz service on a machine or container.

## When to use

- Fresh Feliz install
- Reconfiguring central `feliz.yml`
- Troubleshooting daemon startup or credential issues

## Prerequisites

Before starting, verify these are installed:
- **Bun** — `bun --version`
- **Git** — `git --version`
- **GitHub CLI** — `gh auth status`
- **A coding agent CLI** — `claude --version` or `codex --version`

## Interview

Ask the user before writing any config:

1. **Runtime mode** — Docker or local CLI?
2. **Central config path**
   - Docker default: `/data/feliz/feliz.yml`
   - Local default: `~/.feliz/feliz.yml`
3. **Linear OAuth token** — Is `$LINEAR_OAUTH_TOKEN` set, or does the user need to create a Linear OAuth app?
   - If creating: guide through https://linear.app/settings/api/applications/new
   - App must have scopes: `app:mentionable`, `app:assignable`, `read`, `write`, `issues:create`
   - Complete OAuth flow with `actor=app`
   - Enable webhooks and select "Agent session events"
4. **Webhook port** — default `3421`
5. **Storage paths**
   - `data_dir` — Docker: `/data/feliz`, Local: `~/.feliz`
   - `workspace_root` — Docker: `/data/feliz/workspaces`, Local: `~/.feliz/workspaces`
6. **Default agent adapter** — `claude-code` or `codex`
7. **Max concurrent runs** — default `5`

## Workflow

### 1. Preflight

```bash
bun --version
git --version
gh auth status
claude --version  # or codex --version
```

Stop on first failure. Help the user fix it before continuing.

Check credential env vars:
- `LINEAR_OAUTH_TOKEN` — required
- `GITHUB_TOKEN` — required
- `ANTHROPIC_API_KEY` — required for claude-code adapter
- `OPENAI_API_KEY` — required for codex adapter

### 2. Write `feliz.yml`

Generate from interview answers. Minimal valid config:

```yaml
linear:
  oauth_token: $LINEAR_OAUTH_TOKEN

webhook:
  port: 3421

tick:
  interval_ms: 5000

storage:
  data_dir: ~/.feliz
  workspace_root: ~/.feliz/workspaces

agent:
  default: claude-code
  max_concurrent: 5

projects: []
```

The `projects` array starts empty — projects are added via `feliz-add-project` or `feliz project add`.

### 3. Validate

```bash
bun run src/cli/index.ts --config <path> config validate
```

Fix any errors before proceeding.

### 4. Start daemon

```bash
bun run src/cli/index.ts --config <path> start
```

In a separate terminal, verify:

```bash
bun run src/cli/index.ts --config <path> status
```

### 5. Next step

Tell the user to add a project using `feliz-add-project` or:

```bash
bun run src/cli/index.ts project add
```

## Guardrails

- Do not write project repo `.feliz/*` files — that is `feliz-add-project` scope.
- Do not skip the interview.
- Do not hardcode secrets in `feliz.yml` — always use `$ENV_VAR` references.
- If `feliz.yml` already exists, confirm before overwriting.
