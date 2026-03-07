import { Database } from "./db/database.ts";
import { LinearClient } from "./linear/client.ts";
import { WebhookHandler } from "./linear/webhook.ts";
import { WorkspaceManager } from "./workspace/manager.ts";
import { Orchestrator } from "./orchestrator/orchestrator.ts";
import { ClaudeCodeAdapter } from "./agents/claude-code.ts";
import { CodexAdapter } from "./agents/codex.ts";
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
import type { AgentSessionEvent } from "./linear/webhook.ts";
import { writeAuthCode, AUTH_CALLBACK_HTML } from "./cli/auth.ts";

export class FelizServer {
  private config: FelizConfig;
  private db: Database;
  private linearClient: LinearClient;
  private webhookHandler: WebhookHandler;
  private workspace: WorkspaceManager;
  private adapters: Record<string, AgentAdapter>;
  private logger = createLogger("server");
  private running = false;
  private httpServer: ReturnType<typeof Bun.serve> | null = null;

  constructor(config: FelizConfig) {
    this.config = config;

    // Ensure directories exist
    const dbDir = join(config.storage.data_dir, "db");
    mkdirSync(dbDir, { recursive: true });
    mkdirSync(config.storage.workspace_root, { recursive: true });

    this.db = new Database(join(dbDir, "feliz.db"));
    this.linearClient = new LinearClient(config.linear.oauth_token);
    this.webhookHandler = new WebhookHandler(this.db, this.linearClient);
    this.workspace = new WorkspaceManager(config.storage.workspace_root);

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
      tick_interval: this.config.tick.interval_ms,
      webhook_port: this.config.webhook.port,
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

    // Start webhook HTTP server
    this.httpServer = Bun.serve({
      port: this.config.webhook.port,
      fetch: (req) => this.handleRequest(req),
    });

    // Main tick loop
    while (this.running) {
      await this.tickCycle();
      await Bun.sleep(this.config.tick.interval_ms);
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.httpServer) {
      this.httpServer.stop();
      this.httpServer = null;
    }
    removePidFile(this.config.storage.data_dir);
    this.logger.info("Feliz server stopping");
    this.db.close();
  }

  async handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    this.logger.info(`${req.method} ${url.pathname}`);

    if (url.pathname === "/auth/callback") {
      const code = url.searchParams.get("code");
      if (!code) {
        return new Response("Missing code parameter", { status: 400 });
      }
      writeAuthCode(code);
      return new Response(AUTH_CALLBACK_HTML, {
        headers: { "Content-Type": "text/html" },
      });
    }

    if (req.method === "POST" && url.pathname === "/webhook/linear") {
      try {
        const rawBody = await req.text();
        this.logger.info("Webhook payload", { body: rawBody.slice(0, 2000) });
        const event = JSON.parse(rawBody) as AgentSessionEvent;
        if (event.type !== "AgentSession" && event.type !== "AgentSessionEvent") {
          this.logger.info(`Ignoring webhook type: ${(event as any).type}`, { action: (event as any).action });
          return new Response("ignored", { status: 200 });
        }

        const projectConfig = this.findProjectForIssue(event);
        if (!projectConfig) {
          return new Response("no matching project", { status: 200 });
        }

        const project = this.db.getProjectByName(projectConfig.name);
        if (!project) {
          return new Response("project not registered", { status: 200 });
        }

        const result = await this.webhookHandler.handleEvent(event, project.id);

        const repoConfig = this.loadRepoConfigForProject(projectConfig.name);
        const orchestrator = new Orchestrator(
          this.db,
          this.adapters,
          repoConfig,
          join(this.config.storage.data_dir, "scratchpad"),
          this.config.agent.max_concurrent,
          { workspace: this.workspace, linearClient: this.linearClient }
        );

        if (result.signal === "stop") {
          orchestrator.cancelWorkItem(result.workItemId);
          const wi = this.db.getWorkItem(result.workItemId);
          if (wi?.linear_session_id) {
            try {
              await this.linearClient.emitError(
                wi.linear_session_id,
                "Cancelled by user"
              );
            } catch {}
          }
        } else if (result.command?.command === "cancel") {
          orchestrator.cancelWorkItem(result.workItemId);
        } else {
          const wi = this.db.getWorkItem(result.workItemId);
          if (wi && wi.orchestration_state === "unclaimed") {
            orchestrator.processNewIssue(wi.id);
          }
        }

        return new Response(JSON.stringify({ ok: true, workItemId: result.workItemId }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (e: any) {
        this.logger.error(`Webhook error: ${e.message}`);
        return new Response("error", { status: 500 });
      }
    }

    return new Response("not found", { status: 404 });
  }

  private async tickCycle(): Promise<void> {
    for (const projConfig of this.config.projects) {
      const project = this.db.getProjectByName(projConfig.name);
      if (!project) continue;

      try {
        const repoConfig = this.loadRepoConfigForProject(projConfig.name);
        const pipeline = this.loadPipelineForProject(projConfig.name, repoConfig);

        const orchestrator = new Orchestrator(
          this.db,
          this.adapters,
          repoConfig,
          join(this.config.storage.data_dir, "scratchpad"),
          this.config.agent.max_concurrent,
          { workspace: this.workspace, linearClient: this.linearClient }
        );

        const workDir = this.workspace.getRepoPath(projConfig.name);
        if (existsSync(workDir)) {
          await orchestrator.processDecomposing(project.id, workDir);
          await orchestrator.processSpecDrafting(project.id, workDir);
        }

        // Promote retry_queued items whose backoff has elapsed
        orchestrator.promoteRetryQueued(project.id);

        // Dispatch queued items
        if (existsSync(workDir)) {
          await orchestrator.dispatchQueued(project.id, pipeline, workDir);
        }
      } catch (e: any) {
        this.logger.error(`Tick cycle error for ${projConfig.name}: ${e.message}`, {
          project_id: project.id,
        });
      }
    }
  }

  private findProjectForIssue(event: AgentSessionEvent) {
    // Try issue.project first
    const issueProject = event.agentSession.issue.project?.name;
    if (issueProject) {
      const match = this.config.projects.find(
        (p) => p.linear_project === issueProject
      );
      if (match) return match;
    }

    // Try extracting from promptContext XML
    const ctx = event.agentSession.promptContext;
    if (ctx) {
      const projectMatch = ctx.match(/<project\s+name="([^"]+)"/);
      if (projectMatch) {
        const match = this.config.projects.find(
          (p) => p.linear_project === projectMatch[1]
        );
        if (match) return match;
      }
    }

    return this.config.projects[0] ?? null;
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
