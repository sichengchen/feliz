# Agent Guide

Feliz dispatches coding agents through a pluggable adapter interface. It includes a Claude Code adapter out of the box. Agent CLIs (Claude Code, Codex, etc.) must be installed and authenticated separately — Feliz never bundles proprietary software.

## How agents work in Feliz

1. Feliz creates an isolated git worktree for each work item
2. Context is assembled (issue description, specs, history, memory)
3. A prompt template is rendered with the context
4. The agent adapter is invoked with the prompt in the worktree directory
5. The agent writes code, runs commands, and produces output
6. Feliz evaluates the success condition and records the result

## Built-in adapters

### Claude Code

The default adapter. Invokes the `claude` CLI:

```bash
claude --dangerously-skip-permissions \
  --output-format json \
  --max-turns {maxTurns} \
  --print \
  -p "{rendered_prompt}"
```

**Requirements**: The `claude` CLI must be installed and authenticated. Authenticate with `claude login` (OAuth) or set `ANTHROPIC_API_KEY`.

**Configuration**:

```yaml
# .feliz/config.yml
agent:
  adapter: claude-code
  max_turns: 30         # max conversation turns
  timeout_ms: 600000    # 10 minute timeout
```

**Output parsing**: The adapter parses Claude Code's JSON output to extract:
- Exit code and status
- Token usage (input/output)
- Files changed
- Summary text

## Agent adapter interface

To add a new agent, implement the `AgentAdapter` interface:

```typescript
interface AgentAdapter {
  /** Unique adapter name (e.g., "claude-code", "codex") */
  name: string;

  /** Check if the agent CLI is installed and available */
  isAvailable(): Promise<boolean>;

  /** Execute an agent run in the given workspace */
  execute(params: AgentRunParams): Promise<AgentRunResult>;

  /** Cancel a running agent by run ID */
  cancel(runId: string): Promise<void>;
}
```

### `AgentRunParams`

```typescript
interface AgentRunParams {
  runId: string;              // unique run identifier
  workDir: string;            // absolute path to the git worktree
  prompt: string;             // fully rendered prompt text
  timeout_ms: number;         // max wall-clock time
  maxTurns: number;           // max conversation turns
  approvalPolicy: 'auto' | 'gated' | 'suggest';
  env: Record<string, string>;  // additional environment variables
}
```

### `AgentRunResult`

```typescript
interface AgentRunResult {
  status: 'succeeded' | 'failed' | 'timed_out' | 'cancelled';
  exitCode: number;
  stdout: string;
  stderr: string;
  tokenUsage?: { input: number; output: number };
  filesChanged: string[];
  summary?: string;
}
```

## Writing a custom adapter

Create a new file in `src/agents/`:

```typescript
// src/agents/my-agent.ts
import type { AgentAdapter, AgentRunParams, AgentRunResult } from "./adapter.ts";

export class MyAgentAdapter implements AgentAdapter {
  name = "my-agent";

  async isAvailable(): Promise<boolean> {
    // Check if the CLI is installed
    try {
      const proc = Bun.spawn(["my-agent", "--version"]);
      await proc.exited;
      return proc.exitCode === 0;
    } catch {
      return false;
    }
  }

  async execute(params: AgentRunParams): Promise<AgentRunResult> {
    const proc = Bun.spawn(
      ["my-agent", "run", "--prompt", params.prompt],
      {
        cwd: params.workDir,
        env: { ...process.env, ...params.env },
        stdout: "pipe",
        stderr: "pipe",
      }
    );

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;

    return {
      status: proc.exitCode === 0 ? "succeeded" : "failed",
      exitCode: proc.exitCode ?? 1,
      stdout,
      stderr,
      filesChanged: [],  // parse from agent output if available
    };
  }

  async cancel(runId: string): Promise<void> {
    // Implement cancellation logic
  }
}
```

Register it in `src/server.ts`:

```typescript
this.adapters = {
  "claude-code": new ClaudeCodeAdapter(),
  "my-agent": new MyAgentAdapter(),
};
```

Then reference it in pipeline steps:

```yaml
# .feliz/pipeline.yml
phases:
  - name: implement
    steps:
      - name: code
        agent: my-agent
        prompt: .feliz/prompts/implement.md
```

## Per-step agent selection

Different steps in a pipeline can use different agents:

```yaml
phases:
  - name: implement
    steps:
      - name: code
        agent: claude-code          # Claude Code writes the code
  - name: review
    repeat: { max: 3, on_exhaust: pass }
    steps:
      - name: review
        agent: codex                # Codex reviews it
      - name: fix
        agent: claude-code          # Claude Code fixes issues
```

If a step doesn't specify `agent`, it uses the repo's default (`agent.adapter` in `.feliz/config.yml`).

## Approval policies

The `approval_policy` setting controls how agents operate:

| Policy | Behavior |
|---|---|
| `auto` | Agent runs freely. Verification gates (tests, lint) checked after completion. |
| `gated` | Feliz posts the agent's plan to Linear before execution. Requires `@feliz approve` to proceed. |
| `suggest` | Agent produces a diff without committing. Feliz posts the diff for review. Requires approval to apply. |

Configure in `.feliz/config.yml`:

```yaml
agent:
  approval_policy: gated
```

## Agent authentication

Feliz delegates authentication to each agent's own CLI:

| Agent | OAuth (recommended) | API Key (fallback) |
|---|---|---|
| Claude Code | `claude login` | `ANTHROPIC_API_KEY` env var |
| Codex | `codex login` | `OPENAI_API_KEY` env var |

OAuth is recommended because it avoids managing long-lived API keys. For headless environments, use API keys via environment variables.

Re-authenticate with:

```bash
feliz agent login claude-code
```
