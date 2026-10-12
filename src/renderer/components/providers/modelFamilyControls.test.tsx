// @vitest-environment node
import type { AgentCapability, ThreadConfig } from "@/shared/contracts";
import { describe, expect, it, vi } from "vitest";
import type { ComposerControl } from "@/renderer/components/thread/ThreadComposer";
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

type SelectorControl = Extract<ComposerControl, { kind: "family-selector" }>;

function pairControls(input: ComposerControlsInput): SelectorControl[] {
  const controls = modelFamilySelectorControls(input, "example");
  expect(controls).toHaveLength(2);
  for (const control of controls)
    if (control.kind !== "family-selector") throw new Error("Expected selector controls");
  return controls as SelectorControl[];
}

describe("modelFamilySelectorControls", () => {
  it("only supplies the selector controls for a selected accepted pair", () => {
    const controls = pairControls(
      builderInput(familyCapability({ effort: "config", fast: "config" }), {}),
    );
    expect(controls.map((control) => [control.id, control.value])).toEqual([
      ["lead", "alpha"],
      ["sidekick", "x"],
    ]);
    expect(controls.every((control) => control.label.length > 0)).toBe(true);
    const outside = familyCapability({ effort: "config", fast: "config" });
    expect(
      modelFamilySelectorControls(builderInput(outside, { model: "solo" }), "example"),
    ).toEqual([]);
    const { modelFamilies: _families, ...plain } = outside;
    expect(modelFamilySelectorControls(builderInput(plain, {}), "example")).toEqual([]);
  });

  it("prevents edits while configuration is disabled", () => {
    const input = {
      ...builderInput(familyCapability({ effort: "config", fast: "config" }), {}),
      isDisabled: true,
    };
    const controls = pairControls(input);
    expect(controls.every((control) => control.isDisabled)).toBe(true);
    controls[0]!.onChange("beta");
    expect(input.onConfigChange).not.toHaveBeenCalled();
  });

  it("preserves config-bound carriers while selecting an exact member", () => {
    const capabilities = familyCapability({ effort: "config", fast: "config" });
    // Every member advertises a usable Fast select, so the stored `fast: true`
    // carrier stays valid across the member edit.
    capabilities.fastModels = ["pair-alpha-x", "pair-alpha-y", "pair-beta-x"];
    const input = builderInput(capabilities, {
      effort: "high",
      fast: true,
    });
    pairControls(input)[0]!.onChange("beta");
    expect(input.onConfigChange).toHaveBeenCalledExactlyOnceWith(
      { model: "pair-beta-x" },
      { kind: "family-resolved" },
    );
  });

  it("clears a stale Fast carrier when the selector edit lands on a pair without usable Fast", () => {
    const capabilities = familyCapability({ effort: "config", fast: "config" });
    // Only pair-alpha-x advertises a usable Fast select — the beta pair would
    // otherwise inherit `fast: true` into a launch that cannot honor it.
    capabilities.fastModels = ["pair-alpha-x"];
    const input = builderInput(capabilities, { effort: "high", fast: true });
    pairControls(input)[0]!.onChange("beta");
    expect(input.onConfigChange).toHaveBeenCalledExactlyOnceWith(
      { model: "pair-beta-x", fast: false },
      { kind: "family-resolved" },
    );
  });

  it("resolves encoded selectors atomically", () => {
    const input = builderInput(
      familyCapability({ effort: "model", fast: "model" }, { effort: "low", fast: false }),
      { effort: "", fast: false },
    );
    pairControls(input)[0]!.onChange("beta");
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
    const controls = pairControls(input);
    const lead = controls[0]!;
    expect(lead.options.map((option) => option.id)).toEqual(["alpha"]);
    lead.onChange("beta");
    expect(input.onConfigChange).not.toHaveBeenCalled();
    const other = pairControls(
      builderInput(familyCapability({ effort: "config", fast: "config" }), {
        model: "pair-beta-x",
      }),
    );
    expect(other[1]!.options.map((option) => option.id)).toEqual(["x"]);
  });

  it("lets the provider opt into only its selected workflow and present its own labels and icons", () => {
    const input = builderInput(familyCapability({ effort: "config", fast: "config" }), {});
    expect(modelFamilySelectorControls(input, "example", { accepts: () => false })).toEqual([]);
    const icon = <span data-testid="selector-icon" />;
    const controls = pairControls(
      builderInput(familyCapability({ effort: "config", fast: "config" }), {}),
    );
    const presented = modelFamilySelectorControls(input, "example", {
      selectorLabel: (id) => (id === "lead" ? "Main" : undefined),
      selectorIcon: () => icon,
    }) as SelectorControl[];
    expect(presented.map((control) => control.label)).toEqual(["Main", "Sidekick"]);
    expect(presented.map((control) => control.icon)).toEqual([icon, icon]);
    // Without a provider label the shared catalog label key supplies the name.
    expect(controls.map((control) => control.label)).toEqual(["Lead", "Sidekick"]);
  });
});

it("presents a component's decoded effort as the option hint while the edit keeps the exact id", () => {
  const capabilities = familyCapability({ effort: "config", fast: "config" });
  capabilities.fastModels = ["pair-alpha-x", "pair-alpha-y"];
  const input = builderInput(capabilities, {
    effort: "high",
    fast: true,
  });
  const controls = modelFamilySelectorControls(input, "example", {
    option: (selectorId, option) =>
      selectorId === "sidekick"
        ? { model: { id: "support", label: "Support" }, effort: option.id === "x" ? "low" : "high" }
        : undefined,
  }) as SelectorControl[];
  const sidekick = controls[1]!;
  expect(sidekick.options).toEqual([
    { id: "x", label: "Support", hint: "Low" },
    { id: "y", label: "Support", hint: "High" },
  ]);
  sidekick.onChange("y");
  expect(input.onConfigChange).toHaveBeenCalledExactlyOnceWith(
    { model: "pair-alpha-y" },
    { kind: "family-resolved" },
  );
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
      modelFamilySelectorControls(
        builderInput(capabilities, { model: "solo" }),
        "example",
        presentation,
      ),
    ).toEqual([]);
    expect(
      modelFamilySelectorControls(
        builderInput(capabilities, { model: "pair-alpha-x" }),
        "example",
        presentation,
      ),
    ).toEqual([]);
  },
);
