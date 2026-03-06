import type { Database } from "../db/database.ts";
import type { AgentAdapter } from "../agents/adapter.ts";
import type { RepoConfig, PipelineDefinition, PipelineStep } from "../config/types.ts";
import { PipelineExecutor } from "../pipeline/executor.ts";
import { ContextAssembler } from "../context/assembler.ts";
import { canTransition, nextStateForNewIssue } from "./state-machine.ts";
import { SpecEngine } from "./spec-engine.ts";
import { DecompositionEngine } from "./decomposition.ts";
import { renderTemplate } from "../config/template.ts";
import { newId } from "../id.ts";
import type { OrchestrationState, WorkItem } from "../domain/types.ts";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const MAX_RETRY_BACKOFF_MS = 300000;
const DEFAULT_MAX_RETRIES = 3;
const TERMINAL_STATES: OrchestrationState[] = ["completed", "failed", "cancelled"];

interface WorkspaceRuntime {
  createWorktree?: (
    projectName: string,
    identifier: string,
    baseBranch: string
  ) => Promise<string>;
  removeWorktree?: (projectName: string, identifier: string) => Promise<void>;
  getBranchName?: (identifier: string) => string;
  runHook?: (
    workDir: string,
    command: string
  ) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

interface OrchestratorOptions {
  workspace?: WorkspaceRuntime;
}

export class Orchestrator {
  private db: Database;
  private adapters: Record<string, AgentAdapter>;
  private repoConfig: RepoConfig;
  private scratchpadRoot: string;
  private maxConcurrent: number;
  private options: OrchestratorOptions;

  constructor(
    db: Database,
    adapters: Record<string, AgentAdapter>,
    repoConfig: RepoConfig,
    scratchpadRoot: string,
    maxConcurrent: number,
    options: OrchestratorOptions = {}
  ) {
    this.db = db;
    this.adapters = adapters;
    this.repoConfig = repoConfig;
    this.scratchpadRoot = scratchpadRoot;
    this.maxConcurrent = maxConcurrent;
    this.options = options;
  }

  processNewIssue(workItemId: string): void {
    const wi = this.db.getWorkItem(workItemId);
    if (!wi || wi.orchestration_state !== "unclaimed") return;

    const isLargeFeature = wi.labels.includes("epic");
    const nextState = nextStateForNewIssue(
      this.repoConfig.specs.enabled,
      isLargeFeature
    );

    this.transition(wi, nextState);
  }

  async dispatchQueued(
    projectId: string,
    pipeline: PipelineDefinition,
    workDir: string
  ): Promise<string[]> {
    const running = this.db.countRunningItems();
    if (running >= this.maxConcurrent) return [];

    const available = this.maxConcurrent - running;
    const queued = this.db.listWorkItemsByState(projectId, "queued");
    const stateLimits = this.repoConfig.concurrency.max_per_state ?? {};
    const runningInProject = this.db.listWorkItemsByState(projectId, "running");
    const runningByState = new Map<string, number>();
    for (const item of runningInProject) {
      runningByState.set(item.state, (runningByState.get(item.state) ?? 0) + 1);
    }

    const toDispatch: WorkItem[] = [];
    for (const wi of queued) {
      if (!this.areBlockersResolved(wi)) continue;

      const perStateLimit = stateLimits[wi.state];
      const currentlyRunningInState = runningByState.get(wi.state) ?? 0;
      if (
        perStateLimit !== undefined &&
        currentlyRunningInState >= perStateLimit
      ) {
        continue;
      }

      toDispatch.push(wi);
      if (perStateLimit !== undefined) {
        runningByState.set(wi.state, currentlyRunningInState + 1);
      }
      if (toDispatch.length >= available) break;
    }

    const dispatched: string[] = [];

    for (const wi of toDispatch) {
      await this.executeWorkItem(wi, pipeline, workDir);
      dispatched.push(wi.id);
    }

    return dispatched;
  }

