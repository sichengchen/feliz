# CLI

The CLI is for managing Feliz, not for interacting with issues (that's Linear's job).

```
feliz start                    # Start the Feliz daemon
feliz init                     # Interactive setup wizard
feliz stop                     # Stop the daemon
feliz status                   # Show daemon status, running agents, queue

feliz project add              # Interactive: add a new project mapping
feliz project list             # List configured projects
feliz project remove <name>    # Remove a project

feliz run list                 # List recent runs across all projects
feliz run show <run_id>        # Show run details, artifacts, logs
feliz run retry <work_item>    # Manually retry a failed work item

feliz context show <work_item> # Show context snapshot for a work item
feliz context history <project># Show history events for a project

feliz agent list               # List installed agents and availability

feliz config validate          # Validate feliz.yml and all .feliz/ configs
feliz config show              # Print resolved configuration
```

## First-run experience

### Scaffold on `feliz start`

When `feliz start` is run without an existing config file, Feliz scaffolds a template config at the default path (`~/.feliz/feliz.yml`) or the `--config` path, prints instructions, and exits with code 0. The user edits the template and re-runs `feliz start`.

### `feliz init` wizard

An interactive wizard that prompts for:

1. **Linear API key** — if `$LINEAR_API_KEY` is set, offers to use it; otherwise prompts for a literal key
2. **Project name** — human-readable identifier
3. **Git repo URL** — remote URL to clone
4. **Linear project name** — maps to the Linear project

The wizard writes a valid `feliz.yml` using `generateConfig()` from `src/config/writer.ts`. If a config already exists, it prints a message and exits without overwriting.

The generated config round-trips through `loadFelizConfig()` — this is tested and guaranteed.

### `feliz project add` wizard

An interactive wizard that adds a new project mapping to `feliz.yml`. The wizard:

1. **Fetches Linear projects** — calls the Linear API to list all projects, displays a numbered list
2. **Project selection** — user picks a project by number; this sets the `linear_project` field
3. **Git repo URL** — prompts for the remote URL to clone
4. **Base branch** — prompts for the base branch (default: `main`)
5. **Clone** — clones the repo via `WorkspaceManager.cloneRepo()`
6. **Detect `.feliz/`** — checks if `.feliz/config.yml` already exists in the cloned repo
7. **Scaffold** (if missing) — scaffolds `.feliz/` via agent first, with template fallback:
   - Prompts for scaffold adapter (default from `agent.default` in `feliz.yml`)
   - Prompts for specs enabled + optional test/lint commands
   - Invokes the selected agent in the cloned repo to generate:
     - `.feliz/config.yml` — repo settings
     - `.feliz/pipeline.yml` — default pipeline from `getDefaultPipeline()`
     - `.feliz/prompts/` — empty prompts directory
     - `WORKFLOW.md` — default prompt template
   - If adapter is unavailable, agent run fails, or generated files are invalid, wizard falls back to deterministic template scaffold using the same answers
8. **Commit & push** (if scaffolded) — optionally commits and pushes the `.feliz/` config to the repo
9. **Add to `feliz.yml`** — appends the project entry using `addProjectToConfig()`

The project name is derived from the repo URL (e.g., `git@github.com:org/payments-service.git` → `payments-service`).

The wizard uses dependency injection (`WizardDeps` interface) for all external operations, making the full flow testable without network or filesystem access.
