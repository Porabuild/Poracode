import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentCapability, AgentStatus, ScheduledTask, Thread } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  ProviderModelMenu,
  type ProviderModelMenuProvider,
} from "../../common/ProviderModelMenu/ProviderModelMenu";
import { formatModelConfigLabel, resolveModelLabel } from "../modelDisplay";
import { buildControls } from "../../thread/buildModelPickerControls";
import { resolveProviderDraftConfig } from "../../thread/threadDraftViewHelpers";
import { taskScheduleDraft } from "@/renderer/views/SchedulesView/scheduleDraft";
import "./index";

vi.mock("@/renderer/adaptiveLayout", () => ({ useCompactLayout: () => false }));

const capabilities: AgentCapability = {
  models: [{ id: "grok-4.7", label: "Grok 4.7" }],
  efforts: ["low", "high"],
  modelEfforts: {},
  modes: ["agent"],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "server",
  presentationMode: "gui",
  settingDefs: [],
};
function agentWith(): AgentStatus {
  return {
    kind: "grok",
    label: "Grok Build",
    installed: true,
    authState: "authenticated",
    capabilities,
  } as AgentStatus;
}
function agentWithModels(models: AgentCapability["models"]): AgentStatus {
  return { ...agentWith(), capabilities: { ...capabilities, models } };
}
function makeNamedProvider(
  kind: string,
  label: string,
  _modelCount: number,
): ProviderModelMenuProvider {
  return { kind, label, capabilities: { ...capabilities } };
}
const baseTask: ScheduledTask = {
  id: "d2ac39e9-14ac-4776-9279-37a1e455a5db",
  name: "Daily brief",
  prompt: "Summarize my priorities.",
  agentKind: "grok",
  config: { model: "grok-4.7" },
  recurrence: { kind: "weekly", days: [1, 2, 3, 4, 5], time: "08:00" },
  enabled: true,
  nextRunAt: null,
  lastRunAt: null,
  lastCompletedAt: null,
  lastStatus: "never",
  lastResult: null,
  lastError: null,
  createdAt: "2026-07-10T12:00:00.000Z",
  updatedAt: "2026-07-10T12:00:00.000Z",
};
describe("Grok Fast mode renderer", () => {
  beforeEach(() => {
    useSharedSettings.setState({
      favoriteModels: [],
      recentModels: [],
      hiddenModels: {},
      providerConfigs: {},
      providerModelPreferences: {},
    });
  });
  it("preserves a saved Grok fast sibling until its catalog is known", () => {
    const draft = taskScheduleDraft({
      ...baseTask,
      agentKind: "grok",
      config: { model: "grok-4.7-build-fast", effort: "high" },
    });
    expect(draft.model).toBe("grok-4.7-build-fast");
    expect(draft.fast).toBe(true);
  });

  it("keeps Grok Fast off unless it was saved on or the fast sibling was selected", () => {
    const grok = {
      ...agentWith(),
      kind: "grok",
      label: "Grok Build",
      capabilities: {
        ...capabilities,
        models: [
          { id: "grok-4.7", label: "Grok 4.7" },
          { id: "grok-4.6", label: "Grok 4.6" },
        ],
        modelEfforts: { "grok-4.7": ["high"], "grok-4.6": ["high"] },
        fastModels: ["grok-4.7"],
      },
    } as AgentStatus;

    expect(resolveProviderDraftConfig(grok, { model: "grok-4.7" }).fast).toBe(false);
    expect(resolveProviderDraftConfig(grok, {}).fast).toBe(false);
    expect(resolveProviderDraftConfig(grok, { model: "grok-4.7", fast: true }).fast).toBe(true);
    expect(resolveProviderDraftConfig(grok, { model: "grok-4.7-build-fast" })).toMatchObject({
      model: "grok-4.7",
      fast: true,
    });
  });

  it("shows a saved Grok fast sibling as the standard model with Fast on", () => {
    const agent = {
      kind: "grok",
      label: "Grok Build",
      installed: true,
      authState: "authenticated",
      capabilities: {
        ...capabilities,
        models: [
          { id: "grok-4.7", label: "Grok 4.7" },
          { id: "grok-4.6", label: "Grok 4.6" },
        ],
        modelEfforts: { "grok-4.7": ["low", "high"], "grok-4.6": ["high"] },
        fastModels: ["grok-4.7"],
      },
    } as AgentStatus;
    const thread = {
      id: "thread-1",
      projectId: "project-1",
      title: "Thread",
      agentKind: "grok",
      config: { model: "grok-4.7-build-fast" },
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

    const controls = buildControls(thread, agent, undefined, vi.fn());
    const modelControl = controls.find((control) => control.kind === "provider-model");
    const fastToggle = controls.find(
      (control) => control.kind === "toggle" && control.label === "Fast",
    );

    expect(modelControl?.kind === "provider-model" ? modelControl.currentModel : undefined).toBe(
      "grok-4.7",
    );
    expect(fastToggle?.kind === "toggle" ? fastToggle.isSelected : undefined).toBe(true);
  });

  it("keeps Fast off when selecting Grok without a saved Fast preference", () => {
    const agent = {
      kind: "grok",
      label: "Grok Build",
      installed: true,
      authState: "authenticated",
      capabilities: {
        ...capabilities,
        models: [
          { id: "grok-4.7", label: "Grok 4.7" },
          { id: "grok-4.6", label: "Grok 4.6" },
        ],
        modelEfforts: { "grok-4.7": ["high"], "grok-4.6": ["high"] },
        fastModels: ["grok-4.7"],
      },
    } as AgentStatus;
    const thread = {
      id: "thread-1",
      projectId: "project-1",
      title: "Thread",
      agentKind: "grok",
      config: { model: "grok-4.6" },
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
    const onConfigChange = vi.fn<(config: Thread["config"]) => void>();
    const controls = buildControls(thread, agent, undefined, onConfigChange);
    controls
      .find((control) => control.kind === "provider-model")
      ?.onChange({ agentKind: "grok", model: "grok-4.7" });

    expect(onConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({ model: "grok-4.7", fast: false }),
    );
  });

  it("labels a Grok fast sibling as the standard model", () => {
    const agent = agentWithModels([{ id: "grok-4.7", label: "Grok 4.7" }]);
    expect(resolveModelLabel(agent, "grok-4.7-build-fast")).toBe("Grok 4.7");
    expect(formatModelConfigLabel(agent, { model: "grok-4.7-build-fast", effort: "high" })).toBe(
      "Grok 4.7 · High · Fast",
    );
  });

  it("labels a saved Grok fast sibling as the standard model with Fast off by default", async () => {
    const provider = makeNamedProvider("grok", "Grok Build", 0);
    provider.capabilities.models = [
      { id: "grok-4.7", label: "Grok 4.7" },
      { id: "grok-4.6", label: "Grok 4.6" },
    ];
    provider.capabilities.fastModels = ["grok-4.7"];

    render(
      <ProviderModelMenu
        providers={[provider]}
        currentAgentKind="grok"
        currentModel="grok-4.7-build-fast"
        onChange={vi.fn<(next: { agentKind: string; model: string }) => void>()}
      />,
    );

    expect(screen.getByRole("button", { name: "Select model" })).toHaveTextContent("Grok 4.7");
    fireEvent.click(screen.getByRole("button", { name: "Select model" }));

    const listbox = await screen.findByRole("listbox", { name: "Models" });
    expect(within(listbox).getByRole("option", { name: /Grok 4\.7/u })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      within(listbox).queryByRole("option", { name: /Grok 4\.7 Fast/u }),
    ).not.toBeInTheDocument();
    expect(within(listbox).getByRole("img", { name: "Supports Fast mode" })).toBeInTheDocument();
  });
});
