import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();

describe("E2E smoke script", () => {
  test("includes a runnable smoke script in scripts/", () => {
    const scriptPath = join(ROOT, "scripts", "e2e-smoke.sh");
    expect(existsSync(scriptPath)).toBe(true);

    const content = readFileSync(scriptPath, "utf-8");
    expect(content.startsWith("#!/usr/bin/env bash")).toBe(true);
    expect(content).toContain("src/cli/index.ts e2e doctor");
    expect(content).toContain("src/cli/index.ts e2e smoke");
    expect(content).toContain("LINEAR_OAUTH_TOKEN");
  });

  test("includes an env sample for e2e testing", () => {
    const envSamplePath = join(ROOT, "scripts", "e2e.env.example");
    expect(existsSync(envSamplePath)).toBe(true);

    const content = readFileSync(envSamplePath, "utf-8");
    expect(content).toContain("LINEAR_OAUTH_TOKEN=");
    expect(content).toContain("GITHUB_TOKEN=");
    expect(content).toContain("E2E_CONFIG_PATH=");
  });
});