  promoteRetryQueued(projectId: string, now: Date = new Date()): string[] {
    const retryQueued = this.db.listWorkItemsByState(projectId, "retry_queued");
    const promoted: string[] = [];

    for (const wi of retryQueued) {
      const retryReadyAt = this.getRetryReadyAt(wi);
      if (retryReadyAt && retryReadyAt.getTime() > now.getTime()) {
        continue;
      }

      this.transition(wi, "queued");
      promoted.push(wi.id);
    }

    return promoted;
  }

  async processSpecDrafting(projectId: string, workDir: string): Promise<string[]> {
    if (!this.repoConfig.specs.enabled) return [];

    const items = this.db.listWorkItemsByState(projectId, "spec_drafting");
    if (items.length === 0) return [];

    const adapter = this.adapters[this.repoConfig.agent.adapter];
    if (!adapter) return [];

    const engine = new SpecEngine(this.db, adapter);
    const processed: string[] = [];

    for (const wi of items) {
      const result = await engine.draftSpec({
        workItemId: wi.id,
        workDir,
        specDir: this.repoConfig.specs.directory,
      });
      if (!result.success) continue;

      if (!this.repoConfig.specs.approval_required) {
        engine.approveSpec(wi.id);
      }
      processed.push(wi.id);
    }

    return processed;
  }

  async processDecomposing(projectId: string, workDir: string): Promise<string[]> {
    const items = this.db.listWorkItemsByState(projectId, "decomposing");
    if (items.length === 0) return [];

    const adapter = this.adapters[this.repoConfig.agent.adapter];
    if (!adapter) return [];

    const engine = new DecompositionEngine(this.db, adapter);
    const processed: string[] = [];

    for (const wi of items) {
      const result = await engine.proposeDecomposition({
        workItemId: wi.id,
        workDir,
        specsEnabled: this.repoConfig.specs.enabled,
        specDir: this.repoConfig.specs.directory,
      });
      if (result.success) {
        processed.push(wi.id);
      }
    }

    return processed;
  }

  checkParentCompletion(parentWorkItemId: string): void {
    const parent = this.db.getWorkItem(parentWorkItemId);
    if (!parent) return;

    // Only check parents that are in decompose_review state
    if (parent.orchestration_state !== "decompose_review") return;

    const children = this.db.listChildWorkItems(parentWorkItemId);
    if (children.length === 0) return;

    // All children must be in "completed" state
    const allCompleted = children.every(
      (child) => child.orchestration_state === "completed"
    );

    if (allCompleted) {
      this.db.updateWorkItemOrchestrationState(parent.id, "completed");
      this.db.appendHistory({
        id: newId(),
        project_id: parent.project_id,
        work_item_id: parent.id,
        run_id: null,
        event_type: "parent.auto_completed",
        payload: {
          child_count: children.length,
          child_ids: children.map((c) => c.id),
        },
      });
    }
  }

  cancelWorkItem(workItemId: string): void {
    const wi = this.db.getWorkItem(workItemId);
    if (!wi) return;
    this.transition(wi, "cancelled");
  }

  computeRetryDelay(attempt: number): number {
    const baseDelay = 10000 * Math.pow(2, attempt - 1);
    const delay = Math.min(baseDelay, MAX_RETRY_BACKOFF_MS);
    const jitter = Math.random() * 2000;
    return delay + jitter;
  }

  private areBlockersResolved(wi: WorkItem): boolean {
    if (wi.blocker_ids.length === 0) return true;

    for (const blockerId of wi.blocker_ids) {
      const blocker = this.db.getWorkItemByLinearId(blockerId);
      if (!blocker) continue; // unknown blocker, treat as resolved
      if (!TERMINAL_STATES.includes(blocker.orchestration_state)) {
        return false;
      }
    }
    return true;
  }

