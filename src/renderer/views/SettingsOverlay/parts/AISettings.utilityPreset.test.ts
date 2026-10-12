import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@lingui/react";
import { i18n } from "@/renderer/i18n/i18n";
import type { ComposerControl } from "@/renderer/components/thread/ThreadComposer";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { setUtilityPresentation, utilitySettingsKeys } from "./utilityPreset";
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import relationTerminal from "@/shared/fixtures/selection-binding-v1/relation-terminal.json";
import { modelFamilySelectionSchema } from "@/shared/contracts/agent";
import type { AgentStatus, ThreadPresentationMode } from "@/shared/contracts";
import type { ModelSelection } from "@/shared/selectionBinding.schemas";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { ONE_SHOT_UTILITY_PRESENTATION } from "@/renderer/utils/utilitySelection";
import { AISettings, GenConfigSection, createUtilityPresetSetter } from "./AISettings";

const terminalRelation = modelFamilySelectionSchema.parse(relationTerminal.relation);
const member = "lead-a+sidekick-b";

function tupleWithRecord(overrides: Partial<ModelSelection> = {}): ModelSelection {
  return {
    model: member,
    effort: "",
    fast: false,
    selectionBinding: {
      version: 1,
      kind: "family-member",
      owner: { agentKind: "devin:profile-1", presentationMode: "terminal" },
      model: member,
      inertValues: { effort: "", fast: false },
    },
    ...overrides,
  };
}

