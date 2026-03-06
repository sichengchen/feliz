# Skills

Claude Code skills for setting up and configuring Feliz.

## `feliz-setup`

Install and configure the Feliz service: prerequisites, credentials, Linear OAuth app setup, central `feliz.yml`, and daemon startup.

File: `skills/feliz-setup/SKILL.md`

## `feliz-add-project`

Add a project to Feliz and configure its workflow: register in `feliz.yml`, clone repo, write `.feliz/config.yml`, `.feliz/pipeline.yml`, prompt templates, and `WORKFLOW.md`.

File: `skills/feliz-add-project/SKILL.md`

## Recommended order

1. `feliz-setup` — install Feliz and get the daemon running
2. `feliz-add-project` — add each project repo with its pipeline and prompts
