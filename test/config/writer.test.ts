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
  test("contains oauth_token placeholder with env var ref", () => {
    expect(CONFIG_TEMPLATE).toContain("oauth_token: $LINEAR_OAUTH_TOKEN");
  });

  test("contains empty projects list", () => {
    expect(CONFIG_TEMPLATE).toContain("projects: []");
  });

  test("contains comment header", () => {
    expect(CONFIG_TEMPLATE).toContain("# Feliz configuration");
  });
});

describe("generateConfig", () => {
  test("produces YAML with provided token", () => {
    const yaml = generateConfig({
      oauthToken: "$LINEAR_OAUTH_TOKEN",
    });
    expect(yaml).toContain("oauth_token: $LINEAR_OAUTH_TOKEN");
    expect(yaml).toContain("projects: []");
  });

  test("produces YAML with literal API key", () => {
    const yaml = generateConfig({
      oauthToken: "lin_api_abc123",
    });
    expect(yaml).toContain("oauth_token: lin_api_abc123");
  });

  test("round-trips through loadFelizConfig", () => {
    process.env.LINEAR_OAUTH_TOKEN = "test-roundtrip-key";
    try {
      const yaml = generateConfig({
        oauthToken: "$LINEAR_OAUTH_TOKEN",
      });
      const config = loadFelizConfig(yaml);
      expect(config.linear.oauth_token).toBe("test-roundtrip-key");
      expect(config.projects).toEqual([]);
    } finally {
      delete process.env.LINEAR_OAUTH_TOKEN;
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
    const yaml = generatePipelineYml("claude-code", "npm test");
    const pipeline = loadPipelineConfig(yaml);
    expect(pipeline.phases).toHaveLength(1);
    expect(pipeline.phases[0]!.name).toBe("execute");
    expect(pipeline.phases[0]!.steps[0]!.name).toBe("run");
    expect(pipeline.phases[0]!.steps[0]!.agent).toBe("claude-code");
    expect(pipeline.phases[0]!.steps[0]!.success!.command).toBe("npm test");
    expect(pipeline.phases[0]!.steps[1]!.prompt).toBe(".feliz/prompts/publish.md");
    expect(pipeline.phases[0]!.steps[1]!.agent).toBe("claude-code");
  });

  test("omits success condition without test command", () => {
    const yaml = generatePipelineYml("claude-code");
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

  test("contains context system instructions", () => {
    const md = generateWorkflowMd();
    expect(md).toContain("feliz context read");
    expect(md).toContain("feliz context write");
  });

  test("does not contain old template variables", () => {
    const md = generateWorkflowMd();
    expect(md).not.toContain("{{ specs }}");
    expect(md).not.toContain("{{ previous_failure }}");
    expect(md).not.toContain("{{ previous_review }}");
  });
});