describe("createUtilityPresetSetter", () => {
  beforeEach(() => {
    localStorage.clear();
    useSharedSettings.setState({
      // The deliberate title preset: scalar siblings only, no canonical tuple.
      titleGenProvider: "devin:profile-1",
      titleGenModel: member,
      titleGenEffort: "",
      titleGenFast: false,
      titleGenSelection: undefined,
      conflictResolverProvider: "devin:profile-1",
      conflictResolverModel: member,
      conflictResolverEffort: "",
      conflictResolverFast: false,
      conflictResolverSelection: undefined,
      conflictResolverPresentationMode: "terminal" as ThreadPresentationMode,
    });
  });

  it("dual-writes the scalar siblings and the fresh canonical tuple on a raw model pick", () => {
    const setScalars =
      vi.fn<(provider: string, model: string, effort: string, fast: boolean) => void>();
    const setter = createUtilityPresetSetter({
      keys: {
        canonical: "titleGenSelection",
        provider: "titleGenProvider",
        model: "titleGenModel",
        effort: "titleGenEffort",
        fast: "titleGenFast",
      },
      presentation: undefined,
      setScalars,
    });

    setter("devin:profile-1", "m2", "high", false, { kind: "model" });

    const state = useSharedSettings.getState();
    expect(setScalars).toHaveBeenCalledWith("devin:profile-1", "m2", "", false);
    // Exact tuple written; a raw pick never mints, so no binding exists.
    expect(state.titleGenSelection).toEqual({ model: "m2", effort: "", fast: false });
    expect(Object.hasOwn(state.titleGenSelection ?? {}, "selectionBinding")).toBe(false);
  });

  it("revokes only the touched axis on a same-value independent carrier edit", () => {
    useSharedSettings.setState({
      titleGenProvider: "devin:profile-1",
      titleGenModel: member,
      titleGenEffort: "",
      titleGenFast: false,
      titleGenSelection: tupleWithRecord(),
    });
    const setScalars =
      vi.fn<(provider: string, model: string, effort: string, fast: boolean) => void>();
    const setter = createUtilityPresetSetter({
      keys: {
        canonical: "titleGenSelection",
        provider: "titleGenProvider",
        model: "titleGenModel",
        effort: "titleGenEffort",
        fast: "titleGenFast",
      },
      presentation: undefined,
      setScalars,
    });

    // Same empty effort, still a deliberate edit: the recorded axis is revoked.
    setter("devin:profile-1", member, "", false, { kind: "carrier", axes: ["effort"] });

    const state = useSharedSettings.getState();
    expect(state.titleGenSelection?.selectionBinding?.inertValues).toEqual({ fast: false });
    expect(setScalars).toHaveBeenCalledWith("devin:profile-1", member, "", false);
  });

  it("drops the whole record when the provider is retargeted", () => {
    useSharedSettings.setState({ titleGenSelection: tupleWithRecord() });
    const setter = createUtilityPresetSetter({
      keys: {
        canonical: "titleGenSelection",
        provider: "titleGenProvider",
        model: "titleGenModel",
        effort: "titleGenEffort",
        fast: "titleGenFast",
      },
      presentation: undefined,
      setScalars: vi.fn<(provider: string, model: string, effort: string, fast: boolean) => void>(),
    });

    setter("other-agent", "m2", "high", false, { kind: "model" });

    const next = useSharedSettings.getState().titleGenSelection;
    expect(next).toEqual({ model: "m2", effort: "", fast: false });
    expect(Object.hasOwn(next ?? {}, "selectionBinding")).toBe(false);
  });

  it("reset writes the fresh explicit default tuple so a stale object cannot win", () => {
    useSharedSettings.setState({ titleGenSelection: tupleWithRecord() });
    const setter = createUtilityPresetSetter({
      keys: {
        canonical: "titleGenSelection",
        provider: "titleGenProvider",
        model: "titleGenModel",
        effort: "titleGenEffort",
        fast: "titleGenFast",
      },
      presentation: undefined,
      setScalars: vi.fn<(provider: string, model: string, effort: string, fast: boolean) => void>(),
    });

    setter("auto", "", "", false, { kind: "reset" });

    expect(useSharedSettings.getState().titleGenSelection).toEqual({
      model: "",
      effort: "",
      fast: false,
    });
  });

  it("mints from a resolved family-member edit only when the presentation is declared", () => {
    const setScalars =
      vi.fn<(provider: string, model: string, effort: string, fast: boolean) => void>();
    // The conflict resolver declares its presentation: the resolved member
    // edit may mint under the declared surface owner.
    const conflictSetter = createUtilityPresetSetter({
      keys: {
        canonical: "conflictResolverSelection",
        provider: "conflictResolverProvider",
        model: "conflictResolverModel",
        effort: "conflictResolverEffort",
        fast: "conflictResolverFast",
      },
      presentation: "terminal",
      setScalars,
    });

    conflictSetter("devin:profile-1", member, "", false, {
      kind: "model",
      relation: terminalRelation,
    });

    const record = useSharedSettings.getState().conflictResolverSelection?.selectionBinding;
    expect(record).toBeDefined();
    expect(record?.owner).toEqual({
      agentKind: "devin:profile-1",
      presentationMode: "terminal",
    });
    expect(record?.inertValues).toEqual({ effort: "", fast: false });

    // An unset presentation still refuses the mint. Title and commit declare
    // ONE_SHOT_UTILITY_PRESENTATION on the shipped settings page.
    useSharedSettings.setState({ titleGenSelection: undefined });
    const titleSetter = createUtilityPresetSetter({
      keys: {
        canonical: "titleGenSelection",
        provider: "titleGenProvider",
        model: "titleGenModel",
        effort: "titleGenEffort",
        fast: "titleGenFast",
      },
      presentation: undefined,
      setScalars: vi.fn<(provider: string, model: string, effort: string, fast: boolean) => void>(),
    });
    titleSetter("devin:profile-1", member, "", false, {
      kind: "model",
      relation: terminalRelation,
    });
    expect(
      Object.hasOwn(useSharedSettings.getState().titleGenSelection ?? {}, "selectionBinding"),
    ).toBe(false);
  });

  it("mints title and commit bindings when the one-shot presentation is declared", () => {
    const setScalars =
      vi.fn<(provider: string, model: string, effort: string, fast: boolean) => void>();
    for (const domain of ["titleGen", "commitGen"] as const) {
      useSharedSettings.setState({ [`${domain}Selection`]: undefined });
      const setter = createUtilityPresetSetter({
        keys: utilitySettingsKeys(domain, false),
        presentation: ONE_SHOT_UTILITY_PRESENTATION,
        setScalars,
      });
      setter("devin:profile-1", member, "", false, {
        kind: "model",
        relation: terminalRelation,
      });
      const saved = useSharedSettings.getState()[utilitySettingsKeys(domain, false).canonical];
      expect(saved?.selectionBinding?.owner).toEqual({
        agentKind: "devin:profile-1",
        presentationMode: "terminal",
      });
    }
  });

  it("a family-row no-op persists nothing", () => {
    useSharedSettings.setState({ titleGenSelection: tupleWithRecord() });
    const setScalars =
      vi.fn<(provider: string, model: string, effort: string, fast: boolean) => void>();
    const setter = createUtilityPresetSetter({
      keys: {
        canonical: "titleGenSelection",
        provider: "titleGenProvider",
        model: "titleGenModel",
        effort: "titleGenEffort",
        fast: "titleGenFast",
      },
      presentation: undefined,
      setScalars,
    });

    setter("devin:profile-1", member, "", false, { kind: "family-noop" });

    expect(setScalars).not.toHaveBeenCalled();
    expect(useSharedSettings.getState().titleGenSelection).toEqual(tupleWithRecord());
  });

  it("refuses the edit without any write when the carried relation cannot resolve the target", () => {
    const setScalars =
      vi.fn<(provider: string, model: string, effort: string, fast: boolean) => void>();
    const setter = createUtilityPresetSetter({
      keys: {
        canonical: "titleGenSelection",
        provider: "titleGenProvider",
        model: "titleGenModel",
        effort: "titleGenEffort",
        fast: "titleGenFast",
      },
      presentation: "terminal",
      setScalars,
    });

    expect(() =>
      setter("devin:profile-1", "not-a-member", "", false, {
        kind: "model",
        relation: terminalRelation,
      }),
    ).toThrow(/does not resolve to a member/);
    expect(setScalars).not.toHaveBeenCalled();
    expect(useSharedSettings.getState().titleGenSelection).toBeUndefined();
  });
});

