# Fix Review Issues

Address the review feedback for this issue.

## Issue

**{{ issue.identifier }}**: {{ issue.title }}

{% if previous_review %}
## Review Feedback

{{ previous_review }}
{% endif %}

## Instructions

- Fix each issue raised in the review
- Run `bun test` to verify nothing is broken
- Commit fixes with conventional commit messages
