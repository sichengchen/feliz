#!/usr/bin/env bun
import { parseArgs } from "./commands.ts";
import { loadFelizConfig } from "../config/loader.ts";
import { Database } from "../db/database.ts";
import { createLogger } from "../logger/index.ts";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

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

Options:
  --config <path>          Path to feliz.yml (default: ~/.feliz/feliz.yml)
  --help                   Show this help
`.trim();

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
      if (!existsSync(configPath)) {
        console.error(`Config file not found: ${configPath}`);
        process.exit(1);
      }
      const content = readFileSync(configPath, "utf-8");
      loadFelizConfig(content);
      console.log("Configuration is valid.");
    } catch (e: any) {
      console.error(`Configuration error: ${e.message}`);
      process.exit(1);
    }
    return;
  }

  if (cmd.command === "config" && cmd.subcommand === "show") {
    try {
      if (!existsSync(configPath)) {
        console.error(`Config file not found: ${configPath}`);
        process.exit(1);
      }
      const content = readFileSync(configPath, "utf-8");
      const config = loadFelizConfig(content);
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
      const content = readFileSync(configPath, "utf-8");
      const config = loadFelizConfig(content);
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
      const content = readFileSync(configPath, "utf-8");
      const config = loadFelizConfig(content);
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
      const content = readFileSync(configPath, "utf-8");
      const config = loadFelizConfig(content);
      const dbPath = join(config.storage.data_dir, "db", "feliz.db");
      if (!existsSync(dbPath)) {
        console.log("No runs found. Feliz has not been started yet.");
        return;
      }
      const db = new Database(dbPath);
      const runs = db.listRuns();
      if (runs.length === 0) {
        console.log("No runs found.");
        db.close();
        return;
      }
      console.log("ID            Work Item   Status     Phase/Step         Started");
      console.log("─".repeat(75));
      for (const r of runs) {
        const wi = db.getWorkItem(r.work_item_id);
        const identifier = wi?.linear_identifier ?? r.work_item_id.slice(0, 8);
        const status = r.result ?? "running";
        const phase = `${r.current_phase}/${r.current_step}`;
        const started = r.started_at.toISOString().slice(0, 19).replace("T", " ");
        console.log(
          `${r.id.padEnd(14)}${identifier.padEnd(12)}${status.padEnd(11)}${phase.padEnd(19)}${started}`
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
      const content = readFileSync(configPath, "utf-8");
      const config = loadFelizConfig(content);
      const dbPath = join(config.storage.data_dir, "db", "feliz.db");
      const db = new Database(dbPath);
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
      const content = readFileSync(configPath, "utf-8");
      const config = loadFelizConfig(content);
      const dbPath = join(config.storage.data_dir, "db", "feliz.db");
      const db = new Database(dbPath);
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

  if (cmd.command === "init") {
    const { runInit } = await import("./init.ts");
    await runInit(configPath);
    return;
  }

  if (cmd.command === "stop") {
    try {
      const content = readFileSync(configPath, "utf-8");
      const config = loadFelizConfig(content);
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
      if (e.message?.includes("api_key") || e.message?.includes("project")) {
        console.log("Feliz is not running (no PID file found).");
      } else {
        console.error(`Error: ${e.message}`);
        process.exit(1);
      }
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
    // Import and run server
    const { FelizServer } = await import("../server.ts");
    const content = readFileSync(configPath, "utf-8");
    const config = loadFelizConfig(content);
    const server = new FelizServer(config);
    await server.start();
    return;
  }

  console.log(`Unknown command: ${cmd.command}. Run 'feliz --help' for usage.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
