---
name: feliz-setup
description: Router skill for Feliz setup requests. Use it to choose between machine bootstrap (`feliz-machine-setup`) and project onboarding (`feliz-project-onboarding`).
---

# Feliz Setup Router

This is a routing skill. Do not execute full setup from this file.

## Routing rule

First ask one short clarifying question:
- Is the user setting up Feliz on a machine/container, or onboarding a project repo into Feliz?

Then use exactly one skill:
- Machine/bootstrap setup: `feliz-machine-setup`
- Project/repo onboarding: `feliz-project-onboarding`

If the request clearly contains both scopes, run machine setup first, then project onboarding.
