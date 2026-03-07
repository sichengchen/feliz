# CLI Reference

## Global flags

| Flag | Description |
|---|---|
| `--config <path>` | Central config path (default: `~/.feliz/feliz.yml`) |
| `--json` | JSON output (E2E commands) |
| `--out <path>` | Write JSON report to file (E2E commands) |
| `--help`, `-h` | Show help |

## Commands

### Daemon

**`start`** — Start the Feliz daemon. Scaffolds a template config and exits if none exists.

```bash
feliz start
feliz start --config /path/to/feliz.yml
```

**`stop`** — Stop the daemon via PID file.

```bash
feliz stop
```

**`status`** — Show daemon and project status.

```bash
feliz status
```

### Setup

**`init`** — Interactive setup wizard. Creates `feliz.yml`.

```bash
feliz init
```

### Config

**`config validate`** — Validate central and repo configs.

```bash
feliz config validate
```

**`config show`** — Print resolved config with environment variables expanded.

```bash
feliz config show
```

### Projects

**`project list`** — List project mappings.

```bash
feliz project list
```

**`project add`** — Interactive project onboarding.

```bash
feliz project add
```

**`project remove <name>`** — Remove a project mapping.

```bash
feliz project remove backend-api
```

### Runs

**`run list`** — List recent runs.

```bash
feliz run list
```

**`run show <run_id>`** — Show run details and step executions.

```bash
feliz run show abc123
```

**`run retry <identifier>`** — Retry a failed work item.

```bash
feliz run retry BAC-123
```

### Agents

**`agent list`** — Show installed agent adapters and availability.

```bash
feliz agent list
```

### Context

**`context history <project>`** — Show history events for a project.

```bash
feliz context history backend-api
```

**`context show <identifier>`** — Show context snapshot for a work item.

```bash
feliz context show BAC-123
```

### Authentication

**`auth linear`** — Authenticate with Linear via OAuth2. Starts a temporary local server on the webhook port, opens the browser for authorization, exchanges the code for a token, verifies the bot identity, and writes the token to `feliz.yml`.

```bash
feliz auth linear
feliz auth linear --client-id <id> --client-secret <secret>
feliz auth linear --callback-url https://my-host.com/auth/callback
```

| Flag | Description |
|---|---|
| `--client-id <id>` | Linear OAuth app client ID (or prompt interactively) |
| `--client-secret <secret>` | Linear OAuth app client secret (or prompt interactively) |
| `--port <port>` | Callback server port (default: `3421`, same as webhook port) |
| `--callback-url <url>` | Public callback URL for Linear redirect (default: `http://localhost:<port>/auth/callback`). Use this when exposing Feliz to the internet, since Linear blocks `localhost` callback URLs. |

After authentication, the command prints next steps for configuring Linear webhooks.

### E2E Testing

**`e2e doctor`** — Check prerequisites (tools, auth, config).

```bash
feliz e2e doctor
```

**`e2e smoke`** — Run preflight smoke checks.

```bash
feliz e2e smoke
feliz e2e smoke --json --out /tmp/report.json
```

## Helper scripts

```bash
bun run e2e:doctor    # runs feliz e2e doctor
bun run e2e:smoke     # runs scripts/e2e-smoke.sh
bun run e2e:real      # runs scripts/e2e-real.sh
```
