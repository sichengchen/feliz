import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import { stringify } from "yaml";
import { getDefaultPipeline } from "./loader.ts";

export const CONFIG_TEMPLATE = `# Feliz configuration
# Docs: https://github.com/anthropics/feliz

linear:
  api_key: $LINEAR_API_KEY  # Set this environment variable

projects:
  - name: my-project
    repo: git@github.com:org/repo.git
    linear_project: My Project
`;

export interface InitAnswers {
  apiKey: string;
  projectName: string;
  repo: string;
  linearProject: string;
}

export function generateConfig(answers: InitAnswers): string {
  return `# Feliz configuration
# Docs: https://github.com/anthropics/feliz

linear:
  api_key: ${answers.apiKey}

projects:
  - name: ${answers.projectName}
    repo: ${answers.repo}
    linear_project: ${answers.linearProject}
`;
}

export function writeConfigFile(configPath: string, content: string): void {
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, content, "utf-8");
}

export interface RepoScaffoldAnswers {
  agentAdapter: string;
  specsEnabled: boolean;
  specsDirectory?: string;
  testCommand?: string;
  lintCommand?: string;
}

export function generateRepoConfig(answers: RepoScaffoldAnswers): string {
  const doc: Record<string, unknown> = {
    agent: {
      adapter: answers.agentAdapter,
    },
    specs: {
      enabled: answers.specsEnabled,
      ...(answers.specsEnabled && answers.specsDirectory
        ? { directory: answers.specsDirectory }
        : {}),
    },
  };

  if (answers.testCommand || answers.lintCommand) {
    const gates: Record<string, string> = {};
    if (answers.testCommand) gates.test_command = answers.testCommand;
    if (answers.lintCommand) gates.lint_command = answers.lintCommand;
    doc.gates = gates;
  }

  return stringify(doc);
}

export function generatePipelineYml(testCommand?: string): string {
  return stringify(getDefaultPipeline(testCommand));
}

export function generateWorkflowMd(): string {
  return `# System Prompt

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
`;
}
