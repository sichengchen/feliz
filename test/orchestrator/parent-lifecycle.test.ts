import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { Orchestrator } from "../../src/orchestrator/orchestrator.ts";
import { Database } from "../../src/db/database.ts";
import type { AgentAdapter } from "../../src/agents/adapter.ts";
import type { RepoConfig, PipelineDefinition } from "../../src/config/types.ts";
import { existsSync, unlinkSync, mkdirSync, rmSync } from "fs";

const TEST_DB = "/tmp/feliz-parent-test.db";
const TEST_SCRATCH = "/tmp/feliz-parent-scratch";
const TEST_WORK_DIR = "/tmp/feliz-parent-workdir";

function makeAdapter(): AgentAdapter {
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

function makeRepoConfig(): RepoConfig {
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
  };
}

function makeSimplePipeline(): PipelineDefinition {
  return {
    phases: [
      {
        name: "execute",
        steps: [
          { name: "run", agent: "test-agent", success: { always: true } },
        ],
      },
    ],
  };
}

describe("Parent issue lifecycle", () => {
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

    // Parent work item (epic)
    db.upsertWorkItem({
      id: "parent-1",
      linear_id: "lp",
      linear_identifier: "T-1",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "Epic feature",
      description: "Big thing",
      state: "Todo",
      priority: 1,
      labels: ["epic"],
      blocker_ids: [],
      orchestration_state: "decompose_review",
    });

    // Sub-issue 1
    db.upsertWorkItem({
      id: "child-1",
      linear_id: "lc1",
      linear_identifier: "T-2",
      project_id: "proj-1",
      parent_work_item_id: "parent-1",
      title: "Sub 1",
      description: "",
      state: "Todo",
      priority: 1,
      labels: ["feliz:sub-issue"],
      blocker_ids: [],
      orchestration_state: "queued",
    });

    // Sub-issue 2
    db.upsertWorkItem({
      id: "child-2",
      linear_id: "lc2",
      linear_identifier: "T-3",
      project_id: "proj-1",
      parent_work_item_id: "parent-1",
      title: "Sub 2",
      description: "",
      state: "Todo",
      priority: 2,
      labels: ["feliz:sub-issue"],
      blocker_ids: [],
      orchestration_state: "queued",
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

  test("parent auto-completes when all children are completed", async () => {
    const orch = new Orchestrator(
      db,
      { "test-agent": makeAdapter() },
      makeRepoConfig(),
      TEST_SCRATCH,
      5
    );

    // A single dispatch cycle can process all queued children.
    await orch.dispatchQueued("proj-1", makeSimplePipeline(), TEST_WORK_DIR);
    expect(db.getWorkItem("child-1")!.orchestration_state).toBe("completed");
    expect(db.getWorkItem("child-2")!.orchestration_state).toBe("completed");
    expect(db.getWorkItem("parent-1")!.orchestration_state).toBe("completed");
  });

  test("parent does NOT auto-complete when some children are still running", () => {
    db.updateWorkItemOrchestrationState("child-1", "completed");
    db.updateWorkItemOrchestrationState("child-2", "running");

    const orch = new Orchestrator(
      db,
      { "test-agent": makeAdapter() },
      makeRepoConfig(),
      TEST_SCRATCH,
      5
    );

    orch.checkParentCompletion("parent-1");
    expect(db.getWorkItem("parent-1")!.orchestration_state).toBe(
      "decompose_review"
    );
  });

  test("parent does NOT auto-complete when some children have failed", () => {
    db.updateWorkItemOrchestrationState("child-1", "completed");
    db.updateWorkItemOrchestrationState("child-2", "failed");

    const orch = new Orchestrator(
      db,
      { "test-agent": makeAdapter() },
      makeRepoConfig(),
      TEST_SCRATCH,
      5
    );

    orch.checkParentCompletion("parent-1");
    expect(db.getWorkItem("parent-1")!.orchestration_state).toBe(
      "decompose_review"
    );
  });
});

describe("Blocker enforcement", () => {
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

  test("does not dispatch queued item with non-terminal blockers", async () => {
    // Blocker still running
    db.upsertWorkItem({
      id: "blocker-1",
      linear_id: "lb",
      linear_identifier: "T-1",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "Blocker",
      description: "",
      state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: "running",
    });

    // Blocked item
    db.upsertWorkItem({
      id: "blocked-1",
      linear_id: "lbl",
      linear_identifier: "T-2",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "Blocked",
      description: "",
      state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: ["lb"],
      orchestration_state: "queued",
    });

    const orch = new Orchestrator(
      db,
      { "test-agent": makeAdapter() },
      makeRepoConfig(),
      TEST_SCRATCH,
      5
    );

    const dispatched = await orch.dispatchQueued(
      "proj-1",
      makeSimplePipeline(),
      TEST_WORK_DIR
    );

    expect(dispatched).toHaveLength(0);
    expect(db.getWorkItem("blocked-1")!.orchestration_state).toBe("queued");
  });

  test("dispatches item when all blockers are in terminal state", async () => {
    // Blocker completed
    db.upsertWorkItem({
      id: "blocker-1",
      linear_id: "lb",
      linear_identifier: "T-1",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "Blocker",
      description: "",
      state: "Done",
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: "completed",
    });

    // Blocked item
    db.upsertWorkItem({
      id: "blocked-1",
      linear_id: "lbl",
      linear_identifier: "T-2",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "Blocked",
      description: "",
      state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: ["lb"],
      orchestration_state: "queued",
    });

    const orch = new Orchestrator(
      db,
      { "test-agent": makeAdapter() },
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
    expect(db.getWorkItem("blocked-1")!.orchestration_state).toBe("completed");
  });
});
