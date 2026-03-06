# Feliz Specification

Feliz is a long-running orchestration service that connects Linear (as the primary user interface) to pluggable coding agents, managing the full lifecycle from mention-based issue assignment through spec authoring, agent execution, and PR delivery. Users mention `@Feliz` or delegate issues to it in Linear. Every pipeline step — including publishing — is an agent call with a prompt stored in the repo. Feliz maintains a persistent context layer (history, memory, scratchpad) so that knowledge accumulates across runs and agents never start from zero.

## Core value proposition

1. **Linear as the single interface** — users interact with Feliz by @-mentioning or delegating issues. Feliz is a native Linear agent with its own bot identity. No separate UI needed.
2. **Spec-driven development** (optional) — Feliz collaboratively authors specs (system design + behavioral cases) before coding, stored in the repo as structured markdown.
3. **Persistent context** — a layered context model ensures project knowledge, past decisions, and run history are available to every agent run.
4. **Pluggable agents** — an adapter interface allows any CLI-based coding agent to be dispatched. Includes a Claude Code adapter by default. Agent CLIs are installed separately.
5. **Full automation** — agents handle the entire workflow (implementation, testing, committing, PR creation) with prompts stored in the repo. Feliz posts results to Linear and updates issue state autonomously.

## Non-goals for MVP

- Real-time streaming UI / web dashboard (Linear is the UI)
- Multi-tenant SaaS deployment (single-operator, self-hosted)
- Built-in code review (relies on existing PR review workflows)

## Specification documents

| Section | Description |
|---|---|
| [Architecture](architecture/index.md) | System architecture, runtime, domain model, data types |
| [Configuration](configuration/index.md) | Central server config, per-repo config, pipeline definition |
| [Linear Integration](linear/index.md) | Linear Agent API, mention/delegation discovery, Agent Sessions, GraphQL mutations |
| [Context Management](context/index.md) | History, Memory, Scratchpad layers, storage, assembly |
| [Context Lifecycle](context/lifecycle.md) | Detailed lifecycle of each context layer |
| [Orchestration](orchestration/index.md) | State machine, pipeline execution, retry, concurrency, approvals |
| [Spec-Driven Development](spec-driven-dev/index.md) | Spec structure, lifecycle, feature decomposition |
| [Workspace Management](workspace/index.md) | Repo cloning, git worktrees, branch naming |
| [Agent Dispatch](agents/index.md) | Adapter interface, Claude Code adapter, every-step-is-agent-call model, pipeline execution |
| [Publishing](publishing/index.md) | Agent-handled PR creation via prompt, Linear status updates |
| [CLI](cli/index.md) | CLI commands for managing Feliz |
| [Testing](testing/index.md) | End-to-end validation plan from install through PR creation |
| [Security](security/index.md) | Secrets, agent auth, Docker credentials, isolation, trust model |
| [User Journey](user-journey/index.md) | Full project lifecycle walkthrough, from install to ongoing operations |
| [Roadmap](roadmap/index.md) | Implementation phases |
