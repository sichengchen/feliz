import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  WorkspaceManager,
  sanitizeIdentifier,
} from "../../src/workspace/manager.ts";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

const TEST_ROOT = "/tmp/feliz-workspace-test";

function initTestRepo(repoPath: string) {
  mkdirSync(repoPath, { recursive: true });
  Bun.spawnSync(["git", "init", "-b", "main"], { cwd: repoPath });
  Bun.spawnSync(["git", "config", "user.email", "test@test.com"], {
    cwd: repoPath,
  });
  Bun.spawnSync(["git", "config", "user.name", "Test"], {
    cwd: repoPath,
  });
  Bun.spawnSync(["git", "commit", "--allow-empty", "--no-gpg-sign", "-m", "init"], {
    cwd: repoPath,
  });
}

describe("sanitizeIdentifier", () => {
  test("keeps alphanumeric and dash", () => {
    expect(sanitizeIdentifier("BAC-123")).toBe("BAC-123");
  });

  test("replaces invalid chars with underscore", () => {
    expect(sanitizeIdentifier("BAC/123 foo")).toBe("BAC_123_foo");
  });

  test("keeps dots and underscores", () => {
    expect(sanitizeIdentifier("v1.2_beta")).toBe("v1.2_beta");
  });
});

describe("WorkspaceManager", () => {
  let manager: WorkspaceManager;

  beforeEach(() => {
    if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true });
    mkdirSync(TEST_ROOT, { recursive: true });
    manager = new WorkspaceManager(TEST_ROOT);
  });

  afterEach(() => {
    if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true });
  });

  test("getRepoPath returns correct path", () => {
    const path = manager.getRepoPath("backend");
    expect(path).toBe(join(TEST_ROOT, "backend", "repo"));
  });

  test("getWorktreePath returns correct path", () => {
    const path = manager.getWorktreePath("backend", "BAC-123");
    expect(path).toBe(join(TEST_ROOT, "backend", "worktrees", "BAC-123"));
  });

  test("getWorktreePath sanitizes identifier", () => {
    const path = manager.getWorktreePath("backend", "BAC/123 foo");
    expect(path).toBe(join(TEST_ROOT, "backend", "worktrees", "BAC_123_foo"));
  });

  test("getBranchName returns feliz/ prefix", () => {
    expect(manager.getBranchName("BAC-123")).toBe("feliz/BAC-123");
  });

  test("createWorktree creates worktree from initialized repo", async () => {
    const repoPath = manager.getRepoPath("testproj");
    initTestRepo(repoPath);

    const wtPath = await manager.createWorktree("testproj", "BAC-1", "main");
    expect(existsSync(wtPath)).toBe(true);
    expect(wtPath).toBe(manager.getWorktreePath("testproj", "BAC-1"));
  });

  test("removeWorktree cleans up", async () => {
    const repoPath = manager.getRepoPath("testproj");
    initTestRepo(repoPath);

    const wtPath = await manager.createWorktree("testproj", "BAC-1", "main");
    expect(existsSync(wtPath)).toBe(true);

    await manager.removeWorktree("testproj", "BAC-1");
    expect(existsSync(wtPath)).toBe(false);
  });

  test("runHook executes shell command in workdir", async () => {
    const repoPath = manager.getRepoPath("testproj");
    initTestRepo(repoPath);

    const result = await manager.runHook(repoPath, "echo hello");
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hello");
  });

  test("cloneRepo creates repo directory", async () => {
    // Create a local bare repo to clone from
    const bareRepo = join(TEST_ROOT, "bare-repo.git");
    mkdirSync(bareRepo, { recursive: true });
    Bun.spawnSync(["git", "init", "--bare", "-b", "main"], { cwd: bareRepo });

    const repoPath = await manager.cloneRepo("myproj", bareRepo);
    expect(existsSync(repoPath)).toBe(true);
    expect(repoPath).toBe(manager.getRepoPath("myproj"));
  });

  test("cloneRepo throws on invalid URL", async () => {
    try {
      await manager.cloneRepo("bad", "git@nonexistent:invalid/repo.git");
      expect(true).toBe(false); // should not reach
    } catch (e: any) {
      expect(e.message).toContain("Failed to clone");
    }
  });
});

describe("injectGitHubToken", () => {
  test("injects token into HTTPS GitHub URL", () => {
    const { injectGitHubToken } = require("../../src/workspace/manager.ts");
    const result = injectGitHubToken("https://github.com/org/repo.git", "ghp_abc123");
    expect(result).toBe("https://x-access-token:ghp_abc123@github.com/org/repo.git");
  });

  test("injects token into HTTPS GitHub URL without .git suffix", () => {
    const { injectGitHubToken } = require("../../src/workspace/manager.ts");
    const result = injectGitHubToken("https://github.com/org/repo", "ghp_abc123");
    expect(result).toBe("https://x-access-token:ghp_abc123@github.com/org/repo");
  });

  test("returns original URL for SSH URLs", () => {
    const { injectGitHubToken } = require("../../src/workspace/manager.ts");
    const result = injectGitHubToken("git@github.com:org/repo.git", "ghp_abc123");
    expect(result).toBe("git@github.com:org/repo.git");
  });

  test("returns original URL when no token provided", () => {
    const { injectGitHubToken } = require("../../src/workspace/manager.ts");
    const result = injectGitHubToken("https://github.com/org/repo.git", undefined);
    expect(result).toBe("https://github.com/org/repo.git");
  });

  test("returns original URL for non-GitHub HTTPS URLs", () => {
    const { injectGitHubToken } = require("../../src/workspace/manager.ts");
    const result = injectGitHubToken("https://gitlab.com/org/repo.git", "ghp_abc123");
    expect(result).toBe("https://gitlab.com/org/repo.git");
  });
});

describe("sanitizeIdentifier edge cases", () => {
  test("replaces spaces", () => {
    expect(sanitizeIdentifier("hello world")).toBe("hello_world");
  });

  test("replaces slashes", () => {
    expect(sanitizeIdentifier("a/b/c")).toBe("a_b_c");
  });

  test("preserves dashes", () => {
    expect(sanitizeIdentifier("BAC-123-fix")).toBe("BAC-123-fix");
  });

  test("handles empty string", () => {
    expect(sanitizeIdentifier("")).toBe("");
  });
});
