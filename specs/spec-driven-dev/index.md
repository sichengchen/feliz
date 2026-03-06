# Spec-Driven Development

## What specs are

Specs are **system design documents with behavioral cases**. They describe both the architecture/design of a feature and its expected behaviors through structured scenarios.

A spec is not just BDD scenarios. It covers:
- **System design**: data models, APIs, component interactions, invariants
- **Behavioral cases**: Given/When/Then scenarios that define expected outcomes

This mirrors how a team would design a feature: first understand the shape of the system, then enumerate the behaviors it must exhibit.

## Spec Structure

When `specs.enabled: true`, specs are stored in the repo under `{specs.directory}/` (default: `specs/`).

```
specs/
  index.md              # Master index linking to all specs
  auth/
    index.md            # Auth module: design + behavioral cases
    login.md            # Login: design + behavioral cases
    registration.md     # Registration: design + behavioral cases
  payments/
    index.md
    checkout.md
```

Each spec file follows a structured format covering system design and behavioral cases:

```markdown
# Login

## Overview

The login system authenticates users via email/password or OAuth providers.
Sessions are JWT-based with a 24-hour expiry. Failed attempts are rate-limited
per IP address (5 attempts per 15 minutes).

## Design

### Data Model

- `users` table: id, email, password_hash, created_at
- `sessions` table: id, user_id, token, expires_at
- `oauth_accounts` table: id, user_id, provider, provider_id

### API

- `POST /auth/login` — email/password login
- `POST /auth/oauth/callback` — OAuth callback
- `POST /auth/logout` — invalidate session

## Behavioral Cases

### Successful email login
- **Given** a registered user with email "user@example.com"
- **When** they submit valid credentials
- **Then** they receive a session token
- **And** the token expires in 24 hours

### Failed login - invalid password
- **Given** a registered user with email "user@example.com"
- **When** they submit an incorrect password
- **Then** they receive a 401 error
- **And** the failed attempt is logged

### OAuth login - new user
- **Given** a user authenticating via Google OAuth for the first time
- **When** the OAuth callback succeeds
- **Then** a new user account is created
- **And** they receive a session token

### Rate limiting
- **Given** 5 failed login attempts from the same IP in 15 minutes
- **When** a 6th attempt is made
- **Then** the request is rejected with 429
- **And** the lockout period is logged
```

## Spec Lifecycle

```
User mentions @Feliz on a Linear issue
    |
    v
Feliz reacts with 👀, creates WorkItem
    |
    v
Feliz reads issue description
    |
    v
Feliz drafts spec (system design + behavioral cases)
    |
    v
Feliz commits spec to branch, posts summary to Linear
    |
    v
Human reviews, comments with feedback
    |
    v
Feliz reacts with 👀, revises spec based on feedback
    |
    v
Human approves (@Feliz approve)
    |
    v
Spec is committed to worktree, agent uses it as primary context
    |
    v
Agent implements against spec (design informs structure, cases inform tests)
    |
    v
Agent runs tests, commits, pushes, creates PR
```

## Spec as Context

When specs are enabled, the agent's context includes:
- The specific spec file(s) relevant to the current issue
- The spec index for broader project understanding
- System design sections inform implementation architecture
- Behavioral cases serve as acceptance criteria and test targets

The agent is instructed to implement the system described in the design section and write tests that validate the behavioral cases.

## Feature Decomposition

When a user wants to add many features at once, they create a single high-level Linear issue and mention `@Feliz decompose`. Feliz can also detect large features automatically based on heuristics.

**Detection heuristics** (any of):
- User explicitly requests decomposition via `@Feliz decompose`
- Issue has an `epic` label
- Issue description exceeds a complexity threshold (multiple distinct features described)

**Decomposition flow**:

When `specs.enabled: true`:

```
User creates Linear issue and mentions @Feliz decompose
    |
    v
Feliz reacts with 👀, detects large feature -> enters 'decomposing'
    |
    v
Feliz drafts a project-level spec from the issue description
  (system design + behavioral cases for all sub-features)
    |
    v
From the spec, Feliz proposes a breakdown:
  - Individual sub-issues (one per component/behavior group)
  - Dependency graph between sub-issues
  - Suggested implementation order
    |
    v
Feliz posts the breakdown to the parent Linear issue as a comment
    |
    v
Human reviews, adjusts, approves (@Feliz approve)
    |
    v
Feliz creates sub-issues in Linear with:
  - Titles and descriptions derived from the spec
  - Blocker/dependency relationships set in Linear
  - Labels inherited from parent + 'feliz:sub-issue'
  - Link back to parent issue
    |
    v
Feliz commits the project-level spec to the repo
    |
    v
Sub-issues are auto-mentioned by Feliz -> enter spec_drafting -> spec_review -> queued -> running -> completed
    |
    v
Parent issue auto-completes when all sub-issues are completed
```

**Milestone support**: If the parent issue belongs to a Linear milestone, all created sub-issues are added to the same milestone.

When `specs.enabled: false`:

```
User creates Linear issue and mentions @Feliz decompose
    |
    v
Feliz reacts with 👀, detects large feature -> enters 'decomposing'
    |
    v
Feliz analyzes the description and proposes a breakdown:
  - Individual sub-issues with titles and descriptions
  - Dependency graph between sub-issues
  - (No spec artifacts created)
    |
    v
Feliz posts the breakdown to the parent Linear issue as a comment
    |
    v
Human reviews, adjusts, approves (@Feliz approve)
    |
    v
Feliz creates sub-issues in Linear with blocker relationships
    |
    v
Sub-issues enter queued -> running -> completed (no spec phases)
    |
    v
Parent issue auto-completes when all sub-issues are completed
```

**Spec-to-issue mapping** (only when `specs.enabled`): Each sub-issue references specific spec files/sections. When Feliz works on a sub-issue, the relevant spec sections are included in context. The spec index (`specs/index.md`) is updated to reflect the full feature structure.

**Dependency enforcement**: Sub-issues with blockers in non-terminal states remain in `queued` but are not dispatched. They become eligible for dispatch only when all blockers reach terminal states (detected during the poll cycle).
