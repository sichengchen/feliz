# Context Lifecycle: History, Memory, Scratchpad

This document details the full lifecycle of each context layer — what creates them, what reads them, how they transition, and when they're cleaned up.

---

## Overview

```
                    ┌─────────────────────────────────────────┐
                    │              Context Store              │
                    │                                         │
                    │  ┌───────────┐  Immutable, append-only  │
  Linear events ──▶ │  │  History  │  "What happened"         │
  Run events    ──▶ │  │           │                          │
  Comments      ──▶ │  └───────────┘                          │
                    │                                         │
                    │  ┌───────────┐  Versioned, curated      │
                    │  │  Memory   │  "What we know"          │
                    │  │           │◀── promotion              │
                    │  └───────────┘                          │
                    │        ▲                                │
                    │        │ promote                        │
                    │                                         │
                    │  ┌───────────┐  Transient, per-run      │
  Agent outputs ──▶ │  │Scratchpad│  "What just happened"    │
  Draft specs   ──▶ │  │          │                          │
  Test results  ──▶ │  └───────────┘                          │
                    │                                         │
                    └─────────────────────────────────────────┘
```

---

## 1. History

**Purpose**: Immutable record of everything that happened. The source of truth. Never edited, never deleted.

### What creates history entries

| Event | Source | Payload |
|---|---|---|
| `issue.discovered` | Poller | Issue ID, identifier, title, state, priority, labels |
| `issue.updated` | Poller | Issue ID, changed fields (old → new) |
| `issue.state_changed` | Poller | Issue ID, old state, new state |
| `issue.comment_received` | Poller | Issue ID, comment ID, author, body, timestamp |
| `issue.comment_posted` | Feliz | Issue ID, comment body (what Feliz said) |
| `issue.label_added` | Poller | Issue ID, label name |
| `issue.label_removed` | Poller | Issue ID, label name |
| `decomposition.proposed` | Orchestrator | Parent issue ID, proposed breakdown (sub-issues, deps) |
| `decomposition.approved` | Orchestrator | Parent issue ID, created sub-issue IDs |
| `spec.drafted` | Spec Engine | Work item ID, spec file paths, content summary |
| `spec.revised` | Spec Engine | Work item ID, spec file paths, revision diff |
| `spec.approved` | Orchestrator | Work item ID, approved spec version |
| `run.started` | Orchestrator | Run ID, work item ID, attempt number, agent adapter |
| `run.step_started` | Pipeline Executor | Run ID, phase name, step name, cycle number |
| `run.step_completed` | Pipeline Executor | Run ID, phase name, step name, result, duration |
| `run.step_failed` | Pipeline Executor | Run ID, phase name, step name, failure reason, output |
| `run.completed` | Orchestrator | Run ID, result, PR URL, token usage |
| `run.failed` | Orchestrator | Run ID, failure reason, attempt number |
| `run.cancelled` | Orchestrator | Run ID, cancellation source (user or system) |
| `gate.passed` | Pipeline Executor | Run ID, gate type (test/lint), command, output |
| `gate.failed` | Pipeline Executor | Run ID, gate type, command, output, exit code |
| `pr.created` | Publisher | Run ID, PR URL, branch, files changed |
| `pr.merged` | Poller (future) | PR URL, merge commit |
| `context.snapshot_created` | Context Assembler | Snapshot ID, run ID, artifact refs |
| `scratchpad.promoted` | Context Manager | Artifact ID, promoted from scratchpad to memory |

### Schema

```typescript
interface HistoryEntry {
  id: string;
  project_id: string;
  work_item_id: string | null;  // null for project-level events
  run_id: string | null;
  event_type: string;           // e.g., "run.completed"
  payload: Record<string, unknown>;
  created_at: Date;             // immutable timestamp
}
```

### Storage

- SQLite table, append-only.
- No UPDATE or DELETE operations ever.
- Indexed by `(project_id, work_item_id, created_at)` for efficient range queries.

### Who reads history

| Consumer | What it reads | Why |
|---|---|---|
| Context Assembler | Recent events for the current work item | Include relevant history in agent prompt |
| Context Assembler | Prior run summaries for related work items | Cross-issue awareness |
| CLI (`feliz context history`) | Events for a project or work item | Debugging, audit |
| Scratchpad Promotion | Run results and gate outcomes | Decide what to promote to memory |

### Retention

History is never deleted. For long-running projects, old history entries are excluded from context assembly by recency filters and token budgeting, but they remain in the database for audit.

