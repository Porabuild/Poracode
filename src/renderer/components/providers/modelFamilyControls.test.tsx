// @vitest-environment node
import type { AgentCapability, ThreadConfig } from "@/shared/contracts";
import { describe, expect, it, vi } from "vitest";
import type { ComposerControlsInput } from "./providerComposer";
import { modelFamilySelectorControls } from "./modelFamilyControls";

function familyCapability(
  bindings: { effort: "model" | "config"; fast: "model" | "config" },
  coordinates?: { effort?: string; fast?: boolean },
): AgentCapability {
  const coordinate = (member: {
    model: string;
    selections: Record<string, string>;
  }): { model: string; selections: Record<string, string>; effort?: string; fast?: boolean } =>
    bindings.effort === "model" || bindings.fast === "model"
      ? {
          ...member,
          ...(coordinates?.effort !== undefined ? { effort: coordinates.effort } : {}),
          ...(coordinates?.fast !== undefined ? { fast: coordinates.fast } : {}),
        }
      : member;
  return {
    models: [
      { id: "solo", label: "Solo" },
      { id: "pair-alpha-x", label: "Pair (Alpha + X)" },
      { id: "pair-alpha-y", label: "Pair (Alpha + Y)" },
      { id: "pair-beta-x", label: "Pair (Beta + X)" },
    ],
    efforts: [],
    modelEfforts: {},
    modes: ["agent"],
    approvalPolicies: [],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "server",
    presentationMode: "gui",
    settingDefs: [],
    modelFamilies: [
      {
        model: "pair-alpha-x",
        label: "Pair",
        selectors: [
          {
            id: "lead",
            labelKey: "modelSelection.lead",
            options: [
              { id: "alpha", label: "Alpha" },
              { id: "beta", label: "Beta" },
            ],
          },
          {
            id: "sidekick",
            labelKey: "modelSelection.sidekick",
            options: [
              { id: "x", label: "X" },
              { id: "y", label: "Y" },
            ],
          },
        ],
        bindings,
        members: [
          // beta-y is the absent self-pair: never a member, never offered.
          coordinate({ model: "pair-alpha-x", selections: { lead: "alpha", sidekick: "x" } }),
          coordinate({ model: "pair-alpha-y", selections: { lead: "alpha", sidekick: "y" } }),
          coordinate({ model: "pair-beta-x", selections: { lead: "beta", sidekick: "x" } }),
        ],
      },
    ],
  };
}

function builderInput(
  capabilities: AgentCapability,
  config: Partial<ThreadConfig>,
): ComposerControlsInput {
  return {
    capabilities,
    config: { model: "pair-alpha-x", ...config } as ThreadConfig,
    isDisabled: false,
    onConfigChange: vi.fn<(patch: Partial<ThreadConfig>) => void>(),
  };
}

function pairControl(input: ComposerControlsInput) {
  const controls = modelFamilySelectorControls(input);
  expect(controls).toHaveLength(1);
  const control = controls[0]!;
  if (control.kind !== "effort-context" || !control.familySelection)
    throw new Error("Expected paired control");
  return control;
}

