import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync, readFileSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const TEST_DIR = "/tmp/feliz-init-test";

function makePromptFn(answers: (string | null)[]) {
  let i = 0;
  return (_msg?: string): string | null => answers[i++] ?? null;
}

describe("runInit", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  test("creates config with env var ref when LINEAR_OAUTH_TOKEN is set and user confirms", async () => {
    const origEnv = process.env.LINEAR_OAUTH_TOKEN;
    process.env.LINEAR_OAUTH_TOKEN = "lin_test_key";
    try {
      const configPath = join(TEST_DIR, "feliz.yml");
      const promptFn = makePromptFn(["Y", "backend", "git@github.com:acme/backend.git", "Backend API"]);

      const { runInit } = await import("../../src/cli/init.ts");
      await runInit(configPath, promptFn);

      expect(existsSync(configPath)).toBe(true);
      const content = readFileSync(configPath, "utf-8");
      expect(content).toContain("oauth_token: $LINEAR_OAUTH_TOKEN");
      expect(content).toContain("name: backend");
      expect(content).toContain("repo: git@github.com:acme/backend.git");
      expect(content).toContain("linear_project: Backend API");
    } finally {
      if (origEnv !== undefined) {
        process.env.LINEAR_OAUTH_TOKEN = origEnv;
      } else {
        delete process.env.LINEAR_OAUTH_TOKEN;
      }
    }
  });

  test("creates config with literal OAuth token when env var not set", async () => {
    const origEnv = process.env.LINEAR_OAUTH_TOKEN;
    delete process.env.LINEAR_OAUTH_TOKEN;
    try {
      const configPath = join(TEST_DIR, "feliz.yml");
      const promptFn = makePromptFn(["lin_api_abc123", "frontend", "git@github.com:acme/frontend.git", "Frontend"]);

      const { runInit } = await import("../../src/cli/init.ts");
      await runInit(configPath, promptFn);

      expect(existsSync(configPath)).toBe(true);
      const content = readFileSync(configPath, "utf-8");
      expect(content).toContain("oauth_token: lin_api_abc123");
      expect(content).toContain("name: frontend");
    } finally {
      if (origEnv !== undefined) {
        process.env.LINEAR_OAUTH_TOKEN = origEnv;
      } else {
        delete process.env.LINEAR_OAUTH_TOKEN;
      }
    }
  });

  test("skips when config already exists", async () => {
    const configPath = join(TEST_DIR, "feliz.yml");
    writeFileSync(configPath, "existing: config");

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(" "));
    try {
      const { runInit } = await import("../../src/cli/init.ts");
      await runInit(configPath, makePromptFn([]));

      expect(logs.some((l) => l.includes("already exists"))).toBe(true);
      expect(readFileSync(configPath, "utf-8")).toBe("existing: config");
    } finally {
      console.log = origLog;
    }
  });

  test("creates nested directories for config path", async () => {
    const origEnv = process.env.LINEAR_OAUTH_TOKEN;
    delete process.env.LINEAR_OAUTH_TOKEN;
    try {
      const configPath = join(TEST_DIR, "a", "b", "feliz.yml");
      const promptFn = makePromptFn(["lin_key_123", "proj", "git@github.com:o/r.git", "Proj"]);

      const { runInit } = await import("../../src/cli/init.ts");
      await runInit(configPath, promptFn);

      expect(existsSync(configPath)).toBe(true);
    } finally {
      if (origEnv !== undefined) {
        process.env.LINEAR_OAUTH_TOKEN = origEnv;
      } else {
        delete process.env.LINEAR_OAUTH_TOKEN;
      }
    }
  });
});