---

## 2. Memory

**Purpose**: Curated, versioned knowledge that persists across runs. Represents "what we know" about the project. Updated deliberately, not automatically.

### What creates memory entries

| Source | Memory artifact | How it's created |
|---|---|---|
| Spec Engine | Spec files | Spec drafted + approved → committed to repo and recorded as memory artifact |
| Scratchpad promotion | Project conventions | Agent discovers a pattern (e.g., "all routes use `asyncHandler` wrapper") → promoted after review |
| Scratchpad promotion | Architectural decisions | Agent documents a decision (e.g., "chose Stripe over Braintree because...") → promoted |
| Scratchpad promotion | Recurring patterns | Feliz detects recurring test/lint fixes across runs → summarizes as convention |
| Manual | User-provided context | User adds project docs, design decisions, or constraints via CLI or repo files |
| Decomposition | Project structure | Feature breakdown and dependency graph from decomposition phase |

### Schema

```typescript
interface MemoryArtifact {
  id: string;
  project_id: string;
  work_item_id: string | null;  // null for project-level memory
  kind: 'spec' | 'convention' | 'decision' | 'structure' | 'summary';
  path: string;                 // logical path, e.g., "specs/auth/login.md"
  content_hash: string;         // SHA-256
  version: number;              // monotonically increasing
  content: string;
  metadata: {
    source: string;             // "spec_engine", "promotion", "manual", "decomposition"
    promoted_from?: string;     // scratchpad artifact ID, if promoted
    approved_by?: string;       // "user" or "auto"
    approved_at?: Date;
  };
  created_at: Date;
}
```

### Versioning

- Every update to a memory artifact creates a new version.
- Old versions are retained (never deleted).
- The latest version is used for context assembly.
- Version history is queryable: `feliz context show <work_item>` shows which versions were used.

### Version lifecycle

```
v1 (created)
  │
  │  spec revised, or convention updated
  ▼
v2 (new version, v1 retained)
  │
  │  further revision
  ▼
v3 (new version, v1 and v2 retained)
```

### Who reads memory

| Consumer | What it reads | Why |
|---|---|---|
| Context Assembler | Latest version of relevant artifacts | Build the agent's context for a run |
| Spec Engine | Existing specs | Understand what exists before drafting new specs |
| Decomposition Engine | Project structure memory | Understand existing architecture when breaking down features |
| CLI (`feliz context show`) | Artifact versions | Inspect what context a run received |

### Retention

Memory artifacts are never deleted, but old versions can be archived (excluded from context assembly) if they become stale. Archiving is manual (`feliz context archive <artifact_id>`) or automatic after a configurable number of versions.

---

## 3. Scratchpad

**Purpose**: Transient working artifacts produced during runs. Short-lived. Either promoted to memory or discarded.

### What creates scratchpad entries

| Source | Scratchpad artifact | When |
|---|---|---|
| Agent output | `agent_output` | After each pipeline step — the agent's stdout/response |
| Agent output | `diff` | After a step that modifies files — `git diff` of changes |
| Agent output | `summary` | Agent-generated summary of what it did and why |
| Gate execution | `test_output` | After running test command — full test output |
| Gate execution | `lint_output` | After running lint command — full lint output |
| Review step | `review_report` | Reviewer agent's feedback/findings |
| Spec Engine | `draft_spec` | Spec draft before approval (not yet memory) |
| Pipeline | `step_log` | Combined stdout/stderr for a step execution |

### Schema

```typescript
interface ScratchpadArtifact {
  id: string;
  project_id: string;
  work_item_id: string;
  run_id: string;
  step_execution_id: string | null;
  kind: 'agent_output' | 'diff' | 'summary' | 'test_output' | 'lint_output'
      | 'review_report' | 'draft_spec' | 'step_log';
  content_hash: string;
  content: string;              // or file path for large artifacts
  metadata: {
    phase: string;
    step: string;
    cycle: number;
    agent_adapter?: string;
  };
  status: 'active' | 'promoted' | 'discarded';
  promoted_to?: string;         // memory artifact ID, if promoted
  created_at: Date;
  expires_at: Date | null;      // auto-discard deadline
}
```

### Lifecycle

```
                                ┌─────────────┐
       Step produces output ──▶ │   active    │
                                └──────┬──────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                   │
                    ▼                  ▼                   ▼
           ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
           │   promoted   │   │  discarded   │   │   consumed   │
           │  (→ memory)  │   │  (expired/   │   │ (by next step│
           │              │   │   cleaned)   │   │  in pipeline)│
           └──────────────┘   └──────────────┘   └──────────────┘
```

