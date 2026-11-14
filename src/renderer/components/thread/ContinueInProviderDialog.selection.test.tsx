import { act, fireEvent, render, screen } from "@testing-library/react";
import { toast } from "@heroui/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@/renderer/components/providers/bootstrap";
import type { AgentStatus, Thread } from "@/shared/contracts";
import { AppProvider } from "@/renderer/components/ui/provider";
import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { ContinueInProviderDialog } from "./ContinueInProviderDialog";

type DialogProps = Parameters<typeof ContinueInProviderDialog>[0];

const { bridge, composerSpy, helperDefault } = vi.hoisted(() => ({
  bridge: {
    platform: "darwin" as const,
    extractContext: vi.fn<(input: unknown) => Promise<unknown>>(),
    cancelExtractContext: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    searchProjectFiles: vi
      .fn<() => Promise<{ entries: unknown[]; totalIndexed: number }>>()
      .mockResolvedValue({ entries: [], totalIndexed: 0 }),
  },
  composerSpy: vi.fn<(props: { controls: Array<Record<string, unknown>> }) => void>(),
  // The helper model a new crew gets by default. The real crew helper options
  // need a routed provider roster; undefined keeps the real hook's answer.
  helperDefault: { current: undefined as { agentKind: string; model: string } | undefined },
}));

vi.mock("../../bridge", () => ({
  readBridge: () => bridge,
  isRemoteSession: () => false,
  isDevApp: () => false,
  isCompactClientSurface: () => false,
}));

vi.mock("../crew/crewHelperOptions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../crew/crewHelperOptions")>();
  return {
    ...actual,
    useCrewHelperOptions: () => {
      const options = actual.useCrewHelperOptions();
      return helperDefault.current
        ? { ...options, defaultSelectionFor: () => helperDefault.current }
        : options;
    },
  };
});

vi.mock("./ThreadComposer", () => ({
  ThreadComposer: (props: { controls: Array<Record<string, unknown>> }) => {
    composerSpy(props);
    return null;
  },
}));

const thread: Thread = {
  id: "thread-1",
  projectId: "project-1",
  agentKind: "claude",
  config: { model: "claude-opus-5" },
  title: "Incident triage",
  status: "idle",
  attention: "none",
  canResumeWithConfig: false,
  archived: false,
  done: false,
  starred: false,
  presentationMode: "terminal",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

// Terminal: model-bound (encoded) family members declaring their inert seeds.
// GUI: a config-bound pair relation that cannot carry the encoded Fast state.
const selectors = [
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
    options: [{ id: "x", label: "X" }],
  },
];
const terminalRelation = {
  model: "f-alpha-x-low",
  label: "Fusion",
  selectors,
  bindings: { effort: "model" as const, fast: "model" as const },
  redundantValues: { effort: ["", "default"], fast: [false] },
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
    {
      model: "f-beta-x-low",
      selections: { lead: "beta", sidekick: "x" },
      effort: "low",
      fast: false,
    },
  ],
};
const target = {
  kind: "devin",
  label: "Devin",
  installed: true,
  authState: "authenticated",
  capabilities: {
    models: [
      { id: "solo", label: "Solo" },
      ...terminalRelation.members.map((member) => ({ id: member.model, label: member.model })),
    ],
    efforts: [],
    modelEfforts: {},
    modes: ["agent"],
    approvalPolicies: [{ id: "normal", label: "Normal" }],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "terminal",
    presentationMode: "terminal",
    presentationModes: ["terminal", "gui"],
    mcpScope: { gui: "launch", terminal: "none" },
    settingDefs: [],
    modelFamilies: [terminalRelation],
    presentationCapabilities: {
      gui: {
        models: [
          { id: "solo", label: "Solo" },
          { id: "pair-alpha-x", label: "Fusion (Alpha + X)" },
        ],
        efforts: ["low", "high"],
        modelEfforts: { "pair-alpha-x": ["low", "high"] },
        modelFamilies: [
          {
            model: "pair-alpha-x",
            label: "Fusion",
            selectors,
            bindings: { effort: "config" as const, fast: "config" as const },
            members: [{ model: "pair-alpha-x", selections: { lead: "alpha", sidekick: "x" } }],
          },
        ],
      },
    },
  },
} as unknown as AgentStatus;
const source = {
  ...target,
  kind: "claude",
  label: "Claude",
  capabilities: { ...target.capabilities, modelFamilies: [], presentationCapabilities: {} },
} as unknown as AgentStatus;

