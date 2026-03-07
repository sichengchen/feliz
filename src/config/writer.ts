import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import { stringify } from "yaml";
import { getDefaultPipeline } from "./loader.ts";

export const CONFIG_TEMPLATE = `# Feliz configuration
# Docs: https://github.com/anthropics/feliz

linear:
  oauth_token: $LINEAR_OAUTH_TOKEN  # Set this environment variable

webhook:
  port: 3421

storage:
  data_dir: /data/feliz
  workspace_root: /data/feliz/workspaces

agent:
  default: claude-code

projects: []
`;

export interface InitAnswers {
  oauthToken: string;
}

export function generateConfig(answers: InitAnswers): string {
  return `# Feliz configuration
# Docs: https://github.com/anthropics/feliz

linear:
  oauth_token: ${answers.oauthToken}

webhook:
  port: 3421

storage:
  data_dir: /data/feliz
  workspace_root: /data/feliz/workspaces

agent:
  default: claude-code

projects: []
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

export function generatePipelineYml(agentAdapter: string = "claude-code", testCommand?: string): string {
  return stringify(getDefaultPipeline(agentAdapter, testCommand));
}

export function generateWorkflowMd(): string {
  return `# System Prompt

You are working on {{ project.name }}.

## Issue

**{{ issue.identifier }}**: {{ issue.title }}

{{ issue.description }}

## Context

Run \`feliz context read\` to see history and prior step outputs.
Run \`feliz context write <message>\` to leave findings for the next step.
Project memory is in \`.feliz/context/memory/\` — read and write files there directly.
Specs are in \`specs/\`.

## Instructions

- Follow the coding conventions in this repository
- Write tests for new functionality
- Do not modify unrelated code
`;
}
