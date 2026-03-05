import { describe, expect, test } from "bun:test";
import type {
  Project,
  WorkItem,
  Run,
  StepExecution,
  OrchestrationState,
  HistoryEntry,
} from "../../src/domain/types.ts";

describe("Domain Types", () => {
  test("Project has required fields", () => {
    const project: Project = {
      id: "proj-1",
      name: "backend-api",
      repo_url: "git@github.com:org/backend-api.git",
      linear_project_name: "Backend API",
      base_branch: "main",
      created_at: new Date(),
    };
    expect(project.id).toBe("proj-1");
    expect(project.name).toBe("backend-api");
  });

  test("WorkItem has required fields", () => {
    const item: WorkItem = {
      id: "wi-1",
      linear_id: "lin-uuid-1",
      linear_identifier: "BAC-123",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "Add login",
      description: "Implement login flow",
      state: "Todo",
      priority: 1,
      labels: ["feliz"],
      blocker_ids: [],
      orchestration_state: "unclaimed",
      created_at: new Date(),
      updated_at: new Date(),
    };
    expect(item.orchestration_state).toBe("unclaimed");
    expect(item.parent_work_item_id).toBeNull();
  });

  test("OrchestrationState covers all valid states", () => {
    const states: OrchestrationState[] = [
      "unclaimed",
      "decomposing",
      "decompose_review",
      "spec_drafting",
      "spec_review",
      "queued",
      "running",
      "retry_queued",
      "completed",
      "failed",
      "cancelled",
    ];
    expect(states).toHaveLength(11);
  });

  test("Run tracks pipeline execution", () => {
    const run: Run = {
      id: "run-1",
      work_item_id: "wi-1",
      attempt: 1,
      current_phase: "implement",
      current_step: "write_code",
      started_at: new Date(),
      finished_at: null,
      result: null,
      failure_reason: null,
      context_snapshot_id: "snap-1",
      pr_url: null,
      token_usage: null,
    };
    expect(run.result).toBeNull();
    expect(run.attempt).toBe(1);
  });

  test("StepExecution tracks individual step", () => {
    const step: StepExecution = {
      id: "step-1",
      run_id: "run-1",
      phase_name: "implement",
      step_name: "write_code",
      cycle: 1,
      step_attempt: 1,
      agent_adapter: "claude-code",
      started_at: new Date(),
      finished_at: null,
      result: null,
      exit_code: null,
      failure_reason: null,
      token_usage: null,
    };
    expect(step.cycle).toBe(1);
    expect(step.agent_adapter).toBe("claude-code");
  });

  test("HistoryEntry is append-only event", () => {
    const entry: HistoryEntry = {
      id: "hist-1",
      project_id: "proj-1",
      work_item_id: "wi-1",
      run_id: null,
      event_type: "issue.discovered",
      payload: { title: "Add login", state: "Todo" },
      created_at: new Date(),
    };
    expect(entry.event_type).toBe("issue.discovered");
  });
});
