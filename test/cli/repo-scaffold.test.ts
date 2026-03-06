import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  writeRepoScaffold,
  repoHasFelizConfig,
  gitCommitAndPush,
} from "../../src/cli/repo-scaffold.ts";

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
});
