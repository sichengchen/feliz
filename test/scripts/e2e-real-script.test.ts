import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();

describe("E2E real automation script", () => {
  test("includes a runnable real-e2e setup script", () => {
    const scriptPath = join(ROOT, "scripts", "e2e-real.sh");
    expect(existsSync(scriptPath)).toBe(true);

    const content = readFileSync(scriptPath, "utf-8");
    expect(content.startsWith("#!/usr/bin/env bash")).toBe(true);
    expect(content).toContain("gh repo create");
    expect(content).toContain("scripts/e2e-smoke.sh");
    expect(content).toContain("src/cli/index.ts start");
    expect(content).toContain("LINEAR_API_KEY");
    expect(content).toContain("E2E_GH_OWNER");
    expect(content).toContain("E2E_LINEAR_PROJECT");
  });

  test("documents env vars needed for real-e2e automation", () => {
    const envSamplePath = join(ROOT, "scripts", "e2e.env.example");
    expect(existsSync(envSamplePath)).toBe(true);

    const content = readFileSync(envSamplePath, "utf-8");
    expect(content).toContain("E2E_GH_OWNER=");
    expect(content).toContain("E2E_REPO_NAME=");
    expect(content).toContain("E2E_LINEAR_PROJECT=");
    expect(content).toContain("E2E_AGENT_ADAPTER=");
  });
});
