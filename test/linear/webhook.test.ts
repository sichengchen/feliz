import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { Database } from "../../src/db/database.ts";
import { WebhookHandler, type AgentSessionEvent } from "../../src/linear/webhook.ts";
import { existsSync, unlinkSync } from "fs";

const TEST_DB = "/tmp/feliz-webhook-test.db";

function makeEvent(
  overrides: Partial<AgentSessionEvent> = {}
): AgentSessionEvent {
  return {
    action: "created",
    type: "AgentSession",
    agentSession: {
      id: "session-1",
      issueId: "lin-1",
      issue: {
        id: "lin-1",
        identifier: "BAC-1",
        title: "Add login",
        description: "Implement login flow",
        priority: 1,
        state: { name: "Todo" },
        labels: { nodes: [{ name: "feliz" }] },
        url: "https://linear.app/org/issue/BAC-1",
      },
      promptContext: "",
    },
    ...overrides,
  };
}

function makeLinearClient() {
  return {
    emitThought: mock(async () => {}),
    emitComment: mock(async () => {}),
  };
}

describe("WebhookHandler", () => {
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

  test("creates work item on session created event", async () => {
    const client = makeLinearClient();
    const handler = new WebhookHandler(db, client as any);

    const result = await handler.handleEvent(makeEvent(), "proj-1");

    expect(result.workItemId).toBeDefined();
    expect(result.command).toBeNull();

    const wi = db.getWorkItemByLinearId("lin-1");
    expect(wi).not.toBeNull();
    expect(wi!.title).toBe("Add login");
    expect(wi!.orchestration_state).toBe("unclaimed");
    expect(wi!.labels).toEqual(["feliz"]);
  });

  test("emits thought acknowledgment on session created", async () => {
    const client = makeLinearClient();
    const handler = new WebhookHandler(db, client as any);

    await handler.handleEvent(makeEvent(), "proj-1");

    expect(client.emitThought).toHaveBeenCalledTimes(1);
    expect(client.emitThought).toHaveBeenCalledWith(
      "session-1",
      "Looking into this..."
    );
  });

  test("parses command from comment body", async () => {
    const client = makeLinearClient();
    const handler = new WebhookHandler(db, client as any);

    const event = makeEvent({
      agentSession: {
        ...makeEvent().agentSession,
        comment: { body: "@feliz start" },
      },
    });

    const result = await handler.handleEvent(event, "proj-1");

    expect(result.command).not.toBeNull();
    expect(result.command!.command).toBe("start");
  });

  test("returns existing work item on duplicate session created", async () => {
    const client = makeLinearClient();
    const handler = new WebhookHandler(db, client as any);

    const result1 = await handler.handleEvent(makeEvent(), "proj-1");
    const result2 = await handler.handleEvent(makeEvent(), "proj-1");

    expect(result1.workItemId).toBe(result2.workItemId);
  });

  test("handles updated event for existing work item", async () => {
    const client = makeLinearClient();
    const handler = new WebhookHandler(db, client as any);

    await handler.handleEvent(makeEvent(), "proj-1");

    const updateEvent = makeEvent({
      action: "updated",
      agentSession: {
        ...makeEvent().agentSession,
        comment: { body: "@feliz retry" },
      },
    });

    const result = await handler.handleEvent(updateEvent, "proj-1");
    expect(result.command).not.toBeNull();
    expect(result.command!.command).toBe("retry");
  });

  test("records history on session created", async () => {
    const client = makeLinearClient();
    const handler = new WebhookHandler(db, client as any);

    const result = await handler.handleEvent(makeEvent(), "proj-1");

    const history = db.getHistory("proj-1", result.workItemId);
    expect(history).toHaveLength(1);
    expect(history[0]!.event_type).toBe("issue.discovered");
    expect(history[0]!.payload.source).toBe("webhook");
  });
});
