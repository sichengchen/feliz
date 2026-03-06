# Pipeline Guide

Pipelines define how Feliz processes work items. A pipeline is a sequence of **phases**, each containing one or more **steps**.

## Concepts

- **Phase**: A group of steps that run sequentially. Phases can repeat (loop) for convergence patterns like review cycles.
- **Step**: A single unit of work — either an agent invocation, a shell command check, or a built-in action.
- **Success condition**: How Feliz determines if a step passed.
- **Retry**: A failed step can be retried with failure context up to `max_attempts` times.
- **Repeat**: A phase can re-execute from the beginning up to `repeat.max` times.

## File location

Pipeline definitions live at `.feliz/pipeline.yml` in your repo. If this file doesn't exist, Feliz uses a default single-step pipeline.

## Default pipeline

When no `.feliz/pipeline.yml` exists, Feliz generates a default:

```yaml
phases:
  - name: execute
    steps:
      - name: run
        prompt: WORKFLOW.md
        success:
          command: "{gates.test_command}"   # from .feliz/config.yml
      - name: create_pr
        builtin: publish
```

This runs the agent once using `WORKFLOW.md` as the prompt, verifies tests pass (if `gates.test_command` is configured), then creates a PR.

## Pipeline schema

```yaml
phases:
  - name: <phase_name>
    repeat:                        # optional
      max: <number>                # max cycles
      on_exhaust: pass | fail      # behavior when max reached
    steps:
      - name: <step_name>
        agent: <adapter_name>      # optional (omit for non-agent steps)
        prompt: <path>             # optional (defaults to WORKFLOW.md)
        success: <condition>       # optional (defaults to exit code 0)
        max_attempts: <number>     # optional (default: 1)
        builtin: <action>          # optional (e.g., "publish")
```

### Success conditions

Each step can define one success condition:

| Type | Syntax | Behavior |
|---|---|---|
| Shell command | `{ command: "bun test" }` | Runs the command in the worktree. Succeeds if exit code is 0. |
| Agent verdict | `{ agent_verdict: "approved" }` | Succeeds if the agent's output contains the specified keyword. |
| File exists | `{ file_exists: "path/to/file" }` | Succeeds if the file exists in the worktree after the step. |
| Always pass | `{ always: true }` | Always succeeds. Use for intermediate/draft steps. |

If no `success` is specified, the step succeeds if the agent exits with code 0.

## Execution model

```
For each phase:
  cycle = 1
  loop:
    For each step in phase:
      attempt = 1
      loop:
        1. Render prompt template with context
        2. Run hooks.before_run (if configured)
        3. Execute step (agent, command, or builtin)
        4. Run hooks.after_run (if configured)
        5. Evaluate success condition
        6. If success -> next step
        7. If failure AND attempt < max_attempts -> retry with failure context
        8. If failure AND attempt >= max_attempts -> handle phase-level

    If all steps passed -> next phase
    If phase has repeat AND cycle < max -> increment cycle, restart phase
    If phase has repeat AND cycle >= max:
      on_exhaust: pass -> warn and continue to next phase
      on_exhaust: fail -> abort pipeline
    If no repeat -> abort pipeline
```

### Step retries

When a step fails and has `max_attempts > 1`, it retries with the failure context injected into the prompt. The agent receives what went wrong (error messages, test output) and tries to fix it.

### Phase repeats

Repeating phases are designed for convergence loops. The classic pattern is review + fix:

```yaml
- name: review_cycle
  repeat: { max: 3, on_exhaust: pass }
  steps:
    - name: review
      agent: codex
      success: { agent_verdict: approved }
    - name: fix
      agent: claude-code
      success: { command: "bun test" }
```

If the reviewer doesn't approve after 3 cycles, `on_exhaust: pass` lets the pipeline continue (with a warning posted to Linear). Use `on_exhaust: fail` to hard-stop instead.

## Built-in steps

| Builtin | Description |
|---|---|
| `publish` | Push the branch, create a PR via GitHub CLI (`gh`), and post the result to Linear. |

Built-in steps don't use an agent. They run Feliz's internal logic.

## Examples

### Simple: agent + tests + PR

```yaml
phases:
  - name: implement
    steps:
      - name: code
        agent: claude-code
        prompt: WORKFLOW.md
        success: { command: "bun test" }
        max_attempts: 3
      - name: create_pr
        builtin: publish
```

### TDD: tests first, then implementation

```yaml
phases:
  - name: implement
    steps:
      - name: write_tests
        agent: claude-code
        prompt: .feliz/prompts/write_tests.md
        success: { command: "bun test --bail" }
      - name: write_code
        agent: claude-code
        prompt: .feliz/prompts/write_code.md
        success: { command: "bun test" }
        max_attempts: 5
  - name: publish
    steps:
      - name: final_check
        success: { command: "bun run lint && bun test" }
      - name: create_pr
        builtin: publish
```

### Multi-agent review loop

```yaml
phases:
  - name: implement
    steps:
      - name: code
        agent: claude-code
        prompt: .feliz/prompts/implement.md
        success: { command: "bun test" }

  - name: review
    repeat: { max: 3, on_exhaust: pass }
    steps:
      - name: review
        agent: codex
        prompt: .feliz/prompts/review.md
        success: { agent_verdict: approved }
      - name: fix
        agent: claude-code
        prompt: .feliz/prompts/fix_review.md
        success: { command: "bun test" }

  - name: publish
    steps:
      - name: lint
        success: { command: "bun run lint" }
      - name: create_pr
        builtin: publish
```

## Step data sharing

All steps in a pipeline share the same git worktree. There's no formal I/O declaration — the filesystem is the communication channel. A review step can write `REVIEW.md`, and the fix step reads it.
