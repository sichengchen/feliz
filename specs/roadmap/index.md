# Implementation Roadmap

## Phase 1: Foundation
- Project scaffolding (TypeScript, Docker)
- Configuration loader (`feliz.yml` + `.feliz/config.yml` + `.feliz/pipeline.yml` parsers)
- WORKFLOW.md prompt template parser
- SQLite schema + migrations
- CLI skeleton (`feliz start`, `feliz config validate`)

## Phase 2: Linear Integration (Agent API + GraphQL)
- Linear OAuth app registration (`actor=app`, `app:mentionable`, `app:assignable`)
- Webhook handler for Agent Session events (created, updated)
- Agent Activity emitter (thoughts, comments)
- Linear GraphQL client for mutations (state updates, issue creation)
- WorkItem CRUD in SQLite
- History event logging (append-only)

## Phase 3: Workspace + Single-Step Agent Dispatch
- Repo cloning and management
- Git worktree lifecycle
- Agent adapter interface
- Claude Code adapter implementation
- Basic orchestration state machine (unclaimed -> queued -> running -> completed/failed)
- Default single-step pipeline (no `.feliz/pipeline.yml` required)
- All steps as agent calls (no builtin actions)

## Phase 4: Agent-Handled Publishing + Linear Writeback
- Publishing prompt template (`.feliz/prompts/publish.md`)
- Agent commits, pushes, creates PR as a pipeline step
- Linear comment posting and state updates
- Agent Activity acknowledgment on all events
- Command parsing (`@Feliz start/status/retry/cancel`)

## Phase 5: Multi-Step Pipeline Engine
- Pipeline phase/step executor
- Post-step validation conditions (command, agent_verdict, file_exists, always)
- Phase repeat/loop with cycle tracking
- Step-level retry with failure context
- Per-step agent adapter selection
- StepExecution recording

## Phase 6: Context Layer
- Artifact store (SQLite + filesystem)
- Context assembly and snapshot manifests
- History/Memory/Scratchpad lifecycle
- Scratchpad promotion flow
- Cross-step context (prior step outputs as scratchpad)

## Phase 7: Spec-Driven Development
- Spec drafting engine (agent-generated specs from issue descriptions)
- Spec directory management (index.md + structured files)
- Spec review flow (Linear comment approval)
- Spec-as-context integration

## Phase 8: Feature Decomposition
- Large feature detection heuristics
- Spec-to-issue decomposition engine
- Milestone support (sub-issues inherit parent milestone)
- Auto-dependency creation in Linear
- Parent issue lifecycle (tracks children)
- Decomposition review flow

## Phase 9: Hardening
- Concurrency control (global + per-state)
- Approval gates (gated, suggest modes)
- Additional agent adapters (Codex, Aider)
- Dynamic config reload
- Observability improvements
