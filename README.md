# Feliz

Turn Linear issues into merged pull requests. Feliz is a self-hosted platform that orchestrates local coding agents (Claude Code, Codex) through configurable pipelines — from issue discovery to PR delivery.

## How it works

Assign a Linear issue to Feliz (or `@Feliz` mention) and it runs a configurable agent pipeline — implementation, testing, review, and PR creation — all handled by local coding agents in isolated git worktrees.

## Prerequisites

- [Bun](https://bun.sh)
- Git
- At least one coding agent CLI:
  - [Claude Code](https://claude.ai/download): `curl -fsSL https://claude.ai/install.sh | bash`
  - [Codex](https://github.com/openai/codex): `npm install -g @openai/codex`
- [GitHub CLI](https://cli.github.com/) (`gh`)
- A [Linear OAuth app](https://linear.app/settings/api/applications/new) (actor=app)
- GitHub personal access token with `repo` scope ([create one](https://github.com/settings/tokens))

## Quick start

You can use the [`feliz-setup`](skills/feliz-setup/SKILL.md) and [`feliz-add-project`](skills/feliz-add-project/SKILL.md) agent skills:

1. **`feliz-setup`** — installs Feliz, configures credentials (Linear OAuth, GitHub token), writes `feliz.yml`, starts the daemon
2. **`feliz-add-project`** — adds a repo, configures `.feliz/pipeline.yml`, prompt templates, and `WORKFLOW.md`

Or manually:

```bash
git clone git@github.com:sichengchen/feliz.git && cd feliz
bun install

# Authenticate with Linear (runs OAuth flow, opens browser)
# Use --callback-url with your public URL (Linear blocks localhost)
bun run src/cli/index.ts auth linear --callback-url https://<your-host>:3421/auth/callback

export GITHUB_TOKEN="ghp_..."

bun run src/cli/index.ts init         # set up central config
bun run src/cli/index.ts project add  # add a project
bun run src/cli/index.ts start        # start daemon
```

Or with Docker:

```bash
cp .env.example .env   # fill in credentials (see .env.example for guidance)
docker compose up -d --build

# Install an agent CLI (claude or codex):
docker compose exec feliz bash -c 'curl -fsSL https://claude.ai/install.sh | bash'

# Add a project:
docker compose exec feliz bun run src/cli/index.ts project add
```

## CLI

```
feliz start                    Start daemon
feliz stop                     Stop daemon
feliz status                   Show daemon health

feliz init                     Set up central config
feliz config validate          Check configuration
feliz config show              Print resolved config

feliz project list             List projects
feliz project add              Add a project
feliz project remove <name>    Remove a project

feliz run list                 List recent runs
feliz run show <id>            Show run details
feliz run retry <identifier>   Retry a failed item

feliz auth linear              Authenticate with Linear (OAuth)
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
