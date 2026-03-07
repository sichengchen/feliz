import type { AgentAdapter, AgentRunParams, AgentRunResult } from "./adapter.ts";
import { wrapForNonRoot } from "./run-as-user.ts";

export class CodexAdapter implements AgentAdapter {
  name = "codex";
  private runningProcesses = new Map<string, { kill: () => void }>();

  async isAvailable(): Promise<boolean> {
    const version = Bun.spawnSync(wrapForNonRoot(["codex", "--version"]));
    if (version.exitCode !== 0) return false;

    if (process.env.OPENAI_API_KEY) return true;

    const auth = Bun.spawnSync(wrapForNonRoot(["codex", "login", "status"]));
    return auth.exitCode === 0;
  }

  buildArgs(params: AgentRunParams): string[] {
    const sandbox = params.approvalPolicy === "gated"
      ? "read-only"
      : params.approvalPolicy === "suggest"
        ? "workspace-write"
        : "danger-full-access";

    return [
      "exec",
      "--json",
      "-s",
      sandbox,
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

    let summary: string | undefined;

    if (stdout.trim()) {
      const lines = stdout.trim().split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const event = JSON.parse(lines[i]!);
          if (event.type === "message" && event.content) {
            summary = event.content;
            break;
          }
        } catch {
          // skip non-JSON lines
        }
      }
    }

    return {
      status: "succeeded",
      exitCode,
      stdout,
      stderr,
      filesChanged: [],
      summary,
    };
  }

  async execute(params: AgentRunParams): Promise<AgentRunResult> {
    const args = this.buildArgs(params);

    const cmd = wrapForNonRoot(["codex", ...args]);

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

      if (exitCode === 137 || exitCode === null) {
        return {
          status: "timed_out",
          exitCode: exitCode ?? -1,
          stdout,
          stderr,
          filesChanged: [],
        };
      }

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
