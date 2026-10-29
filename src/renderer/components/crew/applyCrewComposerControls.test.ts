import { describe, expect, it, vi } from "vitest";
import type { AgentCapability, ThreadConfig } from "@/shared/contracts";
import type { ComposerControl } from "@/renderer/components/thread/ThreadComposer";
import type { ProviderModelCrewSection } from "@/renderer/components/common/ProviderModelMenu/ProviderModelMenu";
import { buildModelPickerControls } from "@/renderer/components/thread/buildModelPickerControls";
import { CREW_BINDING_VERSION, type CrewMemberSelection, type CrewRole } from "@/shared/crew";
import type { CrewHelperOptions } from "./crewHelperOptions";
import type { CrewRosterModel } from "./crewComposerModel";
import { applyCrewComposerControls } from "./applyCrewComposerControls";

const crewSection: ProviderModelCrewSection = {
  entries: [],
  canCreate: true,
  onSelect: vi.fn<(choice: { crewId: string } | { newCrew: true }) => void>(),
};

const helperOptions: CrewHelperOptions = {
  providers: [],
  ranked: [],
  modelLabelOf: (selection) => selection.model,
  selectionFor: (agentKind, model) => ({ agentKind, model }),
  defaultSelectionFor: () => undefined,
};

const lead: CrewMemberSelection = { agentKind: "claude", model: "opus", effort: "high" };
const role: CrewRole = {
  id: "reviewer",
  label: "Reviewer",
  selection: { agentKind: "codex", model: "gpt", effort: "low" },
};

const roster: CrewRosterModel = {
  binding: {
    version: CREW_BINDING_VERSION,
    policy: "crew-first",
    roles: [role],
  },
  lead,
  helperOptions,
  roleTemplates: [],
  leadProviders: [],
  summary: "Opus + 1",
  isDraft: true,
  isDisabled: false,
  onBindingChange: () => {},
  onLeadChange: () => {},
  onSaveToCrew: () => {},
  onSaveAsNewCrew: () => {},
};

const providerControl: ComposerControl = {
  kind: "provider-model",
  providers: [],
  currentAgentKind: "claude",
  currentModel: "opus",
  onChange: () => {},
};

const effortControl: ComposerControl = {
  kind: "effort-context",
  efforts: [{ id: "high", label: "High" }],
  effortValue: "high",
  contextSizes: [],
  onEffortChange: () => {},
};

const fastControl: ComposerControl = {
  kind: "toggle",
  label: "Fast",
  isSelected: false,
  iconOnly: true,
};

const planControl: ComposerControl = {
  kind: "toggle",
  label: "Plan",
  isSelected: true,
  onChange: () => {},
};

const familyFastCapability: AgentCapability = {
  models: [
    { id: "pair-a", label: "Pair A" },
    { id: "pair-a-fast", label: "Pair A Fast" },
    { id: "hole-a", label: "Hole A" },
  ],
  efforts: [],
  modelEfforts: {},
  modes: ["agent"],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: false,
  supportsDirectInput: true,
  liveInputMode: "server",
  presentationMode: "gui",
  settingDefs: [],
  // Model-bound Fast with no legacy `fastModels`: the only availability truth
  // is the relation tuple, so the descriptor must survive the crew transform.
  modelFamilies: [
    {
      model: "pair-a",
      label: "Pair",
      bindings: { effort: "config", fast: "model" },
      selectors: [
        {
          id: "mode",
          labelKey: "modelSelection.lead",
          options: [{ id: "only", label: "Only" }],
        },
      ],
      members: [
        { model: "pair-a", selections: { mode: "only" }, fast: false },
        { model: "pair-a-fast", selections: { mode: "only" }, fast: true },
      ],
    },
    {
      model: "hole-a",
      label: "Hole",
      bindings: { effort: "config", fast: "model" },
      selectors: [
        {
          id: "mode",
          labelKey: "modelSelection.lead",
          options: [{ id: "only", label: "Only" }],
        },
      ],
      members: [{ model: "hole-a", selections: { mode: "only" }, fast: false }],
    },
  ],
};

function buildFamilyFastControls(input: { model: string; fast?: boolean }) {
  const onConfigPatch = vi.fn<(patch: Partial<ThreadConfig>, origin?: { kind: string }) => void>();
  const controls = buildModelPickerControls({
    providers: [],
    selectedAgentKind: "codex",
    model: input.model,
    effort: "",
    ...(input.fast !== undefined ? { fast: input.fast } : {}),
    capabilities: familyFastCapability,
    onProviderModelChange: vi.fn<(next: { agentKind: string; model: string }) => void>(),
    onConfigPatch: onConfigPatch as never,
  });
  return { controls, onConfigPatch };
}

function crewControlOf(
  controls: readonly ComposerControl[],
): Extract<ComposerControl, { kind: "crew" }> {
  const crew = controls.find((control) => control.kind === "crew");
  if (!crew) throw new Error("Expected a crew control");
  return crew;
}

