import type { OrchestrationState } from "../domain/types.ts";

const TRANSITIONS: Record<OrchestrationState, OrchestrationState[]> = {
  unclaimed: ["decomposing", "spec_drafting", "queued", "cancelled"],
  decomposing: ["decompose_review", "cancelled"],
  decompose_review: ["spec_drafting", "queued", "completed", "cancelled"],
  spec_drafting: ["spec_review", "cancelled"],
  spec_review: ["queued", "cancelled"],
  queued: ["running", "cancelled"],
  running: ["completed", "retry_queued", "failed", "cancelled"],
  retry_queued: ["queued", "cancelled"],
  completed: [],
  failed: ["cancelled"],
  cancelled: [],
};

export function getValidTransitions(
  state: OrchestrationState
): OrchestrationState[] {
  return TRANSITIONS[state] ?? [];
}

export function canTransition(
  from: OrchestrationState,
  to: OrchestrationState
): boolean {
  return getValidTransitions(from).includes(to);
}

export function nextStateForNewIssue(
  specsEnabled: boolean,
  isLargeFeature: boolean
): OrchestrationState {
  if (isLargeFeature) return "decomposing";
  if (specsEnabled) return "spec_drafting";
  return "queued";
}