describe("modelFamilySelectorControls", () => {
  it("only supplies the pairing control for a selected accepted pair", () => {
    const control = pairControl(
      builderInput(familyCapability({ effort: "config", fast: "config" }), {}),
    );
    expect(
      control.familySelection!.columns.map((column) => [column.id, column.models.value]),
    ).toEqual([
      ["lead", "alpha"],
      ["sidekick", "x"],
    ]);
    expect(control.familySelection!.columns.every((column) => column.label.length > 0)).toBe(true);
    const outside = familyCapability({ effort: "config", fast: "config" });
    expect(modelFamilySelectorControls(builderInput(outside, { model: "solo" }))).toEqual([]);
    const { modelFamilies: _families, ...plain } = outside;
    expect(modelFamilySelectorControls(builderInput(plain, {}))).toEqual([]);
  });

  it("prevents edits while configuration is disabled", () => {
    const input = {
      ...builderInput(familyCapability({ effort: "config", fast: "config" }), {}),
      isDisabled: true,
    };
    const control = pairControl(input);
    expect(control.isDisabled).toBe(true);
    control.familySelection!.columns[0]!.models.onChange("beta");
    expect(input.onConfigChange).not.toHaveBeenCalled();
  });

  it("preserves config-bound carriers while selecting an exact member", () => {
    const input = builderInput(familyCapability({ effort: "config", fast: "config" }), {
      effort: "high",
      fast: true,
    });
    pairControl(input).familySelection!.columns[0]!.models.onChange("beta");
    expect(input.onConfigChange).toHaveBeenCalledExactlyOnceWith(
      { model: "pair-beta-x" },
      { kind: "family-resolved" },
    );
  });

  it("forwards the family origin on an independent config-bound effort edit", () => {
    const input = builderInput(familyCapability({ effort: "config", fast: "config" }), {});
    pairControl(input).onEffortChange?.("high");
    expect(input.onConfigChange).toHaveBeenCalledExactlyOnceWith(
      { effort: "high" },
      { kind: "family-resolved" },
    );
  });

  it("resolves encoded selectors atomically and displays native main effort", () => {
    const input = builderInput(
      familyCapability({ effort: "model", fast: "model" }, { effort: "low", fast: false }),
      { effort: "", fast: false },
    );
    const control = pairControl(input);
    expect(control.effortValue).toBe("low");
    expect(control.familySelection!.effortScope).toBe("primary");
    control.familySelection!.columns[0]!.models.onChange("beta");
    expect(input.onConfigChange).toHaveBeenCalledExactlyOnceWith(
      {
        model: "pair-beta-x",
        effort: "",
        fast: false,
      },
      { kind: "family-resolved" },
    );
  });

  it("filters holes and retired members without inventing selections", () => {
    const capabilities = familyCapability({ effort: "config", fast: "config" });
    capabilities.models = capabilities.models.filter((model) => model.id !== "pair-beta-x");
    const input = builderInput(capabilities, {});
    const control = pairControl(input);
    const lead = control.familySelection!.columns[0]!.models;
    expect(lead.options.map((option) => option.id)).toEqual(["alpha"]);
    lead.onChange("beta");
    expect(input.onConfigChange).not.toHaveBeenCalled();
    const other = pairControl(
      builderInput(familyCapability({ effort: "config", fast: "config" }), {
        model: "pair-beta-x",
      }),
    );
    expect(other.familySelection!.columns[1]!.models.options.map((option) => option.id)).toEqual([
      "x",
    ]);
  });

  it("lets the provider opt into only its selected workflow and declare shared effort", () => {
    const input = builderInput(familyCapability({ effort: "config", fast: "config" }), {});
    expect(modelFamilySelectorControls(input, { accepts: () => false })).toEqual([]);
    const control = modelFamilySelectorControls(input, { configEffortScope: "shared" })[0]!;
    expect(control.kind === "effort-context" && control.familySelection?.effortScope).toBe(
      "shared",
    );
  });
});

it("resolves a component's decoded effort to the exact accepted member while preserving live effort", () => {
  const input = builderInput(familyCapability({ effort: "config", fast: "config" }), {
    effort: "high",
    fast: true,
  });
  const control = modelFamilySelectorControls(input, {
    option: (selectorId, option) =>
      selectorId === "sidekick"
        ? { model: { id: "support", label: "Support" }, effort: option.id === "x" ? "low" : "high" }
        : undefined,
  })[0]!;
  if (control.kind !== "effort-context") throw new Error("Expected pair");
  control.familySelection!.columns[1]!.effort!.onChange("high");
  expect(input.onConfigChange).toHaveBeenCalledExactlyOnceWith(
    { model: "pair-alpha-y" },
    { kind: "family-resolved" },
  );
  expect(control.effortValue).toBe("high");
});

it.each(["invalid", "overlap"])(
  "does not declare configuration for a rejected %s relation",
  (reason) => {
    const capabilities = familyCapability({ effort: "config", fast: "config" });
    const family = capabilities.modelFamilies![0]!;
    if (reason === "invalid") family.members[0]!.selections.lead = "not-advertised";
    else
      capabilities.modelFamilies = [
        { ...family, label: "First owner" },
        { ...family, model: "pair-beta-x" },
      ];
    const presentation = { accepts: (candidate: { label: string }) => candidate.label === "Pair" };
    expect(
      modelFamilySelectorControls(builderInput(capabilities, { model: "solo" }), presentation),
    ).toEqual([]);
    expect(
      modelFamilySelectorControls(
        builderInput(capabilities, { model: "pair-alpha-x" }),
        presentation,
      ),
    ).toEqual([]);
  },
);
