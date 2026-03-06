import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { Database } from "../../src/db/database.ts";
import { unlinkSync, existsSync } from "fs";

const TEST_DB = "/tmp/feliz-test.db";

describe("Database", () => {
  let db: Database;

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    db = new Database(TEST_DB);
  });

  afterEach(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  test("creates tables on init", () => {
    const tables = db.listTables();
    expect(tables).toContain("projects");
    expect(tables).toContain("work_items");
    expect(tables).toContain("runs");
    expect(tables).toContain("step_executions");
    expect(tables).toContain("history");
    expect(tables).toContain("context_snapshots");
    expect(tables).toContain("scratchpad");
  });

  // Project CRUD
  test("inserts and retrieves a project", () => {
    db.insertProject({
      id: "proj-1",
      name: "backend",
      repo_url: "git@github.com:org/backend.git",
      linear_project_name: "Backend",
      base_branch: "main",
    });
    const project = db.getProject("proj-1");
    expect(project).not.toBeNull();
    expect(project!.name).toBe("backend");
    expect(project!.repo_url).toBe("git@github.com:org/backend.git");
  });

  test("returns null for missing project", () => {
    const project = db.getProject("nonexistent");
    expect(project).toBeNull();
  });

  test("lists all projects", () => {
    db.insertProject({
      id: "p1",
      name: "a",
      repo_url: "git@a.git",
      linear_project_name: "A",
      base_branch: "main",
    });
    db.insertProject({
      id: "p2",
      name: "b",
      repo_url: "git@b.git",
      linear_project_name: "B",
      base_branch: "main",
    });
    const projects = db.listProjects();
    expect(projects).toHaveLength(2);
  });

  // WorkItem CRUD
  test("inserts and retrieves a work item", () => {
    db.insertProject({
      id: "proj-1",
      name: "backend",
      repo_url: "u",
      linear_project_name: "B",
      base_branch: "main",
    });
    db.upsertWorkItem({
      id: "wi-1",
      linear_id: "lin-1",
      linear_identifier: "BAC-1",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "Add login",
      description: "Implement login",
      state: "Todo",
      priority: 1,
      labels: ["feliz"],
      blocker_ids: [],
      orchestration_state: "unclaimed",
    });
    const item = db.getWorkItem("wi-1");
    expect(item).not.toBeNull();
    expect(item!.title).toBe("Add login");
    expect(item!.labels).toEqual(["feliz"]);
    expect(item!.orchestration_state).toBe("unclaimed");
  });

  test("upserts work item (update on conflict)", () => {
    db.insertProject({
      id: "proj-1",
      name: "b",
      repo_url: "u",
      linear_project_name: "B",
      base_branch: "main",
    });
    db.upsertWorkItem({
      id: "wi-1",
      linear_id: "lin-1",
      linear_identifier: "BAC-1",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "Add login",
      description: "v1",
      state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: "unclaimed",
    });
    db.upsertWorkItem({
      id: "wi-1",
      linear_id: "lin-1",
      linear_identifier: "BAC-1",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "Add login v2",
      description: "v2",
      state: "In Progress",
      priority: 2,
      labels: ["updated"],
      blocker_ids: ["wi-2"],
      orchestration_state: "queued",
    });
    const item = db.getWorkItem("wi-1");
    expect(item!.title).toBe("Add login v2");
    expect(item!.state).toBe("In Progress");
    expect(item!.orchestration_state).toBe("queued");
  });

  test("finds work item by linear_id", () => {
    db.insertProject({
      id: "proj-1",
      name: "b",
      repo_url: "u",
      linear_project_name: "B",
      base_branch: "main",
    });
    db.upsertWorkItem({
      id: "wi-1",
      linear_id: "lin-uuid-1",
      linear_identifier: "BAC-1",
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
    const item = db.getWorkItemByLinearId("lin-uuid-1");
    expect(item).not.toBeNull();
    expect(item!.id).toBe("wi-1");
  });

  test("lists work items by project", () => {
    db.insertProject({
      id: "proj-1",
      name: "b",
      repo_url: "u",
      linear_project_name: "B",
      base_branch: "main",
    });
    db.upsertWorkItem({
      id: "wi-1",
      linear_id: "l1",
      linear_identifier: "B-1",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "A",
      description: "",
      state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: "unclaimed",
    });
    db.upsertWorkItem({
      id: "wi-2",
      linear_id: "l2",
      linear_identifier: "B-2",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "B",
      description: "",
      state: "Todo",
      priority: 2,
      labels: [],
      blocker_ids: [],
      orchestration_state: "queued",
    });
    const items = db.listWorkItemsByProject("proj-1");
    expect(items).toHaveLength(2);
  });

  // History
  test("appends and queries history", () => {
    db.appendHistory({
      id: "h-1",
      project_id: "proj-1",
      work_item_id: "wi-1",
      run_id: null,
      event_type: "issue.discovered",
      payload: { title: "Test" },
    });
    db.appendHistory({
      id: "h-2",
      project_id: "proj-1",
      work_item_id: "wi-1",
      run_id: null,
      event_type: "issue.updated",
      payload: { state: "In Progress" },
    });
    const entries = db.getHistory("proj-1", "wi-1");
    expect(entries).toHaveLength(2);
    expect(entries[0]!.event_type).toBe("issue.discovered");
    expect(entries[1]!.event_type).toBe("issue.updated");
  });

  // Run CRUD
  function seedProjectAndWorkItem() {
    db.insertProject({
      id: "proj-1",
      name: "backend",
      repo_url: "u",
      linear_project_name: "B",
      base_branch: "main",
    });
    db.upsertWorkItem({
      id: "wi-1",
      linear_id: "lin-1",
      linear_identifier: "B-1",
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
  }

  function seedRun() {
    seedProjectAndWorkItem();
    db.insertRun({
      id: "run-1",
      work_item_id: "wi-1",
      attempt: 1,
      current_phase: "execute",
      current_step: "run",
      context_snapshot_id: "snap-1",
    });
  }

  test("inserts and retrieves a run", () => {
    seedProjectAndWorkItem();
    db.insertRun({
      id: "run-1",
      work_item_id: "wi-1",
      attempt: 1,
      current_phase: "execute",
      current_step: "run",
      context_snapshot_id: "snap-1",
    });
    const run = db.getRun("run-1");
    expect(run).not.toBeNull();
    expect(run!.attempt).toBe(1);
    expect(run!.result).toBeNull();
  });

  test("updates run result", () => {
    seedRun();
    db.updateRunResult("run-1", "succeeded", null, "https://github.com/pr/1");
    const run = db.getRun("run-1");
    expect(run!.result).toBe("succeeded");
    expect(run!.pr_url).toBe("https://github.com/pr/1");
    expect(run!.finished_at).not.toBeNull();
  });

  // StepExecution CRUD
  test("inserts and retrieves step execution", () => {
    seedRun();
    db.insertStepExecution({
      id: "se-1",
      run_id: "run-1",
      phase_name: "implement",
      step_name: "write_code",
      cycle: 1,
      step_attempt: 1,
      agent_adapter: "claude-code",
    });
    const step = db.getStepExecution("se-1");
    expect(step).not.toBeNull();
    expect(step!.phase_name).toBe("implement");
    expect(step!.result).toBeNull();
  });

  test("updates step execution result", () => {
    seedRun();
    db.insertStepExecution({
      id: "se-1",
      run_id: "run-1",
      phase_name: "implement",
      step_name: "write_code",
      cycle: 1,
      step_attempt: 1,
      agent_adapter: "claude-code",
    });
    db.updateStepResult("se-1", "succeeded", 0, null);
    const step = db.getStepExecution("se-1");
    expect(step!.result).toBe("succeeded");
    expect(step!.exit_code).toBe(0);
    expect(step!.finished_at).not.toBeNull();
  });

  // listRuns
  test("lists all runs ordered by started_at DESC", () => {
    seedProjectAndWorkItem();
    db.insertRun({
      id: "run-1",
      work_item_id: "wi-1",
      attempt: 1,
      current_phase: "execute",
      current_step: "run",
      context_snapshot_id: "snap-1",
    });
    db.insertRun({
      id: "run-2",
      work_item_id: "wi-1",
      attempt: 2,
      current_phase: "execute",
      current_step: "run",
      context_snapshot_id: "snap-2",
    });
    const runs = db.listRuns();
    expect(runs).toHaveLength(2);
    expect(runs[0]!.id).toBe("run-2");
    expect(runs[1]!.id).toBe("run-1");
  });

  test("listRuns respects limit", () => {
    seedProjectAndWorkItem();
    db.insertRun({
      id: "run-1",
      work_item_id: "wi-1",
      attempt: 1,
      current_phase: "execute",
      current_step: "run",
      context_snapshot_id: "snap-1",
    });
    db.insertRun({
      id: "run-2",
      work_item_id: "wi-1",
      attempt: 2,
      current_phase: "execute",
      current_step: "run",
      context_snapshot_id: "snap-2",
    });
    const runs = db.listRuns(1);
    expect(runs).toHaveLength(1);
  });

  // getWorkItemByLinearIdentifier
  test("finds work item by linear_identifier", () => {
    seedProjectAndWorkItem();
    const item = db.getWorkItemByLinearIdentifier("B-1");
    expect(item).not.toBeNull();
    expect(item!.id).toBe("wi-1");
  });

  test("returns null for missing linear_identifier", () => {
    const item = db.getWorkItemByLinearIdentifier("NOPE-999");
    expect(item).toBeNull();
  });

  // Context snapshots
  test("inserts and retrieves a context snapshot", () => {
    seedRun();
    db.insertContextSnapshot({
      id: "snap-1",
      run_id: "run-1",
      work_item_id: "wi-1",
      artifact_refs: [{ artifact_id: "a1", path: "/f.ts", content_hash: "h", version: 1, purpose: "code" }],
      token_budget: { max_input: 100000, reserved_system: 5000 },
    });
    const snap = db.getContextSnapshot("snap-1");
    expect(snap).not.toBeNull();
    expect(snap!.work_item_id).toBe("wi-1");
    expect(snap!.artifact_refs).toHaveLength(1);
    expect(snap!.token_budget.max_input).toBe(100000);
  });

  test("gets latest snapshot for work item", () => {
    seedRun();
    db.insertContextSnapshot({
      id: "snap-1",
      run_id: "run-1",
      work_item_id: "wi-1",
      artifact_refs: [],
      token_budget: { max_input: 100000, reserved_system: 5000 },
    });
    db.insertContextSnapshot({
      id: "snap-2",
      run_id: "run-1",
      work_item_id: "wi-1",
      artifact_refs: [{ artifact_id: "a1", path: "/f.ts", content_hash: "h", version: 1, purpose: "code" }],
      token_budget: { max_input: 200000, reserved_system: 5000 },
    });
    const snap = db.getLatestSnapshotForWorkItem("wi-1");
    expect(snap).not.toBeNull();
    expect(snap!.id).toBe("snap-2");
  });

  test("returns null for missing snapshot", () => {
    const snap = db.getContextSnapshot("nonexistent");
    expect(snap).toBeNull();
  });

  // listWorkItemsByState
  test("lists work items by orchestration state", () => {
    db.insertProject({
      id: "proj-1",
      name: "b",
      repo_url: "u",
      linear_project_name: "B",
      base_branch: "main",
    });
    db.upsertWorkItem({
      id: "wi-1",
      linear_id: "l1",
      linear_identifier: "B-1",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "A",
      description: "",
      state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: "queued",
    });
    db.upsertWorkItem({
      id: "wi-2",
      linear_id: "l2",
      linear_identifier: "B-2",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "B",
      description: "",
      state: "Todo",
      priority: 2,
      labels: [],
      blocker_ids: [],
      orchestration_state: "running",
    });
    const queued = db.listWorkItemsByState("proj-1", "queued");
    expect(queued).toHaveLength(1);
    expect(queued[0]!.id).toBe("wi-1");
    const running = db.listWorkItemsByState("proj-1", "running");
    expect(running).toHaveLength(1);
    expect(running[0]!.id).toBe("wi-2");
  });

  // countRunningItems
  test("counts running items across all projects", () => {
    db.insertProject({
      id: "proj-1",
      name: "a",
      repo_url: "u",
      linear_project_name: "A",
      base_branch: "main",
    });
    db.insertProject({
      id: "proj-2",
      name: "b",
      repo_url: "u2",
      linear_project_name: "B",
      base_branch: "main",
    });
    db.upsertWorkItem({
      id: "wi-1",
      linear_id: "l1",
      linear_identifier: "A-1",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "A",
      description: "",
      state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: "running",
    });
    db.upsertWorkItem({
      id: "wi-2",
      linear_id: "l2",
      linear_identifier: "B-1",
      project_id: "proj-2",
      parent_work_item_id: null,
      title: "B",
      description: "",
      state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: "running",
    });
    db.upsertWorkItem({
      id: "wi-3",
      linear_id: "l3",
      linear_identifier: "A-2",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "C",
      description: "",
      state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: "queued",
    });
    expect(db.countRunningItems()).toBe(2);
  });

  // countRunningItemsByProject
  test("counts running items for a specific project", () => {
    db.insertProject({
      id: "proj-1",
      name: "a",
      repo_url: "u",
      linear_project_name: "A",
      base_branch: "main",
    });
    db.insertProject({
      id: "proj-2",
      name: "b",
      repo_url: "u2",
      linear_project_name: "B",
      base_branch: "main",
    });
    db.upsertWorkItem({
      id: "wi-1",
      linear_id: "l1",
      linear_identifier: "A-1",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "A",
      description: "",
      state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: "running",
    });
    db.upsertWorkItem({
      id: "wi-2",
      linear_id: "l2",
      linear_identifier: "B-1",
      project_id: "proj-2",
      parent_work_item_id: null,
      title: "B",
      description: "",
      state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: "running",
    });
    expect(db.countRunningItemsByProject("proj-1")).toBe(1);
    expect(db.countRunningItemsByProject("proj-2")).toBe(1);
  });

  // updateRunProgress
  test("updates run progress", () => {
    seedRun();
    db.updateRunProgress("run-1", "review", "check");
    const run = db.getRun("run-1");
    expect(run!.current_phase).toBe("review");
    expect(run!.current_step).toBe("check");
  });

  // listChildWorkItems
  test("lists child work items", () => {
    db.insertProject({
      id: "proj-1",
      name: "b",
      repo_url: "u",
      linear_project_name: "B",
      base_branch: "main",
    });
    db.upsertWorkItem({
      id: "parent",
      linear_id: "lp",
      linear_identifier: "B-0",
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
      linear_identifier: "B-1",
      project_id: "proj-1",
      parent_work_item_id: "parent",
      title: "Child 1",
      description: "",
      state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: "queued",
    });
    db.upsertWorkItem({
      id: "child-2",
      linear_id: "lc2",
      linear_identifier: "B-2",
      project_id: "proj-1",
      parent_work_item_id: "parent",
      title: "Child 2",
      description: "",
      state: "Todo",
      priority: 2,
      labels: [],
      blocker_ids: [],
      orchestration_state: "queued",
    });
    db.upsertWorkItem({
      id: "other",
      linear_id: "lo",
      linear_identifier: "B-3",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "Other",
      description: "",
      state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: "queued",
    });
    const children = db.listChildWorkItems("parent");
    expect(children).toHaveLength(2);
    expect(children[0]!.title).toBe("Child 1");
    expect(children[1]!.title).toBe("Child 2");
  });

  // listStepExecutionsForRun
  test("lists step executions for a run in order", () => {
    seedRun();
    db.insertStepExecution({
      id: "se-1",
      run_id: "run-1",
      phase_name: "execute",
      step_name: "write_code",
      cycle: 1,
      step_attempt: 1,
      agent_adapter: "claude-code",
    });
    db.insertStepExecution({
      id: "se-2",
      run_id: "run-1",
      phase_name: "execute",
      step_name: "run_tests",
      cycle: 1,
      step_attempt: 1,
      agent_adapter: "claude-code",
    });
    const steps = db.listStepExecutionsForRun("run-1");
    expect(steps).toHaveLength(2);
    expect(steps[0]!.step_name).toBe("write_code");
    expect(steps[1]!.step_name).toBe("run_tests");
  });

  // getProjectByName
  test("gets project by name", () => {
    db.insertProject({
      id: "proj-1",
      name: "backend",
      repo_url: "u",
      linear_project_name: "B",
      base_branch: "main",
    });
    const project = db.getProjectByName("backend");
    expect(project).not.toBeNull();
    expect(project!.id).toBe("proj-1");
    const missing = db.getProjectByName("nonexistent");
    expect(missing).toBeNull();
  });

  // getLatestRunForWorkItem
  test("gets latest run for work item", () => {
    seedProjectAndWorkItem();
    db.insertRun({
      id: "run-1",
      work_item_id: "wi-1",
      attempt: 1,
      current_phase: "execute",
      current_step: "run",
      context_snapshot_id: "snap-1",
    });
    db.insertRun({
      id: "run-2",
      work_item_id: "wi-1",
      attempt: 2,
      current_phase: "execute",
      current_step: "run",
      context_snapshot_id: "snap-2",
    });
    const latest = db.getLatestRunForWorkItem("wi-1");
    expect(latest).not.toBeNull();
    expect(latest!.id).toBe("run-2");
    expect(latest!.attempt).toBe(2);
  });
});
