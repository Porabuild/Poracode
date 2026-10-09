import { fireEvent, screen } from "@testing-library/react";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentCapability, AgentStatus, Thread } from "@/shared/contracts";
import { buildControls } from "@/renderer/components/thread/buildModelPickerControls";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  ProviderModelMenu,
  type ProviderModelMenuProvider,
  type ProviderModelSelection,
} from "./ProviderModelMenu";

// A projected GUI pair family whose stored seeds the surface declares
// redundant, mirroring the encoded descriptor shape the selection-binding
// event suites use.
const familyDescriptor = {
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
  bindings: { effort: "model" as const, fast: "model" as const },
  redundantValues: { effort: [""], fast: [false] },
  members: [
    {
      model: "pair-alpha-x",
      selections: { lead: "alpha", sidekick: "x" },
      effort: "low",
      fast: false,
    },
    {
      model: "pair-alpha-y",
      selections: { lead: "alpha", sidekick: "y" },
      effort: "high",
      fast: true,
    },
    {
      model: "pair-beta-x",
      selections: { lead: "beta", sidekick: "x" },
      effort: "low",
      fast: false,
    },
  ],
};

const familyCapabilities = {
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
  modelFamilies: [familyDescriptor],
} as unknown as AgentCapability;

function familyProvider(): ProviderModelMenuProvider {
  return { kind: "agent", label: "Agent", capabilities: familyCapabilities };
}

function guiAgent(): AgentStatus {
  return {
    kind: "agent",
    label: "Agent",
    installed: true,
    authState: "authenticated",
    capabilities: familyCapabilities,
  } as AgentStatus;
}

function bindingThread(config: Record<string, unknown>): Thread {
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "Thread",
    agentKind: "agent",
    config,
    status: "idle",
    attention: "none",
    canResumeWithConfig: true,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
  } as Thread;
}

function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Select model" }));
  return screen.getByRole("listbox", { name: "Models" });
}

function findRow(listbox: HTMLElement, rowIdSuffix: string): HTMLElement {
  const rows = Array.from(listbox.querySelectorAll<HTMLElement>('[role="option"]'));
  const row = rows.find((candidate) => candidate.id.endsWith(rowIdSuffix));
  if (!row) {
    throw new Error(
      `Row ${rowIdSuffix} not rendered; options: ${rows.map((r) => r.id).join(", ")}`,
    );
  }
  return row;
}

describe("ProviderModelMenu deliberate same-value selection events", () => {
  beforeEach(() => {
    useSharedSettings.setState({
      favoriteModels: [],
      recentModels: [],
      hiddenModels: {},
      providerConfigs: {},
      providerModelPreferences: {},
    });
  });

  it("emits an exact re-pick when the current model's own row is activated", () => {
    const onChange = vi.fn<(next: ProviderModelSelection) => void>();
    render(
      <ProviderModelMenu
        providers={[familyProvider()]}
        currentAgentKind="agent"
        currentModel="solo"
        onChange={onChange}
      />,
    );
    const listbox = openMenu();
    fireEvent.click(findRow(listbox, "model:agent:solo"));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      agentKind: "agent",
      model: "solo",
      selectionIntent: "exact",
    });
  });

  it("emits an exact re-pick from the current member's exact favorite row", () => {
    useSharedSettings.setState({
      favoriteModels: [{ agentKind: "agent", modelId: "pair-alpha-y", presentationMode: "gui" }],
    });
    const onChange = vi.fn<(next: ProviderModelSelection) => void>();
    render(
      <ProviderModelMenu
        providers={[familyProvider()]}
        currentAgentKind="agent"
        currentModel="pair-alpha-y"
        presentationMode="gui"
        onChange={onChange}
      />,
    );
    const listbox = openMenu();
    fireEvent.click(findRow(listbox, "model-exact:agent:pair-alpha-y"));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      agentKind: "agent",
      model: "pair-alpha-y",
      selectionIntent: "exact",
    });
  });

  it("emits a family re-pick from the current family row", () => {
    const onChange = vi.fn<(next: ProviderModelSelection) => void>();
    render(
      <ProviderModelMenu
        providers={[familyProvider()]}
        currentAgentKind="agent"
        currentModel="pair-alpha-y"
        onChange={onChange}
      />,
    );
    const listbox = openMenu();
    fireEvent.click(findRow(listbox, "model:agent:pair-alpha-x"));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      agentKind: "agent",
      model: "pair-alpha-x",
      selectionIntent: "family",
    });
  });

  it("emits an exact re-pick from a recent row of the current model", () => {
    useSharedSettings.setState({
      recentModels: [{ agentKind: "agent", modelId: "solo", presentationMode: "gui" }],
    });
    const onChange = vi.fn<(next: ProviderModelSelection) => void>();
    render(
      <ProviderModelMenu
        providers={[
          familyProvider(),
          {
            kind: "codex",
            label: "Codex",
            capabilities: {
              models: [
                { id: "model-1", label: "Model 1" },
                { id: "model-2", label: "Model 2" },
              ],
              efforts: [],
              modelEfforts: {},
              modes: ["agent"],
              approvalPolicies: [],
              sandboxModes: [],
              supportsResume: true,
              supportsDirectInput: true,
              liveInputMode: "terminal",
              presentationMode: "terminal",
              settingDefs: [],
            },
          },
        ]}
        currentAgentKind="agent"
        currentModel="solo"
        presentationMode="gui"
        onChange={onChange}
      />,
    );
    const listbox = openMenu();
    fireEvent.click(findRow(listbox, "recent:agent:solo"));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      agentKind: "agent",
      model: "solo",
      presentationMode: "gui",
      selectionIntent: "exact",
    });
  });
});

