import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { Database } from "../../src/db/database.ts";
import { IssuePoller } from "../../src/linear/poller.ts";
import type { LinearIssue } from "../../src/linear/client.ts";
import { existsSync, unlinkSync } from "fs";

const TEST_DB = "/tmp/feliz-poller-test.db";

describe("IssuePoller", () => {
  let db: Database;

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    db = new Database(TEST_DB);
    db.insertProject({
      id: "proj-1",
      name: "backend",
      repo_url: "git@github.com:org/backend.git",
      linear_project_name: "Backend API",
      base_branch: "main",
    });
  });

  afterEach(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  function makeIssue(overrides: Partial<LinearIssue> = {}): LinearIssue {
    return {
      id: "lin-1",
      identifier: "BAC-1",
      title: "Add login",
      description: "Implement login flow",
      priority: 1,
      state: "Todo",
      labels: ["feliz"],
      blocker_ids: [],
      branch_name: null,
      url: "https://linear.app/issue/BAC-1",
      ...overrides,
    };
  }

  test("discovers new issue and creates work item", async () => {
    const mockClient = {
      fetchProjectIssues: mock(() =>
        Promise.resolve({
          issues: [makeIssue()],
          rateLimitLow: false,
        })
      ),
    };

    const poller = new IssuePoller(db, mockClient as any);
    const events = await poller.poll("proj-1", "Backend API");

    expect(events).toHaveLength(1);
    expect(events[0]!.event_type).toBe("issue.discovered");

    const wi = db.getWorkItemByLinearId("lin-1");
    expect(wi).not.toBeNull();
    expect(wi!.title).toBe("Add login");
    expect(wi!.orchestration_state).toBe("unclaimed");
  });

  test("detects state change on existing work item", async () => {
    // First poll: create the work item
    const mockClient = {
      fetchProjectIssues: mock(() =>
        Promise.resolve({
          issues: [makeIssue()],
          rateLimitLow: false,
        })
      ),
    };

    const poller = new IssuePoller(db, mockClient as any);
    await poller.poll("proj-1", "Backend API");

    // Second poll: state changed
    mockClient.fetchProjectIssues = mock(() =>
      Promise.resolve({
        issues: [makeIssue({ state: "In Progress" })],
        rateLimitLow: false,
      })
    );
    const events = await poller.poll("proj-1", "Backend API");

    expect(events.some((e) => e.event_type === "issue.state_changed")).toBe(true);
    const stateEvent = events.find((e) => e.event_type === "issue.state_changed");
    expect(stateEvent!.payload.old_state).toBe("Todo");
    expect(stateEvent!.payload.new_state).toBe("In Progress");

    const wi = db.getWorkItemByLinearId("lin-1");
    expect(wi!.state).toBe("In Progress");
  });

  test("detects title/description changes", async () => {
    const mockClient = {
      fetchProjectIssues: mock(() =>
        Promise.resolve({
          issues: [makeIssue()],
          rateLimitLow: false,
        })
      ),
    };

    const poller = new IssuePoller(db, mockClient as any);
    await poller.poll("proj-1", "Backend API");

    mockClient.fetchProjectIssues = mock(() =>
      Promise.resolve({
        issues: [makeIssue({ title: "Add login v2" })],
        rateLimitLow: false,
      })
    );
    const events = await poller.poll("proj-1", "Backend API");

    expect(events.some((e) => e.event_type === "issue.updated")).toBe(true);
    const wi = db.getWorkItemByLinearId("lin-1");
    expect(wi!.title).toBe("Add login v2");
  });

  test("detects label changes", async () => {
    const mockClient = {
      fetchProjectIssues: mock(() =>
        Promise.resolve({
          issues: [makeIssue()],
          rateLimitLow: false,
        })
      ),
    };

    const poller = new IssuePoller(db, mockClient as any);
    await poller.poll("proj-1", "Backend API");

    mockClient.fetchProjectIssues = mock(() =>
      Promise.resolve({
        issues: [makeIssue({ labels: ["feliz", "priority"] })],
        rateLimitLow: false,
      })
    );
    const events = await poller.poll("proj-1", "Backend API");
    expect(events.some((e) => e.event_type === "issue.label_added")).toBe(true);
  });

  test("no events on unchanged issues", async () => {
    const mockClient = {
      fetchProjectIssues: mock(() =>
        Promise.resolve({
          issues: [makeIssue()],
          rateLimitLow: false,
        })
      ),
    };

    const poller = new IssuePoller(db, mockClient as any);
    await poller.poll("proj-1", "Backend API");
    const events = await poller.poll("proj-1", "Backend API");
    expect(events).toHaveLength(0);
  });

  test("handles multiple issues", async () => {
    const mockClient = {
      fetchProjectIssues: mock(() =>
        Promise.resolve({
          issues: [
            makeIssue({ id: "lin-1", identifier: "B-1", title: "A" }),
            makeIssue({ id: "lin-2", identifier: "B-2", title: "B" }),
          ],
          rateLimitLow: false,
        })
      ),
    };

    const poller = new IssuePoller(db, mockClient as any);
    const events = await poller.poll("proj-1", "Backend API");
    expect(events).toHaveLength(2);

    const items = db.listWorkItemsByProject("proj-1");
    expect(items).toHaveLength(2);
  });
});
