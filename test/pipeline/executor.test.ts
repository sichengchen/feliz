import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { PipelineExecutor } from "../../src/pipeline/executor.ts";
import { Database } from "../../src/db/database.ts";
import type { AgentAdapter, AgentRunResult } from "../../src/agents/adapter.ts";
import type { PipelineDefinition } from "../../src/config/types.ts";
import { existsSync, unlinkSync, mkdirSync, rmSync, writeFileSync } from "fs";

const TEST_DB = "/tmp/feliz-pipeline-test.db";
const TEST_WORK_DIR = "/tmp/feliz-pipeline-workdir";

function makeAdapter(
  result: Partial<AgentRunResult> = {}
): AgentAdapter {
  return {
    name: "test-agent",
    isAvailable: async () => true,
    execute: mock(async () => ({
      status: "succeeded" as const,
      exitCode: 0,
      stdout: "done",
      stderr: "",
      filesChanged: [],
      ...result,
    })),
    cancel: mock(async () => {}),
  };
}

function makeFailAdapter(): AgentAdapter {
  return {
    name: "test-agent",
    isAvailable: async () => true,
    execute: mock(async () => ({
      status: "failed" as const,
      exitCode: 1,
      stdout: "error",
      stderr: "failed",
      filesChanged: [],
    })),
    cancel: mock(async () => {}),
  };
}

