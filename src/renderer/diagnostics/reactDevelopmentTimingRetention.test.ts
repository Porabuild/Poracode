import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface NativeTimingResult {
  componentEntries: number;
  retainedPropertyStringUnits: number;
  domChars: number;
  foreignControlEntries: number;
  foreignSameNameEntries: number;
  observedComponentEntries: number;
}

function runNativeReact(mode: string, environment = "development"): NativeTimingResult {
  const fixture = resolve(process.cwd(), "tests/fixtures/reactDevelopmentTimingRetention.mjs");
  return JSON.parse(
    execFileSync(process.execPath, [fixture, mode], {
      env: { ...process.env, NODE_ENV: environment, NODE_NO_WARNINGS: "1" },
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 64 * 1024,
    }),
  ) as NativeTimingResult;
}

describe("React development timing retention", () => {
  it("releases native full-prop snapshots while preserving the rendered window and foreign timings", () => {
    const baseline = runNativeReact("baseline");
    const cleaned = runNativeReact("cleanup");
    expect(baseline.componentEntries).toBe(239);
    expect(baseline.retainedPropertyStringUnits).toBeGreaterThan(10_000_000);
    expect(cleaned.componentEntries).toBe(0);
    expect(cleaned.retainedPropertyStringUnits).toBe(0);
    expect(cleaned.domChars).toBe(baseline.domChars);
    expect(cleaned.domChars).toBe(8192);
    expect(cleaned.foreignControlEntries).toBe(1);
    expect(cleaned.observedComponentEntries).toBe(239);
  });

  it("preserves a foreign timing that shares a React component name", () => {
    const result = runNativeReact("collision");
    expect(result.componentEntries).toBe(239);
    expect(result.foreignSameNameEntries).toBe(1);
    expect(result.foreignControlEntries).toBe(1);
  });

  it("disconnects idempotently so a disposed observer does not clear later entries", () => {
    const result = runNativeReact("dispose");
    expect(result.componentEntries).toBe(3);
    expect(result.foreignControlEntries).toBe(1);
  });

  it("confirms production React does not emit the development prop snapshots", () => {
    const result = runNativeReact("baseline", "production");
    expect(result.componentEntries).toBe(0);
    expect(result.retainedPropertyStringUnits).toBe(0);
    expect(result.domChars).toBe(8192);
    expect(result.foreignControlEntries).toBe(1);
  });
});
