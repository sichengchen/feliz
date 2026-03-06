# User Journey: Full Project Lifecycle

This document traces how a developer/team uses Feliz throughout the entire lifecycle of building a product, from initial idea to shipped software.

---

## Phase 0: Install & Start Feliz

**What's happening**: First-time setup. The operator installs Feliz and gets it running.

### Option A: Docker (recommended)

1. **Clone, configure, and start**:
   ```bash
   git clone <repo-url> && cd feliz
   cp .env.example .env
   # Edit .env with your GITHUB_TOKEN, etc. (Linear OAuth token set during `feliz init`)
   docker compose up -d --build
   ```
   The `docker-compose.yml` uses `build: .` to build the image locally. The `.env.example` file documents all available environment variables. Agent API keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) are optional — prefer OAuth via `feliz init`.
   The Feliz Docker image ships with `git`, `openssh-client`, and `bun`. It does **not** bundle coding agent CLIs (they are proprietary/separately licensed).

2. **Run the setup wizard** (inside the container):
   ```bash
   docker compose exec feliz feliz init
   ```
   The wizard walks through:
   - Registering or connecting the Linear OAuth app (`actor=app`)
   - Verifying `GITHUB_TOKEN` environment variable
   - Installing and authenticating coding agents (see below)
   - Selecting the default agent adapter
   - Writing `feliz.yml` with initial settings

   ```
   Feliz Setup
   -----------
   Linear OAuth Setup:
     1. Register a new app at https://linear.app/settings/api/applications/new
     2. Enable webhooks + "Agent session events"
     3. Complete OAuth flow with actor=app

   Connecting to Linear... OK (workspace: "Acme Corp", bot: "Feliz")
   GITHUB_TOKEN   : set

   Install coding agents
   ---------------------
   Which agents do you want to use?
     [x] Claude Code
     [ ] Codex
   > Enter

   Installing Claude Code CLI... done (v1.x.x)

   Authenticate Claude Code:
     1. OAuth login (recommended) — runs `claude login`
     2. API key (ANTHROPIC_API_KEY env var)
   > 1

   Running `claude login`...
   (Claude Code's own OAuth flow opens in browser)
   ... authenticated.

   Default agent: claude-code

   Config written to /data/feliz/feliz.yml
   Run `feliz project add` to add your first project.
   ```

   **Agent authentication**: Feliz delegates auth to each agent's own CLI login command. Feliz never stores agent credentials itself — each agent manages its own tokens/sessions.

   | Agent | OAuth (recommended) | API Key (fallback) |
   |---|---|---|
   | Claude Code | `claude login` — Claude Code's own OAuth flow, credentials stored by Claude Code | `ANTHROPIC_API_KEY` env var passed to subprocess |
   | Codex | `codex login` — Codex's own OAuth flow, credentials stored by Codex | `OPENAI_API_KEY` env var passed to subprocess |

   OAuth is recommended because it avoids managing long-lived API keys. For headless/CI environments where a browser isn't available, API key via env var is the fallback.

3. **Verify**:
   ```bash
   docker compose exec feliz feliz status
   # Feliz is running. 0 projects configured. 0 agents active.
   # Agents installed: claude-code (v1.x.x)
   ```

**Agent installation**: Agents are installed inside the container's persistent data volume (`/data/feliz/agents/`). They survive container restarts but are re-verified on startup. If an agent CLI is missing or outdated, Feliz re-installs it. The user never manually installs agent CLIs — Feliz manages them via `feliz init`.

**Agent credentials**: Feliz never stores agent credentials. OAuth tokens are managed by each agent's own CLI (e.g., `~/.claude/`, `~/.codex/`). Re-authenticate with `feliz agent login <adapter-name>` (which calls the agent's own login command).

### Option B: CLI (local dev)

1. **Install Feliz**:
   ```bash
   bun install -g feliz
   ```
2. **Run the setup wizard**:
   ```bash
   feliz init
   ```
   Same wizard as Docker — checks env vars, connects to Linear, installs agent CLIs locally, writes `~/.feliz/feliz.yml`.
