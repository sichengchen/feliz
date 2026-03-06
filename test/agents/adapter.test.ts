import { describe, expect, test, mock } from "bun:test";
import type {
  AgentAdapter,
  AgentRunParams,
  AgentRunResult,
} from "../../src/agents/adapter.ts";
import {
  ClaudeCodeAdapter,
} from "../../src/agents/claude-code.ts";

describe("AgentAdapter interface", () => {
  test("adapter has required properties", () => {
    const adapter: AgentAdapter = {
      name: "test-agent",
      isAvailable: async () => true,
      execute: async () => ({
        status: "succeeded",
        exitCode: 0,
        stdout: "done",
        stderr: "",
        filesChanged: [],
      }),
      cancel: async () => {},
    };
    expect(adapter.name).toBe("test-agent");
  });
});

describe("ClaudeCodeAdapter", () => {
  test("has correct name", () => {
    const adapter = new ClaudeCodeAdapter();
    expect(adapter.name).toBe("claude-code");
  });

  test("builds correct command args", () => {
    const adapter = new ClaudeCodeAdapter();
    const args = adapter.buildArgs({
      runId: "run-1",
      workDir: "/tmp/work",
      prompt: "Fix the bug",
      timeout_ms: 600000,
      maxTurns: 20,
      approvalPolicy: "auto",
      env: {},
    });
    expect(args).toContain("--dangerously-skip-permissions");
    expect(args).toContain("--output-format");
    expect(args).toContain("json");
    expect(args).toContain("--max-turns");
    expect(args).toContain("20");
    expect(args).toContain("--print");
    expect(args).toContain("-p");
    expect(args).toContain("Fix the bug");
  });

  test("parseOutput handles JSON result", () => {
    const adapter = new ClaudeCodeAdapter();
    const result = adapter.parseOutput(
      0,
      JSON.stringify({
        result: "done",
        cost_usd: 0.5,
        num_turns: 10,
        is_error: false,
        duration_ms: 30000,
        duration_api_ms: 25000,
        total_cost_usd: 0.5,
        session_id: "sess-1",
      }),
      ""
    );
    expect(result.status).toBe("succeeded");
    expect(result.exitCode).toBe(0);
  });

  test("parseOutput handles non-zero exit code", () => {
    const adapter = new ClaudeCodeAdapter();
    const result = adapter.parseOutput(1, "error output", "stderr");
    expect(result.status).toBe("failed");
    expect(result.exitCode).toBe(1);
  });
});

describe("ClaudeCodeAdapter - parseOutput edge cases", () => {
  test("parseOutput detects timeout via exit code 137", () => {
    const adapter = new ClaudeCodeAdapter();
    const result = adapter.parseOutput(137, "", "killed");
    expect(result.status).toBe("failed");
    expect(result.exitCode).toBe(137);
  });

  test("parseOutput handles non-JSON stdout gracefully", () => {
    const adapter = new ClaudeCodeAdapter();
    const result = adapter.parseOutput(0, "not json", "");
    expect(result.status).toBe("succeeded");
    expect(result.summary).toBeUndefined();
  });

  test("parseOutput extracts summary from JSON result field", () => {
    const adapter = new ClaudeCodeAdapter();
    const result = adapter.parseOutput(
      0,
      JSON.stringify({ result: "Fixed the login bug by updating auth middleware" }),
      ""
    );
    expect(result.status).toBe("succeeded");
    expect(result.summary).toBe("Fixed the login bug by updating auth middleware");
  });
});
