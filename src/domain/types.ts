export interface Project {
  id: string;
  name: string;
  repo_url: string;
  linear_project_name: string;
  base_branch: string;
  created_at: Date;
}

export type OrchestrationState =
  | "unclaimed"
  | "decomposing"
  | "decompose_review"
  | "spec_drafting"
  | "spec_review"
  | "queued"
  | "running"
  | "retry_queued"
  | "completed"
  | "failed"
  | "cancelled";

export interface WorkItem {
  id: string;
  linear_id: string;
  linear_identifier: string;
  project_id: string;
  parent_work_item_id: string | null;
  title: string;
  description: string;
  state: string;
  priority: number;
  labels: string[];
  blocker_ids: string[];
  orchestration_state: OrchestrationState;
  created_at: Date;
  updated_at: Date;
}

export type RunResult = "succeeded" | "failed" | "timed_out" | "cancelled";

export interface Run {
  id: string;
  work_item_id: string;
  attempt: number;
  current_phase: string;
  current_step: string;
  started_at: Date;
  finished_at: Date | null;
  result: RunResult | null;
  failure_reason: string | null;
  context_snapshot_id: string;
  pr_url: string | null;
  token_usage: { input: number; output: number } | null;
}

export type StepResult = "succeeded" | "failed" | "timed_out" | "cancelled";

export interface StepExecution {
  id: string;
  run_id: string;
  phase_name: string;
  step_name: string;
  cycle: number;
  step_attempt: number;
  agent_adapter: string | null;
  started_at: Date;
  finished_at: Date | null;
  result: StepResult | null;
  exit_code: number | null;
  failure_reason: string | null;
  token_usage: { input: number; output: number } | null;
}

export interface ContextSnapshot {
  id: string;
  run_id: string;
  work_item_id: string;
  artifact_refs: ArtifactRef[];
  token_budget: {
    max_input: number;
    reserved_system: number;
  };
  created_at: Date;
}

export interface ArtifactRef {
  artifact_id: string;
  path: string;
  content_hash: string;
  version: number;
  purpose: string;
}

export interface HistoryEntry {
  id: string;
  project_id: string;
  work_item_id: string | null;
  run_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: Date;
}
