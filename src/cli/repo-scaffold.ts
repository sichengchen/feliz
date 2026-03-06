import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import {
  generateRepoConfig,
  generatePipelineYml,
  generateWorkflowMd,
  type RepoScaffoldAnswers,
} from "../config/writer.ts";

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

export function gitCommitAndPush(repoPath: string, branch: string): void {
  Bun.spawnSync(["git", "add", ".feliz/", "WORKFLOW.md"], { cwd: repoPath });
  const commit = Bun.spawnSync(
    ["git", "commit", "-m", "chore: add feliz configuration"],
    { cwd: repoPath }
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
