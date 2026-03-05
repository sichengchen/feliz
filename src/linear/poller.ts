import type { Database } from "../db/database.ts";
import type { LinearClient, LinearIssue } from "./client.ts";
import { newId } from "../id.ts";

interface PollEvent {
  event_type: string;
  payload: Record<string, unknown>;
}

export class IssuePoller {
  private db: Database;
  private client: LinearClient;

  constructor(db: Database, client: LinearClient) {
    this.db = db;
    this.client = client;
  }

  async poll(projectId: string, projectName: string): Promise<PollEvent[]> {
    const result = await this.client.fetchProjectIssues(projectName);
    const events: PollEvent[] = [];

    for (const issue of result.issues) {
      const existing = this.db.getWorkItemByLinearId(issue.id);

      if (!existing) {
        // New issue discovered
        const workItemId = newId();
        this.db.upsertWorkItem({
          id: workItemId,
          linear_id: issue.id,
          linear_identifier: issue.identifier,
          project_id: projectId,
          parent_work_item_id: null,
          title: issue.title,
          description: issue.description,
          state: issue.state,
          priority: issue.priority,
          labels: issue.labels,
          blocker_ids: issue.blocker_ids,
          orchestration_state: "unclaimed",
        });

        const event = {
          event_type: "issue.discovered",
          payload: {
            work_item_id: workItemId,
            linear_id: issue.id,
            identifier: issue.identifier,
            title: issue.title,
            state: issue.state,
            priority: issue.priority,
            labels: issue.labels,
          },
        };
        events.push(event);
        this.db.appendHistory({
          id: newId(),
          project_id: projectId,
          work_item_id: workItemId,
          run_id: null,
          event_type: event.event_type,
          payload: event.payload,
        });
      } else {
        // Check for changes
        const changes = detectChanges(existing, issue);
        if (changes.length > 0) {
          this.db.upsertWorkItem({
            ...existing,
            title: issue.title,
            description: issue.description,
            state: issue.state,
            priority: issue.priority,
            labels: issue.labels,
            blocker_ids: issue.blocker_ids,
            orchestration_state: existing.orchestration_state,
          });

          for (const change of changes) {
            events.push(change);
            this.db.appendHistory({
              id: newId(),
              project_id: projectId,
              work_item_id: existing.id,
              run_id: null,
              event_type: change.event_type,
              payload: change.payload,
            });
          }
        }
      }
    }

    return events;
  }
}

interface ExistingItem {
  id: string;
  title: string;
  description: string;
  state: string;
  priority: number;
  labels: string[];
}

function detectChanges(
  existing: ExistingItem,
  issue: LinearIssue
): PollEvent[] {
  const events: PollEvent[] = [];

  if (existing.state !== issue.state) {
    events.push({
      event_type: "issue.state_changed",
      payload: {
        work_item_id: existing.id,
        old_state: existing.state,
        new_state: issue.state,
      },
    });
  }

  if (existing.title !== issue.title || existing.description !== issue.description) {
    events.push({
      event_type: "issue.updated",
      payload: {
        work_item_id: existing.id,
        changed_fields: {
          ...(existing.title !== issue.title
            ? { title: { old: existing.title, new: issue.title } }
            : {}),
          ...(existing.description !== issue.description
            ? {
                description: {
                  old: existing.description,
                  new: issue.description,
                },
              }
            : {}),
        },
      },
    });
  }

  // Detect label additions
  const existingLabels = new Set(existing.labels);
  for (const label of issue.labels) {
    if (!existingLabels.has(label)) {
      events.push({
        event_type: "issue.label_added",
        payload: {
          work_item_id: existing.id,
          label,
        },
      });
    }
  }

  // Detect label removals
  const newLabels = new Set(issue.labels);
  for (const label of existing.labels) {
    if (!newLabels.has(label)) {
      events.push({
        event_type: "issue.label_removed",
        payload: {
          work_item_id: existing.id,
          label,
        },
      });
    }
  }

  return events;
}
