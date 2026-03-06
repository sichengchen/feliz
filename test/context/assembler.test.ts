import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { ContextAssembler } from "../../src/context/assembler.ts";
import { Database } from "../../src/db/database.ts";
import { existsSync, unlinkSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";

const TEST_DB = "/tmp/feliz-context-test.db";
const TEST_SCRATCH_DIR = "/tmp/feliz-context-scratch";
const TEST_WORK_DIR = "/tmp/feliz-context-workdir";

describe("ContextAssembler", () => {
  let db: Database;

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    if (existsSync(TEST_SCRATCH_DIR))
      rmSync(TEST_SCRATCH_DIR, { recursive: true });
    if (existsSync(TEST_WORK_DIR))
      rmSync(TEST_WORK_DIR, { recursive: true });
    mkdirSync(TEST_SCRATCH_DIR, { recursive: true });
    mkdirSync(TEST_WORK_DIR, { recursive: true });
    db = new Database(TEST_DB);

    // Seed data
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
      title: "Test Issue",
      description: "Test description",
      state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: "queued",
    });
  });

  afterEach(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    if (existsSync(TEST_SCRATCH_DIR))
      rmSync(TEST_SCRATCH_DIR, { recursive: true });
    if (existsSync(TEST_WORK_DIR))
      rmSync(TEST_WORK_DIR, { recursive: true });
  });

  test("assembles context with history events", () => {
    db.appendHistory({
      id: "h-1",
      project_id: "proj-1",
      work_item_id: "wi-1",
      run_id: null,
      event_type: "issue.discovered",
      payload: { title: "Test Issue" },
    });
    db.appendHistory({
      id: "h-2",
      project_id: "proj-1",
      work_item_id: "wi-1",
      run_id: null,
      event_type: "issue.state_changed",
      payload: { old_state: "Todo", new_state: "In Progress" },
    });

    const assembler = new ContextAssembler(db, TEST_SCRATCH_DIR);
    const context = assembler.assemble("proj-1", "wi-1", null);
    expect(context.history).toHaveLength(2);
    expect(context.history[0]!.event_type).toBe("issue.discovered");
  });

  test("includes memory from worktree", () => {
    // Create memory files in the workdir
    const memoryDir = join(TEST_WORK_DIR, ".feliz", "context", "memory");
    mkdirSync(join(memoryDir, "conventions"), { recursive: true });
    writeFileSync(
      join(memoryDir, "conventions", "orm.md"),
      "Use Drizzle ORM"
    );

    const assembler = new ContextAssembler(db, TEST_SCRATCH_DIR);
    const context = assembler.assemble("proj-1", "wi-1", TEST_WORK_DIR);
    expect(context.memory).toHaveLength(1);
    expect(context.memory[0]!.path).toContain("conventions/orm.md");
    expect(context.memory[0]!.content).toBe("Use Drizzle ORM");
  });

  test("includes spec files as memory when specDir is provided", () => {
    // Create spec files in the workdir
    const specsDir = join(TEST_WORK_DIR, "specs");
    mkdirSync(join(specsDir, "auth"), { recursive: true });
    writeFileSync(
      join(specsDir, "index.md"),
      "# Project Specs\n\nMaster index."
    );
    writeFileSync(
      join(specsDir, "auth", "login.md"),
      "# Login\n\n## Overview\n\nAuth design.\n\n## Behavioral Cases\n\n..."
    );

    const assembler = new ContextAssembler(db, TEST_SCRATCH_DIR);
    const context = assembler.assemble(
      "proj-1",
      "wi-1",
      TEST_WORK_DIR,
      null,
      "specs"
    );
    // Specs should appear in the specs field
    expect(context.specs).toHaveLength(2);
    expect(context.specs.some((s) => s.path.includes("index.md"))).toBe(true);
    expect(context.specs.some((s) => s.path.includes("auth/login.md"))).toBe(
      true
    );
    expect(
      context.specs.find((s) => s.path.includes("index.md"))!.content
    ).toContain("Master index");
  });

  test("specs field is empty when no specDir provided", () => {
    const assembler = new ContextAssembler(db, TEST_SCRATCH_DIR);
    const context = assembler.assemble("proj-1", "wi-1", TEST_WORK_DIR);
    expect(context.specs).toHaveLength(0);
  });

  test("specs field is empty when specDir doesnt exist", () => {
    const assembler = new ContextAssembler(db, TEST_SCRATCH_DIR);
    const context = assembler.assemble(
      "proj-1",
      "wi-1",
      TEST_WORK_DIR,
      null,
      "nonexistent"
    );
    expect(context.specs).toHaveLength(0);
  });

  test("includes scratchpad artifacts for current run", () => {
    const artifactDir = join(TEST_SCRATCH_DIR, "test", "run-1");
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(join(artifactDir, "agent_output.txt"), "Agent output here");

    // Insert scratchpad metadata
    db.insertRun({
      id: "run-1",
      work_item_id: "wi-1",
      attempt: 1,
      current_phase: "execute",
      current_step: "run",
      context_snapshot_id: "snap-1",
    });

    const assembler = new ContextAssembler(db, TEST_SCRATCH_DIR);
    const context = assembler.assemble("proj-1", "wi-1", null, "run-1");
    // Scratchpad is read from filesystem based on run_id
    expect(context.scratchpad).toBeDefined();
  });

  test("creates context snapshot", () => {
    const assembler = new ContextAssembler(db, TEST_SCRATCH_DIR);
    const context = assembler.assemble("proj-1", "wi-1", null);
    const snapshotId = assembler.createSnapshot("run-1", "wi-1", context);
    expect(snapshotId).toBeDefined();
    expect(typeof snapshotId).toBe("string");
  });

  test("empty context when no data", () => {
    const assembler = new ContextAssembler(db, TEST_SCRATCH_DIR);
    const context = assembler.assemble("proj-1", "wi-1", null);
    expect(context.history).toHaveLength(0);
    expect(context.memory).toHaveLength(0);
    expect(context.scratchpad).toHaveLength(0);
    expect(context.specs).toHaveLength(0);
  });

  test("readSpecs returns concatenated spec content as string", () => {
    const specsDir = join(TEST_WORK_DIR, "specs");
    mkdirSync(join(specsDir, "auth"), { recursive: true });
    writeFileSync(join(specsDir, "index.md"), "# Specs Index");
    writeFileSync(join(specsDir, "auth", "login.md"), "# Login Spec");

    const assembler = new ContextAssembler(db, TEST_SCRATCH_DIR);
    const specContent = assembler.readSpecsAsText(TEST_WORK_DIR, "specs");
    expect(specContent).toContain("Specs Index");
    expect(specContent).toContain("Login Spec");
  });

  test("readSpecs returns null when no specs exist", () => {
    const assembler = new ContextAssembler(db, TEST_SCRATCH_DIR);
    const specContent = assembler.readSpecsAsText(TEST_WORK_DIR, "specs");
    expect(specContent).toBeNull();
  });

  test("writeScratchpad creates file and returns path", () => {
    const assembler = new ContextAssembler(db, TEST_SCRATCH_DIR);
    const filePath = assembler.writeScratchpad(
      "test",
      "run-1",
      "output.txt",
      "Agent output content"
    );
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toBe("Agent output content");
  });

  test("context snapshot stores artifact refs", () => {
    // Create memory so snapshot has something to reference
    const memoryDir = join(TEST_WORK_DIR, ".feliz", "context", "memory");
    mkdirSync(join(memoryDir, "conventions"), { recursive: true });
    writeFileSync(
      join(memoryDir, "conventions", "orm.md"),
      "Use Drizzle ORM"
    );

    const assembler = new ContextAssembler(db, TEST_SCRATCH_DIR);
    const context = assembler.assemble("proj-1", "wi-1", TEST_WORK_DIR);
    const snapshotId = assembler.createSnapshot("run-1", "wi-1", context);

    // Verify snapshot was stored correctly
    const snap = db.getContextSnapshot(snapshotId);
    expect(snap).not.toBeNull();
    expect(snap!.work_item_id).toBe("wi-1");
  });
});
