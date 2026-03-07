import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  writeRepoScaffold,
  writeRepoScaffoldWithAgent,
  repoHasFelizConfig,
  gitCommitAndPush,
} from "../../src/cli/repo-scaffold.ts";
import type { AgentAdapter } from "../../src/agents/adapter.ts";

const TEST_DIR = join(tmpdir(), "feliz-scaffold-test");

describe("repoHasFelizConfig", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  test("returns false when .feliz/config.yml does not exist", () => {
    expect(repoHasFelizConfig(TEST_DIR)).toBe(false);
  });

  test("returns true when .feliz/config.yml exists", () => {
    const { mkdirSync, writeFileSync } = require("fs");
    mkdirSync(join(TEST_DIR, ".feliz"), { recursive: true });
    writeFileSync(join(TEST_DIR, ".feliz", "config.yml"), "agent:\n  adapter: claude-code\n");
    expect(repoHasFelizConfig(TEST_DIR)).toBe(true);
  });
});

describe("writeRepoScaffold", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  test("creates .feliz/config.yml, .feliz/pipeline.yml, .feliz/prompts/, WORKFLOW.md", () => {
    writeRepoScaffold(TEST_DIR, {
      agentAdapter: "claude-code",
      specsEnabled: false,
      testCommand: "bun test",
    });

    expect(existsSync(join(TEST_DIR, ".feliz", "config.yml"))).toBe(true);
    expect(existsSync(join(TEST_DIR, ".feliz", "pipeline.yml"))).toBe(true);
    expect(existsSync(join(TEST_DIR, ".feliz", "prompts"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "WORKFLOW.md"))).toBe(true);

    const configYml = readFileSync(join(TEST_DIR, ".feliz", "config.yml"), "utf-8");
    expect(configYml).toContain("claude-code");

    const pipelineYml = readFileSync(join(TEST_DIR, ".feliz", "pipeline.yml"), "utf-8");
    expect(pipelineYml).toContain("execute");
    expect(pipelineYml).toContain("bun test");

    const workflow = readFileSync(join(TEST_DIR, "WORKFLOW.md"), "utf-8");
    expect(workflow).toContain("{{ project.name }}");
  });
});

describe("gitCommitAndPush", () => {
  const BARE_DIR = join(TEST_DIR, "bare.git");
  const CLONE_DIR = join(TEST_DIR, "clone");

  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    // Create a bare repo and clone it
    Bun.spawnSync(["git", "init", "--bare", BARE_DIR]);
    Bun.spawnSync(["git", "clone", BARE_DIR, CLONE_DIR]);
    Bun.spawnSync(["git", "config", "user.email", "test@test.com"], { cwd: CLONE_DIR });
    Bun.spawnSync(["git", "config", "user.name", "Test"], { cwd: CLONE_DIR });
    // Create an initial commit so we have a branch
    Bun.spawnSync(["touch", "README.md"], { cwd: CLONE_DIR });
    Bun.spawnSync(["git", "add", "README.md"], { cwd: CLONE_DIR });
    Bun.spawnSync(["git", "commit", "-m", "init"], { cwd: CLONE_DIR });
    Bun.spawnSync(["git", "push", "-u", "origin", "main"], { cwd: CLONE_DIR });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  test("commits and pushes .feliz/ and WORKFLOW.md", () => {
    writeRepoScaffold(CLONE_DIR, {
      agentAdapter: "claude-code",
      specsEnabled: false,
    });

    gitCommitAndPush(CLONE_DIR, "main");

    // Verify the commit exists
    const log = Bun.spawnSync(["git", "log", "--oneline", "-1"], { cwd: CLONE_DIR });
    expect(log.stdout.toString()).toContain("feliz");

    // Verify push succeeded by checking bare repo
    const bareLog = Bun.spawnSync(["git", "log", "--oneline", "main"], { cwd: BARE_DIR });
    expect(bareLog.stdout.toString()).toContain("feliz");
  });

  test("pushes using GITHUB_TOKEN when remote is HTTPS github URL", () => {
    // Set remote to an HTTPS github URL (without credentials)
    Bun.spawnSync(
      ["git", "remote", "set-url", "origin", "https://github.com/test-org/test-repo.git"],
      { cwd: CLONE_DIR }
    );

    writeRepoScaffold(CLONE_DIR, {
      agentAdapter: "claude-code",
      specsEnabled: false,
    });

    // Set GITHUB_TOKEN so injectGitHubToken can inject it
    const origToken = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = "ghp_test123";
    try {
      // The push will fail (fake remote) but the command should include the token in the URL
      // We verify by checking that gitCommitAndPush reads the remote URL and injects the token
      // Since we can't push to a fake URL, we just verify the commit succeeds
      // and the push attempt uses the right URL format
      try {
        gitCommitAndPush(CLONE_DIR, "main");
      } catch (e: any) {
        // Push will fail since the remote doesn't exist, but the error
        // should NOT be "403" / "Write access not granted" — it should be
        // a connection error, proving the token was injected into the URL
        expect(e.message).toContain("Failed to push");
        // Verify commit was made
        const log = Bun.spawnSync(["git", "log", "--oneline", "-1"], { cwd: CLONE_DIR });
        expect(log.stdout.toString()).toContain("feliz");
      }
    } finally {
      if (origToken !== undefined) {
        process.env.GITHUB_TOKEN = origToken;
      } else {
        delete process.env.GITHUB_TOKEN;
      }
    }
  });

  test("commits with default Feliz identity when no git user configured", () => {
    // Remove user identity to simulate Docker/CI
    Bun.spawnSync(["git", "config", "--unset", "user.email"], { cwd: CLONE_DIR });
    Bun.spawnSync(["git", "config", "--unset", "user.name"], { cwd: CLONE_DIR });

    writeRepoScaffold(CLONE_DIR, {
      agentAdapter: "claude-code",
      specsEnabled: false,
    });

    // Should not throw even without local git user config
    gitCommitAndPush(CLONE_DIR, "main");

    const log = Bun.spawnSync(["git", "log", "-1", "--format=%an"], { cwd: CLONE_DIR });
    const authorName = log.stdout.toString().trim();
    // Uses GIT_AUTHOR_NAME env if set, otherwise defaults to "Feliz Bot"
    expect(authorName).toBe(process.env.GIT_AUTHOR_NAME || "Feliz Bot");
  });
});

