import type { AgentAdapter, AgentRunParams, AgentRunResult } from "./adapter.ts";
import { wrapForNonRoot } from "./run-as-user.ts";

export class ClaudeCodeAdapter implements AgentAdapter {
  name = "claude-code";
  private runningProcesses = new Map<string, { kill: () => void }>();

  async isAvailable(): Promise<boolean> {
    const version = Bun.spawnSync(wrapForNonRoot(["claude", "--version"]));
    if (version.exitCode !== 0) return false;

    if (process.env.ANTHROPIC_API_KEY) return true;

    const auth = Bun.spawnSync(wrapForNonRoot(["claude", "auth", "status"]), {
      env: { ...process.env, CLAUDECODE: "" },
    });
    if (auth.exitCode !== 0) return false;

    try {
      const status = JSON.parse(auth.stdout.toString());
      return status.loggedIn === true;
    } catch {
      return false;
    }
  }

  buildArgs(params: AgentRunParams): string[] {
    return [
      "--dangerously-skip-permissions",
      "--output-format",
      "json",
      "--max-turns",
      String(params.maxTurns),
      "--print",
      "-p",
      params.prompt,
    ];
  }

  parseOutput(
    exitCode: number,
    stdout: string,
    stderr: string
  ): AgentRunResult {
    if (exitCode !== 0) {
      return {
        status: "failed",
        exitCode,
        stdout,
        stderr,
        filesChanged: [],
      };
    }

    let tokenUsage: { input: number; output: number } | undefined;
    let summary: string | undefined;

    try {
      const json = JSON.parse(stdout);
      summary = json.result || undefined;
    } catch {
      // stdout may not be valid JSON
    }

    return {
      status: "succeeded",
      exitCode,
      stdout,
      stderr,
      tokenUsage,
      filesChanged: [],
      summary,
    };
  }

  async execute(params: AgentRunParams): Promise<AgentRunResult> {
    const args = this.buildArgs(params);

    const cmd = wrapForNonRoot(["claude", ...args]);

    const proc = Bun.spawn(cmd, {
      cwd: params.workDir,
      env: { ...process.env, ...params.env },
      stdout: "pipe",
      stderr: "pipe",
    });

    this.runningProcesses.set(params.runId, {
      kill: () => proc.kill(),
    });

    const timeoutId = setTimeout(() => {
      proc.kill();
    }, params.timeout_ms);

    try {
      const exitCode = await proc.exited;
      clearTimeout(timeoutId);

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      this.runningProcesses.delete(params.runId);

      // Detect if it was killed by timeout
      if (exitCode === 137 || exitCode === null) {
        return {
          status: "timed_out",
          exitCode: exitCode ?? -1,
          stdout,
          stderr,
          filesChanged: [],
        };
      }

      // Get changed files from git diff
      const diffResult = Bun.spawnSync(
        ["git", "diff", "--name-only", "HEAD"],
        { cwd: params.workDir }
      );
      const filesChanged = diffResult.stdout
        .toString()
        .trim()
        .split("\n")
        .filter(Boolean);

      const result = this.parseOutput(exitCode, stdout, stderr);
      result.filesChanged = filesChanged;
      return result;
    } catch {
      clearTimeout(timeoutId);
      this.runningProcesses.delete(params.runId);
      return {
        status: "failed",
        exitCode: -1,
        stdout: "",
        stderr: "Agent process error",
        filesChanged: [],
      };
    }
  }

  async cancel(runId: string): Promise<void> {
    const proc = this.runningProcesses.get(runId);
    if (proc) {
      proc.kill();
      this.runningProcesses.delete(runId);
    }
  }
}
