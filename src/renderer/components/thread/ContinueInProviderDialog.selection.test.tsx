import { act, fireEvent, render, screen } from "@testing-library/react";
import { toast } from "@heroui/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@/renderer/components/providers/bootstrap";
import type { AgentStatus, Thread } from "@/shared/contracts";
import { AppProvider } from "@/renderer/components/ui/provider";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { ContinueInProviderDialog } from "./ContinueInProviderDialog";

type DialogProps = Parameters<typeof ContinueInProviderDialog>[0];

const { bridge, composerSpy } = vi.hoisted(() => ({
  bridge: {
    platform: "darwin" as const,
    extractContext: vi.fn<(input: unknown) => Promise<unknown>>(),
    cancelExtractContext: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    searchProjectFiles: vi
      .fn<() => Promise<{ entries: unknown[]; totalIndexed: number }>>()
      .mockResolvedValue({ entries: [], totalIndexed: 0 }),
  },
  composerSpy: vi.fn<(props: { controls: Array<Record<string, unknown>> }) => void>(),
}));

vi.mock("../../bridge", () => ({
  readBridge: () => bridge,
  isRemoteSession: () => false,
  isDevApp: () => false,
  isCompactClientSurface: () => false,
}));

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

function renderDialog() {
  useSharedSettings.setState({
    hiddenModels: {},
    providerConfigs: {},
    providerModelPreferences: {},
    lastPresentationModeByAgent: { devin: "terminal" },
  } as never);
  const onContinue = vi.fn<DialogProps["onContinue"]>();
  render(
    <AppProvider>
      <ContinueInProviderDialog
        isOpen
        thread={thread}
        projectLocation={{ kind: "posix", path: "/repo" }}
        installedAgents={[source, target]}
        onClose={() => {}}
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
  };
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
});
