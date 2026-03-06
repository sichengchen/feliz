# Pipelines

A pipeline defines the sequence of work Feliz performs for each issue. Pipelines are ordered phases, each containing ordered steps.

Location: `.feliz/pipeline.yml`

If absent, Feliz uses a default pipeline: run agent with `WORKFLOW.md` prompt, then create PR.

## Example

```yaml
phases:
  - name: implement
    repeat:
      max: 3
      on_exhaust: pass
    steps:
      - name: write_tests
        agent: codex
        prompt: .feliz/prompts/write_tests.md
        success:
          command: "bun test --bail"
      - name: write_code
        agent: codex
        success:
          command: "bun test"
        max_attempts: 5
      - name: create_pr
        builtin: publish
```

## Step types

**Agent step** — runs a coding agent with a prompt:

```yaml
- name: code
  agent: claude-code
  prompt: .feliz/prompts/implement.md
```

**Builtin step** — runs a built-in action (currently `publish` for pushing the branch and creating a GitHub PR):

```yaml
- name: create_pr
  builtin: publish
```

## Success conditions

One per step:

| Condition | Passes when |
|---|---|
| `command` | Shell command exits 0 in worktree |
| `agent_verdict` | Agent output contains required verdict |
| `file_exists` | File exists after step completes |
| `always: true` | Always |

No `success` field defaults to agent exit code 0.

## Retry and repeat

**Step retry** — `max_attempts` retries a single step, injecting failure context:

```yaml
- name: code
  max_attempts: 5
  success:
    command: "bun test"
```

**Phase repeat** — `repeat` reruns the entire phase (useful for review cycles):

```yaml
repeat:
  max: 3
  on_exhaust: pass   # or fail
```

## Execution sequence

For each step, Feliz:

1. Renders the prompt template with issue, context, and cycle variables.
2. Runs `hooks.before_run` if configured.
3. Executes agent or builtin.
4. Runs `hooks.after_run`.
5. Evaluates success condition.
6. Records a `StepExecution` result.

All steps share one worktree — files pass between steps directly.

## Default pipeline

When no `.feliz/pipeline.yml` exists:

```yaml
phases:
  - name: execute
    steps:
      - name: run
        prompt: WORKFLOW.md
      - name: create_pr
        builtin: publish
```
