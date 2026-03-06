---
name: feliz-machine-setup
description: Use this skill for machine-level Feliz bootstrap and repair. It configures central `feliz.yml`, environment/auth prerequisites, and daemon lifecycle (`init`, `validate`, `start`, `status`) but does not configure repo `.feliz/*`.
---

# Feliz Machine Setup

Use this skill for host/container setup of Feliz itself.

## Scope

In scope:
- Environment and credential preflight
- Central config (`feliz.yml`) creation/update
- Daemon lifecycle checks (`start`, `status`, `stop`)

Out of scope:
- Project repo `.feliz/config.yml`
- Project repo `.feliz/pipeline.yml`
- `WORKFLOW.md` inside a project repo

For project repo onboarding, use `feliz-project-onboarding`.

## Hard requirement

Run `/interview` before editing config.

Minimum interview topics:
- Runtime mode: Docker or local CLI
- Central config path:
  - Docker default: `/data/feliz/feliz.yml`
  - Local default: `~/.feliz/feliz.yml`
- Workspace root:
  - Docker default: `/data/feliz/workspaces`
  - Local default: `~/.feliz/workspaces`
- Linear OAuth token source: env reference or literal
- Webhook port (default: `3421`)
- Default adapter: `claude-code` or `codex`
- Global concurrency: `agent.max_concurrent`

## Output contract

Write central config only:
- `feliz.yml` at selected path

Config must include:
- `linear.oauth_token`
- `webhook.port`
- `storage` (`data_dir`, `workspace_root` as needed)
- `agent` (`default`, `max_concurrent`)
- `projects[]` (can be empty only if current CLI behavior allows project-add bootstrap)

## Workflow

1. Preflight
- Verify `bun`, `git`.
- Verify Linear OAuth token source is present.
- Verify git auth mode works (SSH agent or HTTPS credential flow).

2. Write central config
- Generate or patch `feliz.yml` from interview answers.
- Preserve user-intended values not explicitly changed.

3. Validate
- Run `bun run src/cli/index.ts --config <path> config validate`.
- Fix schema/format errors.

4. Start and verify
- Run `bun run src/cli/index.ts --config <path> start`.
- Run `bun run src/cli/index.ts --config <path> status`.

## Guardrails

- Do not create repo `.feliz/*` here.
- Do not skip `/interview`.
- Stop and fix first failing prerequisite before continuing.
