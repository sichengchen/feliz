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

{% if cycle %}
## Review Cycle {{ cycle }}

Previous review feedback:
{{ previous_review }}
{% endif %}

## Instructions

- Follow the coding conventions in this repository
- Write tests for new functionality
- Do not modify unrelated code
