import { describe, expect, test } from "bun:test";
import {
  runE2EDoctor,
  runE2ESmoke,
  type E2EHarnessDeps,
} from "../../src/e2e/harness.ts";

function makeConfigYaml(): string {
  return `linear:
  oauth_token: lin_test_key
tick:
  interval_ms: 5000
storage:
  data_dir: /tmp/feliz-e2e/data
  workspace_root: /tmp/feliz-e2e/workspaces
agent:
  default: codex
  max_concurrent: 2
projects:
  - name: feliz-e2e-sandbox
    repo: git@github.com:org/feliz-e2e-sandbox.git
    linear_project: Feliz E2E Test
    branch: main
`;
}

function baseDeps(overrides: Partial<E2EHarnessDeps> = {}): E2EHarnessDeps {
  return {
    existsSync: (path: string) => path === "/tmp/feliz-e2e/feliz.yml",
    readFileSync: (_path: string) => makeConfigYaml(),
    env: {
      LINEAR_OAUTH_TOKEN: "lin_test_key",
      GITHUB_TOKEN: "ghp_test",
    },
    runCommand: (cmd: string, args: string[]) => {
      const key = `${cmd} ${args.join(" ")}`.trim();
      const okCommands = new Set([
        "bun --version",
        "gh --version",
        "sqlite3 --version",
        "git --version",
        "gh auth status",
        "codex --version",
        "bun run src/cli/index.ts config validate --config /tmp/feliz-e2e/feliz.yml",
      ]);
      if (okCommands.has(key)) {
        return { exitCode: 0, stdout: "ok", stderr: "" };
      }
      return { exitCode: 1, stdout: "", stderr: `unexpected command: ${key}` };
    },
    ...overrides,
  };
}

describe("E2E harness doctor", () => {
  test("fails when config file does not exist", () => {
    const report = runE2EDoctor(
      { configPath: "/tmp/feliz-e2e/feliz.yml" },
      baseDeps({
        existsSync: () => false,
      })
    );

    expect(report.ok).toBe(false);
    const configCheck = report.checks.find((c) => c.id === "config.exists");
    expect(configCheck).toBeDefined();
    expect(configCheck!.status).toBe("fail");
  });

  test("passes with valid config and available tools", () => {
    const report = runE2EDoctor(
      { configPath: "/tmp/feliz-e2e/feliz.yml" },
      baseDeps()
    );

    expect(report.ok).toBe(true);
    expect(report.checks.some((c) => c.id === "tool.agent")).toBe(true);
    expect(report.checks.some((c) => c.id === "github.auth")).toBe(true);
  });
});

describe("E2E harness smoke", () => {
  test("stops early when doctor fails", () => {
    const report = runE2ESmoke(
      { configPath: "/tmp/feliz-e2e/feliz.yml" },
      baseDeps({
        existsSync: () => false,
      })
    );

    expect(report.ok).toBe(false);
    expect(report.checks).toHaveLength(0);
  });

  test("runs smoke checks and includes all scenario IDs", () => {
    const report = runE2ESmoke(
      { configPath: "/tmp/feliz-e2e/feliz.yml" },
      baseDeps()
    );

    expect(report.ok).toBe(true);
    expect(report.checks.some((c) => c.id === "cli.config_validate")).toBe(true);
    expect(report.scenarios.map((s) => s.id)).toEqual([
      "S1",
      "S2",
      "S3",
      "S4",
      "S5",
      "S6",
      "S7",
      "S8",
      "S9",
      "S10",
    ]);
  });
});
