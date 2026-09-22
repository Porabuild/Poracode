import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyTerminalGenerationStability } from "./visibleTerminalPanel.ts";

/**
 * Terminal-panel harness invariants.
 *
 * The generation classifier is the boundary between a harness sequencing
 * defect and a renderer defect: a same-id `startShell` after delivery destroys
 * the tested PTY generation, and the run must be classified
 * `harness-generation-mismatch` rather than reported as a paint/hydration
 * failure (the marker bytes no longer exist in the supervisor).
 */

describe("classifyTerminalGenerationStability", () => {
  it("passes a stable generation", () => {
    const result = classifyTerminalGenerationStability({
      expectedGeneration: "gen-a",
      observedGeneration: "gen-a",
    });
    expect(result.stable).toBe(true);
    expect(result.replacementDetected).toBe(false);
    expect(result.classification).toBeNull();
  });

  it("classifies a same-id replacement as a harness-generation-mismatch", () => {
    const result = classifyTerminalGenerationStability({
      expectedGeneration: "gen-a",
      observedGeneration: "gen-b",
    });
    expect(result.stable).toBe(false);
    expect(result.replacementDetected).toBe(true);
    expect(result.classification).toBe("harness-generation-mismatch");
    expect(result.detail).toContain("gen-a -> gen-b");
    expect(result.detail).toContain("harness sequence");
  });

  it("never calls an unobservable generation stable", () => {
    const missingBefore = classifyTerminalGenerationStability({
      expectedGeneration: null,
      observedGeneration: "gen-b",
    });
    const missingAfter = classifyTerminalGenerationStability({
      expectedGeneration: "gen-a",
      observedGeneration: null,
    });
    for (const result of [missingBefore, missingAfter]) {
      expect(result.stable).toBe(false);
      expect(result.replacementDetected).toBe(false);
      expect(result.classification).toBeNull();
      expect(result.detail).toContain("unproven");
    }
  });
});

describe("app-owned panel shell start contract", () => {
  it("never issues a raw supervisor startShell for an app-owned panel shell", () => {
    const source = readFileSync(resolve(import.meta.dirname, "visibleTerminalPanel.ts"), "utf8");
    // The helper may read snapshots and write through the declared
    // `writeTerminal` fallback, but a raw `startShell` bypasses the renderer's
    // shellStartRegistry and destroys the tested generation on the next fit.
    expect(source).not.toContain('invokeProcedure("startShell"');
    // The removed fallback helper was the only raw-start surface here.
    expect(source).not.toContain("startPanelShellViaProductionPath");
  });
});
