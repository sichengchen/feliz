import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { Database } from "../../src/db/database.ts";
import { unlinkSync, existsSync } from "fs";

const TEST_DB = "/tmp/feliz-context-cli-test.db";

describe("context commands", () => {
  let db: Database;

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    db = new Database(TEST_DB);
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
      description: "",
      state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: "running",
    });
  });

  afterEach(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  test("context history returns events for project", () => {
    db.appendHistory({
      id: "h-1",
      project_id: "proj-1",
      work_item_id: "wi-1",
      run_id: null,
      event_type: "issue.discovered",
      payload: { title: "Add login" },
    });
    db.appendHistory({
      id: "h-2",
      project_id: "proj-1",
      work_item_id: null,
      run_id: null,
      event_type: "project.synced",
      payload: {},
    });
    const history = db.getHistory("proj-1");
    expect(history).toHaveLength(2);
    expect(history[0]!.event_type).toBe("issue.discovered");
  });

  test("context show returns latest snapshot for work item", () => {
    db.insertRun({
      id: "run-1",
      work_item_id: "wi-1",
      attempt: 1,
      current_phase: "execute",
      current_step: "run",
      context_snapshot_id: "snap-1",
    });
    db.insertContextSnapshot({
      id: "snap-1",
      run_id: "run-1",
      work_item_id: "wi-1",
      artifact_refs: [
        { artifact_id: "a1", path: "src/auth.ts", content_hash: "abc", version: 1, purpose: "implementation" },
      ],
      token_budget: { max_input: 100000, reserved_system: 5000 },
    });
    const snap = db.getLatestSnapshotForWorkItem("wi-1");
    expect(snap).not.toBeNull();
    expect(snap!.artifact_refs).toHaveLength(1);
    expect(snap!.artifact_refs[0]!.path).toBe("src/auth.ts");
    expect(snap!.token_budget.max_input).toBe(100000);
  });

  test("context show returns null for unknown work item", () => {
    const snap = db.getLatestSnapshotForWorkItem("nonexistent");
    expect(snap).toBeNull();
  });
});
