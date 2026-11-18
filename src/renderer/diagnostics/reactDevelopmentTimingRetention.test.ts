import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface NativeTimingResult {
  componentEntries: number;
  retainedPropertyStringUnits: number;
  domChars: number;
  foreignControlEntries: number;
  observedComponentEntries: number;
  foreignSameNameEntries: number;
}

function runNativeReact(environment: string, mode = "render"): NativeTimingResult {
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
  it.each([
    ["development", 239],
    ["production", 0],
  ] as const)("releases prop snapshots after %s renders", (environment, observedEntries) => {
    const result = runNativeReact(environment);
    // React 19.3 clears each component measure after notifying observers.
    expect(result.observedComponentEntries).toBe(observedEntries);
    expect(result.componentEntries).toBe(0);
    expect(result.retainedPropertyStringUnits).toBe(0);
    expect(result.domChars).toBe(8192);
    expect(result.foreignControlEntries).toBe(1);
  });

  it("preserves a foreign timing recorded after a component emits a same-name measure", () => {
    const result = runNativeReact("development", "collision");
    expect(result.observedComponentEntries).toBe(239);
    expect(result.componentEntries).toBe(0);
    expect(result.foreignSameNameEntries).toBe(1);
    expect(result.foreignControlEntries).toBe(1);
  });

  it("continues to release prop snapshots when a renderer root is replaced", () => {
    const result = runNativeReact("development", "remount");
    expect(result.observedComponentEntries).toBe(242);
    expect(result.retainedPropertyStringUnits).toBe(0);
    expect(result.componentEntries).toBe(0);
    expect(result.domChars).toBe(8192);
    expect(result.foreignControlEntries).toBe(1);
  });
});
