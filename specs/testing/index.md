# Testing & Validation Plan

This document defines an end-to-end validation plan for Feliz, from first install through real Linear/GitHub execution.

## Goal

Validate that Feliz can run the complete production workflow:

1. Discover issues from Linear
2. Progress orchestration states
3. Execute agent runs in isolated worktrees
4. Apply retry/concurrency rules
5. Publish pull requests
6. Persist run/history/context records for observability

## Exit Criteria

A test run is considered complete when all conditions are true:

- Local verification passes: `bun test`, `bun run lint`, `bun run build`
- At least one Linear issue reaches a successful run with a persisted non-null PR URL
- Orchestration state transitions match expected behavior for all scenario tests in this spec
- Run/history/context CLI and DB inspection confirm recorded execution artifacts

## Test Environment

Use isolated test assets:

- Linear project: `Feliz E2E Test`
- GitHub repo: `feliz-e2e-sandbox`
- Feliz config path: `/tmp/feliz-e2e/feliz.yml`
- Feliz data dir: `/tmp/feliz-e2e/data`
- Feliz workspace root: `/tmp/feliz-e2e/workspaces`

## Prerequisites

Install required tooling and authenticate:

```bash
brew install bun gh sqlite
gh auth login
```

Install and verify at least one supported coding agent CLI:

```bash
claude --version
# or
codex --version
```

## Sandbox Repository Setup

Create a dedicated GitHub repository and initialize a minimal Bun TypeScript project:

```bash
mkdir -p /tmp/feliz-e2e && cd /tmp/feliz-e2e
gh repo create <org-or-user>/feliz-e2e-sandbox --private --clone
cd feliz-e2e-sandbox
git checkout -b main
```

```bash
cat > package.json <<'JSON'
{
  "name": "feliz-e2e-sandbox",
  "type": "module",
  "scripts": {
    "test": "bun test",
    "lint": "bunx --bun tsc --noEmit"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5"
  }
}
JSON

cat > tsconfig.json <<'JSON'
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "Preserve",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "strict": true,
    "noEmit": true
  }
}
JSON

mkdir -p src test
cat > src/math.ts <<'TS'
export const add = (a: number, b: number) => a + b;
TS

cat > test/math.test.ts <<'TS'
import { describe, expect, test } from "bun:test";
import { add } from "../src/math";
describe("add", () => {
  test("adds two numbers", () => {
    expect(add(1, 2)).toBe(3);
  });
});
TS

bun install
bun test
git add .
git commit -m "chore: initialize e2e sandbox"
git push -u origin main
```

## Linear Project Setup

Create a dedicated Linear project `Feliz E2E Test` with workflow states including:

- `Todo`
- `In Progress`
- `In Review`
- `Done`

Create labels:

- `feliz`
- `epic`
- `feliz:decompose`

Create seed issues:

- `E2E-1`: small happy-path change
- `E2E-2`: intentionally failing request (retry validation)
- `E2E-3`: blocked by `E2E-1`
- `E2E-4`: concurrency candidate
- `E2E-5`: decomposition candidate (add `epic` label)

## Feliz Installation & Configuration

From the Feliz repository:

```bash
cd /path/to/feliz
bun install
bun run lint
bun test
bun run build
```

Write `/tmp/feliz-e2e/feliz.yml`:

```yaml
linear:
  api_key: $LINEAR_API_KEY

polling:
  interval_ms: 5000

storage:
  data_dir: /tmp/feliz-e2e/data
  workspace_root: /tmp/feliz-e2e/workspaces

agent:
  default: codex
  max_concurrent: 2

projects:
  - name: feliz-e2e-sandbox
    repo: git@github.com:<org-or-user>/feliz-e2e-sandbox.git
    linear_project: Feliz E2E Test
    branch: main
```

In the cloned sandbox repo at `/tmp/feliz-e2e/workspaces/feliz-e2e-sandbox/repo`, create:

`.feliz/config.yml`

```yaml
agent:
  adapter: codex
  approval_policy: auto
  timeout_ms: 600000
  max_turns: 20

specs:
  enabled: true
  directory: specs
  approval_required: false

gates:
  test_command: bun test
  lint_command: bun run lint

concurrency:
  max_per_state:
    Todo: 1
```

`.feliz/pipeline.yml`

```yaml
phases:
  - name: execute
    steps:
      - name: run
        agent: codex
        prompt: WORKFLOW.md
        success:
          command: "bun test && bun run lint"
      - name: create_pr
        builtin: publish
```

## Bring-Up Checks

Run harness preflight before starting full scenarios:

```bash
bun run src/cli/index.ts e2e doctor --config /tmp/feliz-e2e/feliz.yml
bun run src/cli/index.ts e2e smoke --config /tmp/feliz-e2e/feliz.yml
```

