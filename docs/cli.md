# CLI Reference

Feliz CLI controls the daemon and inspects persisted state.

## Global flags

- `--config <path>`: path to central config (`~/.feliz/feliz.yml` default)
- `--json`: JSON output mode (`e2e` commands)
- `--out <path>`: write JSON report to file (`e2e` commands)
- `--help`, `-h`: show help

## Commands

### `start`

Start daemon. If config file is missing, writes a template config and exits.

```bash
bun run src/cli/index.ts start
bun run src/cli/index.ts start --config /tmp/feliz.yml
```

### `init`

Interactive setup wizard for initial `feliz.yml` creation.

```bash
bun run src/cli/index.ts init
```

### `stop`

Stop daemon using PID file in `storage.data_dir`.

```bash
bun run src/cli/index.ts stop
```

### `status`

Show configured/running status from config + database.

```bash
bun run src/cli/index.ts status
```

### `config validate`

Validates central config and repo configs/pipelines for cloned projects.

```bash
bun run src/cli/index.ts config validate
```

### `config show`

Print resolved central config (env-expanded).

```bash
bun run src/cli/index.ts config show
```

### `project list`

List project mappings from central config.

```bash
bun run src/cli/index.ts project list
```

### `project add`

Interactive project onboarding wizard.

```bash
bun run src/cli/index.ts project add
```

### `project remove <name>`

Remove mapping from central config.

```bash
bun run src/cli/index.ts project remove backend-api
```

### `run list`

List recent runs.

```bash
bun run src/cli/index.ts run list
```

### `run show <run_id>`

Show run details and step executions.

```bash
bun run src/cli/index.ts run show <run_id>
```

### `run retry <work_item_identifier>`

Move failed item to `retry_queued`.

```bash
bun run src/cli/index.ts run retry BAC-123
```

### `agent list`

Show installed adapter availability.

```bash
bun run src/cli/index.ts agent list
```

### `context history <project>`

Show history events for a project.

```bash
bun run src/cli/index.ts context history backend-api
```

### `context show <work_item_identifier>`

Show latest context snapshot and artifact refs for a work item.

```bash
bun run src/cli/index.ts context show BAC-123
```

### `e2e doctor`

Check E2E prerequisites (tools/auth/config).

```bash
bun run src/cli/index.ts e2e doctor
```

### `e2e smoke`

Run preflight smoke checks and scenario checklist projection.

```bash
bun run src/cli/index.ts e2e smoke
bun run src/cli/index.ts e2e smoke --json --out /tmp/feliz-e2e-report.json
```

## Helper scripts

From repo root:

```bash
bun run e2e:doctor
bun run e2e:smoke
```

`e2e:smoke` runs `scripts/e2e-smoke.sh`.
