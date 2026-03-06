# Feliz

Self-hosted cloud agents platform.

Feliz turns Linear issues into merged pull requests. It orchestrates coding agents to implement, test, review, and ship code — autonomously.

Write an issue. Feliz writes the code.

## How it works

```
Linear Issue --> Feliz --> Pull Request
```

1. You create an issue in Linear
2. Feliz picks it up, assembles context, and dispatches a coding agent
3. The agent implements the change in an isolated git worktree
4. Feliz runs tests, creates a PR, and posts the result back to Linear

No context switching. No prompting. Linear is your interface — Feliz is the engine.

## Key features

**Linear as the control surface** — Interact through issue states, comments, and labels. `@feliz start` to begin, `@feliz approve` to proceed, `@feliz retry` on failure.

**Multi-step pipelines** — Define execution phases: write tests, implement code, run a review cycle with a different agent, fix issues, repeat until done.

**Pluggable agents** — Adapters for Claude Code and Codex included. Add any CLI agent through a simple adapter interface. Agent CLIs are installed and authenticated separately.

**Persistent context** — History, memory, and scratchpad layers ensure agents learn from prior runs. Conventions and decisions accumulate in the repo, not in ephemeral chat.

**Spec-driven development** *(optional)* — Feliz drafts specs (system design + behavioral cases) before coding. Approve in Linear, then the agent implements against the spec.

**Feature decomposition** — Describe a large feature in one issue. Feliz breaks it into sub-issues with dependencies, creates them in Linear, and works through them in order.

## Getting started

See the full **[Getting Started Guide](docs/getting-started.md)** for detailed setup instructions, or follow the quick start below.

### Agent setup skills

Feliz setup workflows are split into two distinct skills:

- **Machine/bootstrap setup**: [`feliz-machine-setup`](skills/feliz-machine-setup/SKILL.md)
- **Project onboarding**: [`feliz-project-onboarding`](skills/feliz-project-onboarding/SKILL.md)

