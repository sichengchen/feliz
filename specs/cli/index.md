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

feliz agent list               # List installed agents and auth status
feliz agent login <name>       # Authenticate an agent (OAuth or API key)
feliz agent install <name>     # Install an agent CLI

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
