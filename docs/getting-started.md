# Getting Started

This guide walks you through installing Feliz, connecting it to Linear, and processing your first issue.

## Prerequisites

| Requirement | Why |
|---|---|
| [Bun](https://bun.sh) v1.0+ | Runtime for Feliz |
| [Git](https://git-scm.com) | Workspace and worktree management |
| [Linear API key](https://linear.app/settings/api) | Issue polling and writeback |
| [GitHub token](https://github.com/settings/tokens) | PR creation (needs `repo` scope) |
| Coding agent CLI | At least one: [Claude Code](https://docs.anthropic.com/en/docs/claude-code), Codex, etc. |

## Installation

### Option A: Docker (recommended for production)

1. Create a `docker-compose.yml`:

```yaml
services:
  feliz:
    image: feliz
    volumes:
      - ${SSH_AUTH_SOCK}:/ssh-agent:ro
      - ~/.ssh/known_hosts:/root/.ssh/known_hosts:ro
      - feliz-data:/data/feliz
      - feliz-agent-creds:/root
    environment:
      - SSH_AUTH_SOCK=/ssh-agent
      - LINEAR_API_KEY
      - GITHUB_TOKEN
      - GIT_AUTHOR_NAME=Feliz Bot
      - GIT_AUTHOR_EMAIL=feliz@example.com
volumes:
  feliz-data:
  feliz-agent-creds:
```

2. Start the container:

```bash
docker compose up -d
```

3. Run the setup wizard:

```bash
docker compose exec feliz feliz init
```

The wizard verifies your environment variables, connects to Linear, installs coding agents, and writes the initial `feliz.yml`.

4. Add your first project:

```bash
docker compose exec feliz feliz project add
```

5. Verify:

```bash
docker compose exec feliz feliz status
```

### Option B: Local development

1. Clone the repo and install dependencies:

```bash
git clone <repo-url> && cd feliz
bun install
```

2. Set environment variables:

```bash
export LINEAR_API_KEY="lin_api_..."
export GITHUB_TOKEN="ghp_..."
```

3. Create a config file using the interactive wizard:

```bash
bun run src/cli/index.ts init
```

Or simply run `start` — Feliz scaffolds a template config on first run:

```bash
bun run src/cli/index.ts start
# Edit ~/.feliz/feliz.yml with your settings, then re-run start
```

4. Validate the config:

```bash
bun run src/cli/index.ts config validate
```

5. Start the daemon:

```bash
bun run src/cli/index.ts start
```

## Agent skills for setup

If you are using an agent to perform setup, use the split setup skills:

- `feliz-machine-setup` for machine/container bootstrap and central `feliz.yml`
- `feliz-project-onboarding` for adding a project and writing repo `.feliz/*`
- `feliz-setup` as a router when scope is unclear

Details: [Skills](skills.md)

## Setting up your repo

Feliz reads per-repo configuration from a `.feliz/` directory in your repo root. This is optional — Feliz works with sensible defaults.

### Minimal setup (zero config)

If your repo has no `.feliz/` directory, Feliz uses defaults:
- Agent: `claude-code`
- Pipeline: single-step (run agent, create PR)
- Prompt: `WORKFLOW.md` in repo root (if it exists)
- No test/lint gates
- No spec-driven development

### Recommended setup

Create the following files in your repo:

```
my-project/
  .feliz/
    config.yml
    pipeline.yml
    prompts/
      implement.md
  WORKFLOW.md
```

**`.feliz/config.yml`** — repo-level settings:

```yaml
agent:
  adapter: claude-code
  approval_policy: auto
  max_turns: 30
  timeout_ms: 600000

hooks:
  after_create: bun install

gates:
  test_command: bun test
  lint_command: bun run lint
```

**`WORKFLOW.md`** — default prompt template:

```markdown
# Task

You are working on {{ project.name }}.

## Issue

**{{ issue.identifier }}**: {{ issue.title }}

{{ issue.description }}

## Instructions

- Follow the coding conventions in this repository
- Write tests for new functionality
- Do not modify unrelated code
```

## Your first issue

1. In Linear, create an issue in the project you configured (e.g., "My Project").
2. Give it a title and description — be specific about what you want built.
3. Move the issue to "Todo" (or whichever state triggers Feliz).

Feliz will pick it up on the next poll cycle (default: 30 seconds).

### What happens next

1. Feliz discovers the issue and creates a local work item
2. A git worktree is created for isolation (`feliz/{identifier}` branch)
3. Context is assembled (issue description, repo memory, prior history)
4. The prompt template is rendered with issue context
5. The coding agent is dispatched in the worktree
6. If gates are configured, tests and lint run after the agent finishes
7. A PR is created and linked back to the Linear issue
8. Feliz posts a summary comment on the issue

### Checking status

```bash
# Show daemon status and active agents
feliz status

# List recent runs
feliz run list
```

### If something goes wrong

- Feliz posts failure details as a comment on the Linear issue
- The work item enters `retry_queued` state with exponential backoff
- Reply `@feliz retry` on the issue to retry immediately
- Reply `@feliz cancel` to stop retrying

## Enabling specs

If you want Feliz to draft behavior specifications before coding:

```yaml
# .feliz/config.yml
specs:
  enabled: true
  directory: specs
  approval_required: true
```

When enabled, new issues go through `spec_drafting` -> `spec_review` before execution. Feliz drafts specs containing system design (data models, APIs, component interactions) and behavioral cases (Given/When/Then scenarios), then posts them to Linear for approval.

## Enabling feature decomposition

For large features, Feliz can break them into sub-issues automatically. Comment `@feliz decompose` on a large issue, or Feliz will detect it when the description suggests multiple concerns.

Feliz proposes a breakdown with dependencies, posts it for approval, then creates the sub-issues in Linear.

## Next steps

- [Configuration Guide](configuration.md) — all config options explained
- [Pipeline Guide](pipelines.md) — multi-step workflows
- [CLI Reference](cli.md) — full command documentation
- [Agent Guide](agents.md) — adapters and custom agents