Use [`feliz-setup`](skills/feliz-setup/SKILL.md) as a router when you want the setup agent to choose the correct one.

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- [Git](https://git-scm.com)
- A [Linear](https://linear.app) account with an API key
- A [GitHub](https://github.com) personal access token (for PR creation)
- A coding agent CLI installed (e.g., [Claude Code](https://docs.anthropic.com/en/docs/claude-code))

### Quick start (Docker)

```bash
# Start Feliz
docker compose up -d

# Run the setup wizard
docker compose exec feliz feliz init

# Add your first project
docker compose exec feliz feliz project add
```

```yaml
# docker-compose.yml
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

### Quick start (local)

```bash
# Clone and install
git clone <repo-url> && cd feliz
bun install

# Set environment variables
export LINEAR_API_KEY="lin_api_..."
export GITHUB_TOKEN="ghp_..."

# Start the daemon
bun run src/cli/index.ts start
```

## Configuration

Feliz uses two levels of configuration. See the **[Configuration Guide](docs/configuration.md)** for full details.

### Central config (`feliz.yml`)

Controls global settings: Linear API key, polling interval, storage paths, agent defaults, and project mappings.

```yaml
linear:
  api_key: $LINEAR_API_KEY

polling:
  interval_ms: 30000

storage:
  data_dir: /data/feliz
  workspace_root: /data/feliz/workspaces

agent:
  default: claude-code
  max_concurrent: 5

projects:
  - name: backend-api
    repo: git@github.com:org/backend-api.git
    linear_project: Backend API
    branch: main
```

### Per-repo config (`.feliz/` directory)

Lives in each repo. Controls agent behavior, hooks, specs, gates, and pipelines.

```
repo-root/
  .feliz/
    config.yml       # Agent, hooks, specs, gates settings
    pipeline.yml     # Multi-step execution pipeline
    prompts/         # Per-step prompt templates
  WORKFLOW.md        # Default prompt template
```

## Pipeline example

Define multi-step workflows in `.feliz/pipeline.yml`:

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

  - name: review_cycle
    repeat: { max: 3, on_exhaust: pass }
    steps:
      - name: review
        agent: codex
        prompt: .feliz/prompts/review.md
        success: { agent_verdict: approved }
      - name: fix_issues
        agent: claude-code
        prompt: .feliz/prompts/fix_review.md
        success: { command: "bun test" }

  - name: publish
    steps:
      - name: final_check
        success: { command: "bun run lint && bun test" }
      - name: create_pr
        builtin: publish
```

## CLI reference

Feliz ships a CLI for managing the daemon and inspecting state. See the **[CLI Reference](docs/cli.md)** for full details.

```
feliz start                    # Start the Feliz daemon
feliz stop                     # Stop the daemon
feliz status                   # Show daemon status

feliz config validate          # Validate configuration
feliz config show              # Print resolved configuration

feliz project list             # List configured projects
feliz project add              # Add a new project
feliz project remove <name>    # Remove a project

feliz run list                 # List recent runs
feliz run show <run_id>        # Show run details
feliz run retry <work_item>    # Retry a failed work item

feliz agent list               # List installed agents

feliz context history <proj>   # Show history events
feliz context show <item>      # Show context snapshot
```

## Linear commands

Interact with Feliz through Linear comments:

| Command | Effect |
|---|---|
| `@feliz start` | Dispatch agent immediately |
| `@feliz plan` | Enter spec drafting phase (when `specs.enabled`) |
| `@feliz retry` | Re-queue a failed work item |
| `@feliz status` | Reply with current state and last run info |
| `@feliz approve` | Approve spec/decomposition, proceed to next state |
| `@feliz cancel` | Cancel running agent, release work item |
| `@feliz decompose` | Break down a large feature into sub-issues |

## Architecture

```
+----------------------------------------------+
|                Feliz Server                   |
|                                               |
|  Issue Poller <---- Linear GraphQL API        |
|       |                                       |
|       v                                       |
|  Orchestrator (state machine, concurrency)    |
|       |                                       |
|       +-- Workspace Manager (git worktrees)   |
|       +-- Context Store (history/memory/pad)  |
|       +-- Spec Engine (optional)              |
|       |                                       |
|       v                                       |
|  Agent Dispatch --> Claude Code / Codex / ... |
|       |                                       |
|       v                                       |
|  Publisher --> PR + Linear update             |
+----------------------------------------------+
```

- **Bun** runtime, **TypeScript**
- **SQLite** for history and run state
- **Git repo** for persistent memory (conventions, specs, decisions)

## Documentation

| Document | Description |
|---|---|
| [Getting Started](docs/getting-started.md) | Installation, setup, and first project |
| [Skills](docs/skills.md) | Setup skills for machine bootstrap vs project onboarding |
| [Configuration](docs/configuration.md) | All config options with examples |
| [CLI Reference](docs/cli.md) | Full CLI command documentation |
| [Pipelines](docs/pipelines.md) | Pipeline definition and execution model |
| [Agents](docs/agents.md) | Agent adapters and how to add your own |

### Specifications

Full technical specification: **[specs/index.md](specs/index.md)**

| Spec | Topic |
|---|---|
| [Architecture](specs/architecture/index.md) | System design and domain model |
| [Configuration](specs/configuration/index.md) | Server config, repo config, pipelines |
| [Linear Integration](specs/linear/index.md) | Polling, commands, writeback |
| [Context Management](specs/context/index.md) | History, Memory, Scratchpad |
| [Orchestration](specs/orchestration/index.md) | State machine, retry, concurrency |
| [Agent Dispatch](specs/agents/index.md) | Adapter interface, pipeline execution |
| [Publishing](specs/publishing/index.md) | PR creation, gates, Linear updates |
| [User Journey](specs/user-journey/index.md) | Full project lifecycle walkthrough |

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Type-check
bun run lint

# Build
bun run build
```

## License

MIT
