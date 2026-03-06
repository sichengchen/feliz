# Context Management

## Context Assembly

Before each agent run, Feliz assembles a context payload by:

1. **Collecting** relevant artifacts from all three layers:
   - History: recent Linear events for this issue, prior run summaries
   - Memory: project conventions, architectural decisions, and specs (if `specs.enabled`)
   - Scratchpad: outputs from prior failed/partial runs on the same issue
2. **Filtering** by relevance (issue labels, related issues, spec directory if applicable)
3. **Ordering** deterministically (specs first if present, then history, then scratchpad)
4. **Budgeting** to fit within the agent's token window
5. **Recording** the assembled set as a ContextSnapshot (manifest)

Each snapshot is recorded with the run ID that consumed it, so run records and snapshot manifests are directly traceable in both directions.

## Context Storage

Each layer lives in a different location, optimized for its access pattern:

| Layer | Storage | Location |
|---|---|---|
| **History** | Feliz SQLite DB | `{data_dir}/db/feliz.db` → `history` table |
| **Memory** | Git repo | `.feliz/context/memory/` (conventions, decisions, summaries) + `specs/` (if enabled) |
| **Scratchpad** | Feliz filesystem | `{data_dir}/scratchpad/{project}/{run_id}/` |
| **Snapshots** | Feliz SQLite DB | `{data_dir}/db/feliz.db` → `snapshots` table |

- **History** stays in the DB because it's an operational event log with high write frequency — it would bloat the repo.
- **Memory** lives in the repo so it's version-controlled, reviewable in PRs, and survives Feliz resets. The repo is the source of truth for "what we know."
- **Scratchpad** lives on the filesystem because artifacts are transient and large. Discarded after a configurable retention period (default 30 days).

When memory is created or updated (scratchpad promotion, spec approval), Feliz commits the artifact to the repo with a structured commit message and includes it in the run's PR.

## Scratchpad Promotion

After a successful run, certain scratchpad artifacts can be promoted to memory:

- Agent-produced summaries of what was changed and why
- Discovered conventions or patterns
- Test coverage reports

Promotion is either automatic (if `specs.approval_required: false`) or requires human approval (Feliz posts to Linear: "Promote these findings to project memory? Reply `@Feliz approve`").

---

See [Context Lifecycle](lifecycle.md) for detailed lifecycle of each layer.

## Behavioral Scenario

### Scenario: Snapshot Traceability

- **Given** a run is created for a work item
- **When** Feliz assembles and stores context for that run
- **Then** the stored `ContextSnapshot.run_id` equals the `Run.id` that references the snapshot
