import { describe, expect, it } from "vitest";
import type { AgentCapability, ModelFamilySelection } from "./contracts/agent";
import type { SessionConfigOptions } from "./contracts/sessionConfigOptions";
import { capabilitiesForSessionConfig } from "./sessionConfigCapabilities";

const base: AgentCapability = {
  models: [
    { id: "a", label: "Model A", description: "price" },
    { id: "b", label: "Model B" },
  ],
  efforts: ["medium", "high", "max"],
  modelEfforts: { a: ["medium", "high", "max"], b: ["medium", "max"] },
  modes: ["agent", "plan"],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "server",
  presentationMode: "gui",
  settingDefs: [],
};
function inventory(
  model = "a",
  efforts = ["low", "medium", "high", "xhigh", "max"],
): SessionConfigOptions {
  return [
    {
      id: "models",
      type: "select",
      role: "model",
      currentValue: model,
      values: [
        { value: "a", name: "Native A", group: "family" },
        { value: "b", name: "Native B" },
      ],
      groups: [{ id: "family", name: "Family" }],
    },
    {
      id: "reasoning",
      type: "select",
      role: "effort",
      currentValue: "high",
      values: efforts.map((value) => ({ value, name: value })),
      groups: [],
    },
  ];
}
describe("current-session composer capabilities", () => {
  it.each([undefined, null])(
    "keeps static fallback for missing/retired inventory %s",
    (options) => {
      expect(capabilitiesForSessionConfig(base, options)).toBe(base);
    },
  );
  it("expands the current model's live ladder without mutating detection", () => {
    const projected = capabilitiesForSessionConfig(base, inventory());
    expect(projected.modelEfforts?.a).toEqual(["low", "medium", "high", "xhigh", "max"]);
    expect(projected.modelDefaultEfforts?.a).toBe("high");
    expect(base.modelEfforts?.a).toEqual(["medium", "high", "max"]);
    expect(projected.models[0]).toEqual({ id: "a", label: "Native A", description: "price" });
    expect(projected.subProviders).toEqual([{ id: "family", label: "Family" }]);
    expect(projected.modelSubProvider).toEqual({ a: "family" });
  });
  it("does not apply the old native model's ladder to an optimistic new pick", () => {
    const projected = capabilitiesForSessionConfig(base, inventory("a"));
    expect(projected.modelEfforts?.b).toEqual(["medium", "max"]);
    const confirmed = capabilitiesForSessionConfig(base, inventory("b"));
    expect(confirmed.modelEfforts?.b).toEqual(["low", "medium", "high", "xhigh", "max"]);
  });
  it("keeps legacy controls when an empty inventory has no model identity", () => {
    expect(capabilitiesForSessionConfig(base, [])).toBe(base);
  });
  it.each([undefined, []])(
    "clears only the identified native model's missing or empty ladder",
    (values) => {
      const options = inventory().filter((option) => option.role !== "effort");
      if (values !== undefined)
        options.push({ id: "effort", type: "select", role: "effort", values, groups: [] });
      const projected = capabilitiesForSessionConfig(base, options);
      expect(projected.modelEfforts?.a).toEqual([]);
      expect(projected.modelEfforts?.b).toEqual(base.modelEfforts?.b);
      expect(projected.modelDefaultEfforts?.a).toBeUndefined();
    },
  );
  it("scopes context choices and select-backed toggles to the native model", () => {
    const capabilities = {
      ...base,
      fastModels: ["a", "b"],
      thinkingModels: ["b"],
      contextSizes: [{ id: "old", label: "Old" }],
      modelContextSizes: { b: ["old"] },
    };
    const options: SessionConfigOptions = [
      ...inventory(),
      {
        id: "context",
        type: "select",
        role: "context",
        values: [
          { value: "", name: "Default" },
          { value: "large", name: "Large" },
        ],
        groups: [],
      },
      {
        id: "thinking",
        type: "select",
        role: "thinking",
        values: [{ value: "on" }, { value: "off" }],
        groups: [],
      },
      { id: "fast", type: "boolean", role: "fast", currentValue: true },
    ];
    const projected = capabilitiesForSessionConfig(capabilities, options);
    expect(projected.modelContextSizes).toEqual({ a: ["", "large"], b: ["old"] });
    expect(projected.contextSizes).toEqual([
      { id: "old", label: "Old" },
      { id: "", label: "Default" },
      { id: "large", label: "Large" },
    ]);
    expect(projected.fastModels).toEqual(["b"]);
    expect(projected.thinkingModels).toEqual(["b", "a"]);
    expect(projected.modes).toEqual(base.modes);
  });
  it("retains exact accepted model IDs while canonicalizing effort aliases", () => {
    const projected = capabilitiesForSessionConfig(base, inventory("a", ["extra-high", "low"]));
    expect(projected.models.map((model) => model.id)).toEqual(["a", "b"]);
    expect(projected.modelEfforts?.a).toEqual(["low", "xhigh"]);
  });
  it("does not assign unsupported or unscoped controls to a model", () => {
    expect(capabilitiesForSessionConfig(base, [{ type: "unsupported", id: "custom" }])).toBe(base);
  });

  describe("family relations", () => {
    const pairRelation: ModelFamilySelection = {
      model: "a",
      label: "Pair",
      selectors: [
        {
          id: "lead",
          labelKey: "modelSelection.lead",
          options: [
            { id: "one", label: "One" },
            { id: "two", label: "Two" },
            { id: "three", label: "Three" },
          ],
        },
      ],
      bindings: { effort: "config", fast: "config" },
      members: [
        { model: "a", selections: { lead: "one" } },
        { model: "b", selections: { lead: "two" } },
        { model: "retired", selections: { lead: "three" } },
      ],
    };
    const withFamily: AgentCapability = { ...base, modelFamilies: [pairRelation] };

    it("keeps the declared relation when no live inventory replaces models", () => {
      expect(capabilitiesForSessionConfig(withFamily, [])).toBe(withFamily);
      expect(capabilitiesForSessionConfig(withFamily, undefined)).toBe(withFamily);
    });

    it("intersects members with the live accepted inventory", () => {
      const projected = capabilitiesForSessionConfig(withFamily, inventory("a"));
      expect(projected.models.map((model) => model.id)).toEqual(["a", "b"]);
      expect(projected.modelFamilies?.[0]?.members.map((member) => member.model)).toEqual([
        "a",
        "b",
      ]);
      // Raw accepted models stay untouched for backwards compatibility.
      expect(projected.models).toHaveLength(2);
    });

    it("drops a relation whose members all left the accepted inventory", () => {
      const empty = capabilitiesForSessionConfig(withFamily, [
        {
          id: "models",
          type: "select",
          role: "model",
          currentValue: "other",
          values: [{ value: "other", name: "Other" }],
          groups: [],
        },
      ]);
      expect(empty.models.map((model) => model.id)).toEqual(["other"]);
      expect(empty.modelFamilies).toEqual([]);
    });
  });
});
