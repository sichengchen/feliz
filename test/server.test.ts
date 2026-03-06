import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { FelizServer } from "../src/server.ts";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type { FelizConfig } from "../src/config/types.ts";
import type { AgentAdapter } from "../src/agents/adapter.ts";

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

  test("promotes due retry_queued items and dispatches them in poll cycle", async () => {
    const server = new FelizServer(makeConfig());
    const anyServer = server as any;
    const db = anyServer.db;

    const project = {
      id: "proj-1",
      name: "test-project",
      repo_url: "git@github.com:org/test.git",
      linear_project_name: "Test",
      base_branch: "main",
    };
    db.insertProject(project);

    db.upsertWorkItem({
      id: "wi-1",
      linear_id: "lin-1",
      linear_identifier: "T-1",
      project_id: project.id,
      parent_work_item_id: null,
      title: "Retry me",
      description: "Needs retry",
      state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: "retry_queued",
    });
    db.insertRun({
      id: "run-1",
      work_item_id: "wi-1",
      attempt: 1,
      current_phase: "execute",
      current_step: "run",
      context_snapshot_id: "snap-1",
    });
    db.updateRunResult("run-1", "failed", "boom", null);
    db.appendHistory({
      id: "h-1",
      project_id: project.id,
      work_item_id: "wi-1",
      run_id: "run-1",
      event_type: "run.failed",
      payload: {
        attempt: 1,
        retry_ready_at: "2020-01-01T00:00:00.000Z",
      },
    });

    const repoPath = join(TEST_WORKSPACE_DIR, "test-project", "repo");
    mkdirSync(repoPath, { recursive: true });
    writeFileSync(join(repoPath, "WORKFLOW.md"), "Issue {{ issue.title }}", "utf-8");

    anyServer.poller = {
      poll: async () => [],
    };
    anyServer.workspace = {
      getRepoPath: () => repoPath,
    };

    const successAdapter: AgentAdapter = {
      name: "claude-code",
      isAvailable: async () => true,
      execute: async () => ({
        status: "succeeded",
        exitCode: 0,
        stdout: "ok",
        stderr: "",
        filesChanged: [],
      }),
      cancel: async () => {},
    };
    anyServer.adapters = {
      "claude-code": successAdapter,
      "codex": successAdapter,
    };

    await anyServer.pollCycle();

    const wi = db.getWorkItem("wi-1");
    expect(wi.orchestration_state).toBe("completed");

    await server.stop();
  });
});
