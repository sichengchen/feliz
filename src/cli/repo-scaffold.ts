import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import {
  generateRepoConfig,
  generatePipelineYml,
  generateWorkflowMd,
  type RepoScaffoldAnswers,
} from "../config/writer.ts";
import { loadPipelineConfig, loadRepoConfig } from "../config/loader.ts";
import { newId } from "../id.ts";
import type { AgentAdapter } from "../agents/adapter.ts";

export function repoHasFelizConfig(repoPath: string): boolean {
  return existsSync(join(repoPath, ".feliz", "config.yml"));
}

export function writeRepoScaffold(
  repoPath: string,
  answers: RepoScaffoldAnswers
): void {
  const felizDir = join(repoPath, ".feliz");
  mkdirSync(join(felizDir, "prompts"), { recursive: true });

  writeFileSync(
    join(felizDir, "config.yml"),
    generateRepoConfig(answers),
    "utf-8"
  );
  writeFileSync(
    join(felizDir, "pipeline.yml"),
    generatePipelineYml(answers.testCommand),
    "utf-8"
  );
  writeFileSync(join(repoPath, "WORKFLOW.md"), generateWorkflowMd(), "utf-8");
}

export interface AgentScaffoldResult {
  success: boolean;
  reason?: string;
}

function buildAgentScaffoldPrompt(answers: RepoScaffoldAnswers): string {
  const sections: string[] = [];
  sections.push(`Create Feliz starter config files for this repository.

You must create these paths:
- .feliz/config.yml
- .feliz/pipeline.yml
- .feliz/prompts/ (directory)
- WORKFLOW.md`);

  sections.push(`Requirements:
- .feliz/config.yml must set agent.adapter to "${answers.agentAdapter}".
- .feliz/config.yml must set specs.enabled to ${answers.specsEnabled ? "true" : "false"}.
- If specs.enabled is true, set specs.directory to "specs".`);

  if (answers.testCommand || answers.lintCommand) {
    const gateLines: string[] = [];
    if (answers.testCommand) gateLines.push(`- Set gates.test_command to "${answers.testCommand}".`);
    if (answers.lintCommand) gateLines.push(`- Set gates.lint_command to "${answers.lintCommand}".`);
    sections.push(`Gate settings:\n${gateLines.join("\n")}`);
  }

  sections.push(`.feliz/pipeline.yml must define the default pipeline:
- single phase named "execute"
- step "run" with prompt WORKFLOW.md
- include success.command only when a test command is provided
- step "create_pr" with prompt .feliz/prompts/publish.md

WORKFLOW.md should contain the standard Feliz starter prompt template using variables like {{ project.name }} and {{ issue.identifier }}.

Only modify the listed scaffold files/directories.`);

  return sections.join("\n\n");
}

function validateAgentScaffold(repoPath: string): void {
  const configPath = join(repoPath, ".feliz", "config.yml");
  const pipelinePath = join(repoPath, ".feliz", "pipeline.yml");
  const promptsDir = join(repoPath, ".feliz", "prompts");
  const workflowPath = join(repoPath, "WORKFLOW.md");

  if (!existsSync(configPath)) {
    throw new Error("missing .feliz/config.yml");
  }
  if (!existsSync(pipelinePath)) {
    throw new Error("missing .feliz/pipeline.yml");
  }
  if (!existsSync(promptsDir)) {
    throw new Error("missing .feliz/prompts/");
  }
  if (!existsSync(workflowPath)) {
    throw new Error("missing WORKFLOW.md");
  }

  loadRepoConfig(readFileSync(configPath, "utf-8"));
  loadPipelineConfig(readFileSync(pipelinePath, "utf-8"));
}

export async function writeRepoScaffoldWithAgent(
  repoPath: string,
  adapter: AgentAdapter,
  adapterName: string,
  answers: RepoScaffoldAnswers
): Promise<AgentScaffoldResult> {
  const available = await adapter.isAvailable();
  if (!available) {
    return { success: false, reason: `adapter "${adapterName}" is not available` };
  }

  const prompt = buildAgentScaffoldPrompt(answers);
  const result = await adapter.execute({
    runId: newId(),
    workDir: repoPath,
    prompt,
    timeout_ms: 600000,
    maxTurns: 20,
    approvalPolicy: "auto",
    env: {},
  });

  if (result.status !== "succeeded") {
    return {
      success: false,
      reason: `agent scaffold failed (${result.status})`,
    };
  }

  try {
    validateAgentScaffold(repoPath);
  } catch (e: any) {
    return {
      success: false,
      reason: `invalid generated scaffold: ${e.message}`,
    };
  }

  return { success: true };
}

export function gitCommitAndPush(repoPath: string, branch: string): void {
  const gitEnv = {
    GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME || "Feliz Bot",
    GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL || "feliz@localhost",
    GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME || process.env.GIT_AUTHOR_NAME || "Feliz Bot",
    GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL || process.env.GIT_AUTHOR_EMAIL || "feliz@localhost",
  };
  Bun.spawnSync(["git", "add", ".feliz/", "WORKFLOW.md"], { cwd: repoPath });
  const commit = Bun.spawnSync(
    ["git", "commit", "-m", "chore: add feliz configuration"],
    { cwd: repoPath, env: { ...process.env, ...gitEnv } }
  );
  if (commit.exitCode !== 0) {
    throw new Error(
      `Failed to commit: ${commit.stderr.toString()}`
    );
  }
  const push = Bun.spawnSync(["git", "push", "origin", branch], {
    cwd: repoPath,
  });
  if (push.exitCode !== 0) {
    throw new Error(
      `Failed to push: ${push.stderr.toString()}`
    );
  }
}
