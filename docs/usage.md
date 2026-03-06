# Usage Guide

`USE = CONFIG + USAGE`

- **Config** tells Feliz what projects/tools to use.
- **Usage** is the day-to-day operator flow.

This guide is the usage part.

## 0) One-time bootstrap

If you have not configured Feliz yet, do this once:

```bash
cp scripts/e2e.env.example scripts/e2e.env
# fill real credentials
bun run e2e:real -- --env-file scripts/e2e.env
```

This prepares a real sandbox repo + `feliz.yml` and runs smoke checks.

## 1) Start Feliz

```bash
bun run src/cli/index.ts start --config /tmp/feliz-e2e/feliz.yml
```

Keep this terminal running.

## 2) Create work in Linear

In your mapped Linear project (example: `Feliz E2E Test`):

1. Create an issue with clear acceptance criteria.
2. Keep it unblocked.
3. Wait one poll cycle (default in E2E config: 5s).

Feliz will discover it and start orchestration.

## 3) Monitor runs

Open a second terminal:

```bash
bun run src/cli/index.ts status --config /tmp/feliz-e2e/feliz.yml
bun run src/cli/index.ts run list --config /tmp/feliz-e2e/feliz.yml
```

When you have a run id:

```bash
bun run src/cli/index.ts run show <run_id> --config /tmp/feliz-e2e/feliz.yml
```

## 4) Verify delivery

Success means all are true:

1. A PR is created in GitHub sandbox repo.
2. `run show` prints a non-null `PR` URL.
3. Linear issue has run updates/comments.

## 5) Retry failure

If a run fails:

```bash
bun run src/cli/index.ts run retry <LINEAR_IDENTIFIER> --config /tmp/feliz-e2e/feliz.yml
```

Then monitor again with `run list` / `run show`.

## 6) Inspect history/context

```bash
bun run src/cli/index.ts context history feliz-e2e-sandbox --config /tmp/feliz-e2e/feliz.yml
bun run src/cli/index.ts context show <LINEAR_IDENTIFIER> --config /tmp/feliz-e2e/feliz.yml
```

## Daily Operator Cheat Sheet

```bash
# start
bun run src/cli/index.ts start --config /tmp/feliz-e2e/feliz.yml

# health
bun run src/cli/index.ts status --config /tmp/feliz-e2e/feliz.yml

# runs
bun run src/cli/index.ts run list --config /tmp/feliz-e2e/feliz.yml
bun run src/cli/index.ts run show <run_id> --config /tmp/feliz-e2e/feliz.yml

# retry
bun run src/cli/index.ts run retry <LINEAR_IDENTIFIER> --config /tmp/feliz-e2e/feliz.yml

# stop
bun run src/cli/index.ts stop --config /tmp/feliz-e2e/feliz.yml
```

## Related Docs

- Setup: [getting-started.md](getting-started.md)
- Config reference: [configuration.md](configuration.md)
- CLI reference: [cli.md](cli.md)
- E2E spec plan: ../specs/testing/index.md
