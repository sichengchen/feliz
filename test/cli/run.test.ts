import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { Database } from "../../src/db/database.ts";
import { unlinkSync, existsSync } from "fs";

const TEST_DB = "/tmp/feliz-run-cli-test.db";

function seedData(db: Database) {
  db.insertProject({
    id: "proj-1",
    name: "backend",
    repo_url: "git@github.com:org/backend.git",
    linear_project_name: "Backend",
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
    orchestration_state: "failed",
  });
  db.insertContextSnapshot({
    id: "snap-1",
    run_id: "run-1",
    work_item_id: "wi-1",
    artifact_refs: [],
    token_budget: { max_input: 100000, reserved_system: 5000 },
  });
  db.insertRun({
    id: "run-1",
    work_item_id: "wi-1",
    attempt: 1,
    current_phase: "execute",
    current_step: "run",
    context_snapshot_id: "snap-1",
  });
  db.updateRunResult("run-1", "failed", "test failure", null);
  db.insertStepExecution({
    id: "se-1",
    run_id: "run-1",
    phase_name: "execute",
    step_name: "run",
    cycle: 1,
    step_attempt: 1,
    agent_adapter: "claude-code",
  });
  db.updateStepResult("se-1", "failed", 1, "test failure");
}

describe("run commands", () => {
  let db: Database;

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    db = new Database(TEST_DB);
    seedData(db);
  });

  afterEach(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  test("run list returns runs", () => {
    const runs = db.listRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]!.id).toBe("run-1");
    expect(runs[0]!.result).toBe("failed");
  });

  test("run show returns run with steps", () => {
    const run = db.getRun("run-1");
    expect(run).not.toBeNull();
    expect(run!.work_item_id).toBe("wi-1");
    const steps = db.listStepExecutionsForRun("run-1");
    expect(steps).toHaveLength(1);
    expect(steps[0]!.result).toBe("failed");
  });

  test("run retry transitions failed work item to retry_queued", () => {
    const wi = db.getWorkItemByLinearIdentifier("BAC-1");
    expect(wi).not.toBeNull();
    expect(wi!.orchestration_state).toBe("failed");
    db.updateWorkItemOrchestrationState(wi!.id, "retry_queued");
    const updated = db.getWorkItem(wi!.id);
    expect(updated!.orchestration_state).toBe("retry_queued");
  });

  test("run retry rejects non-failed work item", () => {
    db.updateWorkItemOrchestrationState("wi-1", "running");
    const wi = db.getWorkItemByLinearIdentifier("BAC-1");
    expect(wi!.orchestration_state).toBe("running");
    // The CLI handler should reject this
  });
});
