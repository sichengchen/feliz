# Usage

Day-to-day operation of Feliz after setup is complete.

## Start the daemon

```bash
bun run src/cli/index.ts start
```

Keep this terminal running. Feliz polls Linear on the configured interval (default: 30s).

## Create work in Linear

Create an issue in your mapped Linear project with clear acceptance criteria. Feliz polls **all issues** in the project regardless of Linear state (Backlog, Todo, In Progress, etc.) — any new issue is picked up on the next poll cycle.

What happens after discovery:

1. Issue is claimed and queued (or routed to spec drafting / decomposition if configured).
2. An isolated git worktree is created.
3. The pipeline runs (agent execution, gates, PR creation).

No labels, commands, or special formatting needed — just write the issue.

If nothing happens after creating an issue, check:

- Is the daemon running? (`feliz status`)
- Does the project name in `feliz.yml` match the Linear project exactly?
- Is the repo cloned? (check `feliz status` or the workspace directory)
- Is an agent CLI installed? (`feliz agent list`)

## Monitor

```bash
bun run src/cli/index.ts status          # daemon health
bun run src/cli/index.ts run list        # recent runs
bun run src/cli/index.ts run show <id>   # run details + step results
```

## Verify delivery

A successful run produces:

- A pull request on the target repo
- A PR URL in `run show` output

## Handle failures

```bash
bun run src/cli/index.ts run retry <LINEAR_ID>
```

The retry carries failure context from the previous attempt so the agent can correct course.

## Inspect context

```bash
bun run src/cli/index.ts context history <project>   # past events
bun run src/cli/index.ts context show <LINEAR_ID>     # snapshot for a work item
```

## Stop

```bash
bun run src/cli/index.ts stop
```

## Related

- [Getting Started](getting-started.md) — first-time setup
- [Configuration](configuration.md) — config reference
- [CLI](cli.md) — full command reference
