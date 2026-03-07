# CLI

The CLI is for managing Feliz, not for interacting with issues (that's Linear's job).

```
feliz start                    # Start the Feliz daemon
feliz init                     # Interactive setup wizard
feliz stop                     # Stop the daemon
feliz status                   # Show daemon status, running agents, queue

feliz project add              # Interactive: add a new project mapping
feliz project list             # List configured projects
feliz project remove <name>    # Remove a project

feliz run list                 # List recent runs across all projects
feliz run show <run_id>        # Show run details, artifacts, logs
feliz run retry <work_item>    # Manually retry a failed work item

feliz context show <work_item> # Show context snapshot for a work item
feliz context history <project># Show history events for a project

feliz agent list               # List installed agents and availability

feliz auth linear              # Authenticate with Linear (OAuth flow)

feliz config validate          # Validate feliz.yml and all .feliz/ configs
feliz config show              # Print resolved configuration

feliz e2e doctor               # Validate local E2E prerequisites
feliz e2e smoke                # Run automated E2E smoke checks
```

## E2E Commands

Feliz includes E2E harness helpers to validate environment readiness and run a preflight smoke report before full manual scenario execution.

### `feliz e2e doctor`

Runs prerequisite checks:

- Config file existence and parseability
- Required tools (`bun`, `gh`, `sqlite3`, `git`)
- Agent CLI availability (`codex` or `claude`)
- GitHub CLI authentication status
- Environment hints (e.g. `GITHUB_TOKEN`)

Returns non-zero when any critical check fails.

### `feliz e2e smoke`

Runs:

1. `doctor` checks
2. `feliz config validate`
3. Optional DB table preflight checks if DB already exists
4. Scenario checklist projection (`S1` - `S10`) as pending/blocked

Returns non-zero when doctor fails or a critical smoke check fails.

### Output Modes

- `--json`: prints JSON report payload
- `--out <path>`: writes JSON report to disk

## `feliz auth linear` — Linear OAuth flow

Performs the full Linear OAuth2 authorization code flow:

1. User runs `feliz auth linear`
2. Prompts for `--client-id` and `--client-secret` (or accepts them as flags)
3. Starts a temporary local HTTP server on the webhook port (default 3421, configurable via `--port`)
4. Prints an authorization URL and attempts to open it in the browser
5. Waits for the OAuth callback with `?code=...`
6. Exchanges the code for an access token via `POST https://api.linear.app/oauth/token`
7. Verifies the token by querying `{ viewer { id name } }` via the Linear GraphQL API
8. Writes the token into `feliz.yml` (as `$LINEAR_OAUTH_TOKEN` env var reference or literal, user's choice)
9. Returns a success HTML page to the browser and shuts down the temporary server

### Authorization URL

```
https://linear.app/oauth/authorize
  ?client_id=CLIENT_ID
  &redirect_uri=https://<your-host>:3421/auth/callback
  &response_type=code
  &scope=app:mentionable,app:assignable,read,write,issues:create
  &actor=app
```

`actor=app` installs Feliz as a bot identity (not a personal user).

The callback server uses the same port as webhooks (default 3421), so only one port needs to be exposed. Linear blocks `localhost` callback URLs — use `--callback-url` to specify a public URL.

### Flags

- `--client-id <id>` — Linear OAuth app client ID (or prompt interactively)
- `--client-secret <secret>` — Linear OAuth app client secret (or prompt interactively)
- `--port <port>` — callback server port (default 3421, same as webhook port)
- `--callback-url <url>` — public callback URL for the OAuth redirect (default: `http://localhost:<port>/auth/callback`)

### Error handling

- Port bind failure: print clear error
- Token exchange failure: print the error from Linear's response
- Viewer query failure after token exchange: warn but still save the token
- Timeout: 5 minutes with no callback received

### Config file handling

- If `feliz.yml` doesn't exist, create it with a minimal template plus the token
- If `feliz.yml` exists, update only `linear.oauth_token` — preserve everything else
- Uses `yaml` package (`parse` + `stringify`) for read-modify-write

## First-run experience

### Scaffold on `feliz start`

When `feliz start` is run without an existing config file, Feliz scaffolds a template config at the default path (`~/.feliz/feliz.yml`) or the `--config` path, prints instructions, and exits with code 0. The user edits the template and re-runs `feliz start`.

### `feliz init` wizard

An interactive wizard that prompts for:

1. **Linear OAuth** — guides through OAuth app registration (`actor=app`) or accepts `$LINEAR_OAUTH_TOKEN` if already set
2. **Project name** — human-readable identifier
3. **Git repo URL** — remote URL to clone
4. **Linear project name** — maps to the Linear project

The wizard writes a valid `feliz.yml` using `generateConfig()` from `src/config/writer.ts`. If a config already exists, it prints a message and exits without overwriting.

The generated config round-trips through `loadFelizConfig()` — this is tested and guaranteed.

### `feliz project add` wizard

An interactive wizard that adds a new project mapping to `feliz.yml`. The wizard:

1. **Fetches Linear projects** — calls the Linear API to list all projects, displays a numbered list
2. **Project selection** — user picks a project by number; this sets the `linear_project` field
3. **Git repo URL** — prompts for the remote URL to clone
4. **Base branch** — prompts for the base branch (default: `main`)
5. **Clone** — clones the repo via `WorkspaceManager.cloneRepo()`
6. **Detect `.feliz/`** — checks if `.feliz/config.yml` already exists in the cloned repo
7. **Scaffold** (if missing) — prompts for agent adapter, specs, test/lint commands, then creates:
   - `.feliz/config.yml` — repo settings
   - `.feliz/pipeline.yml` — default pipeline from `getDefaultPipeline()`
   - `.feliz/prompts/` — empty prompts directory
   - `WORKFLOW.md` — default prompt template
8. **Commit & push** (if scaffolded) — optionally commits and pushes the `.feliz/` config to the repo
9. **Add to `feliz.yml`** — appends the project entry using `addProjectToConfig()`

The project name is derived from the repo URL (e.g., `git@github.com:org/payments-service.git` → `payments-service`).

The wizard uses dependency injection (`WizardDeps` interface) for all external operations, making the full flow testable without network or filesystem access.
