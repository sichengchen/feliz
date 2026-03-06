# Feliz

Turn Linear issues into merged pull requests. Feliz is a self-hosted platform that orchestrates local coding agents (Claude Code, Codex) through configurable pipelines — from issue discovery to PR delivery.

## How it works

Assign a Linear issue to Feliz (or `@Feliz` mention) and it runs a configurable agent pipeline — implementation, testing, review, and PR creation — all handled by local coding agents in isolated git worktrees.

## Quick start

Install the [`feliz-setup`](skills/feliz-setup/SKILL.md) and [`feliz-add-project`](skills/feliz-add-project/SKILL.md) Claude Code skills, then:

1. **`feliz-setup`** — installs Feliz, configures credentials (Linear OAuth, GitHub token), writes `feliz.yml`, starts the daemon
2. **`feliz-add-project`** — adds a repo, configures `.feliz/pipeline.yml`, prompt templates, and `WORKFLOW.md`

Or manually:

```bash
git clone <repo-url> && cd feliz
bun install

export LINEAR_OAUTH_TOKEN="lin_oauth_..."
export GITHUB_TOKEN="ghp_..."

bun run src/cli/index.ts init    # interactive setup
bun run src/cli/index.ts start   # start daemon
```

## CLI

```
feliz start                    Start daemon
feliz stop                     Stop daemon
feliz status                   Show daemon health

feliz init                     Setup wizard
feliz config validate          Check configuration
feliz config show              Print resolved config

feliz project list             List projects
feliz project add              Add a project
feliz project remove <name>    Remove a project

feliz run list                 List recent runs
feliz run show <id>            Show run details
feliz run retry <identifier>   Retry a failed item

feliz agent list               Show available agents

feliz context history <proj>   Project history
feliz context show <item>      Work item context

feliz e2e doctor               Check prerequisites
feliz e2e smoke                Run smoke checks
```

## Configuration

Two layers:

1. **Central config** (`~/.feliz/feliz.yml`) — Linear OAuth token, webhook port, storage paths, project mappings, agent defaults.
2. **Repo config** (`.feliz/config.yml` + `.feliz/pipeline.yml`) — agent behavior, pipeline steps, test/lint gates, hooks.

See [docs/configuration.md](docs/configuration.md).

## Documentation

| Guide | Description |
|---|---|
| [Getting Started](docs/getting-started.md) | Install, configure, first run |
| [Usage](docs/usage.md) | Day-to-day operation |
| [Configuration](docs/configuration.md) | Central and repo config reference |
| [Pipelines](docs/pipelines.md) | Multi-phase pipeline definition |
| [Agents](docs/agents.md) | Agent adapters and custom agents |
| [CLI](docs/cli.md) | Full command reference |
| [Skills](docs/skills.md) | Claude Code skills for setup and project config |

## Specs

Design specifications live in [`specs/`](specs/index.md) — the source of truth for architecture, state machines, data types, and behavior.

## Development

```bash
bun install
bun test
bun run lint
bun run build
```
