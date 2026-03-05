# MVP Implementation Progress

## Phase 1: Foundation
- [ ] 1.1 Project scaffolding (bun init, tsconfig, package.json)
- [ ] 1.2 Domain types (Project, WorkItem, Run, StepExecution, etc.)
- [ ] 1.3 Configuration loader (feliz.yml parser with env var substitution)
- [ ] 1.4 Per-repo config loader (.feliz/config.yml, .feliz/pipeline.yml)
- [ ] 1.5 Prompt template renderer (Jinja2-style)
- [ ] 1.6 SQLite schema + database module
- [ ] 1.7 Structured logger
- [ ] 1.8 CLI skeleton (feliz start, feliz status, feliz config validate)

## Phase 2: Linear Polling + Work Items
- [ ] 2.1 Linear GraphQL client with rate limiting
- [ ] 2.2 Issue poller (poll loop, discovery, change detection)
- [ ] 2.3 WorkItem CRUD in SQLite
- [ ] 2.4 History event logging (append-only)

## Phase 3: Workspace + Single-Step Agent Dispatch
- [ ] 3.1 Repo cloning and management
- [ ] 3.2 Git worktree lifecycle (create, cleanup)
- [ ] 3.3 Agent adapter interface
- [ ] 3.4 Claude Code adapter implementation
- [ ] 3.5 Basic orchestration state machine (unclaimed → queued → running → completed/failed)
- [ ] 3.6 Default single-step pipeline

## Phase 4: Results + Linear Writeback
- [ ] 4.1 PR creation (GitHub API via gh CLI)
- [ ] 4.2 Linear comment posting (status updates)
- [ ] 4.3 Linear state transitions
- [ ] 4.4 Verification gates (test/lint commands)

## Phase 5: Multi-Step Pipeline Engine
- [ ] 5.1 Pipeline phase/step executor
- [ ] 5.2 Step success conditions (command, agent_verdict, file_exists, always)
- [ ] 5.3 Phase repeat/loop with cycle tracking
- [ ] 5.4 Step-level retry with failure context
- [ ] 5.5 Per-step agent adapter selection
- [ ] 5.6 StepExecution recording

## Phase 6: Context Layer
- [ ] 6.1 History/Memory/Scratchpad storage
- [ ] 6.2 Context assembly and snapshot manifests
- [ ] 6.3 Cross-step context (prior step outputs)
- [ ] 6.4 Scratchpad promotion flow

## Phase 7: Spec-Driven Development
- [ ] 7.1 Spec drafting engine
- [ ] 7.2 Spec directory management
- [ ] 7.3 Spec review flow
- [ ] 7.4 Spec-as-context integration

## Phase 8: Feature Decomposition
- [ ] 8.1 Large feature detection
- [ ] 8.2 Decomposition engine
- [ ] 8.3 Auto-dependency creation in Linear
- [ ] 8.4 Parent issue lifecycle
- [ ] 8.5 Decomposition review flow

## Phase 9: Hardening
- [ ] 9.1 Concurrency control (global + per-state)
- [ ] 9.2 Approval gates (gated, suggest modes)
- [ ] 9.3 Retry policy (exponential backoff with jitter)
- [ ] 9.4 CLI commands (full suite)
