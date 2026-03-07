#!/usr/bin/env bun
import { parseArgs } from "./commands.ts";
import { loadFelizConfig, loadFelizProjectAddConfig } from "../config/loader.ts";
import { Database } from "../db/database.ts";
import { createLogger } from "../logger/index.ts";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { validateAllConfigs } from "./validate.ts";

const HELP_TEXT = `
feliz - Cloud agents platform

Usage: feliz <command> [options]

Commands:
  start                    Start the Feliz daemon
  init                     Interactive setup wizard
  stop                     Stop the daemon
  status                   Show daemon status
  config validate          Validate configuration
  config show              Print resolved configuration
  project list             List configured projects
  project add              Add a new project
  project remove <name>    Remove a project
  run list                 List recent runs
  run show <run_id>        Show run details
  run retry <work_item>    Retry a failed work item
  agent list               List installed agents
  context history <proj>   Show history events
  context show <item>      Show context snapshot
  auth linear              Authenticate with Linear (OAuth flow)
  e2e doctor               Validate local E2E prerequisites
  e2e smoke                Run automated E2E smoke checks

Options:
  --config <path>          Path to feliz.yml (default: ~/.feliz/feliz.yml)
  --json                   Print report as JSON (for e2e commands)
  --out <path>             Write report JSON to file (for e2e commands)
  --help                   Show this help
`.trim();

function loadConfig(configPath: string) {
  if (!existsSync(configPath)) {
    console.error(`Config file not found: ${configPath}`);
    process.exit(1);
  }
  const content = readFileSync(configPath, "utf-8");
  return loadFelizConfig(content);
}

function loadProjectAddConfig(configPath: string) {
  if (!existsSync(configPath)) {
    console.error(`Config file not found: ${configPath}`);
    process.exit(1);
  }
  const content = readFileSync(configPath, "utf-8");
  return loadFelizProjectAddConfig(content);
}

function openDb(configPath: string) {
  const config = loadConfig(configPath);
  const dbPath = join(config.storage.data_dir, "db", "feliz.db");
  if (!existsSync(dbPath)) {
    return { config, db: null, dbPath };
  }
  return { config, db: new Database(dbPath), dbPath };
}

