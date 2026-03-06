# Agents

## Project

Feliz is a self-hosted cloud agents platform. It orchestrates coding agents to turn Linear issues into merged pull requests — autonomously.

Runtime: Bun (TypeScript). Specs live in `specs/` with `specs/index.md` as the master index.

## Commit frequently

Commit on milestones — after each meaningful step (e.g., tests green, feature wired in, docs updated). Commit at least once for each small task. Do not batch unrelated changes into a single large commit.

## Commit messages

Use conventional commits:

```
type(scope): description
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`

Scope is the module or area (e.g., `poller`, `orchestrator`, `agents`, `context`, `linear`, `cli`, `pipeline`, `workspace`, `specs`).

Examples:
- `feat(poller): add Linear GraphQL polling loop`
- `fix(orchestrator): handle retry backoff overflow`
- `test(agents): add Claude Code adapter unit tests`
- `refactor(context): extract snapshot builder`

## Specs

All implementation must follow the specifications in `specs/`. Read the relevant spec before writing code.

- `specs/architecture/index.md` — domain model and data types
- `specs/configuration/index.md` — config schemas and pipeline definition
- `specs/linear/index.md` — Linear integration (GraphQL + Chat SDK)
- `specs/context/index.md` — context management layers
- `specs/orchestration/index.md` — state machine and concurrency
- `specs/agents/index.md` — agent adapter interface and pipeline execution

If the spec is ambiguous or incomplete, ask before guessing.

## Testing

Use red-green testing (TDD):

1. **Red** — Write a failing test first that describes the expected behavior.
2. **Green** — Write the minimum code to make the test pass.
3. **Refactor** — Clean up while keeping tests green.

Do not write implementation code without a corresponding test. Do not skip the failing test step.

Test runner: `bun test`

## Build & lint

```
bun install        # install dependencies
bun test           # run tests
bun run lint       # lint
bun run build      # build
```
