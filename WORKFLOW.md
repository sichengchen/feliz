# System Prompt

You are working on {{ project.name }}.

## Issue

**{{ issue.identifier }}**: {{ issue.title }}

{{ issue.description }}

{% if specs %}
## Specifications

{{ specs }}
{% endif %}

{% if attempt %}
## Previous Attempt

This is attempt {{ attempt }}. Previous run failed with:
{{ previous_failure }}
{% endif %}

## Instructions

- Read the relevant spec before writing any code
- Follow TDD (red-green-refactor): write a failing test first, then the minimum implementation to pass, then refactor
- Use conventional commits: type(scope): description
- Commit frequently at meaningful milestones
- Keep it simple — no premature abstractions
- Run `bun test` and `bun run lint` before finishing
