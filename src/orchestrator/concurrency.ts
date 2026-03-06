import type { Database } from "../db/database.ts";
import type { WorkItem } from "../domain/types.ts";

const TERMINAL_STATES = ["completed", "failed", "cancelled"];

export class ConcurrencyManager {
  private db: Database;
  private maxConcurrent: number;
  private maxPerState: Record<string, number>;

  constructor(
    db: Database,
    maxConcurrent: number,
    maxPerState: Record<string, number> = {}
  ) {
    this.db = db;
    this.maxConcurrent = maxConcurrent;
    this.maxPerState = maxPerState;
  }

  canDispatch(): boolean {
    return this.availableSlots() > 0;
  }

  availableSlots(): number {
    const running = this.db.countRunningItems();
    return Math.max(0, this.maxConcurrent - running);
  }

  canDispatchForState(projectId: string, issueState: string): boolean {
    const limit = this.maxPerState[issueState];
    if (limit === undefined) return true;

    // Count running items that have this Linear issue state
    const running = this.db.listWorkItemsByState(projectId, "running");
    const runningInState = running.filter((wi) => wi.state === issueState);
    return runningInState.length < limit;
  }

  getDispatchableItems(projectId: string): WorkItem[] {
    const queued = this.db.listWorkItemsByState(projectId, "queued");

    return queued.filter((wi) => {
      if (wi.blocker_ids.length === 0) return true;

      // Check that all blockers are in terminal states
      return wi.blocker_ids.every((blockerId) => {
        const blocker = this.db.getWorkItemByLinearId(blockerId);
        if (!blocker) return true; // Unknown blocker, allow dispatch
        return TERMINAL_STATES.includes(blocker.orchestration_state);
      });
    });
  }
}
