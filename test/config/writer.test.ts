import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import {
  CONFIG_TEMPLATE,
  generateConfig,
  writeConfigFile,
  generateRepoConfig,
  generatePipelineYml,
  generateWorkflowMd,
} from "../../src/config/writer.ts";
import { loadFelizConfig, loadRepoConfig, loadPipelineConfig } from "../../src/config/loader.ts";

const TEST_DIR = "/tmp/feliz-writer-test";

describe("CONFIG_TEMPLATE", () => {
  test("contains api_key placeholder with env var ref", () => {
    expect(CONFIG_TEMPLATE).toContain("api_key: $LINEAR_API_KEY");
  });

  test("contains project placeholders", () => {
    expect(CONFIG_TEMPLATE).toContain("name: my-project");
    expect(CONFIG_TEMPLATE).toContain("repo: git@github.com:org/repo.git");
    expect(CONFIG_TEMPLATE).toContain("linear_project: My Project");
  });

  test("contains comment header", () => {
    expect(CONFIG_TEMPLATE).toContain("# Feliz configuration");
  });
});

describe("generateConfig", () => {
  test("produces YAML with provided values", () => {
    const yaml = generateConfig({
      apiKey: "$LINEAR_API_KEY",
      projectName: "backend",
      repo: "git@github.com:acme/backend.git",
      linearProject: "Backend API",
    });
    expect(yaml).toContain("api_key: $LINEAR_API_KEY");
    expect(yaml).toContain("name: backend");
    expect(yaml).toContain("repo: git@github.com:acme/backend.git");
    expect(yaml).toContain("linear_project: Backend API");
  });

  test("produces YAML with literal API key", () => {
    const yaml = generateConfig({
      apiKey: "lin_api_abc123",
      projectName: "frontend",
      repo: "git@github.com:acme/frontend.git",
      linearProject: "Frontend",
    });
    expect(yaml).toContain("api_key: lin_api_abc123");
  });

  test("round-trips through loadFelizConfig", () => {
    process.env.LINEAR_API_KEY = "test-roundtrip-key";
    try {
      const yaml = generateConfig({
        apiKey: "$LINEAR_API_KEY",
        projectName: "backend",
        repo: "git@github.com:acme/backend.git",
        linearProject: "Backend API",
      });
      const config = loadFelizConfig(yaml);
      expect(config.linear.api_key).toBe("test-roundtrip-key");
      expect(config.projects[0]!.name).toBe("backend");
      expect(config.projects[0]!.repo).toBe("git@github.com:acme/backend.git");
      expect(config.projects[0]!.linear_project).toBe("Backend API");
    } finally {
      delete process.env.LINEAR_API_KEY;
    }
  });
});

describe("writeConfigFile", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  test("creates directory and writes template file", () => {
    const configPath = join(TEST_DIR, "feliz.yml");
    writeConfigFile(configPath, CONFIG_TEMPLATE);
    expect(existsSync(configPath)).toBe(true);
    expect(readFileSync(configPath, "utf-8")).toBe(CONFIG_TEMPLATE);
  });

  test("handles deeply nested directories", () => {
    const configPath = join(TEST_DIR, "a", "b", "c", "feliz.yml");
    writeConfigFile(configPath, CONFIG_TEMPLATE);
    expect(existsSync(configPath)).toBe(true);
    expect(readFileSync(configPath, "utf-8")).toBe(CONFIG_TEMPLATE);
  });
});

describe("generateRepoConfig", () => {
  test("round-trips through loadRepoConfig", () => {
    const yaml = generateRepoConfig({
      agentAdapter: "claude-code",
      specsEnabled: true,
      specsDirectory: "docs/specs",
      testCommand: "bun test",
      lintCommand: "bun run lint",
    });
    const config = loadRepoConfig(yaml);
    expect(config.agent.adapter).toBe("claude-code");
    expect(config.specs.enabled).toBe(true);
    expect(config.specs.directory).toBe("docs/specs");
    expect(config.gates.test_command).toBe("bun test");
    expect(config.gates.lint_command).toBe("bun run lint");
  });

  test("handles minimal answers with defaults", () => {
    const yaml = generateRepoConfig({
      agentAdapter: "claude-code",
      specsEnabled: false,
    });
    const config = loadRepoConfig(yaml);
    expect(config.agent.adapter).toBe("claude-code");
    expect(config.specs.enabled).toBe(false);
    expect(config.gates.test_command).toBeUndefined();
  });
});

describe("generatePipelineYml", () => {
  test("round-trips through loadPipelineConfig", () => {
    const yaml = generatePipelineYml("npm test");
    const pipeline = loadPipelineConfig(yaml);
    expect(pipeline.phases).toHaveLength(1);
    expect(pipeline.phases[0]!.name).toBe("execute");
    expect(pipeline.phases[0]!.steps[0]!.name).toBe("run");
    expect(pipeline.phases[0]!.steps[0]!.success!.command).toBe("npm test");
    expect(pipeline.phases[0]!.steps[1]!.builtin).toBe("publish");
  });

  test("omits success condition without test command", () => {
    const yaml = generatePipelineYml();
    const pipeline = loadPipelineConfig(yaml);
    expect(pipeline.phases[0]!.steps[0]!.success).toBeUndefined();
  });
});

describe("generateWorkflowMd", () => {
  test("contains template variables", () => {
    const md = generateWorkflowMd();
    expect(md).toContain("{{ project.name }}");
    expect(md).toContain("{{ issue.identifier }}");
    expect(md).toContain("{{ issue.title }}");
    expect(md).toContain("{{ issue.description }}");
  });
});