  private async executeWorkItem(
    wi: WorkItem,
    pipeline: PipelineDefinition,
    workDir: string
  ): Promise<void> {
    this.transition(wi, "running");

    const project = this.db.getProject(wi.project_id);
    const workspace = this.options.workspace;
    let executionDir = workDir;
    let usingWorktree = false;
    const branchName =
      workspace?.getBranchName?.(wi.linear_identifier) ??
      `feliz/${wi.linear_identifier}`;

    if (
      project &&
      workspace?.createWorktree &&
      workspace?.removeWorktree &&
      workspace?.getBranchName
    ) {
      executionDir = await workspace.createWorktree(
        project.name,
        wi.linear_identifier,
        project.base_branch
      );
      usingWorktree = true;

      if (this.repoConfig.hooks.after_create && workspace.runHook) {
        const hook = await workspace.runHook(
          executionDir,
          this.repoConfig.hooks.after_create
        );
        if (hook.exitCode !== 0) {
          throw new Error(
            `after_create hook failed: ${hook.stderr || hook.stdout}`
          );
        }
      }
    }

    const runId = newId();
    const contextAssembler = new ContextAssembler(this.db, this.scratchpadRoot);
    const context = contextAssembler.assemble(
      wi.project_id,
      wi.id,
      executionDir,
      runId,
      this.repoConfig.specs.enabled ? this.repoConfig.specs.directory : null
    );
    const snapshotId = contextAssembler.createSnapshot(runId, wi.id, context);

    const latestRun = this.db.getLatestRunForWorkItem(wi.id);
    const attempt = latestRun ? latestRun.attempt + 1 : 1;

    this.db.insertRun({
      id: runId,
      work_item_id: wi.id,
      attempt,
      current_phase: pipeline.phases[0]?.name ?? "",
      current_step: pipeline.phases[0]?.steps[0]?.name ?? "",
      context_snapshot_id: snapshotId,
    });

    this.db.appendHistory({
      id: newId(),
      project_id: wi.project_id,
      work_item_id: wi.id,
      run_id: runId,
      event_type: "run.started",
      payload: { attempt, agent_adapter: this.repoConfig.agent.adapter },
    });

    const executor = new PipelineExecutor(
      this.db,
      this.adapters,
      {
        approval_policy: this.repoConfig.agent.approval_policy,
        timeout_ms: this.repoConfig.agent.timeout_ms,
        max_turns: this.repoConfig.agent.max_turns,
      },
      {
        before_run: this.repoConfig.hooks.before_run,
        after_run: this.repoConfig.hooks.after_run,
      }
    );
    const promptTemplateCache = new Map<string, string>();
    const result = await executor.execute({
      runId,
      workDir: executionDir,
      pipeline,
      promptRenderer: (phaseName, stepName, cycle) => {
        const template = this.getStepPromptTemplate(
          executionDir,
          pipeline,
          phaseName,
          stepName,
          promptTemplateCache
        );
        const project = this.db.getProject(wi.project_id);

        return renderTemplate(template, {
          project: { name: project?.name ?? wi.project_id },
          issue: {
            identifier: wi.linear_identifier,
            title: wi.title,
            description: wi.description,
            labels: wi.labels,
            priority: wi.priority,
          },
          phase: { name: phaseName },
          step: { name: stepName },
          cycle: cycle > 1 ? cycle : null,
          attempt: attempt > 1 ? attempt : null,
        });
      },
    });

    if (result.success) {
      this.db.updateRunResult(runId, "succeeded", null, null);
      this.db.appendHistory({
        id: newId(),
        project_id: wi.project_id,
        work_item_id: wi.id,
        run_id: runId,
        event_type: "run.completed",
        payload: { result: "succeeded" },
      });
      const updatedWi = this.db.getWorkItem(wi.id)!;
      this.transition(updatedWi, "completed");
      if (updatedWi.parent_work_item_id) {
        this.checkParentCompletion(updatedWi.parent_work_item_id);
      }
    } else {
      this.db.updateRunResult(
        runId,
        "failed",
        result.failureReason ?? "Unknown failure",
        null
      );
      this.db.appendHistory({
        id: newId(),
        project_id: wi.project_id,
        work_item_id: wi.id,
        run_id: runId,
        event_type: "run.failed",
        payload: this.buildRunFailedPayload(result.failureReason, attempt),
      });

      const updatedWi = this.db.getWorkItem(wi.id)!;
      if (attempt < DEFAULT_MAX_RETRIES) {
        this.transition(updatedWi, "retry_queued");
      } else {
        this.transition(updatedWi, "failed");
      }
    }

    if (
      usingWorktree &&
      project &&
      workspace?.removeWorktree
    ) {
      if (this.repoConfig.hooks.before_remove && workspace.runHook) {
        await workspace.runHook(executionDir, this.repoConfig.hooks.before_remove);
      }
      await workspace.removeWorktree(project.name, wi.linear_identifier);
    }
  }