describe("canonical event patches", () => {
  const keys = {
    canonical: "titleGenSelection",
    provider: "titleGenProvider",
    model: "titleGenModel",
    effort: "titleGenEffort",
    fast: "titleGenFast",
  } as const;
  function setter() {
    return createUtilityPresetSetter({
      keys,
      presentation: undefined,
      setScalars: useSharedSettings.getState().setTitleGenConfig,
    });
  }
  beforeEach(() => {
    localStorage.clear();
    useSharedSettings.setState({
      titleGenProvider: "devin:profile-1",
      titleGenModel: "stale",
      titleGenEffort: "high",
      titleGenFast: true,
      titleGenSelection: tupleWithRecord({ thinking: true, contextSize: "large" }),
    });
  });
  it("preserves thinking/context and revokes only the same-value edited axis", () => {
    setter()("devin:profile-1", "stale", "", true, { kind: "carrier", axes: ["effort"] });
    const next = useSharedSettings.getState().titleGenSelection;
    expect(next).toStrictEqual(
      tupleWithRecord({
        thinking: true,
        contextSize: "large",
        selectionBinding: { ...tupleWithRecord().selectionBinding!, inertValues: { fast: false } },
      }),
    );
  });
  it("raw model edits revoke intent while retaining every other axis", () => {
    setter()("devin:profile-1", member, "high", true, { kind: "model" });
    expect(useSharedSettings.getState().titleGenSelection).toStrictEqual({
      model: member,
      effort: "",
      fast: false,
      thinking: true,
      contextSize: "large",
    });
  });
  it("does not backfill stale siblings into omitted modern controls", () => {
    useSharedSettings.setState({ titleGenSelection: { model: member } });
    setter()("devin:profile-1", "stale", "low", true, { kind: "carrier", axes: ["effort"] });
    expect(useSharedSettings.getState().titleGenSelection).toStrictEqual({
      model: member,
      effort: "low",
    });
    expect(useSharedSettings.getState().titleGenFast).toBe(false);
  });
  it("revokes only touched thinking/context axes, including same values and deletion", () => {
    const original = tupleWithRecord({
      thinking: false,
      contextSize: "",
      selectionBinding: {
        ...tupleWithRecord().selectionBinding!,
        inertValues: { effort: "", fast: false, thinking: false, contextSize: "" },
      },
    });
    useSharedSettings.setState({ titleGenSelection: original });
    setter()("devin:profile-1", "stale", "high", true, {
      kind: "carrier",
      axes: ["thinking"],
      patch: { thinking: false },
    });
    expect(useSharedSettings.getState().titleGenSelection).toStrictEqual({
      ...original,
      selectionBinding: {
        ...original.selectionBinding!,
        inertValues: { effort: "", fast: false, contextSize: "" },
      },
    });
    setter()("devin:profile-1", "stale", "high", true, {
      kind: "carrier",
      axes: ["contextSize"],
      patch: {},
    });
    const next = useSharedSettings.getState().titleGenSelection;
    expect(Object.hasOwn(next!, "contextSize")).toBe(false);
    expect(next?.selectionBinding?.inertValues).toStrictEqual({ effort: "", fast: false });
    expect(next?.thinking).toBe(false);
  });
  it("reset is a fresh default and discards previous actual controls", () => {
    setter()("auto", "ignored", "high", true, { kind: "reset" });
    expect(useSharedSettings.getState().titleGenSelection).toStrictEqual({
      model: "",
      effort: "",
      fast: false,
    });
  });
  it("publishes and persists one coherent compatibility snapshot from the final tuple", () => {
    const observed: unknown[] = [];
    const unsub = useSharedSettings.subscribe((s) =>
      observed.push([s.titleGenSelection, s.titleGenModel, s.titleGenEffort, s.titleGenFast]),
    );
    const persist = vi.spyOn(Storage.prototype, "setItem");
    try {
      setter()("devin:profile-1", "next", "high", true, { kind: "model" });
      const next = { model: "next", effort: "", fast: false, thinking: true, contextSize: "large" };
      for (const snapshot of observed) expect(snapshot).toStrictEqual([next, "next", "", false]);
      expect(persist).toHaveBeenCalledTimes(1);
      const snapshot = JSON.parse(persist.mock.calls[0]![1]);
      expect(snapshot.titleGenSelection).toStrictEqual(next);
      expect([
        snapshot.titleGenModel,
        snapshot.titleGenEffort,
        snapshot.titleGenFast,
      ]).toStrictEqual(["next", "", false]);
    } finally {
      unsub();
      persist.mockRestore();
    }
  });
  it("family no-op under a different full profile retargets and drops intent", () => {
    setter()("devin:profile-2", member, "high", true, { kind: "family-noop" });
    expect(useSharedSettings.getState().titleGenProvider).toBe("devin:profile-2");
    expect(useSharedSettings.getState().titleGenSelection).toStrictEqual({
      model: member,
      effort: "",
      fast: false,
      thinking: true,
      contextSize: "large",
    });
  });
});

