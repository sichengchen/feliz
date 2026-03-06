import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  ConcurrencyManager,
} from "../../src/orchestrator/concurrency.ts";
import { Database } from "../../src/db/database.ts";
import { existsSync, unlinkSync } from "fs";

const TEST_DB = "/tmp/feliz-conc-test.db";

describe("ConcurrencyManager", () => {
  let db: Database;

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
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
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  function addWorkItem(id: string, state: string, orchState: string) {
    db.upsertWorkItem({
      id,
      linear_id: `l-${id}`,
      linear_identifier: `T-${id}`,
      project_id: "proj-1",
      parent_work_item_id: null,
      title: `Item ${id}`,
      description: "",
      state,
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: orchState,
    });
  }

  test("allows dispatch when under global limit", () => {
    addWorkItem("1", "Todo", "running");
    addWorkItem("2", "Todo", "running");

    const mgr = new ConcurrencyManager(db, 5);
    expect(mgr.canDispatch()).toBe(true);
    expect(mgr.availableSlots()).toBe(3);
  });

  test("blocks dispatch when at global limit", () => {
    for (let i = 1; i <= 5; i++) {
      addWorkItem(String(i), "Todo", "running");
    }

    const mgr = new ConcurrencyManager(db, 5);
    expect(mgr.canDispatch()).toBe(false);
    expect(mgr.availableSlots()).toBe(0);
  });

  test("respects per-state limits", () => {
    addWorkItem("1", "Todo", "running");
    addWorkItem("2", "Todo", "running");
    addWorkItem("3", "Todo", "queued");

    const mgr = new ConcurrencyManager(db, 10, { Todo: 2 });
    // 2 running items are in "Todo" state, limit is 2
    expect(mgr.canDispatchForState("proj-1", "Todo")).toBe(false);
  });

  test("allows dispatch when under per-state limit", () => {
    addWorkItem("1", "Todo", "running");

    const mgr = new ConcurrencyManager(db, 10, { Todo: 3 });
    expect(mgr.canDispatchForState("proj-1", "Todo")).toBe(true);
  });

  test("getDispatchableItems respects blockers", () => {
    addWorkItem("1", "Todo", "queued");
    addWorkItem("2", "Todo", "queued");
    // Item 2 has blocker
    db.upsertWorkItem({
      id: "2",
      linear_id: "l-2",
      linear_identifier: "T-2",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "Item 2",
      description: "",
      state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: ["l-1"],
      orchestration_state: "queued",
    });
    // Item 1 is not completed, so item 2 is blocked
    const mgr = new ConcurrencyManager(db, 10);
    const items = mgr.getDispatchableItems("proj-1");
    // Only item 1 should be dispatchable (item 2 is blocked)
    expect(items.some((i) => i.id === "1")).toBe(true);
    // Item 2 is blocked because blocker "l-1" corresponds to item 1 which is still queued
    expect(items.some((i) => i.id === "2")).toBe(false);
  });

  test("getDispatchableItems orders by priority then creation time", () => {
    db.upsertWorkItem({
      id: "low",
      linear_id: "l-low",
      linear_identifier: "T-low",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "Low priority",
      description: "",
      state: "Todo",
      priority: 4,
      labels: [],
      blocker_ids: [],
      orchestration_state: "queued",
    });
    db.upsertWorkItem({
      id: "high",
      linear_id: "l-high",
      linear_identifier: "T-high",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "High priority",
      description: "",
      state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: "queued",
    });

    const mgr = new ConcurrencyManager(db, 10);
    const items = mgr.getDispatchableItems("proj-1");
    expect(items[0]!.id).toBe("high");
    expect(items[1]!.id).toBe("low");
  });
});
