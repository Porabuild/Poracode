import { describe, expect, it } from "vitest";
import {
  humanizeAcpModeName,
  humanizeModelId,
  mapAcpConfigModels,
  mapAcpModels,
  mapAcpModes,
  mapAcpSlashCommands,
  mapAcpThoughtLevels,
  normalizeAcpModeId,
} from "./probe";

describe("mapAcpSlashCommands", () => {
  it("maps ACP skill commands into the Skills section without changing their native id", () => {
    expect(
      mapAcpSlashCommands([
        {
          name: "skill:simplify",
          description: "Review changed code",
        },
      ]),
    ).toEqual([
      {
        id: "skill:simplify",
        label: "skill:simplify — Review changed code",
        description: "Review changed code",
        section: "skills",
        skillName: "simplify",
      },
    ]);
  });

  it("keeps non-skill ACP commands in the command section", () => {
    expect(mapAcpSlashCommands([{ name: "status", description: "Show status" }])).toEqual([
      {
        id: "status",
        label: "status — Show status",
        description: "Show status",
      },
    ]);
  });
});

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

describe("mapAcpConfigModels", () => {
  it("extracts the models Kimi advertises through configOptions", () => {
    const result = mapAcpConfigModels([
      {
        type: "select",
        id: "model",
        name: "Model",
        category: "model",
        currentValue: "kimi-code/kimi-for-coding",
        options: [
          { value: "kimi-code/kimi-for-coding", name: "K2.7 Coding" },
          {
            value: "kimi-code/kimi-for-coding-highspeed",
            name: "K2.7 Coding Highspeed",
          },
          { value: "kimi-code/k3", name: "K3" },
        ],
      },
    ]);

    expect(result).toEqual([
      { id: "kimi-code/kimi-for-coding", label: "K2.7 Coding" },
      { id: "kimi-code/kimi-for-coding-highspeed", label: "K2.7 Coding Highspeed" },
      { id: "kimi-code/k3", label: "K3" },
    ]);
  });

  it("ignores malformed and unrelated config options", () => {
    expect(
      mapAcpConfigModels([
        { type: "select", category: "mode", options: [{ value: "default" }] },
        { type: "select", category: "model", options: [{ value: "" }, {}] },
      ]),
    ).toEqual([]);
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

  it("preserves model descriptions for secondary menu hints", () => {
    const result = mapAcpModels([
      {
        modelId: "claude-opus-4-7",
        name: "Claude Opus 4.7",
        description: "2x Factory token rate",
      },
    ]);

    expect(result).toEqual([
      {
        id: "claude-opus-4-7",
        label: "Claude Opus 4.7",
        description: "2x Factory token rate",
      },
    ]);
  });

  it("does not interpret provider-specific model metadata", () => {
    const result = mapAcpModels([
      {
        modelId: "claude-opus-4.6",
        name: "Claude Opus 4.6",
        description: "Claude Opus 4.6",
        _meta: {
          copilotUsage: "3x",
        },
      },
    ]);

    expect(result).toEqual([
      {
        id: "claude-opus-4.6",
        label: "Claude Opus 4.6",
        description: "Claude Opus 4.6",
      },
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

  it("normalizes raw snake_case mode names into readable labels", () => {
    const result = mapAcpModes([
      { id: "auto", name: "auto" },
      { id: "approve", name: "approve" },
      { id: "smart_approve", name: "smart_approve" },
      { id: "chat", name: "chat" },
    ]);
    expect(result.modes).toEqual(["agent"]);
    expect(result.approvalPolicies).toEqual([
      { id: "auto", label: "Auto" },
      { id: "approve", label: "Approve" },
      { id: "smart_approve", label: "Smart approve" },
      { id: "chat", label: "Chat" },
    ]);
  });

  it("maps unknown mode IDs as agent approval policies", () => {
    const result = mapAcpModes([
      { id: "default", name: "Default" },
      { id: "some_future_mode", name: "Future Mode" },
      { id: "plan", name: "Plan" },
    ]);
    expect(result.modes).toEqual(["agent", "plan"]);
    expect(result.approvalPolicies).toEqual([
      { id: "default", label: "Default" },
      { id: "some_future_mode", label: "Future Mode" },
    ]);
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

  it("maps ACP URI mode ids — autopilot becomes an approval policy", () => {
    const result = mapAcpModes([
      {
        id: "https://agentclientprotocol.com/protocol/session-modes#agent",
        name: "Agent",
      },
      {
        id: "https://agentclientprotocol.com/protocol/session-modes#plan",
        name: "Plan",
      },
      {
        id: "https://agentclientprotocol.com/protocol/session-modes#autopilot",
        name: "Autopilot",
      },
    ]);
    expect(result.modes).toEqual(["agent", "plan"]);
    expect(result.approvalPolicies).toEqual([{ id: "autopilot", label: "Autopilot" }]);
  });

  it("maps GLM ACP permission modes from the agent", () => {
    const result = mapAcpModes([
      { id: "default", name: "Ask for permission" },
      { id: "accept_edits", name: "Auto-approve edits" },
      { id: "bypass_permissions", name: "Bypass all permissions" },
    ]);

    expect(result.modes).toEqual(["agent"]);
    expect(result.approvalPolicies).toEqual([
      { id: "default", label: "Ask for permission" },
      { id: "accept_edits", label: "Auto-approve edits" },
      { id: "bypass_permissions", label: "Bypass all permissions" },
    ]);
  });

  it("maps Droid-style autonomy levels to approval policies", () => {
    const result = mapAcpModes([
      { id: "normal", name: "Auto (Off)" },
      { id: "spec", name: "Spec" },
      { id: "auto-low", name: "Auto (Low)" },
      { id: "auto-medium", name: "Auto (Medium)" },
      { id: "auto-high", name: "Auto (High)" },
    ]);

    expect(result.modes).toEqual(["agent"]);
    expect(result.approvalPolicies).toEqual([
      { id: "normal", label: "Auto (Off)" },
      { id: "spec", label: "Spec" },
      { id: "auto-low", label: "Auto (Low)" },
      { id: "auto-medium", label: "Auto (Medium)" },
      { id: "auto-high", label: "Auto (High)" },
    ]);
  });
});

describe("mapAcpThoughtLevels", () => {
  it("extracts efforts and default effort from an ungrouped thought_level selector", () => {
    const result = mapAcpThoughtLevels([
      {
        id: "reasoning",
        name: "Reasoning",
        category: "thought_level",
        type: "select",
        currentValue: "medium",
        options: [
          { value: "low", name: "Low" },
          { value: "medium", name: "Medium" },
          { value: "high", name: "High" },
        ],
      },
    ]);

    expect(result).toEqual({
      efforts: ["low", "medium", "high"],
      defaultEffort: "medium",
    });
  });

  it("flattens grouped thought_level selectors", () => {
    const result = mapAcpThoughtLevels([
      {
        id: "reasoning",
        name: "Reasoning",
        category: "thought_level",
        type: "select",
        currentValue: "high",
        options: [
          {
            group: "standard",
            name: "Standard",
            options: [
              { value: "low", name: "Low" },
              { value: "medium", name: "Medium" },
            ],
          },
          {
            group: "extended",
            name: "Extended",
            options: [{ value: "high", name: "High" }],
          },
        ],
      },
    ]);

    expect(result).toEqual({
      efforts: ["low", "medium", "high"],
      defaultEffort: "high",
    });
  });

  it("extracts efforts from a reasoning_effort selector filed under the model category", () => {
    // Qoder files its effort selector as { category: "model", id: "reasoning_effort" }.
    const result = mapAcpThoughtLevels([
      {
        id: "model",
        name: "Model",
        category: "model",
        type: "select",
        currentValue: "auto",
        options: [{ value: "auto", name: "Auto" }],
      },
      {
        id: "reasoning_effort",
        name: "Reasoning Effort",
        category: "model",
        type: "select",
        currentValue: "xhigh",
        options: [
          { value: "xhigh", name: "Extra High" },
          { value: "high", name: "High" },
          { value: "low", name: "Low" },
        ],
      },
    ]);

    expect(result).toEqual({
      efforts: ["xhigh", "high", "low"],
      defaultEffort: "xhigh",
    });
  });

  it("returns empty efforts when no thought_level config exists", () => {
    expect(
      mapAcpThoughtLevels([
        {
          id: "mode",
          name: "Mode",
          category: "mode",
          type: "select",
          currentValue: "default",
          options: [{ value: "default", name: "Default" }],
        },
      ]),
    ).toEqual({ efforts: [] });
  });
});

describe("normalizeAcpModeId", () => {
  it("normalizes ACP uri mode ids to their suffix", () => {
    expect(
      normalizeAcpModeId("https://agentclientprotocol.com/protocol/session-modes#autopilot"),
    ).toBe("autopilot");
  });
});

describe("humanizeAcpModeName", () => {
  it("replaces underscores with spaces and capitalizes the first letter", () => {
    expect(humanizeAcpModeName("smart_approve")).toBe("Smart approve");
    expect(humanizeAcpModeName("auto")).toBe("Auto");
  });

  it("leaves prose labels untouched", () => {
    expect(humanizeAcpModeName("Accept Edits")).toBe("Accept Edits");
    expect(humanizeAcpModeName("YOLO")).toBe("YOLO");
  });

  it("collapses whitespace introduced by separators", () => {
    expect(humanizeAcpModeName("  read_only  mode ")).toBe("Read only mode");
  });
});