async function main() {
  const cmd = parseArgs(process.argv.slice(2));
  const logger = createLogger("cli");

  if (cmd.command === "help") {
    console.log(HELP_TEXT);
    return;
  }

  const configPath =
    cmd.flags.config ?? join(homedir(), ".feliz", "feliz.yml");

  if (cmd.command === "config" && cmd.subcommand === "validate") {
    try {
      const result = validateAllConfigs(configPath);
      console.log(
        `Configuration is valid. Validated ${result.validated_projects} project(s), ${result.checked_repo_configs} repo config(s), ${result.checked_pipelines} pipeline config(s).`
      );
    } catch (e: any) {
      console.error(`Configuration error: ${e.message}`);
      process.exit(1);
    }
    return;
  }

  if (cmd.command === "config" && cmd.subcommand === "show") {
    try {
      const config = loadConfig(configPath);
      console.log(JSON.stringify(config, null, 2));
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
    return;
  }

  if (cmd.command === "status") {
    try {
      if (!existsSync(configPath)) {
        console.log("Feliz is not configured. Run `feliz init` first.");
        return;
      }
      const config = loadConfig(configPath);
      const dbPath = join(config.storage.data_dir, "db", "feliz.db");
      if (!existsSync(dbPath)) {
        console.log(
          `Feliz is configured but not running. ${config.projects.length} project(s) configured.`
        );
        return;
      }
      const db = new Database(dbPath);
      const projects = db.listProjects();
      const running = db.countRunningItems();
      console.log(
        `Feliz status: ${projects.length} project(s), ${running} running agent(s).`
      );
      for (const p of projects) {
        console.log(`  ${p.name}: watching "${p.linear_project_name}"`);
      }
      db.close();
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
    return;
  }

  if (cmd.command === "project" && cmd.subcommand === "list") {
    try {
      const config = loadConfig(configPath);
      for (const p of config.projects) {
        console.log(`${p.name}: ${p.repo} (${p.linear_project})`);
      }
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
    return;
  }

  if (cmd.command === "run" && cmd.subcommand === "list") {
    try {
      const { db } = openDb(configPath);
      if (!db) {
        console.log("No runs found. Feliz has not been started yet.");
        return;
      }
      const runs = db.listRuns();
      if (runs.length === 0) {
        console.log("No runs found.");
        db.close();
        return;
      }
      console.log("ID            Work Item   Project        Status     Phase/Step         Started");
      console.log("─".repeat(90));
      for (const r of runs) {
        const wi = db.getWorkItem(r.work_item_id);
        const identifier = wi?.linear_identifier ?? r.work_item_id.slice(0, 8);
        const project = wi ? db.getProject(wi.project_id) : null;
        const projName = project?.name ?? "-";
        const status = r.result ?? "running";
        const phase = `${r.current_phase}/${r.current_step}`;
        const started = r.started_at.toISOString().slice(0, 19).replace("T", " ");
        console.log(
          `${r.id.padEnd(14)}${identifier.padEnd(12)}${projName.padEnd(15)}${status.padEnd(11)}${phase.padEnd(19)}${started}`
        );
      }
      db.close();
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
    return;
  }

  if (cmd.command === "run" && cmd.subcommand === "show") {
    const runId = cmd.args[0];
    if (!runId) {
      console.error("Usage: feliz run show <run_id>");
      process.exit(1);
    }
    try {
      const { db } = openDb(configPath);
      if (!db) {
        console.error("No data found. Feliz has not been started yet.");
        process.exit(1);
      }
      const run = db.getRun(runId);
      if (!run) {
        console.error(`Run not found: ${runId}`);
        db.close();
        process.exit(1);
      }
      const wi = db.getWorkItem(run.work_item_id);
      console.log(`Run:        ${run.id}`);
      console.log(`Work Item:  ${wi?.linear_identifier ?? run.work_item_id}`);
      console.log(`Attempt:    ${run.attempt}`);
      console.log(`Status:     ${run.result ?? "running"}`);
      console.log(`Phase/Step: ${run.current_phase}/${run.current_step}`);
      console.log(`Started:    ${run.started_at.toISOString()}`);
      if (run.finished_at) console.log(`Finished:   ${run.finished_at.toISOString()}`);
      if (run.pr_url) console.log(`PR:         ${run.pr_url}`);
      if (run.failure_reason) console.log(`Failure:    ${run.failure_reason}`);
      if (run.token_usage) console.log(`Tokens:     ${run.token_usage.input} in / ${run.token_usage.output} out`);

      const steps = db.listStepExecutionsForRun(runId);
      if (steps.length > 0) {
        console.log("\nStep Executions:");
        for (const s of steps) {
          const sStatus = s.result ?? "running";
          const agent = s.agent_adapter ?? "-";
          console.log(`  ${s.phase_name}/${s.step_name} (cycle ${s.cycle}, attempt ${s.step_attempt}): ${sStatus} [${agent}]`);
        }
      }
      db.close();
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
    return;
  }

  if (cmd.command === "run" && cmd.subcommand === "retry") {
    const identifier = cmd.args[0];
    if (!identifier) {
      console.error("Usage: feliz run retry <work_item_identifier>");
      process.exit(1);
    }
    try {
      const { db } = openDb(configPath);
      if (!db) {
        console.error("No data found. Feliz has not been started yet.");
        process.exit(1);
      }
      const wi = db.getWorkItemByLinearIdentifier(identifier);
      if (!wi) {
        console.error(`Work item not found: ${identifier}`);
        db.close();
        process.exit(1);
      }
      if (wi.orchestration_state !== "failed") {
        console.error(`Work item ${identifier} is in state "${wi.orchestration_state}", not "failed". Only failed items can be retried.`);
        db.close();
        process.exit(1);
      }
      db.updateWorkItemOrchestrationState(wi.id, "retry_queued");
      console.log(`Queued ${identifier} for retry.`);
      db.close();
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
    return;
  }

  if (cmd.command === "context" && cmd.subcommand === "history") {
    const projectName = cmd.args[0];
    if (!projectName) {
      console.error("Usage: feliz context history <project>");
      process.exit(1);
    }
    try {
      const { db } = openDb(configPath);
      if (!db) {
        console.log("No history found. Feliz has not been started yet.");
        return;
      }
      const project = db.getProjectByName(projectName);
      if (!project) {
        console.error(`Project not found: ${projectName}`);
        db.close();
        process.exit(1);
      }
      const entries = db.getHistory(project.id);
      if (entries.length === 0) {
        console.log(`No history events for project "${projectName}".`);
        db.close();
        return;
      }
      for (const e of entries) {
        const ts = e.created_at.toISOString().slice(0, 19).replace("T", " ");
        const wi = e.work_item_id ?? "-";
        console.log(`${ts}  ${e.event_type.padEnd(25)} work_item=${wi}`);
      }
      db.close();
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
    return;
  }

  if (cmd.command === "context" && cmd.subcommand === "show") {
    const identifier = cmd.args[0];
    if (!identifier) {
      console.error("Usage: feliz context show <work_item_identifier>");
      process.exit(1);
    }
    try {
      const { db } = openDb(configPath);
      if (!db) {
        console.error("No data found. Feliz has not been started yet.");
        process.exit(1);
      }
      const wi = db.getWorkItemByLinearIdentifier(identifier);
      if (!wi) {
        console.error(`Work item not found: ${identifier}`);
        db.close();
        process.exit(1);
      }
      const snap = db.getLatestSnapshotForWorkItem(wi.id);
      if (!snap) {
        console.log(`No context snapshot for ${identifier}.`);
        db.close();
        return;
      }
      console.log(`Snapshot:    ${snap.id}`);
      console.log(`Work Item:   ${identifier}`);
      console.log(`Created:     ${snap.created_at.toISOString()}`);
      console.log(`Token Budget: ${snap.token_budget.max_input} max input, ${snap.token_budget.reserved_system} reserved`);
      if (snap.artifact_refs.length > 0) {
        console.log("\nArtifacts:");
        for (const ref of snap.artifact_refs) {
          console.log(`  ${ref.path} (${ref.purpose})`);
        }
      }
      db.close();
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
    return;
  }

  if (cmd.command === "agent" && cmd.subcommand === "list") {
    const { ClaudeCodeAdapter } = await import("../agents/claude-code.ts");
    const { CodexAdapter } = await import("../agents/codex.ts");
    const adapters = [new ClaudeCodeAdapter(), new CodexAdapter()];
    console.log("Agent          Available");
    console.log("─".repeat(30));
    for (const a of adapters) {
      const available = await a.isAvailable();
      console.log(`${a.name.padEnd(15)}${available ? "yes" : "no"}`);
    }
    return;
  }

  if (cmd.command === "project" && cmd.subcommand === "add") {
    try {
      if (!existsSync(configPath)) {
        console.error("Config file not found. Run `feliz init` first.");
        process.exit(1);
      }
      const config = loadProjectAddConfig(configPath);
      const { LinearClient } = await import("../linear/client.ts");
      const { WorkspaceManager } = await import("../workspace/manager.ts");
      const { addProjectToConfig } = await import("./project.ts");
      const {
        repoHasFelizConfig,
        writeRepoScaffold,
        writeRepoScaffoldWithAgent,
        gitCommitAndPush,
      } = await import("./repo-scaffold.ts");
      const { ClaudeCodeAdapter } = await import("../agents/claude-code.ts");
      const { CodexAdapter } = await import("../agents/codex.ts");
      const { runProjectAddWizard } = await import("./project-add-wizard.ts");

      const linearClient = new LinearClient(config.linear.oauth_token);
      const workspace = new WorkspaceManager(config.storage.workspace_root);
      const adapters = {
        "claude-code": new ClaudeCodeAdapter(),
        codex: new CodexAdapter(),
      };

      await runProjectAddWizard({
        prompt: globalThis.prompt,
        fetchProjects: () => linearClient.fetchProjects(),
        cloneRepo: (name, url) => workspace.cloneRepo(name, url),
        repoHasFelizConfig,
        writeRepoScaffoldWithAgent: async (repoPath, adapterName, answers) => {
          const adapter = adapters[adapterName as keyof typeof adapters];
          if (!adapter) {
            return {
              success: false,
              reason: `unknown adapter "${adapterName}"`,
            };
          }
          return writeRepoScaffoldWithAgent(
            repoPath,
            adapter,
            adapterName,
            answers
          );
        },
        writeRepoScaffold,
        gitCommitAndPush,
        addProjectToConfig,
        defaultScaffoldAdapter: config.agent.default,
        configPath,
      });
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
    return;
  }

  if (cmd.command === "project" && cmd.subcommand === "remove") {
    const name = cmd.args[0];
    if (!name) {
      console.error("Usage: feliz project remove <name>");
      process.exit(1);
    }
    try {
      if (!existsSync(configPath)) {
        console.error("Config file not found. Run `feliz init` first.");
        process.exit(1);
      }
      const { removeProjectFromConfig } = await import("./project.ts");
      removeProjectFromConfig(configPath, name);
      console.log(`Removed project "${name}".`);
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
    return;
  }

  if (cmd.command === "init") {
    const { runInit } = await import("./init.ts");
    await runInit(configPath);
    return;
  }

  if (cmd.command === "stop") {
    try {
      if (!existsSync(configPath)) {
        console.log("Feliz is not running (no config file found).");
        return;
      }
      const config = loadConfig(configPath);
      const { readPidFile } = await import("../pid.ts");
      const pid = readPidFile(config.storage.data_dir);
      if (pid === null) {
        console.log("Feliz is not running (no PID file found).");
        return;
      }
      try {
        process.kill(pid, "SIGTERM");
        console.log(`Stopped Feliz daemon (PID ${pid}).`);
      } catch (e: any) {
        if (e.code === "ESRCH") {
          console.log(`Feliz is not running (stale PID ${pid}). Cleaning up.`);
          const { removePidFile } = await import("../pid.ts");
          removePidFile(config.storage.data_dir);
        } else {
          throw e;
        }
      }
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
    return;
  }

  if (cmd.command === "start") {
    if (!existsSync(configPath)) {
      const { CONFIG_TEMPLATE, writeConfigFile } = await import("../config/writer.ts");
      writeConfigFile(configPath, CONFIG_TEMPLATE);
      console.log(`Created config file: ${configPath}`);
      console.log("");
      console.log("Edit this file to set your Linear API key and project details,");
      console.log("then run `feliz start` again.");
      return;
    }
    console.log("Starting Feliz daemon...");
    logger.info("Feliz starting");
    const { FelizServer } = await import("../server.ts");
    const config = loadConfig(configPath);
    const server = new FelizServer(config);
    await server.start();
    return;
  }

  if (cmd.command === "auth") {
    if (cmd.subcommand !== "linear") {
      console.error("Usage: feliz auth linear [--client-id <id>] [--client-secret <secret>] [--port <port>] [--callback-url <url>]");
      process.exit(1);
    }
    const { runAuth } = await import("./auth.ts");
    await runAuth(configPath, cmd.flags);
    return;
  }

  if (cmd.command === "e2e") {
    const { runE2ECommand } = await import("./e2e.ts");
    const ok = runE2ECommand({
      subcommand: cmd.subcommand,
      configPath,
      flags: cmd.flags,
    });
    if (!ok) {
      process.exit(1);
    }
    return;
  }

  console.log(`Unknown command: ${cmd.command}. Run 'feliz --help' for usage.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