Repo helper script (loads env file and writes a JSON report):

```bash
bash scripts/e2e-smoke.sh --env-file scripts/e2e.env.example --config /tmp/feliz-e2e/feliz.yml --report /tmp/feliz-e2e-smoke-report.json
```

Use JSON output for CI/staging ingestion:

```bash
bun run src/cli/index.ts e2e smoke --config /tmp/feliz-e2e/feliz.yml --json --out /tmp/feliz-e2e-smoke-report.json
```

Start Feliz:

```bash
bun run src/cli/index.ts start --config /tmp/feliz-e2e/feliz.yml
```

In a second terminal:

```bash
bun run src/cli/index.ts status --config /tmp/feliz-e2e/feliz.yml
bun run src/cli/index.ts config validate --config /tmp/feliz-e2e/feliz.yml
```

DB sanity:

```bash
sqlite3 /tmp/feliz-e2e/data/db/feliz.db ".tables"
```

## Scenario-Behavior Suite

### S1 Issue Discovery

- **Given** a new issue in `Feliz E2E Test`
- **When** the poll cycle runs
- **Then** a `work_items` record is created and history contains `issue.discovered`

### S2 Spec Draft Progression

- **Given** a non-epic item with `specs.enabled: true`
- **When** orchestration processes it
- **Then** it progresses through spec-drafting flow and emits `spec.drafted`

### S3 Decomposition Progression

- **Given** an issue labeled `epic`
- **When** orchestration processes it
- **Then** it transitions `decomposing -> decompose_review` and emits `decomposition.proposed`

### S4 Dispatch & Run Recording

- **Given** a queued item
- **When** dispatch executes
- **Then** run and step execution records are created with `run.started` and terminal run history events

### S5 Publishing

- **Given** a successful pipeline containing builtin `publish`
- **When** run completes
- **Then** a GitHub PR is created and `runs.pr_url` is persisted

### S6 Retry

- **Given** a run that fails
- **When** retries remain
- **Then** item transitions to `retry_queued` and later re-enters `queued` after backoff

### S7 Blocker Enforcement

- **Given** an item blocked by non-terminal blocker issues
- **When** dispatch eligibility is evaluated
- **Then** the blocked item remains `queued`

### S8 Per-State Concurrency

- **Given** `concurrency.max_per_state` is saturated for a Linear state
- **When** queued items of that state are considered
- **Then** additional items are not dispatched

### S9 Context Snapshot Traceability

- **Given** a run starts
- **When** context snapshot is created
- **Then** `context_snapshots.run_id` equals the run's `id`

### S10 Worktree Lifecycle

- **Given** worktree execution is configured
- **When** a run starts and finishes
- **Then** worktree create/remove lifecycle executes and no stale worktree remains

## Verification Commands

CLI checks:

```bash
bun run src/cli/index.ts e2e doctor --config /tmp/feliz-e2e/feliz.yml
bun run src/cli/index.ts e2e smoke --config /tmp/feliz-e2e/feliz.yml
bun run src/cli/index.ts run list --config /tmp/feliz-e2e/feliz.yml
bun run src/cli/index.ts run show <run_id> --config /tmp/feliz-e2e/feliz.yml
bun run src/cli/index.ts context history feliz-e2e-sandbox --config /tmp/feliz-e2e/feliz.yml
bun run src/cli/index.ts context show <LINEAR_IDENTIFIER> --config /tmp/feliz-e2e/feliz.yml
```

SQLite checks:

```bash
sqlite3 /tmp/feliz-e2e/data/db/feliz.db \
"select linear_identifier, orchestration_state from work_items order by updated_at desc;"

sqlite3 /tmp/feliz-e2e/data/db/feliz.db \
"select id, work_item_id, attempt, result, pr_url from runs order by started_at desc;"
```

GitHub checks:

```bash
gh pr list --repo <org-or-user>/feliz-e2e-sandbox
```

## Failure Injection

Deliberately exercise failure paths:

- Break tests in sandbox repo and verify retry behavior
- Remove agent CLI from PATH and verify failure reporting
- Configure an invalid gate command and verify step failure recording
- Terminate Feliz mid-run and verify safe restart behavior

## Test Report Template

For each scenario, capture:

- Scenario ID
- Start time / end time
- Linear issue identifier
- Run ID(s)
- Final orchestration state
- PR URL (if applicable)
- Pass/fail
- Notes

## Cleanup

```bash
bun run src/cli/index.ts stop --config /tmp/feliz-e2e/feliz.yml
rm -rf /tmp/feliz-e2e
```

Before cleanup, archive:

- `/tmp/feliz-e2e/data/db/feliz.db`
- Feliz server logs
- Scenario execution report