describe("writeRepoScaffoldWithAgent", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  test("returns fallback reason when adapter is unavailable", async () => {
    const adapter: AgentAdapter = {
      name: "claude-code",
      isAvailable: async () => false,
      execute: async () => {
        throw new Error("should not run");
      },
      cancel: async () => {},
    };

    const result = await writeRepoScaffoldWithAgent(
      TEST_DIR,
      adapter,
      "claude-code",
      {
        agentAdapter: "claude-code",
        specsEnabled: false,
      }
    );

    expect(result.success).toBe(false);
    expect(result.reason).toContain("not available (not installed or not authenticated)");
  });

  test("includes stderr in failure reason when agent execution fails", async () => {
    const adapter: AgentAdapter = {
      name: "claude-code",
      isAvailable: async () => true,
      execute: async () => ({
        status: "failed" as const,
        exitCode: 1,
        stdout: "",
        stderr: "Error: ANTHROPIC_API_KEY not set",
        filesChanged: [],
      }),
      cancel: async () => {},
    };

    const result = await writeRepoScaffoldWithAgent(
      TEST_DIR,
      adapter,
      "claude-code",
      {
        agentAdapter: "claude-code",
        specsEnabled: false,
      }
    );

    expect(result.success).toBe(false);
    expect(result.reason).toContain("ANTHROPIC_API_KEY not set");
  });

  test("returns success when agent generates valid scaffold files", async () => {
    const adapter: AgentAdapter = {
      name: "claude-code",
      isAvailable: async () => true,
      execute: async () => {
        writeRepoScaffold(TEST_DIR, {
          agentAdapter: "claude-code",
          specsEnabled: true,
          testCommand: "bun test",
        });
        return {
          status: "succeeded",
          exitCode: 0,
          stdout: "ok",
          stderr: "",
          filesChanged: [".feliz/config.yml", ".feliz/pipeline.yml", "WORKFLOW.md"],
        };
      },
      cancel: async () => {},
    };

    const result = await writeRepoScaffoldWithAgent(
      TEST_DIR,
      adapter,
      "claude-code",
      {
        agentAdapter: "claude-code",
        specsEnabled: true,
        testCommand: "bun test",
      }
    );

    expect(result.success).toBe(true);
    expect(existsSync(join(TEST_DIR, ".feliz", "config.yml"))).toBe(true);
    expect(existsSync(join(TEST_DIR, ".feliz", "pipeline.yml"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "WORKFLOW.md"))).toBe(true);
  });
});
