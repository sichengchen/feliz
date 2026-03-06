import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";

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
