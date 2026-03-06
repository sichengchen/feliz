# Skills

Feliz setup is split into two separate workflows because machine bootstrap and project onboarding are different tasks.

## Setup skills

### `feliz-machine-setup`

File: `skills/feliz-machine-setup/SKILL.md`

Use for:
- Host/container bootstrap
- Central `feliz.yml` setup and validation
- Daemon lifecycle (`start`, `status`, `stop`)

Do not use for:
- Writing repo `.feliz/config.yml` or `.feliz/pipeline.yml`
- Writing `WORKFLOW.md` in a managed project repo

### `feliz-project-onboarding`

File: `skills/feliz-project-onboarding/SKILL.md`

Use for:
- Adding/updating a project mapping in central config
- Writing repo config in the managed workspace repo:
  - `<workspace_root>/<project>/repo/.feliz/config.yml`
  - `<workspace_root>/<project>/repo/.feliz/pipeline.yml`
  - `<workspace_root>/<project>/repo/WORKFLOW.md`

Default workspace roots:
- Docker: `/data/feliz/workspaces`
- Local: `~/.feliz/workspaces`

### `feliz-setup` (router)

File: `skills/feliz-setup/SKILL.md`

Use when request scope is unclear. It routes to one of the two setup skills above.

## Interview requirement

Both setup skills require `/interview` before any config write, so generated configuration matches user preferences and deployment mode.
