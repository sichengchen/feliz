import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const TEST_DIR = join(tmpdir(), "feliz-stop-test");
const PID_FILE = join(TEST_DIR, "feliz.pid");

describe("stop command", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
  });

  test("writePidFile writes current PID", async () => {
    const { writePidFile } = await import("../../src/pid.ts");
    writePidFile(TEST_DIR);
    expect(existsSync(PID_FILE)).toBe(true);
    const content = readFileSync(PID_FILE, "utf-8").trim();
    expect(Number(content)).toBe(process.pid);
  });

  test("removePidFile removes PID file", async () => {
    const { writePidFile, removePidFile } = await import("../../src/pid.ts");
    writePidFile(TEST_DIR);
    expect(existsSync(PID_FILE)).toBe(true);
    removePidFile(TEST_DIR);
    expect(existsSync(PID_FILE)).toBe(false);
  });

  test("readPidFile returns PID when file exists", async () => {
    const { readPidFile } = await import("../../src/pid.ts");
    writeFileSync(PID_FILE, "12345\n");
    expect(readPidFile(TEST_DIR)).toBe(12345);
  });

  test("readPidFile returns null when file missing", async () => {
    const { readPidFile } = await import("../../src/pid.ts");
    expect(readPidFile(TEST_DIR)).toBeNull();
  });
});