### Transition: Active → Consumed (within a run)

During pipeline execution, scratchpad artifacts from earlier steps are available to later steps:

1. Step "write_tests" produces `agent_output` and `diff` → stored as scratchpad.
2. Step "write_code" runs. Context Assembler includes the prior step's scratchpad artifacts so the agent knows what tests were written.
3. Step "review" runs. Context includes all prior steps' outputs.

This happens automatically — all scratchpad artifacts from the current run are available to subsequent steps.

### Transition: Active → Promoted (to memory)

After a successful run, Feliz evaluates scratchpad artifacts for promotion:

**Auto-promotion candidates** (if configured):
- Agent-generated summaries that describe conventions or patterns
- Spec drafts that were approved during the run

**Human-approved promotion**:
1. Feliz identifies scratchpad artifacts worth preserving.
2. Posts to Linear: "This run discovered the following. Promote to project memory?"
   ```
   Findings from PAY-103:
   - Convention: all Stripe API calls use the shared `stripeClient` wrapper
   - Pattern: error handling uses `StripeError` → `AppError` mapping in middleware

   Reply @Feliz approve to promote, or @Feliz discard.
   ```
3. User approves → artifacts become memory entries with `source: "promotion"`.

**Auto-promotion rules** (configurable in `.feliz/config.yml`):
```yaml
context:
  auto_promote:
    - kind: summary      # always promote agent summaries
    - kind: draft_spec   # promote approved specs automatically
  promotion_approval: true  # require human approval for other types
```

### Transition: Active → Discarded

Scratchpad artifacts are discarded when:

| Trigger | Behavior |
|---|---|
| Run completes successfully | Non-promoted artifacts are marked `discarded` after a configurable retention period (default: 7 days). |
| Run fails and is retried | Prior run's scratchpad stays `active` until the retry completes (the retry needs the failure context). After successful retry, prior scratchpad is discarded. |
| Run fails permanently | Scratchpad stays `active` for inspection. Discarded after retention period. |
| Manual cleanup | `feliz context cleanup --project <name>` discards old scratchpad artifacts. |
| Expiration | `expires_at` is set on creation (default: 30 days). Background job discards expired artifacts. |

Discarded artifacts are soft-deleted (marked `status: 'discarded'`) and excluded from context assembly. They can be hard-deleted by a periodic cleanup job after a secondary retention period.

---

## 4. How the Three Layers Interact

### During a single run

```
1. Context Assembly (before step)
   ├── Read History: recent events for this work item
   ├── Read Memory: relevant specs, conventions, decisions
   ├── Read Scratchpad: outputs from prior steps in this run
   └── Build ContextSnapshot manifest

2. Agent Executes Step
   └── Produces output

3. After Step
   ├── Append to History: step started/completed/failed events
   ├── Write to Scratchpad: agent output, diff, test results
   └── (Scratchpad artifacts available to next step)

4. After Pipeline Completes
   ├── Append to History: run.completed event
   ├── Evaluate Scratchpad for promotion
   │   ├── Auto-promote configured kinds
   │   └── Propose others for human approval
   └── Start scratchpad retention timer
```

### Across runs (context accumulation)

```
Run #1 (PAY-101: Database schema)
  ├── History: issue discovered, run started, run completed
  ├── Scratchpad → promoted to Memory: "Convention: use Drizzle ORM for all DB access"
  └── Memory: specs/database/index.md (if specs enabled)

Run #2 (PAY-102: Stripe integration)
  ├── Context includes: Memory from Run #1 (Drizzle convention)
  ├── History: includes Run #1 summary
  ├── Scratchpad → promoted: "Convention: all Stripe calls through stripeClient wrapper"
  └── Memory: specs/stripe/index.md (if specs enabled)

Run #3 (PAY-103: Credit card tokenization)
  ├── Context includes: Memory from Run #1 + #2 (Drizzle + Stripe conventions)
  ├── History: includes Run #1 + #2 summaries
  └── Agent knows to use Drizzle ORM and stripeClient wrapper without being told
```

### Cross-issue context

When working on PAY-103, the Context Assembler:
1. Reads **Memory** for the project (all conventions, specs, decisions — not issue-specific).
2. Reads **History** for PAY-103 specifically (its own events).
3. Reads **History** for related issues (PAY-101, PAY-102 — via blocker relationships) — summarized, not full logs.
4. Reads **Scratchpad** only from the current run (prior steps).

