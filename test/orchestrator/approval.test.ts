import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { Database } from "../../src/db/database.ts";
import { PipelineExecutor } from "../../src/pipeline/executor.ts";
import type { AgentAdapter, AgentRunParams } from "../../src/agents/adapter.ts";
import type { PipelineDefinition } from "../../src/config/types.ts";
import { existsSync, unlinkSync, mkdirSync, rmSync } from "fs";

const TEST_DB = "/tmp/feliz-approval-test.db";
const TEST_WORK_DIR = "/tmp/feliz-approval-workdir";

function makeAdapter(capturePolicy = false): AgentAdapter & { lastPolicy?: string } {
  const adapter: AgentAdapter & { lastPolicy?: string } = {
    name: "test-agent",
    lastPolicy: undefined,
    isAvailable: async () => true,
    execute: mock(async (params: AgentRunParams) => {
      if (capturePolicy) {
        adapter.lastPolicy = params.approvalPolicy;
      }
      return {
        status: "succeeded" as const,
        exitCode: 0,
        stdout: "done",
        stderr: "",
        filesChanged: [],
      };
    }),
    cancel: mock(async () => {}),
  };
  return adapter;
}

describe("Approval policies in pipeline", () => {
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

  test("pipeline passes approvalPolicy to agent adapter", async () => {
    const adapter = makeAdapter(true);
    const executor = new PipelineExecutor(db, { "test-agent": adapter }, {
      approval_policy: "gated",
      timeout_ms: 600000,
      max_turns: 20,
    });

    const pipeline: PipelineDefinition = {
      phases: [
        {
          name: "execute",
          steps: [{ name: "run", agent: "test-agent", success: { always: true } }],
        },
      ],
    };

    await executor.execute({
      runId: "run-1",
      workDir: TEST_WORK_DIR,
      pipeline,
      promptRenderer: () => "test prompt",
    });

    expect(adapter.lastPolicy).toBe("gated");
  });

  test("pipeline uses default auto policy when not specified", async () => {
    const adapter = makeAdapter(true);
    const executor = new PipelineExecutor(db, { "test-agent": adapter });

    const pipeline: PipelineDefinition = {
      phases: [
        {
          name: "execute",
          steps: [{ name: "run", agent: "test-agent", success: { always: true } }],
        },
      ],
    };

    await executor.execute({
      runId: "run-1",
      workDir: TEST_WORK_DIR,
      pipeline,
      promptRenderer: () => "test prompt",
    });

    expect(adapter.lastPolicy).toBe("auto");
  });

  test("pipeline uses provided timeout and maxTurns from config", async () => {
    let capturedParams: AgentRunParams | null = null;
    const adapter: AgentAdapter = {
      name: "test-agent",
      isAvailable: async () => true,
      execute: mock(async (params: AgentRunParams) => {
        capturedParams = params;
        return {
          status: "succeeded" as const,
          exitCode: 0,
          stdout: "done",
          stderr: "",
          filesChanged: [],
        };
      }),
      cancel: mock(async () => {}),
    };

    const executor = new PipelineExecutor(db, { "test-agent": adapter }, {
      approval_policy: "suggest",
      timeout_ms: 300000,
      max_turns: 10,
    });

    const pipeline: PipelineDefinition = {
      phases: [
        {
          name: "execute",
          steps: [{ name: "run", agent: "test-agent", success: { always: true } }],
        },
      ],
    };

    await executor.execute({
      runId: "run-1",
      workDir: TEST_WORK_DIR,
      pipeline,
      promptRenderer: () => "test prompt",
    });

    expect(capturedParams).not.toBeNull();
    expect(capturedParams!.approvalPolicy).toBe("suggest");
    expect(capturedParams!.timeout_ms).toBe(300000);
    expect(capturedParams!.maxTurns).toBe(10);
  });
});
