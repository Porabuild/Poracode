import { describe, expect, it } from "vitest";
import { humanizeModelId, mapAcpModels, mapAcpModes } from "./probe";

describe("humanizeModelId", () => {
  it("strips gemini- prefix and title-cases segments", () => {
    expect(humanizeModelId("gemini-2.5-pro")).toBe("2.5 Pro");
    expect(humanizeModelId("gemini-2.5-flash-lite")).toBe("2.5 Flash Lite");
    expect(humanizeModelId("gemini-3.1-pro-preview")).toBe("3.1 Pro Preview");
  });

  it("keeps auto- prefix for auto-gemini IDs", () => {
    expect(humanizeModelId("auto-gemini-3")).toBe("Auto Gemini 3");
    expect(humanizeModelId("auto-gemini-2.5")).toBe("Auto Gemini 2.5");
  });

  it("handles ids without gemini- prefix", () => {
    expect(humanizeModelId("some-model")).toBe("Some Model");
  });
});

describe("mapAcpModels", () => {
  it("uses human-friendly name when provided by agent", () => {
    const result = mapAcpModels([
      { modelId: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { modelId: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    ]);
    expect(result).toEqual([
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    ]);
  });

  it("humanizes label when name equals modelId", () => {
    const result = mapAcpModels([
      { modelId: "gemini-2.5-pro", name: "gemini-2.5-pro" },
      { modelId: "gemini-2.5-flash-lite", name: "gemini-2.5-flash-lite" },
    ]);
    expect(result).toEqual([
      { id: "gemini-2.5-pro", label: "2.5 Pro" },
      { id: "gemini-2.5-flash-lite", label: "2.5 Flash Lite" },
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(mapAcpModels([])).toEqual([]);
  });
});

describe("mapAcpModes", () => {
  it("maps all known Gemini ACP mode IDs with ACP-provided labels", () => {
    const result = mapAcpModes([
      { id: "default", name: "Default" },
      { id: "autoEdit", name: "Auto Edit" },
      { id: "yolo", name: "YOLO" },
      { id: "plan", name: "Plan" },
    ]);
    expect(result.modes).toEqual(["agent", "plan"]);
    expect(result.approvalPolicies).toEqual([
      { id: "default", label: "Default" },
      { id: "auto_edit", label: "Auto Edit" },
      { id: "never", label: "YOLO" },
    ]);
  });

  it("deduplicates modes from multiple agent-mode entries", () => {
    const result = mapAcpModes([
      { id: "default", name: "Default" },
      { id: "yolo", name: "Full Auto" },
    ]);
    // Both map to "agent" — should only appear once
    expect(result.modes).toEqual(["agent"]);
    expect(result.approvalPolicies).toEqual([
      { id: "default", label: "Default" },
      { id: "never", label: "Full Auto" },
    ]);
  });

  it("skips unknown mode IDs gracefully", () => {
    const result = mapAcpModes([
      { id: "default", name: "Default" },
      { id: "some_future_mode", name: "Future Mode" },
      { id: "plan", name: "Plan" },
    ]);
    expect(result.modes).toEqual(["agent", "plan"]);
    expect(result.approvalPolicies).toEqual([{ id: "default", label: "Default" }]);
  });

  it("returns empty arrays for empty input", () => {
    const result = mapAcpModes([]);
    expect(result.modes).toEqual([]);
    expect(result.approvalPolicies).toEqual([]);
  });

  it("handles plan-only mode set", () => {
    const result = mapAcpModes([{ id: "plan", name: "Plan" }]);
    expect(result.modes).toEqual(["plan"]);
    expect(result.approvalPolicies).toEqual([]);
  });
});
