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
  env: Record<string, string>; // additional env vars
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
        4. If step.agent: invoke agent adapter
           If step.builtin: run built-in action (e.g., publish)
        5. Collect result, store artifacts as scratchpad
        6. Run hooks.after_run in worktree
        7. Evaluate step success condition
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

**Step data sharing**: All steps in a pipeline share the same worktree filesystem. A review step can write a report file (e.g., `REVIEW.md`), and the next fix step reads it. No formal I/O declaration is needed -- the worktree is the communication channel.

**Step context**: Each step execution is recorded as a `StepExecution` in the database. Agent outputs from prior steps in the same run are available as scratchpad artifacts for later steps' context assembly.