This ensures agents benefit from prior work without being overwhelmed by irrelevant history.

---

## 5. Storage Summary

Each layer lives in a different place, optimized for its access pattern and lifecycle.

| Layer | Primary Storage | Location | Mutability | Retention |
|---|---|---|---|---|
| **History** | Feliz SQLite DB | `{data_dir}/db/feliz.db` → `history` table | Append-only, never modified | Forever (in DB) |
| **Memory** | Git repo | `.feliz/context/memory/` + `specs/` (if enabled) | Versioned via git commits | Forever (git history) |
| **Scratchpad** | Feliz filesystem | `{data_dir}/scratchpad/{project}/{run_id}/` | Status transitions | Configurable (default 30 days) |

### Why this split

- **History in DB**: Operational event log. High write frequency, structured queries needed, would bloat the repo. Feliz is the only consumer.
- **Memory in repo**: Curated knowledge that agents and humans both need. Version-controlled via git so the team can review changes in PRs, see blame/history, and the knowledge survives if Feliz is reset. The repo is the source of truth for "what we know."
- **Scratchpad on filesystem**: Transient, large artifacts (full agent output, test logs). No value in version-controlling. Discarded after retention period.

See [Context Management](index.md) for the high-level overview of assembly, storage, and promotion.

### Repo layout for memory

```
repo/
  .feliz/
    config.yml                    # repo config
    pipeline.yml                  # pipeline definition
    prompts/                      # prompt templates
    context/
      memory/
        conventions/
          orm.md                  # "Use Drizzle ORM for all DB access"
          error-handling.md       # "Map StripeError → AppError in middleware"
          testing.md              # "Use vitest, co-locate test files"
        decisions/
          payment-provider.md     # "Chose Stripe over Braintree because..."
          auth-strategy.md        # "JWT with refresh tokens, 24h expiry"
        summaries/
          PAY-101.md              # Run summary for PAY-101
          PAY-102.md              # Run summary for PAY-102
  specs/                          # only when specs.enabled
    index.md
    auth/
      login.md
    payments/
      charge.md
```

### Memory commit workflow

When memory is created or updated (promotion, spec approval, etc.), Feliz:

1. Writes the artifact to the appropriate path in `.feliz/context/memory/` (or `specs/`).
2. Commits to the current worktree branch with a structured commit message:
   ```
   feliz: promote convention "Use Drizzle ORM for all DB access"

   Promoted from run PAY-101 (attempt 1).
   Source: agent summary from step "write_code".
   ```
3. If on main branch (e.g., after a project-level promotion): creates a PR for the memory update.
4. If on a worktree branch (during a run): included in the run's PR alongside code changes.

This means memory changes are reviewable in PRs, just like code changes.

### Feliz DB schema (History + Scratchpad metadata)

```sql
-- History: append-only event log
CREATE TABLE history (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  work_item_id TEXT,
  run_id TEXT,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,  -- JSON
  created_at TEXT NOT NULL
);
CREATE INDEX idx_history_project_item ON history(project_id, work_item_id, created_at);

-- Scratchpad: metadata only, content on filesystem
CREATE TABLE scratchpad (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  work_item_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  step_execution_id TEXT,
  kind TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  file_path TEXT NOT NULL,  -- relative to {data_dir}/scratchpad/
  metadata TEXT,            -- JSON
  status TEXT NOT NULL DEFAULT 'active',  -- active, promoted, discarded
  promoted_to_path TEXT,    -- repo path if promoted to memory
  created_at TEXT NOT NULL,
  expires_at TEXT
);
CREATE INDEX idx_scratchpad_run ON scratchpad(run_id, status);
```

---

## 6. CLI Commands

```
feliz context history <project>              # Show history events for a project
feliz context history <work_item>            # Show history events for a work item
feliz context memory <project>               # List memory artifacts for a project
feliz context memory <project> --versions    # Show version history
feliz context scratchpad <run_id>            # Show scratchpad artifacts for a run
feliz context show <work_item>               # Show the context snapshot (manifest) for a work item's latest run
feliz context promote <artifact_id>          # Manually promote a scratchpad artifact to memory
feliz context archive <artifact_id>          # Archive a memory artifact (exclude from context)
feliz context cleanup --project <name>       # Discard expired scratchpad artifacts
```