const captured = vi.hoisted(() => ({ controls: [] as ComposerControl[] }));
vi.mock("@/renderer/components/thread/ThreadComposer", () => ({
  ThreadComposer: (props: { controls: ComposerControl[] }) => {
    captured.controls = props.controls;
    return null;
  },
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("utility section event wiring", () => {
  const caps = {
    models: terminalRelation.members.map((m) => ({ id: m.model, label: m.model })),
    efforts: [],
    modelEfforts: {},
    modes: ["agent"],
    approvalPolicies: [],
    sandboxModes: [],
    supportsResume: true,
    supportsOneShot: true,
    supportsDirectInput: true,
    liveInputMode: "terminal",
    presentationMode: "terminal",
    settingDefs: [],
    modelFamilies: [terminalRelation],
  };
  const first = {
    kind: "fixture-profile:first",
    label: "First",
    installed: true,
    authState: "authenticated",
    capabilities: caps,
  } as AgentStatus;
  const second = { ...first, kind: "fixture-profile:second", label: "Second" };
  function mount(
    selection: ModelSelection = tupleWithRecord({
      selectionBinding: {
        ...tupleWithRecord().selectionBinding!,
        owner: { agentKind: first.kind, presentationMode: "terminal" },
      },
    }),
  ) {
    useSharedSettings.setState({
      conflictResolverProvider: first.kind,
      conflictResolverSelection: selection,
      conflictResolverModel: "stale",
      conflictResolverEffort: "high",
      conflictResolverFast: true,
      conflictResolverPresentationMode: "terminal",
    });
    const onConfigChange = createUtilityPresetSetter({
      keys: {
        canonical: "conflictResolverSelection",
        provider: "conflictResolverProvider",
        model: "conflictResolverModel",
        effort: "conflictResolverEffort",
        fast: "conflictResolverFast",
      },
      presentation: "terminal",
      setScalars: useSharedSettings.getState().setConflictResolverConfig,
    });
    render(
      createElement(
        I18nProvider,
        { i18n },
        createElement(GenConfigSection, {
          heading: "Fixture",
          description: "Fixture",
          provider: first.kind,
          selection,
          model: "stale",
          effort: "high",
          fast: true,
          presentationMode: "terminal",
          agentStatuses: [first, second],
          resolve: (_a, model, effort) => ({ model, effort, availableEfforts: [] }),
          getCandidates: () => [first, second],
          onConfigChange,
        }),
      ),
    );
    const picker = captured.controls.find((c) => c.kind === "provider-model");
    if (!picker || picker.kind !== "provider-model") throw new Error("missing model picker");
    return picker;
  }
  it("accepts only same-owner family rows as no-ops", () => {
    const picker = mount();
    const before = useSharedSettings.getState().conflictResolverSelection;
    act(() => picker.onChange({ agentKind: first.kind, model: member, selectionIntent: "family" }));
    expect(useSharedSettings.getState().conflictResolverSelection).toBe(before);
    act(() =>
      picker.onChange({ agentKind: second.kind, model: member, selectionIntent: "family" }),
    );
    expect(useSharedSettings.getState().conflictResolverProvider).toBe(second.kind);
    expect(useSharedSettings.getState().conflictResolverSelection).toStrictEqual({
      model: member,
      effort: "",
      fast: false,
    });
  });
  it("retargets an exact same-UID pick to another full profile", () => {
    const picker = mount();
    act(() => picker.onChange({ agentKind: second.kind, model: member, selectionIntent: "exact" }));
    expect(useSharedSettings.getState().conflictResolverProvider).toBe(second.kind);
    expect(
      useSharedSettings.getState().conflictResolverSelection?.selectionBinding,
    ).toBeUndefined();
  });
  it("an exact same-owner same-UID pick revokes intent instead of minting", () => {
    const picker = mount();
    act(() => picker.onChange({ agentKind: first.kind, model: member, selectionIntent: "exact" }));
    expect(useSharedSettings.getState().conflictResolverProvider).toBe(first.kind);
    expect(
      useSharedSettings.getState().conflictResolverSelection?.selectionBinding,
    ).toBeUndefined();
  });
  it("an exact pick never mints on an unstamped tuple", () => {
    const picker = mount({ model: member, effort: "", fast: false });
    act(() => picker.onChange({ agentKind: first.kind, model: member, selectionIntent: "exact" }));
    expect(
      useSharedSettings.getState().conflictResolverSelection?.selectionBinding,
    ).toBeUndefined();
  });
  it("a cross-provider family row establishes fresh target intent", () => {
    const picker = mount({ model: "solo", effort: "", fast: false });
    act(() =>
      picker.onChange({ agentKind: second.kind, model: member, selectionIntent: "family" }),
    );
    const saved = useSharedSettings.getState().conflictResolverSelection;
    expect(useSharedSettings.getState().conflictResolverProvider).toBe(second.kind);
    expect(saved?.selectionBinding?.owner).toEqual({
      agentKind: second.kind,
      presentationMode: "terminal",
    });
    expect(saved?.selectionBinding?.model).toBe(saved?.model);
  });
  it("routes the real presentation toggle through permanent intent revocation", () => {
    useAgentStatusesStore.setState({ agentStatuses: [first], wslAgentStatuses: [] });
    const selection = tupleWithRecord({ thinking: true, contextSize: "large" });
    useSharedSettings.setState({
      conflictResolverProvider: first.kind,
      conflictResolverSelection: selection,
      conflictResolverPresentationMode: "terminal",
    });
    render(createElement(I18nProvider, { i18n }, createElement(AISettings)));
    fireEvent.click(screen.getByRole("radio", { name: "Chat" }));
    expect(useSharedSettings.getState().conflictResolverPresentationMode).toBe("gui");
    expect(
      useSharedSettings.getState().conflictResolverSelection?.selectionBinding,
    ).toBeUndefined();
    fireEvent.click(screen.getByRole("radio", { name: "CLI" }));
    expect(useSharedSettings.getState().conflictResolverPresentationMode).toBe("terminal");
    expect(useSharedSettings.getState().conflictResolverSelection).toStrictEqual({
      model: member,
      effort: "",
      fast: false,
      thinking: true,
      contextSize: "large",
    });
  });
  it("persists the WSL presentation and complete tuple together without reviving intent", () => {
    useSharedSettings.setState({
      wslConflictResolverProvider: first.kind,
      wslConflictResolverPresentationMode: "terminal",
      wslConflictResolverSelection: tupleWithRecord({ thinking: false, contextSize: "" }),
    });
    const persist = vi.spyOn(Storage.prototype, "setItem");
    setUtilityPresentation(true, "gui");
    expect(persist).toHaveBeenCalledTimes(1);
    const snapshot = JSON.parse(persist.mock.calls[0]![1]);
    expect(snapshot.wslConflictResolverPresentationMode).toBe("gui");
    expect(snapshot.wslConflictResolverSelection).toStrictEqual({
      model: member,
      effort: "",
      fast: false,
      thinking: false,
      contextSize: "",
    });
    setUtilityPresentation(true, "terminal");
    expect(
      useSharedSettings.getState().wslConflictResolverSelection?.selectionBinding,
    ).toBeUndefined();
  });
});
