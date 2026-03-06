import { describe, expect, test, mock, beforeEach } from "bun:test";
import {
  Publisher,
  type PublishParams,
  type PublishResult,
} from "../../src/publishing/publisher.ts";

describe("Publisher", () => {
  test("buildPrTitle formats correctly", () => {
    const publisher = new Publisher();
    const title = publisher.buildPrTitle("BAC-123", "Add login flow");
    expect(title).toBe("[BAC-123] Add login flow");
  });

  test("buildPrBody includes required sections", () => {
    const publisher = new Publisher();
    const body = publisher.buildPrBody({
      linearUrl: "https://linear.app/issue/BAC-123",
      summary: "Added login endpoint",
      filesChanged: ["src/auth.ts", "test/auth.test.ts"],
      testResults: "All tests passed",
    });
    expect(body).toContain("https://linear.app/issue/BAC-123");
    expect(body).toContain("Added login endpoint");
    expect(body).toContain("src/auth.ts");
    expect(body).toContain("All tests passed");
  });

  test("buildPrBody handles empty filesChanged", () => {
    const publisher = new Publisher();
    const body = publisher.buildPrBody({
      linearUrl: "https://linear.app/issue/BAC-1",
      summary: "Fix",
      filesChanged: [],
      testResults: null,
    });
    expect(body).toContain("Fix");
  });

  test("buildPrBody includes context snapshot reference when provided", () => {
    const publisher = new Publisher();
    const body = publisher.buildPrBody({
      linearUrl: "https://linear.app/issue/BAC-50",
      summary: "Completed with context snapshot ctx-abc",
      filesChanged: ["src/main.ts"],
      testResults: "OK",
    });
    expect(body).toContain("Completed with context snapshot ctx-abc");
  });

  test("buildPrBody includes all sections in order", () => {
    const publisher = new Publisher();
    const body = publisher.buildPrBody({
      linearUrl: "https://linear.app/issue/BAC-99",
      summary: "Refactored auth module",
      filesChanged: ["src/auth.ts"],
      testResults: "5 passed",
    });
    const linearIdx = body.indexOf("## Linear Issue");
    const summaryIdx = body.indexOf("## Summary");
    const filesIdx = body.indexOf("## Files Changed");
    const testsIdx = body.indexOf("## Test Results");

    expect(linearIdx).not.toBe(-1);
    expect(summaryIdx).not.toBe(-1);
    expect(filesIdx).not.toBe(-1);
    expect(testsIdx).not.toBe(-1);

    expect(linearIdx).toBeLessThan(summaryIdx);
    expect(summaryIdx).toBeLessThan(filesIdx);
    expect(filesIdx).toBeLessThan(testsIdx);
  });

  test("buildPrTitle truncates long titles", () => {
    const publisher = new Publisher();
    const longTitle = "A".repeat(300);
    const title = publisher.buildPrTitle("BAC-200", longTitle);
    expect(title).toBe(`[BAC-200] ${"A".repeat(300)}`);
  });
});

describe("Gates", () => {
  test("runGate returns success on exit 0", async () => {
    const publisher = new Publisher();
    const result = await publisher.runGate("/tmp", "true");
    expect(result.passed).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  test("runGate returns failure on non-zero exit", async () => {
    const publisher = new Publisher();
    const result = await publisher.runGate("/tmp", "false");
    expect(result.passed).toBe(false);
    expect(result.exitCode).not.toBe(0);
  });

  test("runGate captures output", async () => {
    const publisher = new Publisher();
    const result = await publisher.runGate("/tmp", "echo test-output");
    expect(result.passed).toBe(true);
    expect(result.output).toContain("test-output");
  });

  test("runGate handles command not found", async () => {
    const publisher = new Publisher();
    const result = await publisher.runGate("/tmp", "nonexistent_command_xyz");
    expect(result.passed).toBe(false);
  });

  test("runGate handles multiline output", async () => {
    const publisher = new Publisher();
    const result = await publisher.runGate("/tmp", 'echo -e "line1\nline2"');
    expect(result.passed).toBe(true);
    expect(result.output).toContain("line1");
    expect(result.output).toContain("line2");
  });
});