3. **Start the daemon**:
   ```bash
   feliz start
   ```

Feliz is now running but has no projects configured.

---

## Phase 1: Project Setup

**What's happening**: The team has decided to build a new product (or major module). They have a rough idea of what it should do.

### Steps

1. **Create a Linear project** for the new product (e.g., "Payments Service").
2. **Create a git repo** for the codebase.
3. **Register the project with Feliz** using the project wizard:
   ```bash
   feliz project add
   ```
   The wizard walks through:
   ```
   Add Project
   -----------
   Fetching Linear projects... found 4 projects.

   Select Linear project:
     1. Payments Service
     2. Mobile App
     3. Internal Tools
     4. Marketing Site
   > 1

   Git repo URL: git@github.com:org/payments-service.git
   Base branch [main]: main

   Cloning repo... done.

   Repo config (.feliz/) not found. Generate starter config?
     Agent adapter [claude-code]: claude-code
     Enable specs? [Y/n]: Y
     Specs directory [specs]: specs
     Test command: bun test
     Lint command: bun run lint

   Generated:
     .feliz/config.yml    (agent, hooks, gates, specs settings)
     .feliz/pipeline.yml  (default pipeline: implement -> review -> publish)
     .feliz/prompts/       (starter prompt templates)
     WORKFLOW.md          (default prompt template)

   Commit and push config to repo? [Y/n]: Y
   Pushed to main.

   Project "payments-service" added.
   ```

   If the repo already has `.feliz/` config, the wizard skips generation and uses the existing config.

4. **Verify**:
   ```bash
   feliz status
   # Feliz is running. 1 project configured.
   #   payments-service: watching "Payments Service"
   #   Agents: claude-code (v1.x.x)
   ```

### What Feliz does

Feliz is now listening for `@Feliz` mentions and issue delegations in the Payments Service project via Agent Session webhooks. No issues are tracked yet — Feliz only tracks issues when explicitly mentioned or delegated.

---

## Phase 2: Vision & High-Level Planning

**What's happening**: The team brainstorms features, writes a product brief, and creates a high-level plan.

### Flow A: Adding a large task

1. **Create a milestone** (optional) in Linear for the feature set (e.g., "Payments MVP").
2. **Create an initial Linear issue** describing the full product vision:
   > "Build a payments service that supports credit card processing, subscription billing, invoicing, and webhook notifications to downstream services."
3. **Mention Feliz** in the issue: `@Feliz decompose`

### What Feliz does

4. Feliz acknowledges on the comment.
5. Feliz detects this as a large feature and enters `decomposing` state.

#### With `specs.enabled: true`

6. Feliz analyzes the description and **drafts a project-level spec**:
   - `specs/index.md` — master overview
   - `specs/credit-cards/index.md` — credit card processing: design + behavioral cases
   - `specs/subscriptions/index.md` — subscription billing: design + behavioral cases
   - `specs/invoicing/index.md` — invoicing: design + behavioral cases
   - `specs/webhooks/index.md` — webhook notifications: design + behavioral cases
7. From the spec, Feliz **proposes a breakdown** into sub-issues, posted as a Linear comment:
   ```
   Proposed breakdown into 12 sub-issues:

   Foundation:
   1. PAY-101: Database schema & migrations (no deps)
   2. PAY-102: Stripe SDK integration layer (no deps)

   Credit Cards:
   3. PAY-103: Credit card tokenization (depends on PAY-101, PAY-102)
   4. PAY-104: Charge creation & capture (depends on PAY-103)
   5. PAY-105: Refund processing (depends on PAY-104)

   Subscriptions:
   6. PAY-106: Plan & pricing model (depends on PAY-101)
   7. PAY-107: Subscription lifecycle (depends on PAY-106, PAY-103)
   8. PAY-108: Usage-based billing (depends on PAY-107)

   Invoicing:
   9.  PAY-109: Invoice generation (depends on PAY-104, PAY-107)
   10. PAY-110: PDF rendering & email delivery (depends on PAY-109)

   Webhooks:
   11. PAY-111: Webhook event system (depends on PAY-101)
   12. PAY-112: Webhook delivery & retry (depends on PAY-111)

   Reply @Feliz approve to create these issues, or comment with adjustments.
   ```

