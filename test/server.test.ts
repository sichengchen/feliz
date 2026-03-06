import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { FelizServer } from "../src/server.ts";
import { existsSync, rmSync, mkdirSync } from "fs";
import { join } from "path";
import type { FelizConfig } from "../src/config/types.ts";

const TEST_DATA_DIR = "/tmp/feliz-server-test-data";
const TEST_WORKSPACE_DIR = "/tmp/feliz-server-test-workspace";

function makeConfig(overrides?: Partial<FelizConfig>): FelizConfig {
  return {
    linear: { api_key: "test-api-key" },
    storage: { data_dir: TEST_DATA_DIR, workspace_root: TEST_WORKSPACE_DIR },
    polling: { interval_ms: 5000 },
    agent: { default: "claude-code", max_concurrent: 1 },
    projects: [
      {
        name: "test-project",
        repo: "git@github.com:org/test.git",
        linear_project: "Test",
        branch: "main",
      },
    ],
    ...overrides,
  };
}

describe("FelizServer", () => {
  beforeEach(() => {
    if (existsSync(TEST_DATA_DIR)) rmSync(TEST_DATA_DIR, { recursive: true });
    if (existsSync(TEST_WORKSPACE_DIR))
      rmSync(TEST_WORKSPACE_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DATA_DIR)) rmSync(TEST_DATA_DIR, { recursive: true });
    if (existsSync(TEST_WORKSPACE_DIR))
      rmSync(TEST_WORKSPACE_DIR, { recursive: true });
  });

  test("constructs without error", () => {
    const server = new FelizServer(makeConfig());
    expect(server).toBeDefined();
    server.stop();
  });

  test("stop cleans up resources", async () => {
    const server = new FelizServer(makeConfig());

    // Write a PID file to simulate what start() would do
    const { writePidFile } = await import("../src/pid.ts");
    writePidFile(TEST_DATA_DIR);
    expect(existsSync(join(TEST_DATA_DIR, "feliz.pid"))).toBe(true);

    await server.stop();
    expect(existsSync(join(TEST_DATA_DIR, "feliz.pid"))).toBe(false);
  });

  test("creates required directories on construction", () => {
    const server = new FelizServer(makeConfig());

    expect(existsSync(join(TEST_DATA_DIR, "db"))).toBe(true);
    expect(existsSync(TEST_WORKSPACE_DIR)).toBe(true);

    server.stop();
  });
});