const builderRoles = [
  {
    id: "builder",
    label: "Builder",
    selection: { agentKind: "claude", model: "claude-opus-5" },
  },
];
// A saved crew whose lead is the dialog's target provider.
const nightShift = {
  id: "crew-1",
  name: "Night shift",
  lead: { agentKind: "devin", model: "solo" },
  roles: builderRoles,
  policy: "crew-only" as const,
};
// The binding a source thread carries when it already runs with a crew.
const carriedCrew = {
  version: 1 as const,
  name: "Night shift",
  policy: "crew-only" as const,
  roles: builderRoles,
};

function renderDialog(
  sourceThread: Thread = thread,
  targetPresentationMode: "terminal" | "gui" = "terminal",
  options: { agents?: AgentStatus[]; onClose?: () => void } = {},
) {
  useSharedSettings.setState({
    hiddenModels: {},
    providerConfigs: {},
    providerModelPreferences: {},
    lastPresentationModeByAgent: { devin: targetPresentationMode },
  } as never);
  const onContinue = vi.fn<DialogProps["onContinue"]>();
  render(
    <AppProvider>
      <ContinueInProviderDialog
        isOpen
        thread={sourceThread}
        projectLocation={{ kind: "posix", path: "/repo" }}
        installedAgents={options.agents ?? [source, target]}
        onClose={options.onClose ?? (() => {})}
        onContinue={onContinue}
      />
    </AppProvider>,
  );
  return onContinue;
}

function controls() {
  return composerSpy.mock.lastCall?.[0].controls ?? [];
}

function picker() {
  return controls().find((control) => control.kind === "provider-model") as {
    currentModel: string;
    onChange: (next: Record<string, unknown>) => void;
    crewSection?: {
      entries: Array<{ crewId: string; name: string }>;
      currentCrewId?: string;
      current?: { name: string };
      canCreate: boolean;
      onSelect: (choice: { crewId: string } | { newCrew: true }) => void;
    };
  };
}

function crewControl() {
  return controls().find((control) => control.kind === "crew") as
    | { openSignal?: number; model: RosterModel }
    | undefined;
}

type RosterModel = {
  onLeadChange: (selection: { agentKind: string; model: string; effort?: string }) => void;
  onEditInSettings: () => void;
};

function roster(): RosterModel {
  const control = crewControl();
  if (!control) throw new Error("no crew control is rendered");
  return control.model;
}

function fastToggle() {
  return controls().find((control) => control.kind === "toggle" && control.iconKind === "fast") as {
    onChange: (selected: boolean) => void;
  };
}

function pick(model: string, selectionIntent: "exact" | "family" = "exact") {
  act(() => picker().onChange({ agentKind: "devin", model, selectionIntent }));
}

async function submittedConfig(onContinue: ReturnType<typeof renderDialog>) {
  fireEvent.click(await screen.findByRole("button", { name: "Switch" }));
  return onContinue.mock.lastCall?.[1];
}

