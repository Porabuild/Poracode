import { describe, expect, it } from "vitest";
import type { AgentCapability } from "@/shared/contracts";
import {
  crewMemberDisplayState,
  initialCrewMemberSelection,
  resolveCrewMemberSelectionEdit,
} from "./crewMemberSelection";

const familyDescriptor = {
  model: "f-alpha-x-low",
  label: "Fusion",
  selectors: [
    {
      id: "lead",
      labelKey: "modelSelection.lead" as const,
      options: [
        { id: "alpha", label: "Alpha" },
        { id: "beta", label: "Beta" },
      ],
    },
    {
      id: "sidekick",
      labelKey: "modelSelection.sidekick" as const,
      options: [
        { id: "x", label: "X" },
        { id: "y", label: "Y" },
      ],
    },
  ],
  bindings: { effort: "model" as const, fast: "model" as const },
  members: [
    {
      model: "f-alpha-x-low",
      selections: { lead: "alpha", sidekick: "x" },
      effort: "low",
      fast: false,
    },
    {
      model: "f-alpha-x-high",
      selections: { lead: "alpha", sidekick: "x" },
      effort: "high",
      fast: false,
    },
    {
      model: "f-alpha-x-low-fast",
      selections: { lead: "alpha", sidekick: "x" },
      effort: "low",
      fast: true,
    },
  ],
};

function capability(overrides: Partial<AgentCapability> = {}): AgentCapability {
  return {
    models: [
      { id: "plain", label: "Plain" },
      { id: "f-alpha-x-low", label: "Fusion (Alpha Low + X)" },
      { id: "f-alpha-x-high", label: "Fusion (Alpha High + X)" },
      { id: "f-alpha-x-low-fast", label: "Fusion (Alpha Low + X Fast)" },
    ],
    efforts: [],
    modelEfforts: {},
    fastModels: [],
    modes: ["agent"],
    approvalPolicies: [],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "server",
    presentationMode: "gui",
    presentationModes: ["gui"],
    mcpScope: { gui: "launch", terminal: "none" },
    settingDefs: [],
    modelFamilies: [familyDescriptor],
    ...overrides,
  };
}

describe("crew member selection resolution", () => {
  it("stores an exact family member without materializing its encoded effort or Fast carriers", () => {
    expect(initialCrewMemberSelection(capability(), "devin", "f-alpha-x-low", "exact")).toEqual({
      agentKind: "devin",
      model: "f-alpha-x-low",
    });
  });

  it("resolves a model-bound effort edit into the exact sibling member", () => {
    expect(
      resolveCrewMemberSelectionEdit(
        capability(),
        { agentKind: "devin", model: "f-alpha-x-low" },
        { kind: "effort", value: "high" },
      ),
    ).toEqual({ agentKind: "devin", model: "f-alpha-x-high" });
  });

  it("resolves a model-bound Fast edit into the exact Fast sibling", () => {
    const resolved = resolveCrewMemberSelectionEdit(
      capability(),
      { agentKind: "devin", model: "f-alpha-x-low" },
      { kind: "fast", value: true },
    );
    expect(resolved).toEqual({ agentKind: "devin", model: "f-alpha-x-low-fast" });
    expect(crewMemberDisplayState(capability(), resolved!)).toMatchObject({
      effortValue: "low",
      fastSelected: true,
      fastAvailable: true,
    });
  });

  it("uses family-row intent when adopting a projected family row", () => {
    expect(initialCrewMemberSelection(capability(), "devin", "f-alpha-x-low", "family")).toEqual({
      agentKind: "devin",
      model: "f-alpha-x-low",
    });
  });

  it("keeps config-bound effort only while the target model accepts it", () => {
    const configBound = capability({
      models: [
        { id: "pair-a", label: "Pair A" },
        { id: "pair-b", label: "Pair B" },
      ],
      efforts: ["low", "high"],
      modelEfforts: { "pair-a": ["low", "high"], "pair-b": ["low"] },
      modelDefaultEfforts: { "pair-a": "high", "pair-b": "low" },
      fastModels: ["pair-a"],
      modelFamilies: [
        {
          ...familyDescriptor,
          bindings: { effort: "config", fast: "config" },
          members: [
            { model: "pair-a", selections: { lead: "alpha", sidekick: "x" } },
            { model: "pair-b", selections: { lead: "alpha", sidekick: "y" } },
          ],
        },
      ],
    });
    expect(
      resolveCrewMemberSelectionEdit(
        configBound,
        { agentKind: "devin", model: "pair-a", effort: "high", fast: true },
        { kind: "model", model: "pair-b", selectionIntent: "exact" },
      ),
    ).toEqual({ agentKind: "devin", model: "pair-b", effort: "low" });
  });

  it("normalizes provider-encoded model picks through the composer normalization hook", () => {
    const grokCatalog = capability({
      models: [
        { id: "grok-4.7", label: "Grok 4.7" },
        { id: "grok-4.7-build-fast", label: "Grok 4.7 Fast" },
      ],
      modelFamilies: [],
    });
    expect(
      resolveCrewMemberSelectionEdit(
        grokCatalog,
        { agentKind: "grok", model: "grok-4.7" },
        { kind: "model", model: "grok-4.7-build-fast", selectionIntent: "exact" },
        "grok",
      ),
    ).toEqual({ agentKind: "grok", model: "grok-4.7", fast: true });
  });
});
