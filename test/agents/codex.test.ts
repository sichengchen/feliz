import { describe, expect, test } from "bun:test";
import { CodexAdapter } from "../../src/agents/codex.ts";

describe("CodexAdapter", () => {
  test("has correct name", () => {
    const adapter = new CodexAdapter();
    expect(adapter.name).toBe("codex");
  });

  test("builds correct command args", () => {
    const adapter = new CodexAdapter();
    const args = adapter.buildArgs({
      runId: "run-1",
      workDir: "/tmp/work",
      prompt: "Fix the bug",
      timeout_ms: 600000,
      maxTurns: 20,
      approvalPolicy: "auto",
      env: {},
    });
    expect(args[0]).toBe("exec");
    expect(args).toContain("--json");
    expect(args).toContain("-s");
    expect(args).toContain("danger-full-access");
    expect(args[args.length - 1]).toBe("Fix the bug");
  });

  test("uses workspace-write sandbox for suggest policy", () => {
    const adapter = new CodexAdapter();
    const args = adapter.buildArgs({
      runId: "run-1",
      workDir: "/tmp/work",
      prompt: "Review",
      timeout_ms: 600000,
      maxTurns: 20,
      approvalPolicy: "suggest",
      env: {},
    });
    const sandboxIdx = args.indexOf("-s");
    expect(args[sandboxIdx + 1]).toBe("workspace-write");
  });

  test("uses read-only sandbox for gated policy", () => {
    const adapter = new CodexAdapter();
    const args = adapter.buildArgs({
      runId: "run-1",
      workDir: "/tmp/work",
      prompt: "Plan this",
      timeout_ms: 600000,
      maxTurns: 20,
      approvalPolicy: "gated",
      env: {},
    });
    const sandboxIdx = args.indexOf("-s");
    expect(args[sandboxIdx + 1]).toBe("read-only");
  });

  test("parseOutput handles successful JSONL output", () => {
    const adapter = new CodexAdapter();
    const jsonl = [
      JSON.stringify({ type: "message", content: "Working on it..." }),
      JSON.stringify({ type: "message", content: "Done. Fixed the bug." }),
    ].join("\n");

    const result = adapter.parseOutput(0, jsonl, "");
    expect(result.status).toBe("succeeded");
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("Done. Fixed the bug.");
  });

  test("parseOutput handles non-zero exit code", () => {
    const adapter = new CodexAdapter();
    const result = adapter.parseOutput(1, "error", "stderr");
    expect(result.status).toBe("failed");
    expect(result.exitCode).toBe(1);
  });

  test("parseOutput handles empty stdout", () => {
    const adapter = new CodexAdapter();
    const result = adapter.parseOutput(0, "", "");
    expect(result.status).toBe("succeeded");
    expect(result.summary).toBeUndefined();
  });

  test("parseOutput extracts last message as summary", () => {
    const adapter = new CodexAdapter();
    const jsonl = [
      JSON.stringify({ type: "start", content: "Starting" }),
      JSON.stringify({ type: "message", content: "First message" }),
      JSON.stringify({ type: "message", content: "Final summary here" }),
    ].join("\n");

    const result = adapter.parseOutput(0, jsonl, "");
    expect(result.summary).toBe("Final summary here");
  });

  test("maps auto policy to danger-full-access sandbox", () => {
    const adapter = new CodexAdapter();
    const args = adapter.buildArgs({
      runId: "run-1",
      workDir: "/tmp/work",
      prompt: "Fix it",
      timeout_ms: 600000,
      maxTurns: 20,
      approvalPolicy: "auto",
      env: {},
    });
    expect(args).toContain("danger-full-access");
  });
});
