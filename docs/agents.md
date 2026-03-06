# Agent Guide

Feliz dispatches coding agents via adapter implementations.

## Adapter interface

```ts
interface AgentAdapter {
  name: string;
  isAvailable(): Promise<boolean>;
  execute(params: AgentRunParams): Promise<AgentRunResult>;
  cancel(runId: string): Promise<void>;
}
```

Core run params:

- `runId`
- `workDir`
- `prompt`
- `timeout_ms`
- `maxTurns`
- `approvalPolicy`
- `env`

## Built-in adapters

### `claude-code`

Command shape:

```bash
claude --dangerously-skip-permissions --output-format json --max-turns <N> --print -p "<prompt>"
```

### `codex`

Command shape:

```bash
codex exec --json -s <sandbox> "<prompt>"
```

Sandbox mapping from `approvalPolicy`:

- `auto` -> `danger-full-access`
- `suggest` -> `workspace-write`
- `gated` -> `read-only`

## Availability checks

List adapters with:

```bash
bun run src/cli/index.ts agent list
```

Feliz reports whether each adapter CLI is installed and runnable.

## Per-step agent selection

`agent` can be set per pipeline step.

```yaml
phases:
  - name: implement
    steps:
      - name: code
        agent: claude-code
  - name: review
    steps:
      - name: review
        agent: codex
```

If omitted, Feliz uses `.feliz/config.yml` -> `agent.adapter`.

## Writing a custom adapter

1. Add a new adapter file under `src/agents/` implementing `AgentAdapter`.
2. Register it in `src/server.ts` adapter map.
3. Reference the adapter name in repo config or pipeline steps.

Keep adapters deterministic:

- always return structured status (`succeeded|failed|timed_out|cancelled`)
- capture stdout/stderr
- honor `timeout_ms`
- implement `cancel(runId)`
