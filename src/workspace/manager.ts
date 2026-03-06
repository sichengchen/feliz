import { join } from "path";

export function sanitizeIdentifier(id: string): string {
  return id.replace(/[^A-Za-z0-9._-]/g, "_");
}

export class WorkspaceManager {
  private root: string;

  constructor(workspaceRoot: string) {
    this.root = workspaceRoot;
  }

  getRepoPath(projectName: string): string {
    return join(this.root, projectName, "repo");
  }

  getWorktreePath(projectName: string, identifier: string): string {
    return join(
      this.root,
      projectName,
      "worktrees",
      sanitizeIdentifier(identifier)
    );
  }

  getBranchName(identifier: string): string {
    return `feliz/${identifier}`;
  }

  async cloneRepo(projectName: string, repoUrl: string): Promise<string> {
    const repoPath = this.getRepoPath(projectName);
    const result = Bun.spawnSync(["git", "clone", repoUrl, repoPath]);
    if (result.exitCode !== 0) {
      throw new Error(
        `Failed to clone repo: ${result.stderr.toString()}`
      );
    }
    return repoPath;
  }

  async createWorktree(
    projectName: string,
    identifier: string,
    baseBranch: string
  ): Promise<string> {
    const repoPath = this.getRepoPath(projectName);
    const wtPath = this.getWorktreePath(projectName, identifier);
    const branchName = this.getBranchName(identifier);

    const result = Bun.spawnSync(
      ["git", "worktree", "add", wtPath, "-b", branchName, baseBranch],
      { cwd: repoPath }
    );
    if (result.exitCode !== 0) {
      throw new Error(
        `Failed to create worktree: ${result.stderr.toString()}`
      );
    }
    return wtPath;
  }

  async removeWorktree(
    projectName: string,
    identifier: string
  ): Promise<void> {
    const repoPath = this.getRepoPath(projectName);
    const wtPath = this.getWorktreePath(projectName, identifier);

    Bun.spawnSync(["git", "worktree", "remove", wtPath, "--force"], {
      cwd: repoPath,
    });
  }

  async runHook(workDir: string, command: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const result = Bun.spawnSync(["sh", "-c", command], { cwd: workDir });
    return {
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    };
  }
}
