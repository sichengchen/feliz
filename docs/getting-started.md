# Getting Started

Install Feliz, configure your first project, and verify everything works.

## Prerequisites

- [Bun](https://bun.sh)
- Git
- A [Linear OAuth app](https://linear.app/settings/api/applications/new) (with `actor=app` for bot identity)
- GitHub personal access token with `repo` scope ([create one](https://github.com/settings/tokens))
- GitHub CLI (`gh auth login`) or `GITHUB_TOKEN` env var
- A coding agent CLI: `claude` or `codex`

## Install

```bash
git clone git@github.com:sichengchen/feliz.git
cd feliz
bun install
```

## Authenticate with Linear

Run the OAuth flow to obtain and store your Linear token:

```bash
bun run src/cli/index.ts auth linear
```

This will:
1. Prompt for your Linear OAuth app's client ID and client secret
2. Open the Linear authorization page in your browser
3. Exchange the authorization code for an access token
4. Verify the bot identity via `viewer { id name }`
5. Write the token to `~/.feliz/feliz.yml`

You can also pass credentials as flags:

```bash
bun run src/cli/index.ts auth linear --client-id <id> --client-secret <secret>
```

Or set the token manually:

```bash
export LINEAR_OAUTH_TOKEN="lin_oauth_..."
```

## Set up Linear webhooks

After authenticating, configure webhooks in your Linear OAuth app settings:

1. Go to your Linear OAuth app settings
2. Enable webhooks and select **Agent session events**
3. Set the webhook URL to `https://<your-host>:3421/webhook/linear`

## Set GitHub credentials

```bash
export GITHUB_TOKEN="ghp_..."  # needs `repo` scope
```

## Create config

Run the interactive wizard:

```bash
bun run src/cli/index.ts init
```

This prompts for a project name, repo URL, and Linear project — then writes `~/.feliz/feliz.yml`.

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
# fill in credentials (see .env.example for guidance)
docker compose up -d --build
```

The Docker entrypoint automatically:
- Runs preflight checks (tools, auth, env vars)
- Generates `feliz.yml` from environment variables if none exists
- Validates the configuration before starting

Run CLI commands inside the container:

```bash
docker compose exec feliz bun run src/cli/index.ts status
docker compose exec feliz bun run src/cli/index.ts project add
docker compose exec feliz bun run src/cli/index.ts auth linear
```

## Next steps

- [Usage](usage.md) — day-to-day operation
- [Configuration](configuration.md) — config reference
- [Pipelines](pipelines.md) — custom pipeline steps