#### With `specs.enabled: false`

6. Feliz analyzes the description and **proposes a breakdown** directly (no spec artifacts created):
   ```
   Proposed breakdown into 12 sub-issues:

   Foundation:
   1. PAY-101: Database schema & migrations (no deps)
      "Create PostgreSQL migrations for users, plans, invoices, and payments tables."
   2. PAY-102: Stripe SDK integration layer (no deps)
      "Create a Stripe client wrapper with charge, refund, and subscription methods."
   ...

   Reply @Feliz approve to create these issues, or comment with adjustments.
   ```

#### Both paths continue:

### What the user does

7. Reviews the proposed breakdown (and spec, if enabled) in Linear.
8. Comments with adjustments: "Split PAY-107 into create/cancel/upgrade. Combine PAY-111 and PAY-112 into one issue."
9. Feliz acknowledges, revises and reposts.
10. User approves: `@Feliz approve`.

### What Feliz does next

11. Creates all sub-issues in Linear with:
    - Titles and descriptions (derived from spec scenarios if specs enabled, or from the breakdown descriptions)
    - Blocker/dependency relationships
    - Labels: `feliz:sub-issue`, `payments`
    - Links back to the parent epic
    - Added to the same milestone as the parent (if one exists)
12. If `specs.enabled`: commits the project-level spec to the repo on a branch, creates a PR for the specs.
13. Parent epic stays tracked — auto-completes when all children are done.

---

## Phase 3: Iterative Implementation

**What's happening**: The team starts building. Issues are worked on in dependency order. Some are simple, some need clarification.

### Scenario A: Simple issue (small task)

1. User mentions `@Feliz` on PAY-101 (Database schema): "Please work on this."
2. Feliz acknowledges and creates a WorkItem.
3. Context assembly:
   - **With specs**: Feliz finds the relevant spec files (system design and behavioral cases) for this issue and includes them as context.
   - **Without specs**: Feliz uses the issue description and any accumulated project memory (conventions, prior run summaries).
4. Pipeline executes (every step is an agent call):
   - **implement phase**: Claude Code writes migrations and models, runs tests.
   - **review_cycle phase**: Codex reviews, Claude Code fixes, until approved (or max cycles).
   - **publish phase**: Agent runs lint/tests, commits changes, pushes branch, creates PR.
5. Feliz posts to Linear: "PR created: [link]. Summary: Added migrations for users, plans, invoices, payments tables."
6. Feliz moves issue to "In Review".
7. Human reviews PR, merges. Issue moves to "Done" in Linear.

### Scenario B: Complex issue, needs clarification (specs enabled)

*This scenario only applies when `specs.enabled: true`.*

