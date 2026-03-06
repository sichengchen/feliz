import { Database } from "./db/database.ts";
import { LinearClient } from "./linear/client.ts";
import { IssuePoller } from "./linear/poller.ts";
import { WorkspaceManager } from "./workspace/manager.ts";
import { Orchestrator } from "./orchestrator/orchestrator.ts";
import { Publisher } from "./publishing/publisher.ts";
import { ClaudeCodeAdapter } from "./agents/claude-code.ts";
import { CodexAdapter } from "./agents/codex.ts";
import { ContextAssembler } from "./context/assembler.ts";
import {
  loadRepoConfig,
  loadPipelineConfig,
  getDefaultPipeline,
} from "./config/loader.ts";
import { createLogger } from "./logger/index.ts";
import type { FelizConfig } from "./config/types.ts";
import type { AgentAdapter } from "./agents/adapter.ts";
import { existsSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import { writePidFile, removePidFile } from "./pid.ts";

export class FelizServer {
  private config: FelizConfig;
  private db: Database;
  private linearClient: LinearClient;
  private poller: IssuePoller;
  private workspace: WorkspaceManager;
  private publisher: Publisher;
  private adapters: Record<string, AgentAdapter>;
  private logger = createLogger("server");
  private running = false;

  constructor(config: FelizConfig) {
    this.config = config;

    // Ensure directories exist
    const dbDir = join(config.storage.data_dir, "db");
    mkdirSync(dbDir, { recursive: true });
    mkdirSync(config.storage.workspace_root, { recursive: true });

    this.db = new Database(join(dbDir, "feliz.db"));
    this.linearClient = new LinearClient(config.linear.api_key);
    this.poller = new IssuePoller(this.db, this.linearClient);
    this.workspace = new WorkspaceManager(config.storage.workspace_root);
    this.publisher = new Publisher();

    // Register adapters
    this.adapters = {
      "claude-code": new ClaudeCodeAdapter(),
      "codex": new CodexAdapter(),
    };
  }

  async start(): Promise<void> {
    this.running = true;
    writePidFile(this.config.storage.data_dir);

    const shutdown = () => {
      this.stop();
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);

    this.logger.info("Feliz server started", {
      projects: this.config.projects.length,
      polling_interval: this.config.polling.interval_ms,
    });

    // Register projects in DB
    for (const proj of this.config.projects) {
      const existing = this.db.getProjectByName(proj.name);
      if (!existing) {
        const { newId } = await import("./id.ts");
        this.db.insertProject({
          id: newId(),
          name: proj.name,
          repo_url: proj.repo,
          linear_project_name: proj.linear_project,
          base_branch: proj.branch,
        });
        this.logger.info(`Registered project: ${proj.name}`);

        // Clone repo if not already cloned
        const repoPath = this.workspace.getRepoPath(proj.name);
        if (!existsSync(repoPath)) {
          try {
            await this.workspace.cloneRepo(proj.name, proj.repo);
            this.logger.info(`Cloned repo for ${proj.name}`);
          } catch (e: any) {
            this.logger.error(`Failed to clone repo for ${proj.name}: ${e.message}`);
          }
        }
      }
    }

    // Main poll loop
    while (this.running) {
      await this.pollCycle();
      await Bun.sleep(this.config.polling.interval_ms);
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    removePidFile(this.config.storage.data_dir);
    this.logger.info("Feliz server stopping");
    this.db.close();
  }

  private async pollCycle(): Promise<void> {
    for (const projConfig of this.config.projects) {
      const project = this.db.getProjectByName(projConfig.name);
      if (!project) continue;

      try {
        // Poll Linear for issues
        const events = await this.poller.poll(
          project.id,
          projConfig.linear_project
        );

        for (const event of events) {
          this.logger.info(`Event: ${event.event_type}`, {
            project_id: project.id,
            ...event.payload,
          });
        }

        // Process new unclaimed issues
        const repoConfig = this.loadRepoConfigForProject(projConfig.name);
        const pipeline = this.loadPipelineForProject(projConfig.name, repoConfig);

        const orchestrator = new Orchestrator(
          this.db,
          this.adapters,
          repoConfig,
          join(this.config.storage.data_dir, "scratchpad"),
          this.config.agent.max_concurrent
        );

        // Transition unclaimed to queued/spec_drafting
        const unclaimed = this.db.listWorkItemsByState(project.id, "unclaimed");
        for (const wi of unclaimed) {
          orchestrator.processNewIssue(wi.id);
        }

        // Dispatch queued items
        const workDir = this.workspace.getRepoPath(projConfig.name);
        if (existsSync(workDir)) {
          await orchestrator.dispatchQueued(project.id, pipeline, workDir);
        }
      } catch (e: any) {
        this.logger.error(`Poll cycle error for ${projConfig.name}: ${e.message}`, {
          project_id: project.id,
        });
      }
    }
  }

  private loadRepoConfigForProject(projectName: string): ReturnType<typeof loadRepoConfig> {
    const repoPath = this.workspace.getRepoPath(projectName);
    const configPath = join(repoPath, ".feliz", "config.yml");
    if (existsSync(configPath)) {
      return loadRepoConfig(readFileSync(configPath, "utf-8"));
    }
    return loadRepoConfig("");
  }

  private loadPipelineForProject(
    projectName: string,
    repoConfig: ReturnType<typeof loadRepoConfig>
  ) {
    const repoPath = this.workspace.getRepoPath(projectName);
    const pipelinePath = join(repoPath, ".feliz", "pipeline.yml");
    if (existsSync(pipelinePath)) {
      return loadPipelineConfig(readFileSync(pipelinePath, "utf-8"));
    }
    return getDefaultPipeline(repoConfig.gates.test_command);
  }
}
