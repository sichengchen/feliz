import { describe, expect, test } from "bun:test";
import { parseArgs, type CliCommand } from "../../src/cli/commands.ts";

describe("CLI parseArgs", () => {
  test("parses 'start' command", () => {
    const cmd = parseArgs(["start"]);
    expect(cmd.command).toBe("start");
  });

  test("parses 'init' command", () => {
    const cmd = parseArgs(["init"]);
    expect(cmd.command).toBe("init");
  });

  test("parses 'stop' command", () => {
    const cmd = parseArgs(["stop"]);
    expect(cmd.command).toBe("stop");
  });

  test("parses 'status' command", () => {
    const cmd = parseArgs(["status"]);
    expect(cmd.command).toBe("status");
  });

  test("parses 'config validate' command", () => {
    const cmd = parseArgs(["config", "validate"]);
    expect(cmd.command).toBe("config");
    expect(cmd.subcommand).toBe("validate");
  });

  test("parses 'config show' command", () => {
    const cmd = parseArgs(["config", "show"]);
    expect(cmd.command).toBe("config");
    expect(cmd.subcommand).toBe("show");
  });

  test("parses 'project list' command", () => {
    const cmd = parseArgs(["project", "list"]);
    expect(cmd.command).toBe("project");
    expect(cmd.subcommand).toBe("list");
  });

  test("parses 'run list' command", () => {
    const cmd = parseArgs(["run", "list"]);
    expect(cmd.command).toBe("run");
    expect(cmd.subcommand).toBe("list");
  });

  test("parses 'run show <id>' command", () => {
    const cmd = parseArgs(["run", "show", "run-123"]);
    expect(cmd.command).toBe("run");
    expect(cmd.subcommand).toBe("show");
    expect(cmd.args).toEqual(["run-123"]);
  });

  test("parses 'agent list' command", () => {
    const cmd = parseArgs(["agent", "list"]);
    expect(cmd.command).toBe("agent");
    expect(cmd.subcommand).toBe("list");
  });

  test("parses 'context history <project>' command", () => {
    const cmd = parseArgs(["context", "history", "backend"]);
    expect(cmd.command).toBe("context");
    expect(cmd.subcommand).toBe("history");
    expect(cmd.args).toEqual(["backend"]);
  });

  test("parses --config flag", () => {
    const cmd = parseArgs(["--config", "/path/to/feliz.yml", "start"]);
    expect(cmd.command).toBe("start");
    expect(cmd.flags.config).toBe("/path/to/feliz.yml");
  });

  test("returns help for empty args", () => {
    const cmd = parseArgs([]);
    expect(cmd.command).toBe("help");
  });

  test("returns help for --help flag", () => {
    const cmd = parseArgs(["--help"]);
    expect(cmd.command).toBe("help");
  });
});
