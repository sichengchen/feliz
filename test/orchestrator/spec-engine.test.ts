import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test";
import { SpecEngine } from "../../src/orchestrator/spec-engine.ts";
import { Database } from "../../src/db/database.ts";
import type { AgentAdapter } from "../../src/agents/adapter.ts";
import {
  existsSync,
  unlinkSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join } from "path";

const TEST_DB = "/tmp/feliz-spec-test.db";
const TEST_WORK_DIR = "/tmp/feliz-spec-workdir";

function makeAdapter(stdout = "spec content"): AgentAdapter {
  return {
    name: "test-agent",
    isAvailable: async () => true,
    execute: mock(async () => ({
      status: "succeeded" as const,
      exitCode: 0,
      stdout,
      stderr: "",
      filesChanged: ["specs/auth/login.md"],
      summary: "Drafted login spec",
    })),
    cancel: mock(async () => {}),
  };
}

describe("SpecEngine", () => {
  let db: Database;

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    if (existsSync(TEST_WORK_DIR)) rmSync(TEST_WORK_DIR, { recursive: true });
    mkdirSync(TEST_WORK_DIR, { recursive: true });
    db = new Database(TEST_DB);
    db.insertProject({
      id: "proj-1",
      name: "test",
      repo_url: "u",
      linear_project_name: "T",
      base_branch: "main",
    });
    db.upsertWorkItem({
      id: "wi-1",
      linear_id: "l1",
      linear_identifier: "T-1",
      project_id: "proj-1",
      parent_work_item_id: null,
      title: "Add login",
      description: "Implement login with email/password and OAuth",
      state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: "spec_drafting",
    });
  });

  afterEach(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    if (existsSync(TEST_WORK_DIR)) rmSync(TEST_WORK_DIR, { recursive: true });
  });

  test("prompt instructs agent to produce system design AND behavioral cases", () => {
    const engine = new SpecEngine(db, makeAdapter());
    const prompt = engine.buildSpecDraftPrompt({
      identifier: "T-1",
      title: "Add login",
      description: "Implement login with email/password and OAuth",
      specDir: "specs",
      existingSpecs: null,
    });
    expect(prompt).toContain("T-1");
    expect(prompt).toContain("Add login");
    expect(prompt).toContain("email/password");
    expect(prompt).toContain("specs");
    // Must request system design sections
    expect(prompt).toContain("Overview");
    expect(prompt).toContain("Design");
    expect(prompt).toContain("Data Model");
    expect(prompt).toContain("API");
    // Must request behavioral cases
    expect(prompt).toContain("Behavioral Cases");
    expect(prompt).toContain("Given");
    expect(prompt).toContain("When");
    expect(prompt).toContain("Then");
  });

  test("prompt includes existing specs as context when provided", () => {
    const engine = new SpecEngine(db, makeAdapter());
    const existingSpecs = "# Auth Module\n\nExisting auth design...";
    const prompt = engine.buildSpecDraftPrompt({
      identifier: "T-2",
      title: "Add OAuth",
      description: "Add OAuth support",
      specDir: "specs",
      existingSpecs,
    });
    expect(prompt).toContain("Existing Specs");
    expect(prompt).toContain("Existing auth design");
  });

  test("draftSpec reads existing specs from the repo", async () => {
    // Create existing spec files in the workdir
    const specsDir = join(TEST_WORK_DIR, "specs");
    mkdirSync(join(specsDir, "auth"), { recursive: true });
    writeFileSync(
      join(specsDir, "auth", "index.md"),
      "# Auth\n\n## Overview\n\nExisting auth module."
    );

    const adapter = makeAdapter();
    const engine = new SpecEngine(db, adapter);
    await engine.draftSpec({
      workItemId: "wi-1",
      workDir: TEST_WORK_DIR,
      specDir: "specs",
    });

    // The agent should have been called with a prompt containing existing specs
    const call = (adapter.execute as ReturnType<typeof mock>).mock.calls[0]!;
    const promptArg = (call[0] as any).prompt;
    expect(promptArg).toContain("Existing auth module");
  });

  test("drafts spec via agent", async () => {
    const adapter = makeAdapter("# Login\n\n## Design\n\n...");
    const engine = new SpecEngine(db, adapter);
    const result = await engine.draftSpec({
      workItemId: "wi-1",
      workDir: TEST_WORK_DIR,
      specDir: "specs",
    });

    expect(result.success).toBe(true);
    expect(adapter.execute).toHaveBeenCalledTimes(1);
  });

  test("records spec.drafted history event", async () => {
    const engine = new SpecEngine(db, makeAdapter());
    await engine.draftSpec({
      workItemId: "wi-1",
      workDir: TEST_WORK_DIR,
      specDir: "specs",
    });

    const history = db.getHistory("proj-1", "wi-1");
    expect(history.some((h) => h.event_type === "spec.drafted")).toBe(true);
  });

  test("transitions work item to spec_review", async () => {
    const engine = new SpecEngine(db, makeAdapter());
    await engine.draftSpec({
      workItemId: "wi-1",
      workDir: TEST_WORK_DIR,
      specDir: "specs",
    });

    const wi = db.getWorkItem("wi-1");
    expect(wi!.orchestration_state).toBe("spec_review");
  });

  test("approveSpec transitions to queued", () => {
    db.updateWorkItemOrchestrationState("wi-1", "spec_review");
    const engine = new SpecEngine(db, makeAdapter());
    engine.approveSpec("wi-1");

    const wi = db.getWorkItem("wi-1");
    expect(wi!.orchestration_state).toBe("queued");
  });

  test("returns failure when agent fails", async () => {
    const failAdapter: AgentAdapter = {
      name: "fail-agent",
      isAvailable: async () => true,
      execute: mock(async () => ({
        status: "failed" as const,
        exitCode: 1,
        stdout: "",
        stderr: "error",
        filesChanged: [],
      })),
      cancel: mock(async () => {}),
    };
    const engine = new SpecEngine(db, failAdapter);
    const result = await engine.draftSpec({
      workItemId: "wi-1",
      workDir: TEST_WORK_DIR,
      specDir: "specs",
    });
    expect(result.success).toBe(false);
    // State should NOT transition on failure
    const wi = db.getWorkItem("wi-1");
    expect(wi!.orchestration_state).toBe("spec_drafting");
  });

  test("returns failure when work item not found", async () => {
    const engine = new SpecEngine(db, makeAdapter());
    const result = await engine.draftSpec({
      workItemId: "nonexistent",
      workDir: TEST_WORK_DIR,
      specDir: "specs",
    });
    expect(result.success).toBe(false);
  });

  test("approveSpec records spec.approved history event", () => {
    db.updateWorkItemOrchestrationState("wi-1", "spec_review");
    const engine = new SpecEngine(db, makeAdapter());
    engine.approveSpec("wi-1");

    const history = db.getHistory("proj-1", "wi-1");
    expect(history.some((h) => h.event_type === "spec.approved")).toBe(true);
  });
});
