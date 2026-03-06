import { describe, expect, test } from "bun:test";
import { parseCommand, type FelizCommand } from "../../src/linear/commands.ts";

describe("Linear Comment Commands", () => {
  test("parses @feliz start", () => {
    const cmd = parseCommand("@feliz start");
    expect(cmd).not.toBeNull();
    expect(cmd!.command).toBe("start");
  });

  test("parses @feliz plan", () => {
    const cmd = parseCommand("@feliz plan");
    expect(cmd).not.toBeNull();
    expect(cmd!.command).toBe("plan");
  });

  test("parses @feliz retry", () => {
    const cmd = parseCommand("@feliz retry");
    expect(cmd).not.toBeNull();
    expect(cmd!.command).toBe("retry");
  });

  test("parses @feliz status", () => {
    const cmd = parseCommand("@feliz status");
    expect(cmd).not.toBeNull();
    expect(cmd!.command).toBe("status");
  });

  test("parses @feliz approve", () => {
    const cmd = parseCommand("@feliz approve");
    expect(cmd).not.toBeNull();
    expect(cmd!.command).toBe("approve");
  });

  test("parses @feliz cancel", () => {
    const cmd = parseCommand("@feliz cancel");
    expect(cmd).not.toBeNull();
    expect(cmd!.command).toBe("cancel");
  });

  test("parses @feliz decompose", () => {
    const cmd = parseCommand("@feliz decompose");
    expect(cmd).not.toBeNull();
    expect(cmd!.command).toBe("decompose");
  });

  test("returns null for non-feliz mention", () => {
    const cmd = parseCommand("Hey team, let's discuss this");
    expect(cmd).toBeNull();
  });

  test("returns null for empty string", () => {
    const cmd = parseCommand("");
    expect(cmd).toBeNull();
  });

  test("handles case insensitivity", () => {
    const cmd = parseCommand("@Feliz START");
    expect(cmd).not.toBeNull();
    expect(cmd!.command).toBe("start");
  });

  test("extracts text after command as args", () => {
    const cmd = parseCommand(
      "@feliz approve the spec looks good"
    );
    expect(cmd).not.toBeNull();
    expect(cmd!.command).toBe("approve");
    expect(cmd!.extraText).toBe("the spec looks good");
  });

  test("handles @feliz in the middle of text", () => {
    const cmd = parseCommand(
      "I think we should @feliz start this one"
    );
    expect(cmd).not.toBeNull();
    expect(cmd!.command).toBe("start");
  });
});
