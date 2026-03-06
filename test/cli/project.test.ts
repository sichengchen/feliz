import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { addProjectToConfig, removeProjectFromConfig } from "../../src/cli/project.ts";

const TEST_DIR = join(tmpdir(), "feliz-project-test");
const CONFIG_PATH = join(TEST_DIR, "feliz.yml");

const SAMPLE_CONFIG = `# Feliz configuration
linear:
  api_key: test-key

projects:
  - name: backend
    repo: git@github.com:org/backend.git
    linear_project: Backend
`;

describe("project add/remove", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(CONFIG_PATH, SAMPLE_CONFIG);
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  test("addProjectToConfig appends a project", () => {
    addProjectToConfig(CONFIG_PATH, {
      name: "frontend",
      repo: "git@github.com:org/frontend.git",
      linear_project: "Frontend",
      branch: "main",
    });
    const content = readFileSync(CONFIG_PATH, "utf-8");
    expect(content).toContain("frontend");
    expect(content).toContain("git@github.com:org/frontend.git");
    expect(content).toContain("Frontend");
    // Original project still present
    expect(content).toContain("backend");
  });

  test("removeProjectFromConfig removes a project", () => {
    removeProjectFromConfig(CONFIG_PATH, "backend");
    const content = readFileSync(CONFIG_PATH, "utf-8");
    expect(content).not.toContain("backend");
    // Config should still be valid YAML with linear section
    expect(content).toContain("linear");
  });

  test("removeProjectFromConfig throws for non-existent project", () => {
    expect(() => removeProjectFromConfig(CONFIG_PATH, "nonexistent")).toThrow(
      "not found"
    );
  });

  test("addProjectToConfig rejects duplicate name", () => {
    expect(() =>
      addProjectToConfig(CONFIG_PATH, {
        name: "backend",
        repo: "git@github.com:org/other.git",
        linear_project: "Other",
        branch: "main",
      })
    ).toThrow("already exists");
  });
});
