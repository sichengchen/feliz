import { describe, expect, test } from "bun:test";
import { createLogger, type LogEntry, type Logger } from "../../src/logger/index.ts";

describe("Logger", () => {
  test("creates logger with component name", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger("poller", (entry) => entries.push(entry));
    logger.info("poll started");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.component).toBe("poller");
    expect(entries[0]!.level).toBe("info");
    expect(entries[0]!.message).toBe("poll started");
  });

  test("includes context fields", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger("orchestrator", (entry) => entries.push(entry));
    logger.info("run started", {
      project_id: "proj-1",
      work_item_id: "wi-1",
      run_id: "run-1",
    });
    expect(entries[0]!.project_id).toBe("proj-1");
    expect(entries[0]!.work_item_id).toBe("wi-1");
    expect(entries[0]!.run_id).toBe("run-1");
  });

  test("supports all log levels", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger("test", (entry) => entries.push(entry));
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    expect(entries.map((e) => e.level)).toEqual(["debug", "info", "warn", "error"]);
  });

  test("includes timestamp", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger("test", (entry) => entries.push(entry));
    logger.info("test");
    expect(entries[0]!.timestamp).toBeDefined();
    expect(typeof entries[0]!.timestamp).toBe("string");
  });
});
