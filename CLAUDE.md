# Claude Code Instructions

## Project

Feliz is a self-hosted cloud agents platform that turns Linear issues into merged pull requests by orchestrating coding agents (Claude Code, Codex, etc.) through configurable multi-step pipelines.

- Runtime: Bun (TypeScript)
- Test runner: `bun test`
- Linter: `bun run lint`
- Build: `bun run build`

## Rules

### Follow the specs

Specifications live in `specs/` — read `specs/index.md` for the full index. Always read the relevant spec before implementing a feature. The specs define the domain model, data types, state machines, APIs, and behavior. Do not deviate without explicit approval.

### Red-green testing

Always use TDD:

1. Write a failing test that describes the expected behavior.
2. Write the minimum implementation to make it pass.
3. Refactor with tests still green.

Never write code without a test. Never skip the red step.

### Commit frequently

Commit on milestones — after each meaningful step (e.g., tests green, feature wired in, docs updated). Commit at least once for each small task. Do not batch unrelated changes into a single large commit.

### Commit messages

Use conventional commits: `type(scope): description`

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`

Scopes: `poller`, `orchestrator`, `agents`, `context`, `linear`, `cli`, `pipeline`, `workspace`, `publishing`, `specs`

### Code style

- Keep it simple. No premature abstractions.
- Prefer explicit over clever.
- No unnecessary comments — code should be self-explanatory.
- Only add error handling at system boundaries (user input, external APIs, agent subprocess).