1. User mentions `@Feliz` on PAY-107 (Subscription lifecycle).
2. Feliz acknowledges. Detects ambiguity (spec doesn't fully cover edge cases for upgrades/downgrades).
3. Feliz enters `spec_drafting` — drafts additional design details and behavioral cases:
   ```
   I've drafted additional design and cases for subscription lifecycle:

   ### Mid-cycle upgrade
   - Given a user on the "Basic" plan with 15 days remaining
   - When they upgrade to "Pro"
   - Then they are charged the prorated difference
   - And the new plan takes effect immediately

   ### Downgrade at renewal
   - Given a user on the "Pro" plan
   - When they downgrade to "Basic"
   - Then the current billing cycle completes at "Pro" rate
   - And "Basic" takes effect at next renewal

   ### Cancel with grace period
   ...

   Reply @Feliz approve to proceed, or comment with adjustments.
   ```
4. User comments: "Upgrades should take effect at next renewal too, not immediately. Add a scenario for failed payment retry."
5. Feliz acknowledges, revises the spec, reposts. User approves.
6. Pipeline executes with the refined spec as context.

### Scenario C: Complex issue, needs clarification (specs disabled)

*When specs are off, Feliz doesn't draft spec artifacts — but it can still ask for clarification.*

1. User mentions `@Feliz` on PAY-107 (Subscription lifecycle).
2. Feliz acknowledges. Detects ambiguity in the issue description.
3. Feliz posts a clarifying question to Linear:
   ```
   Before starting, I need clarification on a few points:

   1. Should plan upgrades take effect immediately or at next renewal?
   2. How should prorated charges be calculated for mid-cycle changes?
   3. Should there be a grace period for cancellations?

   Reply with answers and I'll proceed.
   ```
4. User replies with clarifications. Feliz acknowledges, appends them to context history.
5. Pipeline executes with the issue description + clarifications as context.

### Scenario D: Failed run, agent handles recovery

1. PAY-108 (Usage-based billing) is running. The agent writes code but tests fail.
2. Within the pipeline, the agent receives the test failure context and attempts fixes (up to `max_attempts`).
3. If the agent fixes the tests: pipeline continues to publish step, agent commits/pushes/creates PR.
4. If the agent cannot fix after max attempts: Feliz posts to Linear:
   ```
   Run failed (attempt 1/3). Test failure:
   FAIL src/billing/metering.test.ts
     Expected: 150 units
     Received: 149 units

   I attempted to fix this but couldn't resolve it. The issue seems to be in the
   metering window calculation.

   Reply @Feliz retry to retry, or provide guidance.
   ```
5. User comments with a hint: "The metering window should be inclusive on both ends."
6. Feliz acknowledges. On retry, the agent receives the original failure context plus the user's guidance.

### Scenario E: Publishing failure, agent recovers

1. Agent finishes implementation and tests pass.
2. During the publish step, the agent tries to push but the branch has conflicts with main.
3. The agent detects the conflict, rebases on main, resolves conflicts, re-runs tests, and pushes successfully.
4. Agent creates the PR. Pipeline completes.

If the agent cannot resolve the conflict, it posts to Linear asking the user for help.

---

## Phase 4: Integration & Cross-Cutting Concerns

**What's happening**: Individual features are built. Now the team needs to connect them, add auth, error handling, monitoring, etc.

### Steps

1. User creates a new Linear issue: "Add authentication middleware and protect all payment endpoints."
2. User mentions `@Feliz` on the issue.
3. Feliz acknowledges and picks it up. Context assembly includes:
   - **Memory**: project conventions, architectural decisions, and specs (if enabled)
   - **History**: summaries of prior runs (what code was written, which files changed)
   - **Scratchpad**: any notes promoted from prior runs about conventions discovered
4. The agent implements auth middleware with awareness of the existing codebase structure, because Feliz provided accumulated context.

### What's different from Phase 3

- The context layer matters most here. Without accumulated context, the agent would need to rediscover the codebase structure. With Feliz's memory, it already knows the route patterns, middleware conventions, and test structure established by prior runs — regardless of whether specs are enabled.

---

## Phase 5: Refinement & Bug Fixes

**What's happening**: The product is mostly built. The team is fixing bugs, polishing UX, and handling edge cases found in testing/staging.

### Steps

1. Bugs are filed as Linear issues.
2. User mentions `@Feliz` on the bug. Feliz acknowledges and picks it up.
3. For bugs:
   - Issue description + existing context (specs if enabled, or accumulated memory) provide enough context.
   - Pipeline runs normally: agent implements fix, runs tests, commits, pushes, creates PR.
4. User can control per-issue behavior:
   - Add a `feliz:priority` label -> Feliz boosts priority in the dispatch queue.
   - Comment `@Feliz start` -> skip spec phase (if enabled), go straight to execution.

### Scenario: Rapid bug fixing

1. QA files 5 bugs in quick succession, mentions `@Feliz` on each.
2. Feliz acknowledges on all five.
3. Feliz creates worktrees for each, works on them in parallel (up to `max_concurrent` limit).
4. Each gets its own branch, its own PR.
5. Feliz posts results to each Linear issue independently.
6. Some PRs fix the bug on the first try. Some fail and the agent retries. One needs human input — the agent asks in a Linear comment.

---

## Phase 6: Feature Evolution

**What's happening**: The product is live. New features are requested. Existing behavior needs to change.

### With `specs.enabled: true` — Spec Maintenance

1. A new feature request arrives: "Support ACH bank transfers in addition to credit cards."
2. User creates a Linear issue and mentions `@Feliz`.
3. Feliz acknowledges and enters `spec_drafting`:
   - Reads the existing specs to understand the current payment architecture.
   - Drafts new spec files: `specs/ach-transfers/index.md` with design and behavioral cases.
   - **Also identifies specs that need updating**: the charge creation spec now needs an ACH path.
4. Feliz proposes both new specs and spec modifications:
   ```
   New specs:
   - specs/ach-transfers/index.md (design + 5 behavioral cases)
   - specs/ach-transfers/verification.md (design + 3 behavioral cases)

   Modified specs:
   - specs/credit-cards/charge.md — added "payment method type" branching
   - specs/index.md — added ACH transfers section

   Reply @Feliz approve to proceed.
   ```
5. User reviews, approves. Feliz implements against the updated specs.

### With `specs.enabled: false` — Context-Driven Evolution

1. Same feature request: "Support ACH bank transfers."
2. User creates a Linear issue and mentions `@Feliz`.
3. Feliz acknowledges and picks it up directly — no spec phase. Context assembly includes accumulated memory from prior runs.
4. Pipeline executes. The agent uses its understanding of the existing code (from context) to add ACH support consistently.
5. Quality is enforced via pipeline gates (tests, review cycles) rather than spec conformance.

---

## Phase 7: Ongoing Operations

**What's happening**: The product is mature. Work is a mix of maintenance, incremental features, dependency updates, and occasional refactors.

### Typical workflows

| Work type | How the user uses Feliz |
|---|---|
| **Dependency update** | Create issue, mention `@Feliz`: "Update Stripe SDK to v15." Feliz updates, runs tests, creates PR. |
| **Small feature** | Create issue, mention `@Feliz`. Feliz implements (spec phase if enabled). |
| **Large feature** | Create issue, `@Feliz decompose`. Full decomposition flow (with milestone if desired). |
| **Refactor** | Create issue, mention `@Feliz`: "Extract billing logic into separate module." Feliz has context from prior runs. |
| **Bug fix** | File bug, mention `@Feliz`. Feliz fixes and creates PR. |
| **Tech debt** | Create issue, mention `@Feliz`. Add `feliz:low-priority` label. Feliz works on it when higher-priority work is done. |

### Context accumulation over time

As the project matures, Feliz's context store grows:

- **Memory** contains: project conventions, architectural decisions, and specs if enabled (living documentation)
- **History** contains: every run's inputs/outputs, every comment exchange
- **Scratchpad** contains: recent run artifacts not yet promoted

This means later agents benefit from earlier agents' work. Agent run #50 has dramatically more context than agent run #1.

---

## Summary: What the user actually does day-to-day

The user's workflow converges to:

1. **Write Linear issues** (descriptions, acceptance criteria, context).
2. **Mention `@Feliz`** to assign work.
3. **Review Feliz's proposals** in Linear comments (decompositions, spec drafts if enabled, clarifying questions).
4. **Approve or adjust** via `@Feliz approve` or comment feedback.
5. **Review PRs** that Feliz creates.
6. **Merge or request changes** through normal PR workflow.

The user **never** needs to:
- Manually configure per-issue agent behavior
- Write prompts or manage agent pipelines
- Context-switch to a different tool for AI-assisted coding
- Maintain documentation separately (when specs are enabled, they serve as living system design docs)

Linear is the control surface. The repo is the output. Feliz is the engine in between.
