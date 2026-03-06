# Pipeline Guide

A pipeline is an ordered list of phases; each phase contains ordered steps.

Location: `.feliz/pipeline.yml`

If absent, Feliz uses a default `execute -> create_pr` pipeline.

## Schema

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

- Agent step: has `agent` and usually `prompt`.
- Builtin step: has `builtin` (currently `publish`).

## Success conditions

Choose one per step:

- `command`: run shell command in worktree, pass on exit code 0.
- `agent_verdict`: pass when output contains required verdict.
- `file_exists`: pass when file exists after step.
- `always: true`: unconditional pass.

If no `success` is provided, Feliz treats agent exit code 0 as success.

## Retry and repeat

- `max_attempts` retries a step with failure context.
- `repeat` reruns the entire phase up to `max` cycles.
- `on_exhaust: pass` continues to next phase.
- `on_exhaust: fail` aborts pipeline.

## Execution behavior

For each step execution, Feliz:

1. Renders prompt template with issue/context variables.
2. Runs `hooks.before_run` if configured.
3. Executes agent or builtin.
4. Runs `hooks.after_run`.
5. Evaluates success and records `StepExecution`.

All steps share one worktree, so files can be passed between steps directly.

## Default pipeline

When `.feliz/pipeline.yml` does not exist:

```yaml
phases:
  - name: execute
    steps:
      - name: run
        prompt: WORKFLOW.md
        # includes gates.test_command success only if configured
      - name: create_pr
        builtin: publish
```
