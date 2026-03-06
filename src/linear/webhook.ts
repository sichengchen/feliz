import type { Database } from "../db/database.ts";
import type { LinearClient } from "./client.ts";
import { parseCommand, type FelizCommand } from "./commands.ts";
import { newId } from "../id.ts";

export interface AgentSessionEvent {
  action: "created" | "updated";
  type: "AgentSession";
  agentSession: {
    id: string;
    issueId: string;
    issue: {
      id: string;
      identifier: string;
      title: string;
      description: string;
      priority: number;
      state: { name: string };
      labels: { nodes: { name: string }[] };
      project?: { name: string };
      url: string;
    };
    promptContext: string;
    comment?: { body: string };
  };
}

export interface WebhookResult {
  workItemId: string;
  command: FelizCommand | null;
}

export class WebhookHandler {
  private db: Database;
  private linearClient: LinearClient;

  constructor(db: Database, linearClient: LinearClient) {
    this.db = db;
    this.linearClient = linearClient;
  }

  async handleEvent(
    event: AgentSessionEvent,
    projectId: string
  ): Promise<WebhookResult> {
    const session = event.agentSession;
    const issue = session.issue;
    const command = session.comment?.body
      ? parseCommand(session.comment.body)
      : null;

    if (event.action === "created") {
      await this.linearClient.emitThought(session.id, "Looking into this...");
    }

    const existing = this.db.getWorkItemByLinearId(issue.id);
    if (existing) {
      return { workItemId: existing.id, command };
    }

    const workItemId = this.createWorkItem(session, issue, projectId);
    return { workItemId, command };
  }

  private createWorkItem(
    session: AgentSessionEvent["agentSession"],
    issue: AgentSessionEvent["agentSession"]["issue"],
    projectId: string
  ): string {
    const workItemId = newId();
    this.db.upsertWorkItem({
      id: workItemId,
      linear_id: issue.id,
      linear_identifier: issue.identifier,
      project_id: projectId,
      parent_work_item_id: null,
      title: issue.title,
      description: issue.description,
      state: issue.state.name,
      priority: issue.priority,
      labels: issue.labels.nodes.map((l) => l.name),
      blocker_ids: [],
      orchestration_state: "unclaimed",
    });

    this.db.appendHistory({
      id: newId(),
      project_id: projectId,
      work_item_id: workItemId,
      run_id: null,
      event_type: "issue.discovered",
      payload: {
        source: "webhook",
        session_id: session.id,
        linear_id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
      },
    });

    return workItemId;
  }
}
