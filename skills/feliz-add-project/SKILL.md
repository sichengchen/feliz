---
name: feliz-add-project
description: Use this skill to add a project to Feliz and configure its workflow. It registers the project in `feliz.yml`, clones the repo, and sets up `.feliz/config.yml`, `.feliz/pipeline.yml`, prompt templates, and `WORKFLOW.md` inside the managed project repo.
---

# Feliz Add Project

Add a project to Feliz and configure its workflow, pipeline, and prompt templates.

## When to use

- Adding a new repo/project to Feliz
- Reconfiguring an existing project's `.feliz/` setup
- Customizing pipeline steps or prompt templates

## Prerequisite

Feliz must already be installed with a valid `feliz.yml`. If not, use `feliz-setup` first.

## Interview

Ask the user before writing any config:

1. **Project identity**
   - Linear project name (which Linear project maps to this repo?)
   - Git repo URL (SSH or HTTPS)
   - Base branch — default `main`
2. **Agent settings**
   - Agent adapter — `claude-code` or `codex` (default from central config)
   - Approval policy — `auto`, `gated`, or `suggest` (default `auto`)
   - Max turns per agent invocation — default `20`
   - Timeout per agent invocation — default `600000` (10 min)
3. **Specs**
   - Enable spec-driven development? (default `false`)
   - If yes: specs directory (default `specs`), approval required? (default `true`)
4. **Gates**
   - Test command — e.g., `bun test`, `npm test` (optional)
   - Lint command — e.g., `bun run lint`, `npm run lint` (optional)
5. **Pipeline design**
   - Use default pipeline or custom?
   - If custom, ask about phases (implement, review cycle, publish), step agents, and repeat settings
6. **Hooks** (optional)
   - `after_create` — run after worktree creation (e.g., `bun install`)
   - `before_run` / `after_run` — run before/after each pipeline step

## Workflow

### 1. Resolve paths

Read central `feliz.yml` to get `storage.workspace_root`. The target repo will live at:
```
<workspace_root>/<project-name>/repo
```

### 2. Register project in `feliz.yml`

Add to `projects[]`:

```yaml
- name: payments-service
  repo: git@github.com:org/payments-service.git
  linear_project: Payments Service
  branch: main
```

Project name is derived from the repo URL (last path segment without `.git`).

### 3. Clone the repo

If not already cloned at the workspace path:

```bash
bun run src/cli/index.ts project add
```

Or manually clone and register.

### 4. Write `.feliz/config.yml`

If `.feliz/config.yml` already exists in the repo, ask before overwriting.

```yaml
agent:
  adapter: claude-code
  approval_policy: auto
  max_turns: 20
  timeout_ms: 600000

hooks:
  after_create: bun install

specs:
  enabled: false

gates:
  test_command: bun test
  lint_command: bun run lint
```

### 5. Write `.feliz/pipeline.yml`

**Default pipeline** (single phase, implement + publish):

```yaml
phases:
  - name: execute
    steps:
      - name: run
        prompt: WORKFLOW.md
        success:
          command: "bun test"
      - name: create_pr
        prompt: .feliz/prompts/publish.md
```

**TDD pipeline** (test-first, implement, publish):

```yaml
phases:
  - name: implement
    steps:
      - name: write_tests
        agent: claude-code
        prompt: .feliz/prompts/write_tests.md
        success:
          command: "bun test --bail"
      - name: write_code
        agent: claude-code
        prompt: .feliz/prompts/write_code.md
        success:
          command: "bun test"
        max_attempts: 5
      - name: create_pr
        agent: claude-code
        prompt: .feliz/prompts/publish.md
```

**Review cycle pipeline** (implement, review loop, publish):

```yaml
phases:
  - name: implement
    steps:
      - name: code
        agent: claude-code
        prompt: WORKFLOW.md
        success:
          command: "bun test"
        max_attempts: 3

  - name: review_cycle
    repeat:
      max: 3
      on_exhaust: pass
    steps:
      - name: review
        agent: codex
        prompt: .feliz/prompts/review.md
        success:
          agent_verdict: approved
      - name: fix_issues
        agent: claude-code
        prompt: .feliz/prompts/fix_review.md
        success:
          command: "bun test"

  - name: publish
    steps:
      - name: create_pr
        agent: claude-code
        prompt: .feliz/prompts/publish.md
```

### 6. Write prompt templates

Create `.feliz/prompts/` with templates matching the pipeline steps. Every pipeline step references a prompt file — create each one.

**`WORKFLOW.md`** (default/fallback prompt):

```markdown
# {{ project.name }}

You are working on issue {{ issue.identifier }}: {{ issue.title }}

## Issue description

{{ issue.description }}

## Instructions

Implement the changes described above. Write tests, ensure they pass, and follow existing code conventions.
```

**`.feliz/prompts/publish.md`** (required — every pipeline needs this):

```markdown
# Publish

You are finalizing work on {{ issue.identifier }}: {{ issue.title }}.

## Steps

1. Check `git status`. If there are uncommitted changes, stage and commit them with a message referencing {{ issue.identifier }}.
2. Push the branch to origin. If rejected, rebase on {{ project.base_branch }} and retry.
3. Create a PR:
   - Title: `[{{ issue.identifier }}] {{ issue.title }}`
   - Body: Link to Linear issue, summary of changes, files changed.
   - Base: `{{ project.base_branch }}`
4. Output the PR URL.

If any step fails, describe what went wrong and attempt to fix it.
```

Create additional prompts as needed for the chosen pipeline (e.g., `write_tests.md`, `write_code.md`, `review.md`, `fix_review.md`).

### 7. Validate

```bash
bun run src/cli/index.ts --config <path> config validate
```

### 8. Commit and push (optional)

Ask the user if they want to commit `.feliz/` and `WORKFLOW.md` to the repo:

```bash
cd <repo-path>
git add .feliz/ WORKFLOW.md
git commit -m "chore: add Feliz pipeline config"
git push
```

## Repair mode

If a project already exists and is broken:
1. Run `feliz project remove <name>` first
2. Clean up `<workspace_root>/<project>` if stale
3. Re-run the workflow above

## Guardrails

- Do not modify central `feliz.yml` beyond the `projects[]` entry.
- Write `.feliz/` files in the **managed project repo**, not the Feliz service repo.
- Do not skip the interview.
- Every pipeline step must reference a prompt file that exists.
- The publish step is always an agent call with a prompt — never a builtin.
