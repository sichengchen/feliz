// Core
export { Database } from "./db/database.ts";
export { createLogger } from "./logger/index.ts";
export { newId } from "./id.ts";

// Config
export { loadFelizConfig, loadRepoConfig, loadPipelineConfig, getDefaultPipeline, resolveEnvVars } from "./config/loader.ts";
export { renderTemplate } from "./config/template.ts";
export type { FelizConfig, RepoConfig, PipelineDefinition, PipelinePhase, PipelineStep, SuccessCondition, ProjectConfig } from "./config/types.ts";

// Domain
export type { Project, WorkItem, Run, StepExecution, HistoryEntry, OrchestrationState, RunResult, StepResult, ContextSnapshot, ArtifactRef } from "./domain/types.ts";

// Linear
export { LinearClient } from "./linear/client.ts";
export type { LinearIssue, FetchResult } from "./linear/client.ts";
export { WebhookHandler } from "./linear/webhook.ts";
export type { AgentSessionEvent, WebhookResult } from "./linear/webhook.ts";
export { parseCommand } from "./linear/commands.ts";
export type { FelizCommand } from "./linear/commands.ts";

// Workspace
export { WorkspaceManager, sanitizeIdentifier } from "./workspace/manager.ts";

// Agents
export type { AgentAdapter, AgentRunParams, AgentRunResult } from "./agents/adapter.ts";
export { ClaudeCodeAdapter } from "./agents/claude-code.ts";
export { CodexAdapter } from "./agents/codex.ts";

// Pipeline
export { PipelineExecutor } from "./pipeline/executor.ts";
export type { ExecuteParams, ExecuteResult, AgentConfig, HooksConfig } from "./pipeline/executor.ts";

// Context
export { ContextAssembler } from "./context/assembler.ts";
export type { AssembledContext, MemoryItem, ScratchpadItem, SpecItem } from "./context/assembler.ts";

// Orchestrator
export { Orchestrator } from "./orchestrator/orchestrator.ts";
export { canTransition, getValidTransitions, nextStateForNewIssue } from "./orchestrator/state-machine.ts";
export { ConcurrencyManager } from "./orchestrator/concurrency.ts";
export { computeRetryDelay, shouldRetry } from "./orchestrator/retry.ts";
export { SpecEngine } from "./orchestrator/spec-engine.ts";
export { DecompositionEngine } from "./orchestrator/decomposition.ts";
export type { SubIssueProposal } from "./orchestrator/decomposition.ts";

// Server
export { FelizServer } from "./server.ts";
