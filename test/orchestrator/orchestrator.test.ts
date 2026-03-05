import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { Orchestrator } from "../../src/orchestrator/orchestrator.ts";
import { Database } from "../../src/db/database.ts";
import type { AgentAdapter } from "../../src/agents/adapter.ts";
import type { RepoConfig, PipelineDefinition } from "../../src/config/types.ts";
import { existsSync, unlinkSync, mkdirSync, rmSync } from "fs";

const TEST_DB = "/tmp/feliz-orch-test.db";
const TEST_SCRATCH = "/tmp/feliz-orch-scratch";
const TEST_WORK_DIR = "/tmp/feliz-orch-workdir";

function makeSuccessAdapter(): AgentAdapter {
  return {
    name: "test-agent",
    isAvailable: async () => true,
    execute: mock(async () => ({
      status: "succeeded" as const,
      exitCode: 0,
      stdout: "done",
      stderr: "",
      filesChanged: [],
    })),
    cancel: mock(async () => {}),
  };
}

function makeRepoConfig(overrides: Partial<RepoConfig> = {}): RepoConfig {
  return {
    agent: {
      adapter: "test-agent",
      approval_policy: "auto",
      max_turns: 20,
      timeout_ms: 600000,
    },
    hooks: {},
    specs: { enabled: false, directory: "specs", approval_required: true },
    gates: {},
    concurrency: {},
    ...overrides,
  };
}

function makeSimplePipeline(): PipelineDefinition {
  return {
    phases: [
      {
        name: "execute",
        steps: [
          {
            name: "run",
            agent: "test-agent",
            success: { always: true },
          },
        ],
      },
    ],
  };
}

describe("Orchestrator", () => {
  let db: Database;

  beforeEach(() => {
    for (const p of [TEST_DB, TEST_DB + "-wal", TEST_DB + "-shm"]) {
      if (existsSync(p)) unlinkSync(p);
    }
    if (existsSync(TEST_SCRATCH)) rmSync(TEST_SCRATCH, { recursive: true });
    if (existsSync(TEST_WORK_DIR)) rmSync(TEST_WORK_DIR, { recursive: true });
    mkdirSync(TEST_SCRATCH, { recursive: true });
    mkdirSync(TEST_WORK_DIR, { recursive: true });
    db = new Database(TEST_DB);

    db.insertProject({
      id: "proj-1",
      name: "test",
      repo_url: "u",
      linear_project_name: "T",
      base_branch: "main",
    });
  });

  afterEach(() => {
    db.close();
    for (const p of [TEST_DB, TEST_DB + "-wal", TEST_DB + "-shm"]) {
      if (existsSync(p)) unlinkSync(p);
    }
    if (existsSync(TEST_SCRATCH)) rmSync(TEST_SCRATCH, { recursive: true });
    if (existsSync(TEST_WORK_DIR)) rmSync(TEST_WORK_DIR, { recursive: true });
  });

  test("transitions new issue to queued when specs disabled", () => {
    db.upsertWorkItem({
      id: "wi-1",
      linear_id: "l1",
      linear_identifier: "T-1",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "Test",
      description: "",
      state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: "unclaimed",
    });

    const orch = new Orchestrator(
      db,
      { "test-agent": makeSuccessAdapter() },
      makeRepoConfig(),
      TEST_SCRATCH,
      5
    );
    orch.processNewIssue("wi-1");

    const wi = db.getWorkItem("wi-1");
    expect(wi!.orchestration_state).toBe("queued");
  });

  test("transitions new issue to spec_drafting when specs enabled", () => {
    db.upsertWorkItem({
      id: "wi-1",
      linear_id: "l1",
      linear_identifier: "T-1",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "Test",
      description: "",
      state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: "unclaimed",
    });

    const orch = new Orchestrator(
      db,
      { "test-agent": makeSuccessAdapter() },
      makeRepoConfig({
        specs: { enabled: true, directory: "specs", approval_required: true },
      }),
      TEST_SCRATCH,
      5
    );
    orch.processNewIssue("wi-1");

    const wi = db.getWorkItem("wi-1");
    expect(wi!.orchestration_state).toBe("spec_drafting");
  });

  test("dispatches queued item to running", async () => {
    db.upsertWorkItem({
      id: "wi-1",
      linear_id: "l1",
      linear_identifier: "T-1",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "Test",
      description: "",
      state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: "queued",
    });

    const adapter = makeSuccessAdapter();
    const orch = new Orchestrator(
      db,
      { "test-agent": adapter },
      makeRepoConfig(),
      TEST_SCRATCH,
      5
    );

    const dispatched = await orch.dispatchQueued(
      "proj-1",
      makeSimplePipeline(),
      TEST_WORK_DIR
    );

    expect(dispatched).toHaveLength(1);
    const wi = db.getWorkItem("wi-1");
    expect(wi!.orchestration_state).toBe("completed");
  });

  test("respects max_concurrent limit", async () => {
    // Create 2 items
    for (let i = 1; i <= 2; i++) {
      db.upsertWorkItem({
        id: `wi-${i}`,
        linear_id: `l${i}`,
        linear_identifier: `T-${i}`,
        project_id: "proj-1",
        parent_work_item_id: null,
        title: `Item ${i}`,
        description: "",
        state: "Todo",
        priority: i,
        labels: [],
        blocker_ids: [],
        orchestration_state: "queued",
      });
    }

    const adapter = makeSuccessAdapter();
    const orch = new Orchestrator(
      db,
      { "test-agent": adapter },
      makeRepoConfig(),
      TEST_SCRATCH,
      1 // max_concurrent = 1
    );

    // Only 1 should be dispatched at a time
    const dispatched = await orch.dispatchQueued(
      "proj-1",
      makeSimplePipeline(),
      TEST_WORK_DIR
    );

    expect(dispatched).toHaveLength(1);
  });

  test("cancels work item", () => {
    db.upsertWorkItem({
      id: "wi-1",
      linear_id: "l1",
      linear_identifier: "T-1",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "Test",
      description: "",
      state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: "running",
    });

    const orch = new Orchestrator(
      db,
      { "test-agent": makeSuccessAdapter() },
      makeRepoConfig(),
      TEST_SCRATCH,
      5
    );
    orch.cancelWorkItem("wi-1");

    const wi = db.getWorkItem("wi-1");
    expect(wi!.orchestration_state).toBe("cancelled");
  });

  test("computes retry delay with exponential backoff", () => {
    const orch = new Orchestrator(
      db,
      {},
      makeRepoConfig(),
      TEST_SCRATCH,
      5
    );
    const delay1 = orch.computeRetryDelay(1);
    const delay2 = orch.computeRetryDelay(2);
    const delay3 = orch.computeRetryDelay(3);

    // Base delay: 10000 * 2^(attempt-1)
    expect(delay1).toBeGreaterThanOrEqual(10000);
    expect(delay1).toBeLessThanOrEqual(12000); // +jitter up to 2000
    expect(delay2).toBeGreaterThanOrEqual(20000);
    expect(delay3).toBeGreaterThanOrEqual(40000);
  });
});
