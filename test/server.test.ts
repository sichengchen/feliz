import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { FelizServer } from "../src/server.ts";
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type { FelizConfig } from "../src/config/types.ts";
import type { AgentAdapter } from "../src/agents/adapter.ts";
import { AUTH_CODE_FILE, clearAuthCode } from "../src/cli/auth.ts";

const TEST_DATA_DIR = "/tmp/feliz-server-test-data";
const TEST_WORKSPACE_DIR = "/tmp/feliz-server-test-workspace";

function makeConfig(overrides?: Partial<FelizConfig>): FelizConfig {
  return {
    linear: { oauth_token: "test-oauth-token" },
    webhook: { port: 0 },
    tick: { interval_ms: 5000 },
    storage: { data_dir: TEST_DATA_DIR, workspace_root: TEST_WORKSPACE_DIR },
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

  test("promotes due retry_queued items and dispatches them in tick cycle", async () => {
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

    await anyServer.tickCycle();

    const wi = db.getWorkItem("wi-1");
    expect(wi.orchestration_state).toBe("completed");

    await server.stop();
  });

  test("Given a work item in spec_drafting When tickCycle runs Then it advances to spec_review", async () => {
    const server = new FelizServer(makeConfig());
    const anyServer = server as any;
    const db = anyServer.db;

    const project = {
      id: "proj-spec",
      name: "test-project",
      repo_url: "git@github.com:org/test.git",
      linear_project_name: "Test",
      base_branch: "main",
    };
    db.insertProject(project);
    db.upsertWorkItem({
      id: "wi-spec",
      linear_id: "lin-spec",
      linear_identifier: "T-20",
      project_id: project.id,
      parent_work_item_id: null,
      title: "Draft spec",
      description: "Need a spec",
      state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: "spec_drafting",
    });

    const repoPath = join(TEST_WORKSPACE_DIR, "test-project", "repo");
    mkdirSync(join(repoPath, ".feliz"), { recursive: true });
    writeFileSync(
      join(repoPath, ".feliz", "config.yml"),
      `specs:
  enabled: true
  directory: specs
  approval_required: true
agent:
  adapter: claude-code
`,
      "utf-8"
    );

    anyServer.workspace = { getRepoPath: () => repoPath };
    const specAdapter: AgentAdapter = {
      name: "claude-code",
      isAvailable: async () => true,
      execute: async () => ({
        status: "succeeded",
        exitCode: 0,
        stdout: "spec drafted",
        stderr: "",
        filesChanged: ["specs/new-feature.md"],
      }),
      cancel: async () => {},
    };
    anyServer.adapters = { "claude-code": specAdapter, codex: specAdapter };

    await anyServer.tickCycle();

    const wi = db.getWorkItem("wi-spec");
    expect(wi.orchestration_state).toBe("spec_review");

    await server.stop();
  });

  test("handles /auth/callback by writing code to file", async () => {
    clearAuthCode();

    const server = new FelizServer(makeConfig());
    const anyServer = server as any;

    // Start the HTTP server only (not the full start() which enters tick loop)
    const httpServer = Bun.serve({
      port: 0,
      fetch: anyServer.handleRequest.bind(anyServer),
    });

    try {
      const resp = await fetch(
        `http://localhost:${httpServer.port}/auth/callback?code=srv_test_code`
      );
      expect(resp.status).toBe(200);
      const html = await resp.text();
      expect(html).toContain("Authorization complete");

      expect(existsSync(AUTH_CODE_FILE)).toBe(true);
      expect(readFileSync(AUTH_CODE_FILE, "utf-8")).toBe("srv_test_code");
    } finally {
      httpServer.stop();
      await server.stop();
      clearAuthCode();
    }
  });

  test("returns 400 for /auth/callback without code", async () => {
    const server = new FelizServer(makeConfig());
    const anyServer = server as any;

    const httpServer = Bun.serve({
      port: 0,
      fetch: anyServer.handleRequest.bind(anyServer),
    });

    try {
      const resp = await fetch(
        `http://localhost:${httpServer.port}/auth/callback`
      );
      expect(resp.status).toBe(400);
    } finally {
      httpServer.stop();
      await server.stop();
    }
  });

  test("Given a work item in decomposing When tickCycle runs Then it advances to decompose_review", async () => {
    const server = new FelizServer(makeConfig());
    const anyServer = server as any;
    const db = anyServer.db;

    const project = {
      id: "proj-decomp",
      name: "test-project",
      repo_url: "git@github.com:org/test.git",
      linear_project_name: "Test",
      base_branch: "main",
    };
    db.insertProject(project);
    db.upsertWorkItem({
      id: "wi-decomp",
      linear_id: "lin-decomp",
      linear_identifier: "T-30",
      project_id: project.id,
      parent_work_item_id: null,
      title: "Large feature",
      description: "Break down this epic",
      state: "Todo",
      priority: 1,
      labels: ["epic"],
      blocker_ids: [],
      orchestration_state: "decomposing",
    });

    const repoPath = join(TEST_WORKSPACE_DIR, "test-project", "repo");
    mkdirSync(join(repoPath, ".feliz"), { recursive: true });
    writeFileSync(
      join(repoPath, ".feliz", "config.yml"),
      `specs:
  enabled: false
agent:
  adapter: claude-code
`,
      "utf-8"
    );

    anyServer.workspace = { getRepoPath: () => repoPath };
    const decompAdapter: AgentAdapter = {
      name: "claude-code",
      isAvailable: async () => true,
      execute: async () => ({
        status: "succeeded",
        exitCode: 0,
        stdout: JSON.stringify({
          sub_issues: [
            {
              title: "Part 1",
              description: "First part",
              dependencies: [],
            },
          ],
        }),
        stderr: "",
        filesChanged: [],
      }),
      cancel: async () => {},
    };
    anyServer.adapters = { "claude-code": decompAdapter, codex: decompAdapter };

    await anyServer.tickCycle();

    const wi = db.getWorkItem("wi-decomp");
    expect(wi.orchestration_state).toBe("decompose_review");

    await server.stop();
  });
});
