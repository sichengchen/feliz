# Getting Started

Install Feliz, configure your first project, and verify everything works.

## Prerequisites

- [Bun](https://bun.sh)
- Git
- Linear OAuth token ([Settings > API](https://linear.app/settings/api))
- GitHub CLI (`gh auth login`)
- A coding agent CLI: `claude` or `codex`

## Install

```bash
git clone git@github.com:sichengchen/feliz.git
cd feliz
bun install
```

## Set credentials

```bash
export LINEAR_OAUTH_TOKEN="lin_oauth_..."
export GITHUB_TOKEN="ghp_..."
```

## Create config

Run the interactive wizard:

```bash
bun run src/cli/index.ts init
```

This prompts for your Linear OAuth token, webhook port, a project name, repo URL, and Linear project — then writes `~/.feliz/feliz.yml`.

Alternatively, run `start` without a config to scaffold a template you can edit manually.

## Start the daemon

```bash
bun run src/cli/index.ts start
```

Verify it's running:

```bash
bun run src/cli/index.ts status
bun run src/cli/index.ts config validate
```

## Add more projects

```bash
bun run src/cli/index.ts project add
```

This walks through Linear project selection, repo cloning, and scaffolding `.feliz/` config files if they don't exist.

## Validate with E2E smoke checks

```bash
bun run src/cli/index.ts e2e doctor
bun run src/cli/index.ts e2e smoke
```

For a full automated E2E run against real Linear and GitHub:

```bash
cp scripts/e2e.env.example scripts/e2e.env
# fill in credentials
bash scripts/e2e-real.sh --env-file scripts/e2e.env
```

## Docker alternative

```bash
cp .env.example .env
# fill in credentials
docker compose up -d --build
```

Run CLI commands inside the container:

```bash
docker compose exec feliz bun run src/cli/index.ts status
```

## Next steps

- [Usage](usage.md) — day-to-day operation
- [Configuration](configuration.md) — config reference
- [Pipelines](pipelines.md) — custom pipeline steps
