import type { Database } from "../db/database.ts";
import type { AgentAdapter } from "../agents/adapter.ts";
import type { PipelineDefinition, SuccessCondition } from "../config/types.ts";
import { newId } from "../id.ts";
import { existsSync } from "fs";
import { join } from "path";

export interface AgentConfig {
  approval_policy: "auto" | "gated" | "suggest";
  timeout_ms: number;
  max_turns: number;
  defaultAgent?: string;
}

export interface HooksConfig {
  before_run?: string;
  after_run?: string;
}

export interface ExecuteParams {
  runId: string;
  workDir: string;
  pipeline: PipelineDefinition;
  promptRenderer: (phaseName: string, stepName: string, cycle: number) => string;
}

export interface ExecuteResult {
  success: boolean;
  failureReason?: string;
  warnings: string[];
}

export class PipelineExecutor {
  private db: Database;
  private adapters: Record<string, AgentAdapter>;
  private agentConfig: AgentConfig;
  private hooks: HooksConfig;

  constructor(
    db: Database,
    adapters: Record<string, AgentAdapter>,
    agentConfig?: AgentConfig,
    hooks?: HooksConfig
  ) {
    this.db = db;
    this.adapters = adapters;
    this.agentConfig = agentConfig ?? {
      approval_policy: "auto",
      timeout_ms: 600000,
      max_turns: 20,
    };
    this.hooks = hooks ?? {};
  }

  async execute(params: ExecuteParams): Promise<ExecuteResult> {
    const warnings: string[] = [];

    for (const phase of params.pipeline.phases) {
      const maxCycles = phase.repeat?.max ?? 1;

      for (let cycle = 1; cycle <= maxCycles; cycle++) {
        let allStepsSucceeded = true;

        for (const step of phase.steps) {
          this.db.updateRunProgress(params.runId, phase.name, step.name);

          const maxAttempts = step.max_attempts ?? 1;
          let stepSucceeded = false;

          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const seId = newId();
            this.db.insertStepExecution({
              id: seId,
              run_id: params.runId,
              phase_name: phase.name,
              step_name: step.name,
              cycle,
              step_attempt: attempt,
              agent_adapter: step.agent || null,
            });

            let agentResult: { status: string; exitCode: number; stdout: string } | null = null;

            // Run before_run hook
            if (this.hooks.before_run) {
              runHook(this.hooks.before_run, params.workDir);
            }

            const agentName = step.agent || this.agentConfig.defaultAgent;
            if (agentName) {
              const adapter = this.adapters[agentName];
              if (!adapter) {
                this.db.updateStepResult(
                  seId,
                  "failed",
                  -1,
                  `Agent adapter "${agentName}" not found`
                );
                return {
                  success: false,
                  failureReason: `Agent adapter "${agentName}" not found`,
                  warnings,
                };
              }

              const prompt = params.promptRenderer(phase.name, step.name, cycle);
              const result = await adapter.execute({
                runId: params.runId,
                workDir: params.workDir,
                prompt,
                timeout_ms: this.agentConfig.timeout_ms,
                maxTurns: this.agentConfig.max_turns,
                approvalPolicy: this.agentConfig.approval_policy,
                env: {},
              });

              agentResult = result;

              // Run after_run hook
              if (this.hooks.after_run) {
                runHook(this.hooks.after_run, params.workDir);
              }

              if (result.status === "failed" || result.status === "timed_out") {
                this.db.updateStepResult(
                  seId,
                  result.status,
                  result.exitCode,
                  `Agent ${result.status}`
                );
                if (attempt < maxAttempts) continue;
              }
            } else {
              // No agent configured at all — fail
              this.db.updateStepResult(
                seId,
                "failed",
                -1,
                `No agent configured for step "${step.name}"`
              );
              return {
                success: false,
                failureReason: `No agent configured for step "${step.name}" and no defaultAgent set`,
                warnings,
              };
            }

            // Evaluate success condition
            const success = step.success
              ? await evaluateSuccess(step.success, params.workDir, agentResult)
              : agentResult
                ? agentResult.status === "succeeded"
                : true;

            this.db.updateStepResult(
              seId,
              success ? "succeeded" : "failed",
              agentResult?.exitCode ?? 0,
              success ? null : "Success condition not met"
            );

            if (success) {
              stepSucceeded = true;
              break;
            }

            if (attempt >= maxAttempts) break;
          }

          if (!stepSucceeded) {
            allStepsSucceeded = false;
            break;
          }
        }

        if (allStepsSucceeded) {
          break;
        }

        if (cycle >= maxCycles) {
          if (phase.repeat?.on_exhaust === "pass") {
            warnings.push(
              `Phase "${phase.name}" exhausted max cycles (${maxCycles}), auto-passing`
            );
            break;
          } else {
            return {
              success: false,
              failureReason: `Phase "${phase.name}" failed after ${maxCycles} cycles`,
              warnings,
            };
          }
        }
      }
    }

    return { success: true, warnings };
  }
}

function runHook(command: string, workDir: string): void {
  Bun.spawnSync(["sh", "-c", command], { cwd: workDir });
}

async function evaluateSuccess(
  condition: SuccessCondition,
  workDir: string,
  agentResult: { status: string; exitCode: number; stdout: string } | null
): Promise<boolean> {
  if (condition.always) return true;

  if (condition.command) {
    const result = Bun.spawnSync(["sh", "-c", condition.command], {
      cwd: workDir,
    });
    return result.exitCode === 0;
  }

  if (condition.agent_verdict && agentResult) {
    return agentResult.stdout
      .toLowerCase()
      .includes(condition.agent_verdict.toLowerCase());
  }

  if (condition.file_exists) {
    const filePath = join(workDir, condition.file_exists);
    return existsSync(filePath);
  }

  return agentResult ? agentResult.exitCode === 0 : true;
}
