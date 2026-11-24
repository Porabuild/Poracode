import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

const remote = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  hostSettingCalls: [] as Array<[string | undefined, string]>,
}));

vi.mock("@/renderer/state/pairedHostSettings", () => ({
  useHostSetting: (key: string | undefined, field: string) => {
    remote.hostSettingCalls.push([key, field]);
    return field === "hiddenModels" ? remote.settings.hiddenModels : [];
  },
  usePairedHostSettings: () => ({ generation: 0, settings: remote.settings }),
}));

vi.mock("@/renderer/components/crew/crewHelperOptions", () => ({
  useCrewHelperOptions: () => ({
    providers: [],
    ranked: [],
    modelLabelOf: (selection: { model: string }) => selection.model,
    selectionFor: (agentKind: string, model: string) => ({ agentKind, model, effort: "low" }),
    defaultSelectionFor: () => ({
      agentKind: "codex",
      model: "codex-visible",
      effort: "low",
    }),
  }),
}));

import { CrewsSettings } from "./CrewsSettings";

const capabilities: AgentStatus["capabilities"] = {
  models: [
    { id: "codex-visible", label: "Codex Visible" },
    { id: "codex-hidden", label: "Codex Hidden" },
  ],
  efforts: ["low"],
  modelEfforts: { "codex-visible": ["low"], "codex-hidden": ["low"] },
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

const status: AgentStatus = {
  kind: "codex",
  label: "Codex",
  installed: true,
  authState: "authenticated",
  capabilities,
};

describe("CrewsSettings remote visibility", () => {
  beforeEach(() => {
    remote.hostSettingCalls.length = 0;
    remote.settings = {
      hiddenModels: { codex: ["codex-hidden"] },
      crews: [
        {
          id: "crew-work",
          name: "Work",
          lead: { agentKind: "codex", model: "codex-visible", effort: "low" },
          roles: [
            {
              id: "sidekick",
              label: "Sidekick",
              selection: { agentKind: "codex", model: "codex-visible", effort: "low" },
            },
          ],
          policy: "crew-only",
          updatedAt: 1,
        },
      ],
      providerOrder: [],
      disabledAgents: [],
      crossagentPausedProviders: [],
      crossagentHiddenModels: {},
    };
    useRemoteServersStore.setState({
      runtime: {
        "desktop-1": {
          status: "online",
          agentStatuses: { windows: [status], wsl: [] },
        },
      },
    } as never);
    useAgentStatusesStore.setState({
      agentStatuses: [
        {
          ...status,
          capabilities: {
            ...capabilities,
            models: [{ id: "local-only", label: "Local Only" }],
          },
        },
      ],
      wslAgentStatuses: [],
    });
    useSharedSettings.setState({
      hiddenModels: { codex: ["codex-visible"] },
      providerOrder: [],
    });
  });

  it("uses the selected remote host's hidden models", async () => {
    renderWithI18n(<CrewsSettings machineKey="remote:desktop-1" />);
    expect(remote.hostSettingCalls).toContainEqual(["desktop-1", "hiddenModels"]);
    fireEvent.click(screen.getByRole("button", { name: "Edit Work" }));
    fireEvent.click(await screen.findByRole("button", { name: "Model for Lead" }));
    const listbox = await screen.findByRole("listbox", { name: "Models" });
    expect(within(listbox).queryByText("Codex Hidden")).toBeNull();
    expect(within(listbox).getByText("Codex Visible")).toBeInTheDocument();
    expect(within(listbox).queryByText("Local Only")).toBeNull();
  });
});