describe("PipelineExecutor", () => {
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
      current_phase: "",
      current_step: "",
      context_snapshot_id: "snap-1",
    });
  });

  afterEach(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    if (existsSync(TEST_WORK_DIR)) rmSync(TEST_WORK_DIR, { recursive: true });
  });

  test("executes single-step pipeline successfully", async () => {
    const adapter = makeAdapter();
    const pipeline: PipelineDefinition = {
      phases: [
        {
          name: "execute",
          steps: [
            {
              name: "run",
              agent: "test-agent",
              success: { always: true },
            },
          ],
        },
      ],
    };

    const executor = new PipelineExecutor(db, { "test-agent": adapter });
    const result = await executor.execute({
      runId: "run-1",
      workDir: TEST_WORK_DIR,
      pipeline,
      promptRenderer: () => "test prompt",
    });

    expect(result.success).toBe(true);
    expect(adapter.execute).toHaveBeenCalledTimes(1);
  });

  test("executes multi-step pipeline", async () => {
    const adapter = makeAdapter();
    const pipeline: PipelineDefinition = {
      phases: [
        {
          name: "implement",
          steps: [
            { name: "write_tests", agent: "test-agent", success: { always: true } },
            { name: "write_code", agent: "test-agent", success: { always: true } },
          ],
        },
      ],
    };

    const executor = new PipelineExecutor(db, { "test-agent": adapter });
    const result = await executor.execute({
      runId: "run-1",
      workDir: TEST_WORK_DIR,
      pipeline,
      promptRenderer: () => "prompt",
    });

    expect(result.success).toBe(true);
    expect(adapter.execute).toHaveBeenCalledTimes(2);
  });

  test("evaluates command success condition", async () => {
    const adapter = makeAdapter();
    const pipeline: PipelineDefinition = {
      phases: [
        {
          name: "execute",
          steps: [
            {
              name: "run",
              agent: "test-agent",
              success: { command: "true" }, // always exits 0
            },
          ],
        },
      ],
    };

    const executor = new PipelineExecutor(db, { "test-agent": adapter });
    const result = await executor.execute({
      runId: "run-1",
      workDir: TEST_WORK_DIR,
      pipeline,
      promptRenderer: () => "prompt",
    });

    expect(result.success).toBe(true);
  });

  test("fails on command success condition failure", async () => {
    const adapter = makeAdapter();
    const pipeline: PipelineDefinition = {
      phases: [
        {
          name: "execute",
          steps: [
            {
              name: "run",
              agent: "test-agent",
              success: { command: "false" }, // always exits 1
            },
          ],
        },
      ],
    };

    const executor = new PipelineExecutor(db, { "test-agent": adapter });
    const result = await executor.execute({
      runId: "run-1",
      workDir: TEST_WORK_DIR,
      pipeline,
      promptRenderer: () => "prompt",
    });

    expect(result.success).toBe(false);
  });

  test("evaluates file_exists success condition", async () => {
    const adapter = makeAdapter();
    // Create the file the condition checks for
    writeFileSync(`${TEST_WORK_DIR}/output.txt`, "content");

    const pipeline: PipelineDefinition = {
      phases: [
        {
          name: "execute",
          steps: [
            {
              name: "run",
              agent: "test-agent",
              success: { file_exists: "output.txt" },
            },
          ],
        },
      ],
    };

    const executor = new PipelineExecutor(db, { "test-agent": adapter });
    const result = await executor.execute({
      runId: "run-1",
      workDir: TEST_WORK_DIR,
      pipeline,
      promptRenderer: () => "prompt",
    });

    expect(result.success).toBe(true);
  });

  test("evaluates agent_verdict success condition", async () => {
    const adapter = makeAdapter({ stdout: "APPROVED: looks good" });
    const pipeline: PipelineDefinition = {
      phases: [
        {
          name: "review",
          steps: [
            {
              name: "check",
              agent: "test-agent",
              success: { agent_verdict: "approved" },
            },
          ],
        },
      ],
    };

    const executor = new PipelineExecutor(db, { "test-agent": adapter });
    const result = await executor.execute({
      runId: "run-1",
      workDir: TEST_WORK_DIR,
      pipeline,
      promptRenderer: () => "prompt",
    });

    expect(result.success).toBe(true);
  });

  test("retries step on failure with max_attempts", async () => {
    let callCount = 0;
    const adapter: AgentAdapter = {
      name: "test-agent",
      isAvailable: async () => true,
      execute: mock(async () => {
        callCount++;
        if (callCount < 3) {
          return {
            status: "failed" as const,
            exitCode: 1,
            stdout: "fail",
            stderr: "",
            filesChanged: [],
          };
        }
        return {
          status: "succeeded" as const,
          exitCode: 0,
          stdout: "pass",
          stderr: "",
          filesChanged: [],
        };
      }),
      cancel: mock(async () => {}),
    };

    const pipeline: PipelineDefinition = {
      phases: [
        {
          name: "execute",
          steps: [
            {
              name: "run",
              agent: "test-agent",
              max_attempts: 3,
              success: { always: true },
            },
          ],
        },
      ],
    };

    const executor = new PipelineExecutor(db, { "test-agent": adapter });
    const result = await executor.execute({
      runId: "run-1",
      workDir: TEST_WORK_DIR,
      pipeline,
      promptRenderer: () => "prompt",
    });

    expect(result.success).toBe(true);
    expect(callCount).toBe(3);
  });

  test("phase repeat loops on step failure", async () => {
    let callCount = 0;
    const adapter: AgentAdapter = {
      name: "test-agent",
      isAvailable: async () => true,
      execute: mock(async () => {
        callCount++;
        return {
          status: "succeeded" as const,
          exitCode: 0,
          stdout: callCount >= 3 ? "approved" : "needs work",
          stderr: "",
          filesChanged: [],
        };
      }),
      cancel: mock(async () => {}),
    };

    const pipeline: PipelineDefinition = {
      phases: [
        {
          name: "review_cycle",
          repeat: { max: 3, on_exhaust: "fail" },
          steps: [
            {
              name: "review",
              agent: "test-agent",
              success: { agent_verdict: "approved" },
            },
          ],
        },
      ],
    };

    const executor = new PipelineExecutor(db, { "test-agent": adapter });
    const result = await executor.execute({
      runId: "run-1",
      workDir: TEST_WORK_DIR,
      pipeline,
      promptRenderer: () => "prompt",
    });

    expect(result.success).toBe(true);
    expect(callCount).toBe(3);
  });

  test("phase repeat on_exhaust pass continues pipeline", async () => {
    const adapter = makeAdapter({ stdout: "needs work" });
    const pipeline: PipelineDefinition = {
      phases: [
        {
          name: "review_cycle",
          repeat: { max: 2, on_exhaust: "pass" },
          steps: [
            {
              name: "review",
              agent: "test-agent",
              success: { agent_verdict: "approved" },
            },
          ],
        },
      ],
    };

    const executor = new PipelineExecutor(db, { "test-agent": adapter });
    const result = await executor.execute({
      runId: "run-1",
      workDir: TEST_WORK_DIR,
      pipeline,
      promptRenderer: () => "prompt",
    });

    expect(result.success).toBe(true);
    expect(result.warnings).toContain(
      'Phase "review_cycle" exhausted max cycles (2), auto-passing'
    );
  });

  test("phase repeat on_exhaust fail aborts pipeline", async () => {
    const adapter = makeAdapter({ stdout: "needs work" });
    const pipeline: PipelineDefinition = {
      phases: [
        {
          name: "review_cycle",
          repeat: { max: 2, on_exhaust: "fail" },
          steps: [
            {
              name: "review",
              agent: "test-agent",
              success: { agent_verdict: "approved" },
            },
          ],
        },
      ],
    };

    const executor = new PipelineExecutor(db, { "test-agent": adapter });
    const result = await executor.execute({
      runId: "run-1",
      workDir: TEST_WORK_DIR,
      pipeline,
      promptRenderer: () => "prompt",
    });

    expect(result.success).toBe(false);
    expect(result.failureReason).toContain("review_cycle");
  });

  test("records step executions in DB", async () => {
    const adapter = makeAdapter();
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

    const executor = new PipelineExecutor(db, { "test-agent": adapter });
    await executor.execute({
      runId: "run-1",
      workDir: TEST_WORK_DIR,
      pipeline,
      promptRenderer: () => "prompt",
    });

    const steps = db.listStepExecutionsForRun("run-1");
    expect(steps).toHaveLength(1);
    expect(steps[0]!.phase_name).toBe("execute");
    expect(steps[0]!.step_name).toBe("run");
    expect(steps[0]!.result).toBe("succeeded");
  });

  test("default success: step succeeds when agent exits 0 and no success condition", async () => {
    const adapter = makeAdapter();
    const pipeline: PipelineDefinition = {
      phases: [
        {
          name: "execute",
          steps: [
            {
              name: "run",
              agent: "test-agent",
              // No success condition specified
            },
          ],
        },
      ],
    };

    const executor = new PipelineExecutor(db, { "test-agent": adapter });
    const result = await executor.execute({
      runId: "run-1",
      workDir: TEST_WORK_DIR,
      pipeline,
      promptRenderer: () => "prompt",
    });

    expect(result.success).toBe(true);
  });

  test("default success: step fails when agent exits non-zero and no success condition", async () => {
    const adapter = makeFailAdapter();
    const pipeline: PipelineDefinition = {
      phases: [
        {
          name: "execute",
          steps: [
            {
              name: "run",
              agent: "test-agent",
              // No success condition specified
            },
          ],
        },
      ],
    };

    const executor = new PipelineExecutor(db, { "test-agent": adapter });
    const result = await executor.execute({
      runId: "run-1",
      workDir: TEST_WORK_DIR,
      pipeline,
      promptRenderer: () => "prompt",
    });

    expect(result.success).toBe(false);
  });

  test("per-step agent adapter selection", async () => {
    const agent1 = makeAdapter({ stdout: "agent1" });
    const agent2 = makeAdapter({ stdout: "agent2" });
    const pipeline: PipelineDefinition = {
      phases: [
        {
          name: "execute",
          steps: [
            { name: "step1", agent: "agent-1", success: { always: true } },
            { name: "step2", agent: "agent-2", success: { always: true } },
          ],
        },
      ],
    };

    const executor = new PipelineExecutor(db, { "agent-1": agent1, "agent-2": agent2 });
    const result = await executor.execute({
      runId: "run-1",
      workDir: TEST_WORK_DIR,
      pipeline,
      promptRenderer: () => "prompt",
    });

    expect(result.success).toBe(true);
    expect(agent1.execute).toHaveBeenCalledTimes(1);
    expect(agent2.execute).toHaveBeenCalledTimes(1);
  });

  test("fails when agent adapter not found", async () => {
    const pipeline: PipelineDefinition = {
      phases: [
        {
          name: "execute",
          steps: [
            { name: "run", agent: "nonexistent-agent", success: { always: true } },
          ],
        },
      ],
    };

    const executor = new PipelineExecutor(db, {});
    const result = await executor.execute({
      runId: "run-1",
      workDir: TEST_WORK_DIR,
      pipeline,
      promptRenderer: () => "prompt",
    });

    expect(result.success).toBe(false);
    expect(result.failureReason).toContain("nonexistent-agent");
  });

  test("multiple phases execute sequentially", async () => {
    const callOrder: string[] = [];
    const adapter: AgentAdapter = {
      name: "test-agent",
      isAvailable: async () => true,
      execute: mock(async (params: any) => {
        callOrder.push(params.prompt);
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

    const pipeline: PipelineDefinition = {
      phases: [
        {
          name: "phase1",
          steps: [{ name: "step1", agent: "test-agent", success: { always: true } }],
        },
        {
          name: "phase2",
          steps: [{ name: "step2", agent: "test-agent", success: { always: true } }],
        },
      ],
    };

    const executor = new PipelineExecutor(db, { "test-agent": adapter });
    const result = await executor.execute({
      runId: "run-1",
      workDir: TEST_WORK_DIR,
      pipeline,
      promptRenderer: (phase, step) => `${phase}/${step}`,
    });

    expect(result.success).toBe(true);
    expect(callOrder).toEqual(["phase1/step1", "phase2/step2"]);
  });

  test("promptRenderer receives correct arguments", async () => {
    const receivedArgs: any[] = [];
    const adapter = makeAdapter();
    const pipeline: PipelineDefinition = {
      phases: [
        {
          name: "implement",
          steps: [
            { name: "write_code", agent: "test-agent", success: { always: true } },
          ],
        },
      ],
    };

    const executor = new PipelineExecutor(db, { "test-agent": adapter });
    await executor.execute({
      runId: "run-1",
      workDir: TEST_WORK_DIR,
      pipeline,
      promptRenderer: (phase, step, cycle) => {
        receivedArgs.push({ phase, step, cycle });
        return "prompt";
      },
    });

    expect(receivedArgs).toHaveLength(1);
    expect(receivedArgs[0]).toEqual({ phase: "implement", step: "write_code", cycle: 1 });
  });

  test("cycle counter increments on phase repeat", async () => {
    const receivedCycles: number[] = [];
    let callCount = 0;
    const adapter: AgentAdapter = {
      name: "test-agent",
      isAvailable: async () => true,
      execute: mock(async () => {
        callCount++;
        return {
          status: "succeeded" as const,
          exitCode: 0,
          stdout: callCount >= 3 ? "approved" : "needs work",
          stderr: "",
          filesChanged: [],
        };
      }),
      cancel: mock(async () => {}),
    };

    const pipeline: PipelineDefinition = {
      phases: [
        {
          name: "review",
          repeat: { max: 3, on_exhaust: "fail" },
          steps: [
            { name: "check", agent: "test-agent", success: { agent_verdict: "approved" } },
          ],
        },
      ],
    };

    const executor = new PipelineExecutor(db, { "test-agent": adapter });
    await executor.execute({
      runId: "run-1",
      workDir: TEST_WORK_DIR,
      pipeline,
      promptRenderer: (_phase, _step, cycle) => {
        receivedCycles.push(cycle);
        return "prompt";
      },
    });

    expect(receivedCycles).toEqual([1, 2, 3]);
  });

  test("passes approval policy to agent via agentConfig", async () => {
    const adapter = makeAdapter();
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

    const executor = new PipelineExecutor(
      db,
      { "test-agent": adapter },
      { approval_policy: "gated", timeout_ms: 300000, max_turns: 10 }
    );
    await executor.execute({
      runId: "run-1",
      workDir: TEST_WORK_DIR,
      pipeline,
      promptRenderer: () => "prompt",
    });

    const call = (adapter.execute as ReturnType<typeof mock>).mock.calls[0]!;
    const params = call[0] as any;
    expect(params.approvalPolicy).toBe("gated");
    expect(params.timeout_ms).toBe(300000);
    expect(params.maxTurns).toBe(10);
  });
});
