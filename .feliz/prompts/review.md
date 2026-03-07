# Code Review

Review the changes made for this issue.

## Issue

**{{ issue.identifier }}**: {{ issue.title }}

{{ issue.description }}

{% if specs %}
## Specifications

{{ specs }}
{% endif %}

{% if cycle %}
## Review Cycle {{ cycle }}

Previous review feedback:
{{ previous_review }}
{% endif %}

## Instructions

- Check that tests cover the new behavior
- Verify the implementation matches the spec
- Look for bugs, edge cases, and security issues
- Check code style: simple, explicit, no unnecessary abstractions
- If everything looks good, respond with "approved"
- If there are issues, list them clearly for the next fix step
