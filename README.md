# Feliz

Feliz is a self-hosted cloud agents platform.

It turns Linear issues into pull requests by orchestrating coding agents, repository worktrees, test/lint gates, and publishing.

## What Feliz does

1. Polls Linear projects for issue changes.
2. Tracks each issue as a `WorkItem` with an orchestration state.
3. Creates isolated git worktrees per run.
4. Runs agent pipelines from repo config (`.feliz/pipeline.yml`).
5. Publishes PRs and stores run/history/context artifacts.

Runtime: Bun + TypeScript
Persistence: SQLite + filesystem + git repos

## Use Feliz (Operator Flow)

This is the shortest path to actually use it:

1. Run bootstrap once: `bun run e2e:real -- --env-file scripts/e2e.env`
2. Start daemon: `bun run src/cli/index.ts start --config /tmp/feliz-e2e/feliz.yml`
3. Create issue in mapped Linear project.
4. Watch run: `bun run src/cli/index.ts run list --config /tmp/feliz-e2e/feliz.yml`
5. Inspect run: `bun run src/cli/index.ts run show <run_id> --config /tmp/feliz-e2e/feliz.yml`

Detailed usage guide: [docs/usage.md](docs/usage.md)

## Quick Start (Local)

```bash
# 1) Install deps
bun install

# 2) Set required env
export LINEAR_API_KEY="lin_api_..."
export GITHUB_TOKEN="ghp_..."   # recommended

# 3) Create config interactively
bun run src/cli/index.ts init

# 4) Start daemon
bun run src/cli/index.ts start
```

In another terminal:

```bash
bun run src/cli/index.ts status
bun run src/cli/index.ts config validate
```

If `start` is run before a config exists, Feliz scaffolds `~/.feliz/feliz.yml` and exits. Edit it, then run `start` again.

## Quick Start (Docker)

```bash
cp .env.example .env
# edit .env values

docker compose up -d --build
```

Default container command is `start`. Run other commands with:

```bash
docker compose exec feliz bun run src/cli/index.ts init
docker compose exec feliz bun run src/cli/index.ts status
```

## E2E Smoke Harness

Use the repo helper script:

```bash
cp scripts/e2e.env.example scripts/e2e.env
# edit scripts/e2e.env

bash scripts/e2e-smoke.sh \
  --env-file scripts/e2e.env \
  --config /tmp/feliz-e2e/feliz.yml \
  --report /tmp/feliz-e2e-smoke-report.json
```

What it runs:

1. `feliz e2e doctor`
2. `feliz e2e smoke --json --out ...`

## Real E2E Automation

After `gh auth login`, agent login, and creating a Linear project (default: `Feliz E2E Test`), run:

```bash
cp scripts/e2e.env.example scripts/e2e.env
# edit scripts/e2e.env

bash scripts/e2e-real.sh --env-file scripts/e2e.env
```

`scripts/e2e-real.sh` creates/clones a GitHub sandbox repo, seeds repo files, writes E2E config, runs smoke checks, and prints the exact `start` command.

## CLI Overview

```text
start                    Start the Feliz daemon
init                     Interactive setup wizard
stop                     Stop the daemon
status                   Show daemon status
config validate          Validate configuration
config show              Print resolved configuration
project list             List configured projects
project add              Add a new project
project remove <name>    Remove a project
run list                 List recent runs
run show <run_id>        Show run details
run retry <work_item>    Retry a failed work item
agent list               List installed agents
context history <proj>   Show history events
context show <item>      Show context snapshot
e2e doctor               Validate local E2E prerequisites
e2e smoke                Run automated E2E smoke checks
```

## Configuration Model

Feliz has two config layers:

1. Central config (`feliz.yml`) for Linear key, storage, global concurrency, and project mappings.
2. Repo config (`.feliz/config.yml` + `.feliz/pipeline.yml`) for agent behavior, specs, gates, and pipeline steps.

See [Configuration Guide](docs/configuration.md).

## Documentation

- [Usage Guide](docs/usage.md)
- [Getting Started](docs/getting-started.md)
- [CLI Reference](docs/cli.md)
- [Configuration Guide](docs/configuration.md)
- [Pipeline Guide](docs/pipelines.md)
- [Agent Guide](docs/agents.md)
- [Skills](docs/skills.md)

## Specification Index

Specs are the source of truth for behavior and architecture:

- [Specs Index](specs/index.md)
- [Architecture](specs/architecture/index.md)
- [Configuration](specs/configuration/index.md)
- [Orchestration](specs/orchestration/index.md)
- [Testing Plan](specs/testing/index.md)

## Development Commands

```bash
bun install
bun test
bun run lint
bun run build
```
