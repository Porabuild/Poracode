import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

const helperOptions = vi.hoisted(() => {
  const capabilities = {
    models: [
      { id: "codex-model", label: "Codex Model" },
      { id: "claude-model", label: "Claude Model" },
      { id: "gemini-model", label: "Gemini Model" },
      { id: "qwen-model", label: "Qwen Model" },
    ],
    efforts: ["low", "high"],
    modelEfforts: {
      "codex-model": ["low", "high"],
      "claude-model": ["low", "high"],
      "gemini-model": ["low", "high"],
      "qwen-model": ["low", "high"],
    },
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
  const providers = [
    { kind: "codex", label: "Codex", capabilities },
    { kind: "claude", label: "Claude", capabilities },
    { kind: "gemini", label: "Gemini", capabilities },
    { kind: "qwen", label: "Qwen", capabilities },
  ];
  return {
    providers,
    ranked: [],
    modelLabelOf: (selection: { model: string }) => selection.model,
    selectionFor: (agentKind: string, model: string) => ({
      agentKind,
      model,
      effort: "low",
    }),
    defaultSelectionFor: () => ({
      agentKind: "claude",
      model: "claude-model",
      effort: "low",
    }),
  };
});

vi.mock("@/renderer/components/crew/crewHelperOptions", () => ({
  useCrewHelperOptions: () => helperOptions,
}));

import { CrewsSettings } from "./CrewsSettings";

const capabilities = {
  models: [{ id: "codex-model", label: "Codex Model" }],
  efforts: ["low", "high"],
  modelEfforts: { "codex-model": ["low", "high"] },
  modes: ["agent" as const],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "server" as const,
  presentationMode: "gui" as const,
  presentationModes: ["gui" as const],
  mcpScope: { gui: "launch" as const, terminal: "none" as const },
  settingDefs: [],
};

const leadStatus: AgentStatus = {
  kind: "codex",
  label: "Codex",
  installed: true,
  authState: "authenticated",
  capabilities,
};

describe("CrewsSettings", () => {
  beforeEach(() => {
    useSharedSettings.setState({
      crews: [],
      providerConfigs: {},
      hiddenModels: {},
      disabledAgents: [],
      crossagentPausedProviders: [],
      crossagentHiddenModels: {},
    });
    useAgentStatusesStore.setState({ agentStatuses: [leadStatus], wslAgentStatuses: [] });
  });

  it("creates valid template crews, duplicates with a new id, and deletes after confirmation", async () => {
    renderWithI18n(<CrewsSettings />);
    fireEvent.click(document.querySelector('button[aria-label="New crew"]')!);
    fireEvent.click(await screen.findByRole("option", { name: /^Review board/u }));
    await waitFor(() => expect(useSharedSettings.getState().crews).toHaveLength(1));
    const original = useSharedSettings.getState().crews[0]!;
    expect(original).toMatchObject({
      name: "Review board",
      lead: { agentKind: "codex", model: "codex-model" },
      roles: [{ id: "reviewer", label: "Reviewer", parallel: 2 }],
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Crew name" }), {
      target: { value: "Board v2" },
    });
    await waitFor(() => expect(useSharedSettings.getState().crews[0]?.name).toBe("Board v2"));
    fireEvent.click(screen.getByRole("tab", { name: "Crew first" }));
    await waitFor(() => expect(useSharedSettings.getState().crews[0]?.policy).toBe("crew-first"));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Duplicate Board v2" }));
    await waitFor(() => expect(useSharedSettings.getState().crews).toHaveLength(2));
    const duplicate = useSharedSettings.getState().crews.find((crew) => crew.id !== original.id)!;
    expect(duplicate.name).toBe("Board v2 copy");
    expect(duplicate.id).not.toBe(original.id);

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Delete Board v2 copy" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(useSharedSettings.getState().crews.some((crew) => crew.id === duplicate.id)).toBe(
        false,
      ),
    );
  });

  it("creates Ship crew with a Scout, Builder and read-only Reviewer", async () => {
    renderWithI18n(<CrewsSettings />);
    fireEvent.click(document.querySelector('button[aria-label="New crew"]')!);
    fireEvent.click(await screen.findByRole("option", { name: /^Ship crew/u }));
    await waitFor(() => expect(useSharedSettings.getState().crews).toHaveLength(1));
    expect(useSharedSettings.getState().crews[0]).toMatchObject({
      name: "Ship crew",
      roles: [
        { id: "scout", label: "Scout", noEdits: true },
        { id: "builder", label: "Builder" },
        { id: "reviewer", label: "Reviewer", noEdits: true },
      ],
    });
  });

  it("persists edited roles and caps fallbacks at three", async () => {
    renderWithI18n(<CrewsSettings />);
    fireEvent.click(document.querySelector('button[aria-label="New crew"]')!);
    fireEvent.click(await screen.findByRole("option", { name: /^Blank crew/u }));
    await waitFor(() => expect(useSharedSettings.getState().crews).toHaveLength(1));
    const saved = useSharedSettings.getState().crews[0]!;
    fireEvent.click(screen.getByRole("button", { name: "Role details" }));
    await screen.findByText("If this agent is unavailable, try:");
    const addFallback = screen.getByRole("button", { name: "Add fallback" });
    fireEvent.click(addFallback);
    fireEvent.click(screen.getByRole("button", { name: "Add fallback" }));
    fireEvent.click(screen.getByRole("button", { name: "Add fallback" }));
    await waitFor(() =>
      expect(useSharedSettings.getState().crews[0]?.roles[0]?.fallbacks).toHaveLength(3),
    );
    expect(screen.queryByRole("button", { name: "Add fallback" })).not.toBeInTheDocument();
    expect(useSharedSettings.getState().crews[0]?.roles[0]?.id).toBe(saved.roles[0]?.id);
  });
});