describe("ContinueInProviderDialog target family selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    helperDefault.current = undefined;
    useSharedSettings.setState({
      crews: [],
      agentSelectionUsage: [],
      crossagentSelectionUsage: [],
      favoriteModels: [],
    } as never);
    useAppStore.setState({
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      threadMentionToolsAvailableByThreadId: {},
    } as never);
  });

  it("an exact member pick keeps its exact empty/false carriers without minting", async () => {
    const onContinue = renderDialog();
    pick("f-alpha-x-low-fast");
    const config = await submittedConfig(onContinue);
    expect(config).toMatchObject({ model: "f-alpha-x-low-fast", effort: "", fast: false });
    expect(config?.selectionBinding).toBeUndefined();
  });

  it("mints target intent from a deliberate member edit and submits it intact", async () => {
    const onContinue = renderDialog();
    pick("f-alpha-x-low-fast");
    act(() => fastToggle().onChange(false));
    const config = await submittedConfig(onContinue);
    expect(config).toMatchObject({ model: "f-alpha-x-low", effort: "", fast: false });
    expect(config?.selectionBinding).toEqual({
      version: 1,
      kind: "family-member",
      owner: { agentKind: "devin", presentationMode: "terminal" },
      model: "f-alpha-x-low",
      inertValues: { effort: "", fast: false },
    });
  });

  it("keeps the current non-representative member on a family-row click", () => {
    renderDialog();
    pick("f-alpha-x-high");
    pick("f-alpha-x-low", "family");
    expect(picker().currentModel).toBe("f-alpha-x-high");
  });

  it("drops intent on an exact re-pick of the same member", async () => {
    const onContinue = renderDialog();
    pick("f-alpha-x-low-fast");
    act(() => fastToggle().onChange(false));
    pick("f-alpha-x-low");
    const config = await submittedConfig(onContinue);
    expect(config).toMatchObject({ model: "f-alpha-x-low", effort: "", fast: false });
    expect(config?.selectionBinding).toBeUndefined();
  });

  it("refuses an unprovable surface switch, keeping surface and selection", async () => {
    const toastDanger = vi
      .spyOn(toast, "danger")
      .mockImplementation(() => undefined as unknown as ReturnType<typeof toast.danger>);
    const onContinue = renderDialog();
    pick("f-alpha-x-low-fast");
    fireEvent.click(screen.getByRole("tab", { name: "Chat" }));
    expect(toastDanger).toHaveBeenCalledTimes(1);
    const config = await submittedConfig(onContinue);
    expect(config).toMatchObject({ model: "f-alpha-x-low-fast" });
    expect(onContinue.mock.lastCall?.[2]).toBe("terminal");
    toastDanger.mockRestore();
  });

  it("carries a source crew to a GUI target that can lead it", async () => {
    const crew = {
      version: 1 as const,
      name: "Night shift",
      policy: "crew-only" as const,
      roles: [
        {
          id: "builder",
          label: "Builder",
          selection: { agentKind: "claude", model: "claude-opus-5" },
        },
      ],
    };
    const sourceThread = { ...thread, config: { ...thread.config, crew } };
    const onContinue = renderDialog(sourceThread, "gui");
    expect(screen.getByText("Night shift comes along.")).toBeInTheDocument();
    const config = await submittedConfig(onContinue);
    expect(config?.crew).toEqual(crew);
  });

  it("drops a source crew for a target that cannot lead it", async () => {
    const crew = {
      version: 1 as const,
      name: "Night shift",
      policy: "crew-only" as const,
      roles: [
        {
          id: "builder",
          label: "Builder",
          selection: { agentKind: "claude", model: "claude-opus-5" },
        },
      ],
    };
    const sourceThread = { ...thread, config: { ...thread.config, crew } };
    const onContinue = renderDialog(sourceThread, "terminal");
    expect(
      screen.getByText("Night shift stays behind: Devin can't lead a crew."),
    ).toBeInTheDocument();
    const config = await submittedConfig(onContinue);
    expect(config?.crew).toBeNull();
  });

  it("offers saved crews and continues under the picked crew's lead", async () => {
    useSharedSettings.setState({ crews: [nightShift] } as never);
    const onContinue = renderDialog(thread, "gui");

    const section = picker().crewSection;
    expect(section?.entries.map((entry) => entry.crewId)).toEqual(["crew-1"]);
    act(() => section?.onSelect({ crewId: "crew-1" }));

    expect(picker().crewSection?.currentCrewId).toBe("crew-1");
    expect(crewControl()).toBeDefined();
    const config = await submittedConfig(onContinue);
    expect(onContinue.mock.lastCall?.[0]).toBe("devin");
    expect(config?.model).toBe("solo");
    expect(config?.crew).toEqual({
      version: 1,
      crewId: "crew-1",
      name: "Night shift",
      policy: "crew-only",
      roles: builderRoles,
    });
  });

  it("clears a crew picked here when a plain model is picked afterwards", async () => {
    useSharedSettings.setState({ crews: [nightShift] } as never);
    const onContinue = renderDialog(thread, "gui");

    act(() => picker().crewSection?.onSelect({ crewId: "crew-1" }));
    pick("pair-alpha-x");

    expect(crewControl()).toBeUndefined();
    const config = await submittedConfig(onContinue);
    expect(config?.crew).toBeNull();
  });

  it("keeps the crew carried from the source thread when a plain model is picked", async () => {
    const sourceThread = { ...thread, config: { ...thread.config, crew: carriedCrew } };
    const onContinue = renderDialog(sourceThread, "gui");

    pick("pair-alpha-x");

    expect(screen.getByText("Night shift comes along.")).toBeInTheDocument();
    expect(crewControl()).toBeDefined();
    const config = await submittedConfig(onContinue);
    expect(config).toMatchObject({ model: "pair-alpha-x", crew: carriedCrew });
  });

  it("keeps a crew on a crew thread after swapping crews and picking a plain model", async () => {
    useSharedSettings.setState({ crews: [nightShift] } as never);
    const sourceThread = { ...thread, config: { ...thread.config, crew: carriedCrew } };
    const onContinue = renderDialog(sourceThread, "gui");

    act(() => picker().crewSection?.onSelect({ crewId: "crew-1" }));
    pick("pair-alpha-x");

    expect(crewControl()).toBeDefined();
    const config = await submittedConfig(onContinue);
    expect(config).toMatchObject({ model: "pair-alpha-x", crew: { crewId: "crew-1" } });
  });

  it("presents no crew when the target cannot lead the carried one", async () => {
    const cannotLead = {
      ...target,
      capabilities: { ...target.capabilities, mcpConfigSource: "agentSettings" },
    } as unknown as AgentStatus;
    const sourceThread = { ...thread, config: { ...thread.config, crew: carriedCrew } };
    const onContinue = renderDialog(sourceThread, "gui", { agents: [source, cannotLead] });

    expect(
      screen.getByText("Night shift stays behind: Devin can't lead a crew."),
    ).toBeInTheDocument();
    // A chat surface still lets a crew be picked, but neither the picker nor
    // the toolbar presents a crew the launch will not use.
    expect(picker().crewSection?.current).toBeUndefined();
    expect(crewControl()).toBeUndefined();
    const config = await submittedConfig(onContinue);
    expect(config?.crew).toBeNull();
  });

  it("builds a new crew and opens its roster once the roster has mounted", async () => {
    helperDefault.current = { agentKind: "claude", model: "claude-haiku-5" };
    renderDialog(thread, "gui");

    expect(picker().crewSection?.canCreate).toBe(true);
    expect(crewControl()).toBeUndefined();
    act(() => picker().crewSection?.onSelect({ newCrew: true }));

    expect(crewControl()?.openSignal).toBe(0);
    await act(async () => {});
    expect(crewControl()?.openSignal).toBe(1);
  });

  it("dismisses the dialog before opening Crews settings from the roster", () => {
    useSharedSettings.setState({ crews: [nightShift] } as never);
    const onClose = vi.fn<() => void>();
    const openSettingsSection = vi.fn<(section: string, anchor?: string) => void>();
    const original = usePanelStore.getState().openSettingsSection;
    usePanelStore.setState({ openSettingsSection } as never);
    try {
      renderDialog(thread, "gui", { onClose });
      act(() => picker().crewSection?.onSelect({ crewId: "crew-1" }));

      act(() => roster().onEditInSettings());

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(openSettingsSection).toHaveBeenCalledWith("crews", "crews.crew-1");
    } finally {
      usePanelStore.setState({ openSettingsSection: original } as never);
    }
  });

  it("attaches a crew led by the source provider under the current lead", async () => {
    const warning = vi
      .spyOn(toast, "warning")
      .mockImplementation(() => undefined as unknown as ReturnType<typeof toast.warning>);
    useSharedSettings.setState({
      crews: [{ ...nightShift, lead: { agentKind: "claude", model: "claude-opus-5" } }],
    } as never);
    const onContinue = renderDialog(thread, "gui");

    act(() => picker().crewSection?.onSelect({ crewId: "crew-1" }));

    expect(warning).toHaveBeenCalledTimes(1);
    const config = await submittedConfig(onContinue);
    expect(onContinue.mock.lastCall?.[0]).toBe("devin");
    expect(config?.crew).toMatchObject({ crewId: "crew-1" });
    warning.mockRestore();
  });

  it("retargets the lead from the roster without leaving the crew", async () => {
    useSharedSettings.setState({ crews: [nightShift] } as never);
    const onContinue = renderDialog(thread, "gui");
    act(() => picker().crewSection?.onSelect({ crewId: "crew-1" }));

    act(() => roster().onLeadChange({ agentKind: "devin", model: "pair-alpha-x" }));
    expect(picker().currentModel).toBe("pair-alpha-x");
    act(() => roster().onLeadChange({ agentKind: "devin", model: "pair-alpha-x", effort: "high" }));

    const config = await submittedConfig(onContinue);
    expect(config).toMatchObject({
      model: "pair-alpha-x",
      effort: "high",
      crew: { crewId: "crew-1" },
    });
  });

  it("keeps the lead when the roster hands back one this dialog cannot target", () => {
    const warning = vi
      .spyOn(toast, "warning")
      .mockImplementation(() => undefined as unknown as ReturnType<typeof toast.warning>);
    useSharedSettings.setState({ crews: [nightShift] } as never);
    renderDialog(thread, "gui");
    act(() => picker().crewSection?.onSelect({ crewId: "crew-1" }));

    act(() => roster().onLeadChange({ agentKind: "claude", model: "claude-opus-5" }));

    expect(warning).toHaveBeenCalledTimes(1);
    expect(picker().currentModel).toBe("solo");
    warning.mockRestore();
  });

  it("offers no crew selection on a surface that cannot lead one", () => {
    useSharedSettings.setState({ crews: [nightShift] } as never);
    renderDialog(thread, "terminal");

    expect(picker().crewSection).toBeUndefined();
  });
});
