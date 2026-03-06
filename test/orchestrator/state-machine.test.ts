import { describe, expect, test } from "bun:test";
import {
  getValidTransitions,
  canTransition,
  nextStateForNewIssue,
} from "../../src/orchestrator/state-machine.ts";
import type { OrchestrationState } from "../../src/domain/types.ts";

describe("State Machine", () => {
  describe("getValidTransitions", () => {
    test("unclaimed can go to decomposing, spec_drafting, or queued", () => {
      const transitions = getValidTransitions("unclaimed");
      expect(transitions).toContain("decomposing");
      expect(transitions).toContain("spec_drafting");
      expect(transitions).toContain("queued");
      expect(transitions).toContain("cancelled");
    });

    test("queued can go to running or cancelled", () => {
      const transitions = getValidTransitions("queued");
      expect(transitions).toContain("running");
      expect(transitions).toContain("cancelled");
    });

    test("running can go to completed, retry_queued, failed, or cancelled", () => {
      const transitions = getValidTransitions("running");
      expect(transitions).toContain("completed");
      expect(transitions).toContain("retry_queued");
      expect(transitions).toContain("failed");
      expect(transitions).toContain("cancelled");
    });

    test("retry_queued can go to queued or cancelled", () => {
      const transitions = getValidTransitions("retry_queued");
      expect(transitions).toContain("queued");
      expect(transitions).toContain("cancelled");
    });

    test("completed has no transitions", () => {
      expect(getValidTransitions("completed")).toHaveLength(0);
    });

    test("failed can go to cancelled", () => {
      const transitions = getValidTransitions("failed");
      expect(transitions).toContain("cancelled");
    });

    test("cancelled has no transitions", () => {
      expect(getValidTransitions("cancelled")).toHaveLength(0);
    });
  });

  describe("canTransition", () => {
    test("allows valid transition", () => {
      expect(canTransition("unclaimed", "queued")).toBe(true);
    });

    test("rejects invalid transition", () => {
      expect(canTransition("completed", "running")).toBe(false);
    });

    test("rejects same-state transition", () => {
      expect(canTransition("running", "running")).toBe(false);
    });
  });

  describe("nextStateForNewIssue", () => {
    test("goes to queued when specs disabled and not large feature", () => {
      expect(nextStateForNewIssue(false, false)).toBe("queued");
    });

    test("goes to spec_drafting when specs enabled and not large", () => {
      expect(nextStateForNewIssue(true, false)).toBe("spec_drafting");
    });

    test("goes to decomposing when large feature", () => {
      expect(nextStateForNewIssue(false, true)).toBe("decomposing");
      expect(nextStateForNewIssue(true, true)).toBe("decomposing");
    });
  });
});
