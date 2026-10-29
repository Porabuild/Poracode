import { describe, expect, it, vi } from "vitest";
import { DEFAULT_KEYBINDINGS } from "@/shared/keybindings";
import { CREW_BINDING_VERSION, type CrewMemberSelection } from "@/shared/crew";
import type { AgentCapability, ThreadConfig } from "@/shared/contracts";
import type { CrewHelperOptions } from "@/renderer/components/crew/crewHelperOptions";
import type { CrewRosterModel } from "@/renderer/components/crew/crewComposerModel";
import { applyCrewComposerControls } from "@/renderer/components/crew/applyCrewComposerControls";
import type { ProviderModelCrewSection } from "@/renderer/components/common/ProviderModelMenu/ProviderModelMenu";
import { buildModelPickerControls } from "./buildModelPickerControls";
import type { PlatformName } from "@/renderer/commands/keybindingMatcher";
import type { ComposerControl } from "./ThreadComposer";
import { handleComposerControlShortcut } from "./threadComposerShortcuts";

const KB = DEFAULT_KEYBINDINGS.keybindings;

type ShortcutModifiers = Partial<{
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}>;

function shortcutEvent(key: string, modifiers: ShortcutModifiers = {}) {
  return {
    key,
    shiftKey: false,
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    ...modifiers,
    preventDefault: vi.fn<() => void>(),
  };
}

/** Run the handler against the real default keybindings so each test exercises
 * the chord → action resolution, not just the action dispatch. */
function dispatch(
  event: ReturnType<typeof shortcutEvent>,
  input: {
    controls: readonly ComposerControl[];
    onOpenModelPicker: () => void;
    onStartDictation?: () => boolean;
  },
  platform: PlatformName = "win32",
): boolean {
  return handleComposerControlShortcut(event, { ...input, keybindings: KB, platform });
}

