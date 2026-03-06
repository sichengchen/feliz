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

  if (cmd.command === "init") {
    const { runInit } = await import("./init.ts");
    await runInit(configPath);
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
