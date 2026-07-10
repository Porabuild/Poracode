import { describe, expect, it } from "vitest";
import type { AgentCapability } from "./contracts";
import {
  capabilitiesForPresentation,
  modelSelectionFor,
  resolveModelSelection,
  resolveReasoningSelection,
  validateAgentModelSelection,
} from "./agentSelection";

const capabilities: AgentCapability = {
  models: [{ id: "terminal-model", label: "Terminal" }],
  efforts: ["low"],
  modelEfforts: {},
  fastModels: [],
  modes: [],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  settingDefs: [],
  presentationCapabilities: {
    gui: {
      models: [{ id: "chat-model", label: "Chat" }],
      efforts: ["medium", "high"],
      modelEfforts: { "chat-model": ["high", "xhigh"] },
      defaultEffort: "high",
      fastModels: ["chat-model"],
      fastDisabledReason: "Fast is unavailable for this account",
      presentationMode: "gui",
    },
  },
};

describe("agent selection", () => {
  it("resolves the composer surface before exposing model controls", () => {
    const gui = capabilitiesForPresentation(capabilities, "gui");
    expect(gui.models).toEqual([{ id: "chat-model", label: "Chat" }]);
    expect(modelSelectionFor(gui, "chat-model")).toEqual({
      reasoning: { values: ["high", "xhigh"], default: "high" },
      fast: {
        supported: true,
        available: false,
        disabledReason: "Fast is unavailable for this account",
      },
    });
  });

  it("uses the same model and reasoning fallbacks as the composer", () => {
    const gui = capabilitiesForPresentation(capabilities, "gui");
    expect(resolveModelSelection(gui, "missing")).toBe("chat-model");
    expect(resolveReasoningSelection(gui, "chat-model", "missing")).toBe("high");
  });

  it("validates orchestrator input against the advertised options", () => {
    const gui = capabilitiesForPresentation(capabilities, "gui");
    expect(
      validateAgentModelSelection(gui, {
        model: "chat-model",
        reasoning: "xhigh",
      }),
    ).toBeUndefined();
    expect(validateAgentModelSelection(gui, { model: "chat-model", fast: true })).toBe(
      "Fast is unavailable for this account",
    );
  });
});
