# Code Review

Review the changes made for this issue.

## Issue

**{{ issue.identifier }}**: {{ issue.title }}

{{ issue.description }}

## Context

Run `feliz context read` to see history and prior step outputs.

## Instructions

- Check that tests cover the new behavior
- Verify the implementation matches the spec
- Look for bugs, edge cases, and security issues
- Check code style: simple, explicit, no unnecessary abstractions
- If everything looks good, respond with "approved"
- If there are issues, run `feliz context write` with your findings for the fix step
