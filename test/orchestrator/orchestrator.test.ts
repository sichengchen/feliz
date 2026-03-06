import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { Orchestrator } from "../../src/orchestrator/orchestrator.ts";
import { Database } from "../../src/db/database.ts";
import type { AgentAdapter } from "../../src/agents/adapter.ts";
import type { RepoConfig, PipelineDefinition } from "../../src/config/types.ts";
import { existsSync, unlinkSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

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

function makeFailAdapter(): AgentAdapter {
  return {
    name: "test-agent",
    isAvailable: async () => true,
    execute: mock(async () => ({
      status: "failed" as const,
      exitCode: 1,
      stdout: "",
      stderr: "error",
      filesChanged: [],
    })),
    cancel: mock(async () => {}),
  };
}

function makeCapturingAdapter(calls: string[]): AgentAdapter {
  return {
    name: "test-agent",
    isAvailable: async () => true,
    execute: mock(async (params: { prompt: string }) => {
      calls.push(params.prompt);
      return {
        status: "succeeded" as const,
        exitCode: 0,
        stdout: "done",
        stderr: "",
        filesChanged: [],
      };
    }),
    cancel: mock(async () => {}),
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

function makeFailablePipeline(): PipelineDefinition {
  return {
    phases: [
      {
        name: "execute",
        steps: [
          {
            name: "run",
            agent: "test-agent",
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

  test("does not dispatch queued work item when blocker linear issue is not terminal", async () => {
    db.upsertWorkItem({
      id: "wi-blocker",
      linear_id: "lin-blocker",
      linear_identifier: "T-2",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "Blocker",
      description: "",
      state: "In Progress",
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: "running",
    });

    db.upsertWorkItem({
      id: "wi-blocked",
      linear_id: "lin-blocked",
      linear_identifier: "T-3",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "Blocked item",
      description: "",
      state: "Todo",
      priority: 2,
      labels: [],
      blocker_ids: ["lin-blocker"],
      orchestration_state: "queued",
    });

    const orch = new Orchestrator(
      db,
      { "test-agent": makeSuccessAdapter() },
      makeRepoConfig(),
      TEST_SCRATCH,
      5
    );

    const dispatched = await orch.dispatchQueued(
      "proj-1",
      makeSimplePipeline(),
      TEST_WORK_DIR
    );

    expect(dispatched).toEqual([]);
    const blocked = db.getWorkItem("wi-blocked");
    expect(blocked!.orchestration_state).toBe("queued");
  });

  test("renders step prompt from configured template path", async () => {
    db.upsertWorkItem({
      id: "wi-1",
      linear_id: "l1",
      linear_identifier: "T-1",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "Prompt title",
      description: "Prompt body",
      state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: "queued",
    });

    const promptPath = join(TEST_WORK_DIR, ".feliz", "prompts");
    mkdirSync(promptPath, { recursive: true });
    writeFileSync(
      join(promptPath, "write_code.md"),
      "Issue {{ issue.identifier }}: {{ issue.title }}\n{{ issue.description }}",
      "utf-8"
    );

    const pipeline: PipelineDefinition = {
      phases: [
        {
          name: "implement",
          steps: [
            {
              name: "write_code",
              agent: "test-agent",
              prompt: ".feliz/prompts/write_code.md",
              success: { always: true },
            },
          ],
        },
      ],
    };

    const prompts: string[] = [];
    const orch = new Orchestrator(
      db,
      { "test-agent": makeCapturingAdapter(prompts) },
      makeRepoConfig(),
      TEST_SCRATCH,
      5
    );

    await orch.dispatchQueued("proj-1", pipeline, TEST_WORK_DIR);

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("Issue T-1: Prompt title");
    expect(prompts[0]).toContain("Prompt body");
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

  test("transitions new issue to decomposing when epic label", () => {
    db.upsertWorkItem({
      id: "wi-1",
      linear_id: "l1",
      linear_identifier: "T-1",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "Epic feature",
      description: "",
      state: "Todo",
      priority: 1,
      labels: ["epic"],
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
    expect(wi!.orchestration_state).toBe("decomposing");
  });

  test("transitions to retry_queued when pipeline fails and attempt < max", async () => {
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

    const adapter = makeFailAdapter();
    const orch = new Orchestrator(
      db,
      { "test-agent": adapter },
      makeRepoConfig(),
      TEST_SCRATCH,
      5
    );

    await orch.dispatchQueued("proj-1", makeFailablePipeline(), TEST_WORK_DIR);

    const wi = db.getWorkItem("wi-1");
    expect(wi!.orchestration_state).toBe("retry_queued");

    const runs = db.listRuns();
    const run = runs.find((r) => r.work_item_id === "wi-1");
    expect(run).toBeDefined();
    expect(run!.result).toBe("failed");

    const history = db.getHistory("proj-1", "wi-1");
    const eventTypes = history.map((h) => h.event_type);
    expect(eventTypes).toContain("run.started");
    expect(eventTypes).toContain("run.failed");
  });

  test("promotes retry_queued to queued when retry backoff elapsed", () => {
    db.upsertWorkItem({
      id: "wi-1",
      linear_id: "l1",
      linear_identifier: "T-1",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "Retry item",
      description: "",
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
    db.updateRunResult("run-1", "failed", "error", null);
    db.appendHistory({
      id: "hist-1",
      project_id: "proj-1",
      work_item_id: "wi-1",
      run_id: "run-1",
      event_type: "run.failed",
      payload: {
        attempt: 1,
        retry_ready_at: "2020-01-01T00:00:00.000Z",
      },
    });

    const orch = new Orchestrator(
      db,
      { "test-agent": makeSuccessAdapter() },
      makeRepoConfig(),
      TEST_SCRATCH,
      5
    );

    orch.promoteRetryQueued("proj-1", new Date("2020-01-01T00:00:01.000Z"));

    const wi = db.getWorkItem("wi-1");
    expect(wi!.orchestration_state).toBe("queued");
  });

  test("keeps retry_queued when retry backoff has not elapsed", () => {
    db.upsertWorkItem({
      id: "wi-1",
      linear_id: "l1",
      linear_identifier: "T-1",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "Retry item",
      description: "",
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
    db.updateRunResult("run-1", "failed", "error", null);
    db.appendHistory({
      id: "hist-1",
      project_id: "proj-1",
      work_item_id: "wi-1",
      run_id: "run-1",
      event_type: "run.failed",
      payload: {
        attempt: 1,
        retry_ready_at: "2020-01-01T00:00:10.000Z",
      },
    });

    const orch = new Orchestrator(
      db,
      { "test-agent": makeSuccessAdapter() },
      makeRepoConfig(),
      TEST_SCRATCH,
      5
    );

    orch.promoteRetryQueued("proj-1", new Date("2020-01-01T00:00:01.000Z"));

    const wi = db.getWorkItem("wi-1");
    expect(wi!.orchestration_state).toBe("retry_queued");
  });

  test("transitions to failed when pipeline fails and attempt >= max", async () => {
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

    // Insert 2 prior failed runs so the next attempt will be 3
    db.insertRun({
      id: "run-1",
      work_item_id: "wi-1",
      attempt: 1,
      current_phase: "x",
      current_step: "x",
      context_snapshot_id: "",
    });
    db.updateRunResult("run-1", "failed", "err", null);
    db.insertRun({
      id: "run-2",
      work_item_id: "wi-1",
      attempt: 2,
      current_phase: "x",
      current_step: "x",
      context_snapshot_id: "",
    });
    db.updateRunResult("run-2", "failed", "err", null);

    const adapter = makeFailAdapter();
    const orch = new Orchestrator(
      db,
      { "test-agent": adapter },
      makeRepoConfig(),
      TEST_SCRATCH,
      5
    );

    await orch.dispatchQueued("proj-1", makeFailablePipeline(), TEST_WORK_DIR);

    const wi = db.getWorkItem("wi-1");
    expect(wi!.orchestration_state).toBe("failed");
  });

  test("records run.started and run.completed history events on success", async () => {
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

    await orch.dispatchQueued("proj-1", makeSimplePipeline(), TEST_WORK_DIR);

    const history = db.getHistory("proj-1", "wi-1");
    const eventTypes = history.map((h) => h.event_type);
    expect(eventTypes).toContain("run.started");
    expect(eventTypes).toContain("run.completed");
  });

  test("checkParentCompletion completes parent when all children completed", () => {
    db.upsertWorkItem({
      id: "parent-1",
      linear_id: "lp",
      linear_identifier: "T-P",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "Parent",
      description: "",
      state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: "decompose_review",
    });

    db.upsertWorkItem({
      id: "child-1",
      linear_id: "lc1",
      linear_identifier: "T-C1",
      project_id: "proj-1",
      parent_work_item_id: "parent-1",
      title: "Child 1",
      description: "",
      state: "Done",
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: "completed",
    });

    db.upsertWorkItem({
      id: "child-2",
      linear_id: "lc2",
      linear_identifier: "T-C2",
      project_id: "proj-1",
      parent_work_item_id: "parent-1",
      title: "Child 2",
      description: "",
      state: "Done",
      priority: 2,
      labels: [],
      blocker_ids: [],
      orchestration_state: "completed",
    });

    const orch = new Orchestrator(
      db,
      { "test-agent": makeSuccessAdapter() },
      makeRepoConfig(),
      TEST_SCRATCH,
      5
    );
    orch.checkParentCompletion("parent-1");

    const parent = db.getWorkItem("parent-1");
    expect(parent!.orchestration_state).toBe("completed");

    const history = db.getHistory("proj-1", "parent-1");
    const eventTypes = history.map((h) => h.event_type);
    expect(eventTypes).toContain("parent.auto_completed");
  });

  test("checkParentCompletion does NOT complete parent when children still running", () => {
    db.upsertWorkItem({
      id: "parent-1",
      linear_id: "lp",
      linear_identifier: "T-P",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "Parent",
      description: "",
      state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: "decompose_review",
    });

    db.upsertWorkItem({
      id: "child-1",
      linear_id: "lc1",
      linear_identifier: "T-C1",
      project_id: "proj-1",
      parent_work_item_id: "parent-1",
      title: "Child 1",
      description: "",
      state: "Done",
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: "completed",
    });

    db.upsertWorkItem({
      id: "child-2",
      linear_id: "lc2",
      linear_identifier: "T-C2",
      project_id: "proj-1",
      parent_work_item_id: "parent-1",
      title: "Child 2",
      description: "",
      state: "InProgress",
      priority: 2,
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
    orch.checkParentCompletion("parent-1");

    const parent = db.getWorkItem("parent-1");
    expect(parent!.orchestration_state).toBe("decompose_review");
  });
});