function kindsOf(controls: readonly ComposerControl[]): string[] {
  return controls.map((control) =>
    control.kind === "toggle" ? `toggle:${control.label}` : (control.kind ?? "menu"),
  );
}

describe("applyCrewComposerControls", () => {
  it("adds the Poracode section to the provider picker", () => {
    const controls = applyCrewComposerControls([providerControl], { crewSection });
    expect(controls[0]).toMatchObject({ kind: "provider-model", crewSection });
  });

  it("keeps Fast when no crew roster is active", () => {
    const controls = applyCrewComposerControls([providerControl, effortControl, fastControl], {
      crewSection,
    });
    expect(kindsOf(controls)).toEqual(["provider-model", "effort-context", "toggle:Fast"]);
  });

  it("removes Fast and replaces the effort carrier with one crew control", () => {
    const input = [providerControl, effortControl, fastControl, planControl];
    const controls = applyCrewComposerControls(input, { crewSection, roster });

    expect(kindsOf(controls)).toEqual(["provider-model", "crew", "toggle:Plan"]);
    expect(controls.filter((control) => control.kind === "crew")).toHaveLength(1);
    expect(controls[0]).toMatchObject({ kind: "provider-model", crewSection });
    expect(controls[2]).toBe(planControl);
    expect(input).toHaveLength(4);
    expect(input[0]).not.toHaveProperty("crewSection");
  });

  it("places the crew control after the provider picker when there is no effort carrier", () => {
    const controls = applyCrewComposerControls([providerControl, fastControl, planControl], {
      crewSection,
      roster,
    });

    expect(kindsOf(controls)).toEqual(["provider-model", "crew", "toggle:Plan"]);
  });

  it("appends the crew control when the provider picker is absent", () => {
    const controls = applyCrewComposerControls([fastControl, planControl], {
      crewSection,
      roster,
    });

    expect(kindsOf(controls)).toEqual(["toggle:Plan", "crew"]);
    expect(controls.filter((control) => control.kind === "crew")).toHaveLength(1);
  });

  it("retains the exact original Fast descriptor on the crew model", () => {
    const fastWithHandler: ComposerControl = {
      kind: "toggle",
      label: "Fast",
      isSelected: true,
      onChange: vi.fn<(value: boolean) => void>(),
    };
    const controls = applyCrewComposerControls([providerControl, effortControl, fastWithHandler], {
      crewSection,
      roster,
    });

    expect(crewControlOf(controls).model.leadFastControl).toBe(fastWithHandler);
  });

  it("keeps the GUI family Fast descriptor and its canonical edit after the crew transform", () => {
    const { controls: rawControls, onConfigPatch } = buildFamilyFastControls({
      model: "pair-a",
      fast: false,
    });
    const rawFast = rawControls.find(
      (control) => control.kind === "toggle" && control.label === "Fast",
    );
    if (!rawFast || rawFast.kind !== "toggle") throw new Error("Expected a raw Fast toggle");
    expect(rawFast.isSelected).toBe(false);

    const controls = applyCrewComposerControls(rawControls, { crewSection, roster });
    expect(kindsOf(controls)).not.toContain("toggle:Fast");
    const crew = crewControlOf(controls);
    expect(crew.model.leadFastControl).toBe(rawFast);
    expect(crew.model.leadFastControl?.isSelected).toBe(false);

    crew.model.leadFastControl?.onChange?.(true);
    expect(onConfigPatch).toHaveBeenCalledWith(
      { model: "pair-a-fast", fast: false },
      { kind: "family-resolved" },
    );
  });

  it("reports encoded Fast from the descriptor even when the saved carrier is false", () => {
    const { controls: rawControls } = buildFamilyFastControls({
      model: "pair-a-fast",
      fast: false,
    });
    const rawFast = rawControls.find(
      (control) => control.kind === "toggle" && control.label === "Fast",
    );
    expect(rawFast).toMatchObject({ kind: "toggle", isSelected: true });

    const controls = applyCrewComposerControls(rawControls, { crewSection, roster });
    expect(crewControlOf(controls).model.leadFastControl?.isSelected).toBe(true);
  });

  it("captures an unavailable Fast descriptor without adding a toolbar toggle", () => {
    const { controls: rawControls } = buildFamilyFastControls({
      model: "hole-a",
      fast: false,
    });
    const rawFast = rawControls.find(
      (control) => control.kind === "toggle" && control.label === "Fast",
    );
    expect(rawFast).toMatchObject({ kind: "toggle", isSelected: false });
    expect(rawFast?.kind === "toggle" ? rawFast.disabledReason : undefined).toBeTruthy();

    const controls = applyCrewComposerControls(rawControls, { crewSection, roster });
    expect(kindsOf(controls)).not.toContain("toggle:Fast");
    expect(crewControlOf(controls).model.leadFastControl).toBe(rawFast);
  });
});
