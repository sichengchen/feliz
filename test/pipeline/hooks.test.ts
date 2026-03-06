import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { Database } from "../../src/db/database.ts";
import { PipelineExecutor } from "../../src/pipeline/executor.ts";
import type { AgentAdapter } from "../../src/agents/adapter.ts";
import type { PipelineDefinition } from "../../src/config/types.ts";
import {
  existsSync,
  unlinkSync,
  mkdirSync,
  rmSync,
  readFileSync,
} from "fs";
import { join } from "path";

const TEST_DB = "/tmp/feliz-hooks-test.db";
const TEST_WORK_DIR = "/tmp/feliz-hooks-workdir";

function makeAdapter(): AgentAdapter {
  return {
    name: "test-agent",
    isAvailable: async () => true,
    execute: mock(async () => ({
      status: "succeeded" as const,
      exitCode: 0,
      stdout: "done",
      stderr: "",
      filesChanged: [],
    })),
    cancel: mock(async () => {}),
  };
}

describe("Pipeline hooks", () => {
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
      title: "Test",
      description: "",
      state: "Todo",
      priority: 1,
      labels: [],
      blocker_ids: [],
      orchestration_state: "running",
    });
    db.insertRun({
      id: "run-1",
      work_item_id: "wi-1",
      attempt: 1,
      current_phase: "execute",
      current_step: "run",
      context_snapshot_id: "snap-1",
    });
  });

  afterEach(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    if (existsSync(TEST_WORK_DIR)) rmSync(TEST_WORK_DIR, { recursive: true });
  });

  test("runs before_run hook before each step", async () => {
    const markerFile = join(TEST_WORK_DIR, "before_ran");
    const executor = new PipelineExecutor(
      db,
      { "test-agent": makeAdapter() },
      undefined,
      { before_run: `touch ${markerFile}` }
    );

    const pipeline: PipelineDefinition = {
      phases: [
        {
          name: "execute",
          steps: [
            { name: "run", agent: "test-agent", success: { always: true } },
          ],
        },
      ],
    };

    await executor.execute({
      runId: "run-1",
      workDir: TEST_WORK_DIR,
      pipeline,
      promptRenderer: () => "test",
    });

    expect(existsSync(markerFile)).toBe(true);
  });

  test("runs after_run hook after each step", async () => {
    const markerFile = join(TEST_WORK_DIR, "after_ran");
    const executor = new PipelineExecutor(
      db,
      { "test-agent": makeAdapter() },
      undefined,
      { after_run: `touch ${markerFile}` }
    );

    const pipeline: PipelineDefinition = {
      phases: [
        {
          name: "execute",
          steps: [
            { name: "run", agent: "test-agent", success: { always: true } },
          ],
        },
      ],
    };

    await executor.execute({
      runId: "run-1",
      workDir: TEST_WORK_DIR,
      pipeline,
      promptRenderer: () => "test",
    });

    expect(existsSync(markerFile)).toBe(true);
  });

  test("hooks run in worktree directory", async () => {
    const cwdFile = join(TEST_WORK_DIR, "hook_cwd");
    const executor = new PipelineExecutor(
      db,
      { "test-agent": makeAdapter() },
      undefined,
      { before_run: `pwd > ${cwdFile}` }
    );

    const pipeline: PipelineDefinition = {
      phases: [
        {
          name: "execute",
          steps: [
            { name: "run", agent: "test-agent", success: { always: true } },
          ],
        },
      ],
    };

    await executor.execute({
      runId: "run-1",
      workDir: TEST_WORK_DIR,
      pipeline,
      promptRenderer: () => "test",
    });

    const cwd = readFileSync(cwdFile, "utf-8").trim();
    // macOS resolves /tmp to /private/tmp
    expect(cwd).toEndWith("feliz-hooks-workdir");
  });

  test("does not run hooks when not configured", async () => {
    const executor = new PipelineExecutor(
      db,
      { "test-agent": makeAdapter() }
    );

    const pipeline: PipelineDefinition = {
      phases: [
        {
          name: "execute",
          steps: [
            { name: "run", agent: "test-agent", success: { always: true } },
          ],
        },
      ],
    };

    const result = await executor.execute({
      runId: "run-1",
      workDir: TEST_WORK_DIR,
      pipeline,
      promptRenderer: () => "test",
    });

    expect(result.success).toBe(true);
  });
});