describe("handleComposerControlShortcut", () => {
  it("toggles Work/Plan with Shift+Tab", () => {
    const onChange = vi.fn<(value: boolean) => void>();
    const event = shortcutEvent("Tab", { shiftKey: true, ctrlKey: false });

    const handled = dispatch(event, {
      controls: [
        {
          kind: "toggle",
          label: "Work",
          isSelected: false,
          onChange,
        },
      ],
      onOpenModelPicker: () => undefined,
    });

    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("cycles effort with Ctrl+T", () => {
    const onEffortChange = vi.fn<(value: string) => void>();
    const event = shortcutEvent("T");

    dispatch(event, {
      controls: [
        {
          kind: "effort-context",
          efforts: [
            { id: "low", label: "Low" },
            { id: "medium", label: "Medium" },
            { id: "high", label: "High" },
          ],
          effortValue: "medium",
          onEffortChange,
          contextSizes: [],
        },
      ],
      onOpenModelPicker: () => undefined,
    });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onEffortChange).toHaveBeenCalledWith("high");
  });

  it("toggles Fast with Ctrl+Shift+F", () => {
    const onChange = vi.fn<(value: boolean) => void>();
    const event = shortcutEvent("f", { shiftKey: true });

    dispatch(event, {
      controls: [
        {
          kind: "toggle",
          label: "Fast",
          isSelected: true,
          onChange,
        },
      ],
      onOpenModelPicker: () => undefined,
    });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("cycles menu permissions with Ctrl+P", () => {
    const onChange = vi.fn<(value: string) => void>();
    const event = shortcutEvent("p");

    dispatch(event, {
      controls: [
        {
          iconKind: "permission",
          value: "default-permissions",
          options: [
            { id: "default-permissions", label: "Default permissions" },
            { id: "auto-review", label: "Auto-review" },
            { id: "full-access", label: "Full access" },
          ],
          onChange,
        },
      ],
      onOpenModelPicker: () => undefined,
    });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("auto-review");
  });

  it("toggles permission toggles with Ctrl+P", () => {
    const onChange = vi.fn<(value: boolean) => void>();
    const event = shortcutEvent("p");

    dispatch(event, {
      controls: [
        {
          kind: "toggle",
          label: "Supervised",
          iconKind: "permission",
          isSelected: false,
          onChange,
        },
      ],
      onOpenModelPicker: () => undefined,
    });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("opens the model picker with Ctrl+M", () => {
    const onOpenModelPicker = vi.fn<() => void>();
    const event = shortcutEvent("m");

    dispatch(event, {
      controls: [
        {
          kind: "provider-model",
          providers: [],
          currentAgentKind: "codex",
          currentModel: "gpt-5.4",
          onChange: () => undefined,
        },
      ],
      onOpenModelPicker,
    });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onOpenModelPicker).toHaveBeenCalledOnce();
  });

  it("starts dictation with Ctrl+Shift+D", () => {
    const onStartDictation = vi.fn<() => boolean>(() => true);
    const event = shortcutEvent("d", { shiftKey: true });

    const handled = dispatch(event, {
      controls: [],
      onOpenModelPicker: () => undefined,
      onStartDictation,
    });

    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onStartDictation).toHaveBeenCalledOnce();
  });

  it("lets Ctrl+Shift+D fall through when dictation is unavailable", () => {
    const onStartDictation = vi.fn<() => boolean>(() => false);
    const event = shortcutEvent("d", { shiftKey: true });

    const handled = dispatch(event, {
      controls: [],
      onOpenModelPicker: () => undefined,
      onStartDictation,
    });

    expect(handled).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(onStartDictation).toHaveBeenCalledOnce();
  });

  it("supports Meta as the platform command modifier", () => {
    const onOpenModelPicker = vi.fn<() => void>();
    const event = shortcutEvent("m", { ctrlKey: false, metaKey: true });

    const handled = dispatch(
      event,
      {
        controls: [
          {
            kind: "provider-model",
            providers: [],
            currentAgentKind: "codex",
            currentModel: "gpt-5.4",
            onChange: () => undefined,
          },
        ],
        onOpenModelPicker,
      },
      "darwin",
    );

    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onOpenModelPicker).toHaveBeenCalledOnce();
  });

  it("does not consume Shift+letter typing", () => {
    const onOpenModelPicker = vi.fn<() => void>();
    const event = shortcutEvent("m", { shiftKey: true, ctrlKey: false });

    const handled = dispatch(event, {
      controls: [
        {
          kind: "provider-model",
          providers: [],
          currentAgentKind: "codex",
          currentModel: "gpt-5.4",
          onChange: () => undefined,
        },
      ],
      onOpenModelPicker,
    });

    expect(handled).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(onOpenModelPicker).not.toHaveBeenCalled();
  });

  it("does not consume unhandled shortcut keys", () => {
    const event = shortcutEvent("x");

    const handled = dispatch(event, {
      controls: [] satisfies ComposerControl[],
      onOpenModelPicker: () => undefined,
    });

    expect(handled).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

const crewCapability: AgentCapability = {
  models: [{ id: "gpt-5.5", label: "GPT-5.5" }],
  efforts: ["low", "high"],
  modelEfforts: { "gpt-5.5": ["low", "high"] },
  fastModels: ["gpt-5.5"],
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
};

const crewHelperOptions: CrewHelperOptions = {
  providers: [{ kind: "codex", label: "Codex", capabilities: crewCapability }],
  ranked: [],
  modelLabelOf: (member) => member.model,
  selectionFor: (agentKind, model) => ({ agentKind, model }),
  defaultSelectionFor: () => undefined,
};

function crewModel(
  lead: CrewMemberSelection,
  overrides: Partial<CrewRosterModel> = {},
): CrewRosterModel {
  return {
    binding: {
      version: CREW_BINDING_VERSION,
      policy: "crew-first",
      roles: [
        {
          id: "reviewer",
          label: "Reviewer",
          selection: { agentKind: "codex", model: "gpt-5.5", effort: "low" },
        },
      ],
    },
    lead,
    helperOptions: crewHelperOptions,
    roleTemplates: [],
    leadProviders: [{ kind: "codex", label: "Codex", capabilities: crewCapability }],
    summary: "GPT-5.5 + 1",
    isDraft: true,
    isDisabled: false,
    onBindingChange: () => {},
    onLeadChange: vi.fn<(next: CrewMemberSelection) => void>(),
    onSaveToCrew: () => {},
    onSaveAsNewCrew: () => {},
    ...overrides,
  };
}

function crewControl(
  model: CrewRosterModel,
  overrides: Partial<Extract<ComposerControl, { kind: "crew" }>> = {},
): ComposerControl {
  return { kind: "crew", model, isDisabled: model.isDisabled, ...overrides };
}

const familyCrewSection: ProviderModelCrewSection = {
  entries: [],
  canCreate: false,
  onSelect: () => {},
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
  // Model-bound Fast and no legacy `fastModels`: only the relation tuple can
  // tell the shortcut whether Fast is available.
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

/** Builds the real composer controls, applies the real crew transform, and
 *  returns the crew control that the keyboard and toolbar share. */
function familyCrewControl(model: string, fast: boolean) {
  const onConfigPatch = vi.fn<(patch: Partial<ThreadConfig>, origin?: { kind: string }) => void>();
  const onLeadChange = vi.fn<(next: CrewMemberSelection) => void>();
  const rawControls = buildModelPickerControls({
    providers: [],
    selectedAgentKind: "codex",
    model,
    effort: "",
    fast,
    capabilities: familyFastCapability,
    onProviderModelChange: vi.fn<(next: { agentKind: string; model: string }) => void>(),
    onConfigPatch: onConfigPatch as never,
  });
  const crewLead: CrewMemberSelection = { agentKind: "codex", model, effort: "", fast };
  const controls = applyCrewComposerControls(rawControls, {
    crewSection: familyCrewSection,
    roster: crewModel(crewLead, {
      leadProviders: [{ kind: "codex", label: "Codex", capabilities: familyFastCapability }],
      onLeadChange,
    }),
  });
  const crew = controls.find((control) => control.kind === "crew");
  if (!crew) throw new Error("Expected a crew control");
  return { controls, crew, onConfigPatch, onLeadChange };
}

describe("handleComposerControlShortcut with a crew roster", () => {
  it.each([
    { model: "pair-a", fast: false, expected: { model: "pair-a-fast", fast: false } },
    { model: "pair-a-fast", fast: false, expected: { model: "pair-a", fast: false } },
  ])(
    "toggles Lead Fast through the authoritative family descriptor ($model)",
    ({ model: leadModel, fast, expected }) => {
      const { controls, crew, onConfigPatch, onLeadChange } = familyCrewControl(leadModel, fast);
      // No toolbar Fast: the crew transform must retain the descriptor only.
      expect(
        controls.some((control) => control.kind === "toggle" && control.label === "Fast"),
      ).toBe(false);
      expect(crew.model.leadFastControl?.isSelected).toBe(leadModel.endsWith("-fast"));

      const event = shortcutEvent("f", { shiftKey: true });
      const handled = dispatch(event, {
        controls,
        onOpenModelPicker: () => undefined,
      });

      expect(handled).toBe(true);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(onConfigPatch).toHaveBeenCalledWith(expected, { kind: "family-resolved" });
      expect(onLeadChange).not.toHaveBeenCalled();
    },
  );

  it("falls back to the saved lead carrier when no descriptor is available", () => {
    const onLeadChange = vi.fn<(next: CrewMemberSelection) => void>();
    const model = crewModel(
      { agentKind: "codex", model: "gpt-5.5", fast: false },
      { onLeadChange },
    );
    const event = shortcutEvent("f", { shiftKey: true });

    expect(
      dispatch(event, { controls: [crewControl(model)], onOpenModelPicker: () => undefined }),
    ).toBe(true);
    expect(onLeadChange).toHaveBeenCalledWith({ ...model.lead, fast: true });
  });

  it("does not consume the shortcut for an unavailable family Fast descriptor", () => {
    const { controls, crew, onConfigPatch } = familyCrewControl("hole-a", false);
    expect(crew.model.leadFastControl?.disabledReason).toBeTruthy();
    const event = shortcutEvent("f", { shiftKey: true });

    expect(dispatch(event, { controls, onOpenModelPicker: () => undefined })).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(onConfigPatch).not.toHaveBeenCalled();
  });

  it("does not consume the shortcut when crew Fast is disabled or unavailable", () => {
    const attempts: Array<ComposerControl> = [
      crewControl(crewModel({ agentKind: "codex", model: "gpt-5.5" }), { isDisabled: true }),
      crewControl(crewModel({ agentKind: "codex", model: "gpt-5.5" }, { isDisabled: true }), {
        isDisabled: false,
      }),
      crewControl(crewModel({ agentKind: "codex", model: "gpt-5.5" }, { leadProviders: [] })),
      crewControl(
        crewModel(
          { agentKind: "codex", model: "gpt-5.5" },
          {
            leadProviders: [
              {
                kind: "codex",
                label: "Codex",
                capabilities: { ...crewCapability, fastModels: [] },
              },
            ],
          },
        ),
      ),
    ];
    for (const control of attempts) {
      const event = shortcutEvent("f", { shiftKey: true });
      expect(dispatch(event, { controls: [control], onOpenModelPicker: () => undefined })).toBe(
        false,
      );
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
  });
});

// @vitest-environment node

it("keeps effort and Fast shortcuts with a single pairing control", () => {
  const onFastChange = vi.fn<(value: boolean) => void>();
  const onEffortChange = vi.fn<(value: string) => void>();
  const onSelectorChange = vi.fn<(value: string) => void>();
  const fastToggle: ComposerControl = {
    kind: "toggle",
    label: "Fast",
    isSelected: false,
    onChange: onFastChange,
  };
  const effort: ComposerControl = {
    kind: "effort-context",
    efforts: [
      { id: "low", label: "Low" },
      { id: "high", label: "High" },
    ],
    effortValue: "low",
    onEffortChange,
    contextSizes: [],
  };
  effort.familySelection = {
    agentKind: "example",
    effortScope: "primary",
    columns: [
      {
        id: "lead",
        label: "Main",
        icon: null,
        models: {
          options: [
            { id: "a", label: "Alpha" },
            { id: "b", label: "Beta" },
          ],
          value: "a",
          onChange: onSelectorChange,
        },
      },
    ],
  };
  const input = {
    controls: [effort, fastToggle],
    onOpenModelPicker: vi.fn<() => void>(),
  };
  expect(dispatch(shortcutEvent("t"), input)).toBe(true);
  expect(onEffortChange).toHaveBeenCalledWith("high");
  expect(onSelectorChange).not.toHaveBeenCalled();
  expect(dispatch(shortcutEvent("f", { shiftKey: true }), input)).toBe(true);
  expect(onFastChange).toHaveBeenCalledExactlyOnceWith(true);
  fastToggle.disabledReason = "Unavailable";
  expect(dispatch(shortcutEvent("f", { shiftKey: true }), input)).toBe(false);
  expect(onFastChange).toHaveBeenCalledTimes(1);
  effort.isDisabled = true;
  expect(dispatch(shortcutEvent("t"), input)).toBe(false);
});
