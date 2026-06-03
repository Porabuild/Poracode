import { describe, expect, it } from "vitest";
import type { AgentCapability } from "@/shared/contracts";
import { buildModelPickerControls, patchConfigForModelChange } from "./buildModelPickerControls";

const capabilities = {
  models: [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ],
  efforts: ["low", "high"],
  modelEfforts: {
    a: ["low", "high"],
    b: ["high"],
  },
  modelContextSizes: {
    a: ["128k", "256k"],
    b: ["128k"],
  },
  contextSizes: [
    { id: "128k", label: "128k" },
    { id: "256k", label: "256k" },
  ],
  defaultContextSize: "128k",
  fastModels: ["a"],
  thinkingModels: ["b"],
  modes: ["agent"],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "direct",
  presentationMode: "gui",
  settingDefs: [],
} as unknown as AgentCapability;

describe("patchConfigForModelChange", () => {
  it("preserves valid effort when switching models", () => {
    expect(
      patchConfigForModelChange(capabilities, "b", {
        effort: "high",
        contextSize: "256k",
        fast: true,
        thinking: false,
      }),
    ).toEqual({
      model: "b",
      contextSize: "128k",
      fast: false,
    });
  });

  it("resets effort when the next model does not support it", () => {
    expect(
      patchConfigForModelChange(capabilities, "b", {
        effort: "low",
        contextSize: "256k",
      }),
    ).toEqual({
      model: "b",
      effort: "high",
      contextSize: "128k",
      fast: false,
    });
  });

  it("forces fast off when the account can't use fast mode", () => {
    const gated = { ...capabilities, fastDisabledReason: "disabled" } as AgentCapability;
    expect(patchConfigForModelChange(gated, "a", { fast: true })).toMatchObject({
      model: "a",
      fast: false,
    });
  });
});

describe("buildModelPickerControls fast toggle", () => {
  const baseInput = {
    providers: [],
    selectedAgentKind: "claude",
    model: "a",
    fast: false,
    onProviderModelChange: () => undefined,
    onConfigPatch: () => undefined,
  };

  it("marks the Fast toggle disabled with a reason when the account is gated", () => {
    const controls = buildModelPickerControls({
      ...baseInput,
      capabilities: { ...capabilities, fastDisabledReason: "no fast for you" } as AgentCapability,
    });
    const fastToggle = controls.find((c) => c.kind === "toggle" && c.label === "Fast");
    expect(
      fastToggle && "disabledReason" in fastToggle ? fastToggle.disabledReason : undefined,
    ).toBe("no fast for you");
  });

  it("leaves the Fast toggle enabled when fast mode is available", () => {
    const controls = buildModelPickerControls({ ...baseInput, capabilities });
    const fastToggle = controls.find((c) => c.kind === "toggle" && c.label === "Fast");
    expect(
      fastToggle && "disabledReason" in fastToggle ? fastToggle.disabledReason : undefined,
    ).toBe(undefined);
  });
});
