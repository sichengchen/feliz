# Skills

Feliz setup skills are split by scope.

## `feliz-machine-setup`

File: `skills/feliz-machine-setup/SKILL.md`

Use for:

- host/container bootstrap
- central `feliz.yml` setup
- daemon lifecycle checks (`start`, `status`, `stop`)
- E2E preflight setup (`e2e doctor`, smoke env preparation)

## `feliz-project-onboarding`

File: `skills/feliz-project-onboarding/SKILL.md`

Use for:

- adding project mappings to central config
- generating or updating repo-level `.feliz/config.yml`
- generating or updating `.feliz/pipeline.yml`
- creating/updating `WORKFLOW.md`

## `feliz-setup` (router)

File: `skills/feliz-setup/SKILL.md`

Use when request scope is mixed/unclear and routing is needed.

## Recommendation

Run machine setup first, then onboarding:

1. `feliz-machine-setup`
2. `feliz-project-onboarding`
