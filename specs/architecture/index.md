# Architecture

## System diagram

```
┌─────────────────────────────────────────────────────────┐
│                     Feliz Server                        │
│                                                         │
│  ┌───────────┐  ┌───────────┐  ┌──────────────────────┐ │
│  │  Linear   │  │  Webhook  │  │   Context Store      │ │
│  │  Client   │  │  Handler  │  │  (History/Memory/    │ │
│  │ (GraphQL) │  │ (Agent    │  │   Scratchpad)        │ │
│  │           │  │  Sessions)│  │                      │ │
│  └─────┬─────┘  └─────┬─────┘  └──────────┬───────────┘ │
│        │               │                   │             │
│  ┌─────▼───────────────▼──────────────────▼───────────┐ │
│  │              Orchestrator                           │ │
│  │  (State machine, concurrency, retry, approval)     │ │
│  └─────┬──────────────────────────────────────────────┘ │
│        │                                                 │
│  ┌─────▼──────────┐  ┌────────────────┐                 │
│  │   Workspace    │  │  Spec Engine   │                 │
│  │   Manager      │  │  (Draft/Review │                 │
│  │ (clone, wt)    │  │   /Approve)    │                 │
│  └─────┬──────────┘  └────────────────┘                 │
│        │                                                 │
│  ┌─────▼──────────────────────────────────────────────┐ │
│  │           Agent Dispatch Layer                      │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐           │ │
│  │  │ Claude   │ │  Codex   │ │  Custom  │           │ │
│  │  │ Code     │ │ Adapter  │ │ Adapter  │           │ │
│  │  └──────────┘ └──────────┘ └──────────┘           │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌────────────────────────────────────────────────────┐ │
│  │           Linear Writeback                          │ │
│  │  (Status comments, state updates, 👀 reactions)    │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

- **Runtime**: Bun (TypeScript)
- **Deployment**: Docker container
- **Persistence**: SQLite (runs, history, state) + git repo (memory, specs) + filesystem (worktrees, scratchpad)

## Domain model

```
┌──────────┐       ┌──────────┐       ┌──────────┐
│ Project  │──1:N──│ WorkItem │──1:N──│   Run    │
└──────────┘       └──────────┘       └────┬─────┘
                                           │
                                      ┌────▼─────────────┐
                                      │ StepExecution    │
                                      └──────────────────┘
```

### Project

A repo + Linear project mapping.

```typescript
interface Project {
  id: string;
  name: string;
  repo_url: string;
  linear_project_name: string;
  base_branch: string;
  config: RepoConfig;           // parsed .feliz/config.yml
  pipeline: PipelineDefinition; // parsed .feliz/pipeline.yml
  created_at: Date;
}
```

### WorkItem

A normalized Linear issue tracked by Feliz.

```typescript
interface WorkItem {
  id: string;                    // Feliz internal ID
  linear_id: string;            // Linear issue UUID
  linear_identifier: string;    // e.g., "BAC-123"
  project_id: string;
  parent_work_item_id: string | null; // for decomposed sub-issues
  title: string;
  description: string;
  state: string;                // Linear issue state name
  priority: number;             // 0=none, 1=urgent, 4=low
  labels: string[];
  blocker_ids: string[];        // Linear issue IDs this is blocked by
  orchestration_state: OrchestrationState;
  created_at: Date;
  updated_at: Date;
}

type OrchestrationState =
  | 'unclaimed'
  | 'decomposing'       // Feliz is breaking down a large feature
  | 'decompose_review'  // awaiting human approval of decomposition
  | 'spec_drafting'     // only when specs.enabled
  | 'spec_review'       // only when specs.enabled
  | 'queued'
  | 'running'
  | 'retry_queued'
  | 'completed'
  | 'failed'
  | 'cancelled';
```

### Run

A full pipeline execution for a work item (one run = all phases/steps).

```typescript
interface Run {
  id: string;
  work_item_id: string;
  attempt: number;              // retry attempt for the whole run
  current_phase: string;        // current phase name
  current_step: string;         // current step name
  started_at: Date;
  finished_at: Date | null;
  result: 'succeeded' | 'failed' | 'timed_out' | 'cancelled' | null;
  failure_reason: string | null;
  context_snapshot_id: string;  // references the manifest used
  pr_url: string | null;
  token_usage: { input: number; output: number } | null;
}
```

### StepExecution

A single step execution within a run.

```typescript
interface StepExecution {
  id: string;
  run_id: string;
  phase_name: string;
  step_name: string;
  cycle: number;                // 1-based, >1 for repeating phases
  step_attempt: number;         // retry attempt within this step
  agent_adapter: string | null; // null for builtin steps
  started_at: Date;
  finished_at: Date | null;
  result: 'succeeded' | 'failed' | 'timed_out' | 'cancelled' | null;
  exit_code: number | null;
  failure_reason: string | null;
  token_usage: { input: number; output: number } | null;
}
```

### ContextSnapshot

The bill of materials for what context a run received.

```typescript
interface ContextSnapshot {
  id: string;
  run_id: string;
  work_item_id: string;
  artifact_refs: ArtifactRef[];
  token_budget: {
    max_input: number;
    reserved_system: number;
  };
  created_at: Date;
}

interface ArtifactRef {
  artifact_id: string;
  path: string;
  content_hash: string;
  version: number;
  purpose: string; // e.g., "spec", "history", "memory"
}
```

### Context layers

| Layer | Description | Mutability | Examples |
|---|---|---|---|
| **History** | Append-only event log | Immutable | Linear events, run events, agent tool calls |
| **Memory** | Derived, versioned knowledge | Mutable (versioned) | Specs, project conventions, extracted patterns, decisions |
| **Scratchpad** | Transient working artifacts | Ephemeral (promotable) | Agent outputs, draft specs, test logs |

See [Context Management](../context/index.md) and [Context Lifecycle](../context/lifecycle.md) for full details.
