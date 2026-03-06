# Agent Dispatch

## Adapter Interface

Feliz defines a pluggable agent adapter interface:

```typescript
interface AgentAdapter {
  /** Unique adapter name (e.g., "claude-code", "codex", "aider") */
  name: string;

  /** Check if the agent CLI is available */
  isAvailable(): Promise<boolean>;

  /** Execute an agent run in the given workspace */
  execute(params: AgentRunParams): Promise<AgentRunResult>;

  /** Cancel a running agent */
  cancel(runId: string): Promise<void>;
}

interface AgentRunParams {
  runId: string;
  workDir: string;           // worktree path
  prompt: string;            // rendered prompt template
  timeout_ms: number;
  maxTurns: number;
  approvalPolicy: 'auto' | 'gated' | 'suggest';
  env: Record<string, string>; // additional env vars (GITHUB_TOKEN, etc.)
}

interface AgentRunResult {
  status: 'succeeded' | 'failed' | 'timed_out' | 'cancelled';
  exitCode: number;
  stdout: string;
  stderr: string;
  tokenUsage?: { input: number; output: number };
  filesChanged: string[];
  summary?: string;          // agent-generated summary if available
}
```

## Claude Code Adapter (Default)

Invocation:

```bash
claude --dangerously-skip-permissions \
  --output-format json \
  --max-turns {maxTurns} \
  --print \
  -p "{prompt}"
```

Run in the worktree directory with `cwd` set accordingly.

Parse JSON output for structured results (token usage, files changed, etc.).

## Codex Adapter

Invocation:

```bash
codex exec \
  --json \
  -s {sandbox} \
  "{prompt}"
```

Run in the worktree directory with `cwd` set accordingly.

**Sandbox mapping** from `approvalPolicy`:

| Policy | Sandbox Mode | Behavior |
|---|---|---|
| `auto` | `danger-full-access` | Full filesystem and network access |
| `suggest` | `workspace-write` | Can write to workspace, no external access |
| `gated` | `read-only` | Read-only, for planning/review steps |

Parse JSONL output (one JSON object per line). Extract the last `message` event's `content` as the summary.

## Every Step is an Agent Call

In the Feliz pipeline model, **every step is an agent call with a prompt**. There are no built-in system actions. This includes:

- **Implementation** — agent writes code
- **Testing/linting** — agent runs checks and fixes failures
- **Review** — agent reviews code
- **Publishing** — agent commits, pushes, creates PR

This is more AI-native and flexible:
- If the agent forgets to commit, the publish step's agent can detect and fix it
- If tests fail, the agent can diagnose and attempt fixes rather than just reporting failure
- If PR creation fails (API error, branch conflict), the agent can handle recovery
- Any step can ask the user for help via Linear comments when stuck

### Step execution

Each pipeline step:

1. Assembles context → produces/updates ContextSnapshot
2. Renders the step's prompt template with issue, specs, context, cycle, step info
3. Runs `hooks.before_run` in worktree (if configured)
4. Invokes the agent adapter with the rendered prompt
5. Collects result, stores artifacts as scratchpad
6. Runs `hooks.after_run` in worktree (if configured)
7. Evaluates step success condition (optional post-agent validation)
8. If success: proceed to next step
9. If failure AND retries remaining: re-run with failure context
10. If failure AND no retries: escalate to phase/pipeline level

### Success conditions (optional post-agent validation)

After the agent completes a step, the orchestrator can optionally validate the result:

| Type | Schema | Description |
|---|---|---|
| Shell command | `{ command: "npm test" }` | Step succeeds if command exits 0 in the worktree. |
| Agent verdict | `{ agent_verdict: "approved" }` | Step succeeds if agent output contains the specified verdict keyword. |
| File exists | `{ file_exists: "path/to/file" }` | Step succeeds if the specified file exists after the step. |
| Always pass | `{ always: true }` | Step always succeeds. |

If no `success` is specified, the step succeeds if the agent exits 0.

These are validation checks, not the primary mechanism. The agent is expected to achieve the goal described in its prompt — the success condition is a safety net.

## Pipeline Execution Sequence

When a work item enters `running`, Feliz executes the pipeline defined in `.feliz/pipeline.yml`:

```
For each phase in pipeline.phases:
  cycle = 1
  loop:
    For each step in phase.steps:
      step_attempt = 1
      loop:
        1. Assemble context -> produce/update ContextSnapshot
        2. Render step's prompt template with issue, specs, context, cycle, step info
        3. Run hooks.before_run in worktree
        4. Invoke agent adapter with rendered prompt
        5. Collect result, store artifacts as scratchpad
        6. Run hooks.after_run in worktree
        7. Evaluate step success condition (if defined)
        8. If success: break (proceed to next step)
        9. If failure AND step_attempt < step.max_attempts:
             step_attempt++, continue loop with failure context
        10. If failure AND step_attempt >= step.max_attempts:
             If phase has repeat AND cycle < repeat.max:
               break to phase loop (re-run phase from step 1)
             Else: abort pipeline
      end step retry loop
    end step loop

    If all steps succeeded: break phase loop (proceed to next phase)
    If phase.repeat AND cycle < repeat.max:
      cycle++, continue phase loop
    If phase.repeat AND cycle >= repeat.max:
      If repeat.on_exhaust == 'pass': warn + continue to next phase
      If repeat.on_exhaust == 'fail': abort pipeline
  end phase loop
end phase loop

Pipeline complete -> transition work item to 'completed'
Pipeline aborted -> transition to 'retry_queued' or 'failed'
```

**Step data sharing**: All steps in a pipeline share the same worktree filesystem. A review step can write a report file (e.g., `REVIEW.md`), and the next fix step reads it. No formal I/O declaration is needed — the worktree is the communication channel.

**Step context**: Each step execution is recorded as a `StepExecution` in the database. Agent outputs from prior steps in the same run are available as scratchpad artifacts for later steps' context assembly.
