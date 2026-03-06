import { describe, expect, test } from "bun:test";
import { ClaudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { CodexAdapter } from "../../src/agents/codex.ts";

describe("agent list", () => {
  test("ClaudeCodeAdapter has name property", () => {
    const adapter = new ClaudeCodeAdapter();
    expect(adapter.name).toBe("claude-code");
  });

  test("CodexAdapter has name property", () => {
    const adapter = new CodexAdapter();
    expect(adapter.name).toBe("codex");
  });

  test("isAvailable returns a boolean", async () => {
    const adapter = new ClaudeCodeAdapter();
    const available = await adapter.isAvailable();
    expect(typeof available).toBe("boolean");
  });
});