describe("ProviderModelMenu rendered menu-to-owner selection events", () => {
  beforeEach(() => {
    useSharedSettings.setState({
      favoriteModels: [],
      recentModels: [],
      hiddenModels: {},
      providerConfigs: {},
      providerModelPreferences: {},
    });
  });

  function renderMenuToBuilder(thread: Thread) {
    const onConfigChange = vi.fn<(config: Thread["config"]) => void>();
    const onPreferenceChange = vi.fn<(model: string, preference: unknown) => void>();
    const control = buildControls(
      thread,
      guiAgent(),
      undefined,
      onConfigChange,
      {},
      onPreferenceChange,
    ).find((candidate) => candidate.kind === "provider-model");
    if (!control || control.kind !== "provider-model") throw new Error("Expected picker control");
    render(
      <ProviderModelMenu
        providers={control.providers}
        currentAgentKind={control.currentAgentKind}
        currentModel={control.currentModel}
        {...(control.lockedAgentKind ? { lockedAgentKind: control.lockedAgentKind } : {})}
        {...(control.presentationMode ? { presentationMode: control.presentationMode } : {})}
        onChange={control.onChange}
      />,
    );
    return { onConfigChange, onPreferenceChange };
  }

  it("drops the record as a binding-only persist on a same-UID exact favorite pick", () => {
    useSharedSettings.setState({
      favoriteModels: [{ agentKind: "agent", modelId: "pair-alpha-y", presentationMode: "gui" }],
    });
    const { onConfigChange } = renderMenuToBuilder(
      bindingThread({
        model: "pair-alpha-y",
        effort: "",
        fast: false,
        selectionBinding: {
          version: 1,
          kind: "family-member",
          owner: { agentKind: "agent", presentationMode: "gui" },
          model: "pair-alpha-y",
          inertValues: { effort: "", fast: false },
        },
      }),
    );
    const listbox = openMenu();
    fireEvent.click(findRow(listbox, "model-exact:agent:pair-alpha-y"));
    expect(onConfigChange).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ model: "pair-alpha-y", effort: "", fast: false }),
    );
    expect(onConfigChange.mock.calls[0]?.[0]?.selectionBinding).toBeUndefined();
  });

  it("cleans a stale record on a same-UID family row re-pick", () => {
    const { onConfigChange } = renderMenuToBuilder(
      bindingThread({
        model: "pair-alpha-y",
        effort: "",
        fast: false,
        selectionBinding: {
          version: 1,
          kind: "family-member",
          owner: { agentKind: "agent", presentationMode: "terminal" },
          model: "pair-alpha-y",
          inertValues: { effort: "", fast: false },
        },
      }),
    );
    const listbox = openMenu();
    fireEvent.click(findRow(listbox, "model:agent:pair-alpha-x"));
    expect(onConfigChange).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ model: "pair-alpha-y", effort: "", fast: false }),
    );
    expect(onConfigChange.mock.calls[0]?.[0]?.selectionBinding).toBeUndefined();
  });

  it("persists nothing for an unstamped unchanged family row re-pick", () => {
    const { onConfigChange, onPreferenceChange } = renderMenuToBuilder(
      bindingThread({ model: "pair-alpha-y", effort: "", fast: false }),
    );
    const listbox = openMenu();
    fireEvent.click(findRow(listbox, "model:agent:pair-alpha-x"));
    expect(onConfigChange).not.toHaveBeenCalled();
    expect(onPreferenceChange).not.toHaveBeenCalled();
  });
});
