import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { validateAllConfigs } from "../../src/cli/validate.ts";

const TEST_ROOT = "/tmp/feliz-cli-validate";

describe("CLI config validation", () => {
  beforeEach(() => {
    if (existsSync(TEST_ROOT)) {
      rmSync(TEST_ROOT, { recursive: true });
    }
    mkdirSync(TEST_ROOT, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_ROOT)) {
      rmSync(TEST_ROOT, { recursive: true });
    }
  });

  test("validates repo-level .feliz config and pipeline files", () => {
    const configPath = join(TEST_ROOT, "feliz.yml");
    const workspaceRoot = join(TEST_ROOT, "workspaces");
    const repoPath = join(workspaceRoot, "backend", "repo");
    mkdirSync(join(repoPath, ".feliz"), { recursive: true });

    writeFileSync(
      configPath,
      `linear:\n  api_key: test\nprojects:\n  - name: backend\n    repo: git@github.com:org/backend.git\n    linear_project: Backend\nstorage:\n  data_dir: ${join(TEST_ROOT, "data")}\n  workspace_root: ${workspaceRoot}\n`,
      "utf-8"
    );

    writeFileSync(
      join(repoPath, ".feliz", "config.yml"),
      `agent:\n  adapter: claude-code\n`,
      "utf-8"
    );
    writeFileSync(
      join(repoPath, ".feliz", "pipeline.yml"),
      `phases:\n  - name: execute\n    steps:\n      - name: run\n        prompt: WORKFLOW.md\n`,
      "utf-8"
    );

    expect(() => validateAllConfigs(configPath)).not.toThrow();
  });

  test("fails validation when repo-level pipeline config is invalid", () => {
    const configPath = join(TEST_ROOT, "feliz.yml");
    const workspaceRoot = join(TEST_ROOT, "workspaces");
    const repoPath = join(workspaceRoot, "backend", "repo");
    mkdirSync(join(repoPath, ".feliz"), { recursive: true });

    writeFileSync(
      configPath,
      `linear:\n  api_key: test\nprojects:\n  - name: backend\n    repo: git@github.com:org/backend.git\n    linear_project: Backend\nstorage:\n  data_dir: ${join(TEST_ROOT, "data")}\n  workspace_root: ${workspaceRoot}\n`,
      "utf-8"
    );

    writeFileSync(
      join(repoPath, ".feliz", "config.yml"),
      `agent:\n  adapter: claude-code\n`,
      "utf-8"
    );
    writeFileSync(
      join(repoPath, ".feliz", "pipeline.yml"),
      `phases: [`,
      "utf-8"
    );

    expect(() => validateAllConfigs(configPath)).toThrow(
      /Invalid pipeline config for project "backend"/
    );
  });
});
