# Orchestration

## Work Item Lifecycle

### State Machine (Specs Enabled)

When `specs.enabled: true`:

```
                    ┌──────────────┐
                    │  unclaimed   │◄──────────────────────┐
                    └──────┬───────┘                       │
                           │                               │
              ┌────────────▼────────────┐                  │
              │  large feature?         │                  │
              └─────┬──────────┬────────┘                  │
                yes │          │ no                         │
                    │          │                            │
           ┌────────▼───────┐  │                           │
           │  decomposing   │  │  (drafts spec + breakdown)│
           └────────┬───────┘  │                           │
                    │          │                           │
           ┌────────▼────────┐ │                           │
           │decompose_review │ │                           │
           └────────┬────────┘ │                           │
                    │ approved │                            │
                    │ (creates │                            │
                    │ sub-issues)                           │
                    │          │                            │
           ┌────────▼──────┐   │                           │
           │ spec_drafting │◄──┘                           │
           └────────┬──────┘                               │
                    │                                      │
           ┌────────▼──────┐                               │
           │  spec_review  │  (if approval_required)       │
           └────────┬──────┘                               │
                    │                                      │
              ┌─────▼──────────┐                           │
              │     queued     │                           │
              └─────────┬─────┘                           │
                        │ (slot available)                 │
              ┌─────────▼────────┐                        │
              │     running      │ (pipeline executes     │
              │                  │  phases/steps serially) │
              └──┬──────────┬────┘                        │
                 │          │                              │
        success  │          │ failure                      │
                 │          │                              │
    ┌────────────▼──┐  ┌────▼─────────┐                   │
    │   completed   │  │ retry_queued │───(retry)─────────┘
    └───────────────┘  └──────┬───────┘
                              │ (max retries exceeded)
                       ┌──────▼───────┐
                       │    failed    │
                       └──────────────┘
```

### State Machine (Specs Disabled)

When `specs.enabled: false` (no spec concept at all):

```
                    ┌──────────────┐
                    │  unclaimed   │◄──────────────────────┐
                    └──────┬───────┘                       │
                           │                               │
              ┌────────────▼────────────┐                  │
              │  large feature?         │                  │
              └─────┬──────────┬────────┘                  │
                yes │          │ no                         │
                    │          │                            │
           ┌────────▼───────┐  │                           │
           │  decomposing   │  │  (breakdown only, no spec)│
           └────────┬───────┘  │                           │
                    │          │                           │
           ┌────────▼────────┐ │                           │
           │decompose_review │ │                           │
           └────────┬────────┘ │                           │
                    │ approved │                            │
                    │ (creates │                            │
                    │ sub-issues)                           │
                    │          │                            │
              ┌─────▼──────────▼──┐                        │
              │      queued       │                        │
              └─────────┬────────┘                        │
                        │ (slot available)                 │
              ┌─────────▼────────┐                        │
              │     running      │                        │
              └──┬──────────┬────┘                        │
                 │          │                              │
        success  │          │ failure                      │
                 │          │                              │
    ┌────────────▼──┐  ┌────▼─────────┐                   │
    │   completed   │  │ retry_queued │───(retry)─────────┘
    └───────────────┘  └──────┬───────┘
                              │ (max retries exceeded)
                       ┌──────▼───────┐
                       │    failed    │
                       └──────────────┘
```

## Transitions

| From | To | Trigger |
|---|---|---|
| `unclaimed` | `decomposing` | Issue detected as large feature (epic label, or Feliz judges complexity). Decomposition includes spec drafting (system design + behavioral cases) only if `specs.enabled`. |
| `unclaimed` | `spec_drafting` | `specs.enabled` AND not a large feature |
| `unclaimed` | `queued` | `!specs.enabled` AND not a large feature |
| `decomposing` | `decompose_review` | Feliz drafts breakdown, posts to Linear for approval |
| `decompose_review` | (creates sub-WorkItems) | Human approves decomposition (`@feliz approve`). Parent stays in `decompose_review` until children complete. |
| `spec_drafting` | `spec_review` | `specs.enabled` AND spec draft completed, posted to Linear |
| `spec_review` | `queued` | Human approves (`@feliz approve`) or `!specs.approval_required` |
| `queued` | `running` | Concurrency slot available, pipeline dispatched |
| `running` | `completed` | All pipeline phases/steps succeed, PR created |
| `running` | `retry_queued` | Pipeline fails, retries remaining |
| `running` | `failed` | Pipeline fails, no retries remaining |
| `retry_queued` | `queued` | Backoff timer expires |
| any | `cancelled` | User cancels via `@feliz cancel` or issue moves to terminal state |

**Note**: The states `spec_drafting` and `spec_review` only exist when `specs.enabled: true`. When specs are disabled, these states are never entered and the orchestration state type excludes them.

## Retry Policy

Exponential backoff with jitter:

```
delay = min(10000 * 2^(attempt - 1), max_retry_backoff_ms) + random(0, 2000)
```

Default `max_retry_backoff_ms`: 300000 (5 minutes).
Default max retry attempts: 3.

Normal completion (agent exited 0 but issue still active) uses a fixed 1-second continuation delay.

## Concurrency Control

Two levels:
1. **Global**: `agent.max_concurrent` from central config (default 5).
2. **Per-state**: `concurrency.max_per_state` from `.feliz/config.yml` (optional).

Dispatch eligibility requires:
- Work item is in `queued` state
- Global concurrent count < max
- Per-state concurrent count < max (if configured)
- All blocker issues are in terminal states (if issue is in "Todo" state)

Priority ordering for dispatch queue: `priority ASC` (1=urgent first), then `created_at ASC`.

## Approval Gates

Configurable via `agent.approval_policy` in `.feliz/config.yml`:

| Policy | Behavior |
|---|---|
| `auto` | Agent executes freely. Gates (tests, lint) checked after completion. |
| `gated` | Feliz posts the agent's plan to Linear before execution. Requires `@feliz approve` to proceed. |
| `suggest` | Agent produces a diff but doesn't commit. Feliz posts the diff for review. Requires approval to apply. |
