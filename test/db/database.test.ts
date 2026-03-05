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
});
