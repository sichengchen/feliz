# Getting Started

This guide walks through first install, first project onboarding, and first smoke validation.

## Prerequisites

- Bun
- Git
- Linear API key
- GitHub CLI (`gh`) authenticated
- At least one supported agent CLI (`codex` or `claude`)

## 1) Install Feliz

```bash
git clone <repo-url>
cd feliz
bun install
```

## 2) Set environment variables

```bash
export LINEAR_API_KEY="lin_api_..."
export GITHUB_TOKEN="ghp_..."   # recommended for publish checks
```

For E2E testing, put test-only values in `scripts/e2e.env` (copied from `scripts/e2e.env.example`) and pass it to the smoke script.

## 3) Initialize central config

Interactive wizard:

```bash
bun run src/cli/index.ts init
```

You will be prompted for:

1. Linear API key (or use existing `LINEAR_API_KEY` env var)
2. Project name
3. Git repo URL
4. Linear project name

This writes `~/.feliz/feliz.yml` by default.

Alternative: run `start` first to scaffold a template config file, then edit manually.

## 4) Start the daemon

```bash
bun run src/cli/index.ts start
```

Check status:

```bash
bun run src/cli/index.ts status
```

## 5) Add additional projects

```bash
bun run src/cli/index.ts project add
```

`project add` flow:

1. Fetch Linear projects and choose one.
2. Enter repo URL and base branch.
3. Clone repo into workspace.
4. If `.feliz/config.yml` is missing, scaffold `.feliz/` and `WORKFLOW.md`.
5. Optionally commit and push scaffolded files.
6. Append project mapping to central `feliz.yml`.

## 6) Validate config and run preflight

```bash
bun run src/cli/index.ts config validate
bun run src/cli/index.ts e2e doctor
bun run src/cli/index.ts e2e smoke
```

## 7) Use the repo smoke helper script

```bash
cp scripts/e2e.env.example scripts/e2e.env
# edit scripts/e2e.env

bash scripts/e2e-smoke.sh \
  --env-file scripts/e2e.env \
  --config /tmp/feliz-e2e/feliz.yml \
  --report /tmp/feliz-e2e-smoke-report.json
```

## 8) Operate through Linear

Issue interaction is driven from Linear (state changes/comments/labels). CLI is operational and inspection tooling.

## Next Docs

- [Configuration](configuration.md)
- [Pipelines](pipelines.md)
- [Agents](agents.md)
- [CLI](cli.md)
