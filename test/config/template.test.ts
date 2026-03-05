import { describe, expect, test } from "bun:test";
import { renderTemplate } from "../../src/config/template.ts";

describe("renderTemplate", () => {
  test("replaces simple variable", () => {
    const result = renderTemplate("Hello {{ name }}", { name: "world" });
    expect(result).toBe("Hello world");
  });

  test("replaces dotted variable", () => {
    const result = renderTemplate("{{ project.name }}", {
      project: { name: "backend" },
    });
    expect(result).toBe("backend");
  });

  test("replaces multiple variables", () => {
    const result = renderTemplate(
      "{{ issue.identifier }}: {{ issue.title }}",
      { issue: { identifier: "BAC-123", title: "Add login" } }
    );
    expect(result).toBe("BAC-123: Add login");
  });

  test("handles if/endif block (truthy)", () => {
    const result = renderTemplate(
      "start{% if specs %}\nSpecs: {{ specs }}{% endif %}\nend",
      { specs: "login spec" }
    );
    expect(result).toBe("start\nSpecs: login spec\nend");
  });

  test("handles if/endif block (falsy)", () => {
    const result = renderTemplate(
      "start{% if specs %}\nSpecs: {{ specs }}{% endif %}\nend",
      { specs: null }
    );
    expect(result).toBe("start\nend");
  });

  test("handles nested object access", () => {
    const result = renderTemplate("{{ context.memory }}", {
      context: { memory: "conventions" },
    });
    expect(result).toBe("conventions");
  });

  test("returns empty string for missing variable", () => {
    const result = renderTemplate("Hello {{ missing }}", {});
    expect(result).toBe("Hello ");
  });

  test("handles complex template", () => {
    const template = `# System Prompt

You are working on {{ project.name }}.

## Issue

**{{ issue.identifier }}**: {{ issue.title }}

{{ issue.description }}

{% if attempt %}
## Previous Attempt

This is attempt {{ attempt }}.
{% endif %}

## Instructions

- Follow conventions`;

    const result = renderTemplate(template, {
      project: { name: "backend-api" },
      issue: {
        identifier: "BAC-123",
        title: "Add login",
        description: "Implement login flow",
      },
      attempt: null,
    });

    expect(result).toContain("You are working on backend-api.");
    expect(result).toContain("**BAC-123**: Add login");
    expect(result).toContain("Implement login flow");
    expect(result).not.toContain("Previous Attempt");
    expect(result).toContain("Follow conventions");
  });
});
