# Linear Integration

Feliz connects to Linear as an **Agent** using Linear's native [Agent API](https://linear.app/developers/agent-interaction) (Developer Preview). This gives Feliz its own bot identity in the workspace — users can `@Feliz` with autocomplete, delegate issues to it, and see its status updates as structured agent activities.

## Authentication

Feliz uses Linear's OAuth2 flow with `actor=app` to install as an app-level actor (not a personal user). Installation requires workspace admin permissions.

**Required scopes**:

| Scope | Purpose |
|---|---|
| `app:mentionable` | Allow users to @-mention Feliz in issues, documents, and editor surfaces |
| `app:assignable` | Allow users to delegate issues to Feliz (sets Feliz as `delegate`, not `assignee`) |
| `read` | Read issues, comments, projects, labels, relations |
| `write` | Update issue state, create comments, manage labels |
| `issues:create` | Create sub-issues from decomposition |

**Installation**:

1. Register Feliz as an [Application](https://linear.app/settings/api/applications/new) in Linear.
2. Configure name ("Feliz") and icon — this is how the agent appears in workspace menus.
3. Enable webhooks and select **Agent session events** (plus Inbox notifications and Permission changes).
4. Complete the OAuth flow with `actor=app` to install into a workspace.
5. Store the workspace-specific app user ID (from `viewer.id` query) alongside the access token.

The bot identity means:
- Users see "Feliz" in mention autocomplete when typing `@`
- Users can delegate (assign) issues directly to Feliz
- Activities from Feliz show the app name/avatar, not a personal account
- Feliz does not count as a billable user

## Architecture

```
┌──────────────────────────────────────────────────┐
│                   Feliz Server                    │
│                                                   │
│  ┌──────────────────┐  ┌──────────────────────┐  │
│  │  Linear Client    │  │  Webhook Handler     │  │
│  │  (GraphQL/OAuth)  │  │                      │  │
│  │                   │  │  - AgentSession      │  │
│  │  - Update state   │  │    created/updated   │  │
│  │  - Create issues  │  │  - Permission        │  │
│  │  - Manage labels  │  │    changes           │  │
│  │  - Agent Activity │  │                      │  │
│  └────────┬──────────┘  └──────────┬───────────┘  │
│           │                        │              │
│           └────────────┬───────────┘              │
│                        │                          │
│                  Orchestrator                      │
└──────────────────────────────────────────────────┘
```

## Issue Discovery

Feliz does **not** poll for issues. Work enters Feliz through two mechanisms, both delivered via webhooks:

1. **Assignment (primary)** — a user assigns an issue to Feliz. This is the simplest workflow — no comment needed. Just assign and Feliz starts working.
2. **Mention** — a user @-mentions `@Feliz` in an issue comment. Useful for commands (`@Feliz decompose`), providing guidance, or assigning with context.

Both trigger an `AgentSessionEvent` webhook with a `created` action, containing the `agentSession` object with the relevant issue, comment, and context.

**How an issue enters Feliz**:

1. A user creates or opens a Linear issue.
2. The user assigns the issue to Feliz (simplest), or @-mentions `@Feliz` in a comment.
3. Linear creates an Agent Session and fires a webhook to Feliz.
4. Feliz creates a WorkItem record, emits a `thought` activity within 10 seconds to acknowledge, and begins processing.

Issues that are never assigned/mentioned to Feliz are invisible to it. The user controls exactly which issues Feliz works on.

**Delegate vs Assignee**: Assigning an issue to Feliz sets it as the `delegate`, not the `assignee` — the human maintains ownership while Feliz acts on their behalf. This is Linear's native model for agent collaboration.

**Milestone support**: Users can optionally organize issues under Linear milestones. Feliz respects milestone grouping when decomposing large features — sub-issues are created under the same milestone as the parent.

## Agent Sessions

The [Agent Session](https://linear.app/developers/agent-interaction#agent-session) is the core interaction model. Linear automatically manages session lifecycle:

- A session is **created** when Feliz is mentioned or delegated an issue.
- Session state is **visible to users** and updated automatically based on Feliz's emitted activities.
- The session provides `promptContext` — a pre-formatted string containing issue details, comments, and guidance.

### Receiving webhooks

Feliz subscribes to **Agent session events**. The primary entry point:

```typescript
// Webhook handler for AgentSessionEvent
async function handleAgentSessionEvent(event: AgentSessionEvent) {
  const { action, agentSession } = event;

  if (action === 'created') {
    // New session — Feliz was mentioned or delegated an issue
    // Must emit a thought within 10 seconds to acknowledge
    await emitThought(agentSession.id, 'Looking into this...');

    const workItem = await findOrCreateWorkItem(agentSession);
    const context = agentSession.promptContext; // pre-formatted issue context
    await processWorkItem(workItem, agentSession, context);
  }

  if (action === 'updated') {
    // Session updated — e.g., user replied with more context
    const workItem = await findWorkItem(agentSession);
    await handleSessionUpdate(workItem, agentSession);
  }
}
```

### Agent Activities

Feliz communicates status back to Linear through **Agent Activities** rather than plain comments. Activities provide structured status visible in the session UI:

| Activity type | When Feliz emits it |
|---|---|
| `thought` | Acknowledging a mention/delegation (within 10s). Intermediate status updates. |
| `comment` | Posting detailed results, spec drafts, decomposition proposals, questions for the user. |

```typescript
// Acknowledge receipt
await linearClient.agentActivity.create({
  sessionId: session.id,
  type: 'thought',
  content: 'Looking into this...',
});

// Post detailed result
await linearClient.agentActivity.create({
  sessionId: session.id,
  type: 'comment',
  content: 'PR created: [link]. Summary of changes...',
});
```

### Commands

Commands are parsed from the mention text or follow-up comments in the session:

| Command | Effect |
|---|---|
| (assign to Feliz) | Assign issue to Feliz. Creates WorkItem, starts processing. No comment needed. |
| `@Feliz decompose` | Break down a large feature into sub-issues |
| `@Feliz start` | Dispatch agent immediately (skip spec phase if enabled) |
| `@Feliz plan` | Enter spec drafting phase (only when `specs.enabled`; ignored otherwise) |
| `@Feliz retry` | Re-queue with incremented attempt |
| `@Feliz status` | Reply with current orchestration state, last run info |
| `@Feliz approve` | Approve spec/decomposition, transition to next state |
| `@Feliz cancel` | Cancel running agent, release work item |
| (free text after initial mention) | Treated as clarification/feedback; appended to context |

### Acknowledgment protocol

On **every** Feliz-related event (new session, session update), Feliz:

1. Emits a `thought` activity within 10 seconds to acknowledge receipt
2. Begins processing
3. Emits further activities as status changes (started, completed, failed, needs input)

This gives the user immediate visual feedback that Feliz received their message. Session state is automatically updated by Linear based on emitted activities.

## Writing back to Linear

### Status activities

| Event | Activity |
|---|---|
| Issue assigned/delegated to Feliz | `thought`: "Looking into this..." |
| Spec drafted | `comment`: Spec summary + "Reply `@Feliz approve` to proceed" |
| Decomposition proposed | `comment`: Breakdown summary + "Reply `@Feliz approve` to create issues" |
| Agent run started | `thought`: "Started working on this (attempt N)" |
| Agent run succeeded | `comment`: PR link + summary of changes |
| Agent run failed | `comment`: Failure summary + "Reply `@Feliz retry` to retry" |
| Agent needs help | `comment`: Description of problem + question for user |

### State transitions (via GraphQL)

| Feliz event | Default Linear state change |
|---|---|
| Issue assigned to Feliz | → "In Progress" |
| Run succeeded + PR created | → "In Review" |
| Run failed | → (no change, activity only) |

State transitions are configurable per-workflow in `.feliz/config.yml`.

## GraphQL Mutations

The Linear GraphQL API is used for mutations:

- `issueUpdate` — update issue state, add labels
- `issueCreate` — create sub-issues from decomposition
- `agentActivity.create` — emit thoughts and comments in agent sessions

All mutations pass dynamic values via GraphQL `variables` rather than string interpolation.

### Scenario: Comment Body With Special Characters

- **Given** a comment body containing quotes and newlines
- **When** Feliz emits an agent activity
- **Then** the raw body is passed through GraphQL variables without manual escaping logic in the query string

## Future: GitHub Issues as alternative

Linear's Agent API is the primary interface. A future phase could add GitHub Issues support using a similar webhook-based model with GitHub's bot/app APIs, reusing the same orchestration layer with a different event adapter.
