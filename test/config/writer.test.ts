import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import {
  CONFIG_TEMPLATE,
  generateConfig,
  writeConfigFile,
} from "../../src/config/writer.ts";
import { loadFelizConfig } from "../../src/config/loader.ts";

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