  private buildRunFailedPayload(
    failureReason: string | undefined,
    attempt: number
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      failure_reason: failureReason,
      attempt,
    };

    if (attempt < DEFAULT_MAX_RETRIES) {
      const retryDelayMs = this.computeRetryDelay(attempt);
      payload.retry_delay_ms = Math.round(retryDelayMs);
      payload.retry_ready_at = new Date(Date.now() + retryDelayMs).toISOString();
    }

    return payload;
  }

  private getRetryReadyAt(wi: WorkItem): Date | null {
    const latestRun = this.db.getLatestRunForWorkItem(wi.id);
    if (!latestRun) return null;

    const history = this.db.getHistory(wi.project_id, wi.id);
    for (let idx = history.length - 1; idx >= 0; idx--) {
      const entry = history[idx]!;
      if (entry.event_type !== "run.failed") continue;
      if (entry.run_id !== latestRun.id) continue;

      const retryReadyAt = entry.payload.retry_ready_at;
      if (typeof retryReadyAt !== "string") break;
      const parsed = new Date(retryReadyAt);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
      break;
    }

    if (!latestRun.finished_at) return null;
    const backoffMs = Math.min(
      10000 * Math.pow(2, Math.max(0, latestRun.attempt - 1)),
      MAX_RETRY_BACKOFF_MS
    );
    return new Date(latestRun.finished_at.getTime() + backoffMs);
  }

  private getStepPromptTemplate(
    workDir: string,
    pipeline: PipelineDefinition,
    phaseName: string,
    stepName: string,
    cache: Map<string, string>
  ): string {
    const step = this.findPipelineStep(pipeline, phaseName, stepName);
    const configuredPromptPath = step?.prompt ?? "WORKFLOW.md";
    const cacheKey = configuredPromptPath;
    const cached = cache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const configuredPrompt = this.readPromptTemplate(workDir, configuredPromptPath);
    if (configuredPrompt !== null) {
      cache.set(cacheKey, configuredPrompt);
      return configuredPrompt;
    }

    const workflowPrompt = this.readPromptTemplate(workDir, "WORKFLOW.md");
    if (workflowPrompt !== null) {
      cache.set("WORKFLOW.md", workflowPrompt);
      return workflowPrompt;
    }

    const fallback = "{{ issue.title }}\n{{ issue.description }}";
    cache.set(cacheKey, fallback);
    return fallback;
  }

  private findPipelineStep(
    pipeline: PipelineDefinition,
    phaseName: string,
    stepName: string
  ): PipelineStep | undefined {
    const phase = pipeline.phases.find((p) => p.name === phaseName);
    if (!phase) return undefined;
    return phase.steps.find((s) => s.name === stepName);
  }

  private readPromptTemplate(workDir: string, promptPath: string): string | null {
    const fullPath = join(workDir, promptPath);
    if (!existsSync(fullPath)) {
      return null;
    }
    return readFileSync(fullPath, "utf-8");
  }

  private transition(wi: WorkItem, to: OrchestrationState): void {
    if (!canTransition(wi.orchestration_state, to)) {
      throw new Error(
        `Invalid transition: ${wi.orchestration_state} → ${to} for work item ${wi.id}`
      );
    }
    this.db.updateWorkItemOrchestrationState(wi.id, to);
  }
}
