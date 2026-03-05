import { describe, expect, test } from "bun:test";
import { computeRetryDelay, shouldRetry } from "../../src/orchestrator/retry.ts";

describe("Retry Policy", () => {
  test("computes exponential backoff", () => {
    // attempt 1: base = 10000 * 2^0 = 10000
    const d1 = computeRetryDelay(1);
    expect(d1).toBeGreaterThanOrEqual(10000);
    expect(d1).toBeLessThanOrEqual(12000);

    // attempt 2: base = 10000 * 2^1 = 20000
    const d2 = computeRetryDelay(2);
    expect(d2).toBeGreaterThanOrEqual(20000);
    expect(d2).toBeLessThanOrEqual(22000);

    // attempt 3: base = 10000 * 2^2 = 40000
    const d3 = computeRetryDelay(3);
    expect(d3).toBeGreaterThanOrEqual(40000);
    expect(d3).toBeLessThanOrEqual(42000);
  });

  test("caps at max backoff", () => {
    // attempt 10: 10000 * 2^9 = 5120000, should be capped at 300000
    const d = computeRetryDelay(10);
    expect(d).toBeLessThanOrEqual(302000);
    expect(d).toBeGreaterThanOrEqual(300000);
  });

  test("shouldRetry returns true when under max attempts", () => {
    expect(shouldRetry(1, 3)).toBe(true);
    expect(shouldRetry(2, 3)).toBe(true);
  });

  test("shouldRetry returns false at max attempts", () => {
    expect(shouldRetry(3, 3)).toBe(false);
  });

  test("shouldRetry uses default max of 3", () => {
    expect(shouldRetry(1)).toBe(true);
    expect(shouldRetry(3)).toBe(false);
  });
});
