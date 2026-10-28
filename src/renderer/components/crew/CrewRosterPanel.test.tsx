import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AgentCapability } from "@/shared/contracts";
import { usePanelStore } from "@/renderer/state/panelStore";
import type { CrewHelperOptions } from "./crewHelperOptions";
import type { CrewRosterModel } from "./crewComposerModel";
import type { CrewMemberSelection, CrewRole, SavedCrew, ThreadCrewBinding } from "@/shared/crew";
import { CrewRosterMenu } from "./CrewRosterMenu";
import { CrewRosterPanel } from "./CrewRosterPanel";
import { renderWithI18n } from "@/renderer/testUtils/i18n";

const selection: CrewMemberSelection = {
  agentKind: "codex",
  model: "gpt-5.5",
  effort: "high",
  fast: false,
};
const role: CrewRole = {
  id: "scout",
  label: "Scout",
  brief: "Explores code and docs",
  noEdits: true,
  selection: { ...selection, agentKind: "claude", model: "opus-5.5", effort: "low" },
};
const savedCrew: SavedCrew = {
  id: "crew-review",
  name: "Review board",
  lead: selection,
  roles: [role],
  policy: "crew-only",
  updatedAt: 1,
};
const capability: AgentCapability = {
  models: [
    { id: "gpt-5.5", label: "GPT-5.5" },
    { id: "opus-5.5", label: "Opus 5.5" },
  ],
  efforts: ["low", "high"],
  modelEfforts: { "gpt-5.5": ["low", "high"], "opus-5.5": ["low", "high"] },
  fastModels: ["gpt-5.5", "opus-5.5"],
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
const helperOptions: CrewHelperOptions = {
  providers: [
    { kind: "codex", label: "Codex", capabilities: capability },
    { kind: "claude", label: "Claude", capabilities: capability },
  ],
  ranked: [],
  modelLabelOf: (member) => member.model,
  selectionFor: (agentKind, model) => ({ agentKind, model, effort: "low" }),
  defaultSelectionFor: () => ({ agentKind: "claude", model: "opus-5.5", effort: "low" }),
};

function makeModel(overrides: Partial<CrewRosterModel> = {}): CrewRosterModel {
  const binding: ThreadCrewBinding = {
    version: 1,
    crewId: savedCrew.id,
    name: savedCrew.name,
    policy: savedCrew.policy,
    roles: [role],
  };
  return {
    binding,
    lead: selection,
    savedCrew,
    helperOptions,
    roleTemplates: [
      {
        id: "builder",
        label: "Builder",
        brief: "Implements changes and runs tests",
        tone: "builder",
      },
      {
        id: "reviewer",
        label: "Reviewer",
        brief: "Reviews diffs and finds bugs",
        tone: "reviewer",
      },
      {
        id: "scout",
        label: "Scout",
        brief: "Explores code and docs",
        noEdits: true,
        tone: "scout",
      },
      { id: "helper", label: "Helper", tone: "custom" },
    ],
    leadProviders: helperOptions.providers,
    defaultHelper: { agentKind: "claude", model: "opus-5.5", effort: "low" },
    summary: "GPT-5.5 + 1",
    isDraft: true,
    isDisabled: false,
    onBindingChange: vi.fn<(next: ThreadCrewBinding) => void>(),
    onLeadChange: vi.fn<(next: CrewMemberSelection) => void>(),
    onSaveToCrew: vi.fn<(crew: SavedCrew, next: ThreadCrewBinding) => void>(),
    onSaveAsNewCrew: vi.fn<(crew: SavedCrew, next: ThreadCrewBinding) => void>(),
    ...overrides,
  };
}

describe("CrewRosterPanel", () => {
  it("toggles policy, shows the no-edits image label, and keeps the changed-dot gutter", async () => {
    const model = makeModel({
      lead: { ...selection, model: "other-model" },
      onBindingChange: vi.fn<(next: ThreadCrewBinding) => void>(),
    });
    renderWithI18n(<CrewRosterPanel model={model} compact={false} />);

    const policy = screen.getByRole("button", {
      name: "Crew only: work goes only to this crew",
    });
    fireEvent.click(policy);
    expect(model.onBindingChange).toHaveBeenCalledWith(
      expect.objectContaining({ policy: "crew-first" }),
    );
    expect(
      screen.getByRole("img", { name: "Told not to edit files. Not enforced." }),
    ).toBeInTheDocument();
    expect(screen.getAllByLabelText("Changed for this thread").length).toBeGreaterThan(0);
  });

  it("adds the first unused template when a helper selection is available", async () => {
    const base = makeModel();
    const model = makeModel({
      binding: {
        ...base.binding,
        roles: [role],
      },
      defaultHelper: { agentKind: "claude", model: "opus-5.5", effort: "low" },
      onBindingChange: vi.fn<(next: ThreadCrewBinding) => void>(),
    });
    renderWithI18n(<CrewRosterPanel model={model} compact={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Add role" }));
    await waitFor(() => {
      expect(model.onBindingChange).toHaveBeenCalledWith(
        expect.objectContaining({
          roles: expect.arrayContaining([
            expect.objectContaining({ id: "scout" }),
            expect.objectContaining({ id: "builder" }),
          ]),
        }),
      );
    });
  });

  it("keeps Lead Fast on the toolbar state and requests handoff on active threads", () => {
    const onLeadChange = vi.fn<(next: CrewMemberSelection) => void>();
    const onHandOff = vi.fn<() => void>();
    const model = makeModel({ isDraft: false, onLeadChange, onHandOff });
    renderWithI18n(<CrewRosterPanel model={model} compact={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Fast for Lead" }));
    expect(onLeadChange).toHaveBeenCalledWith({ ...selection, fast: true });
    fireEvent.click(screen.getByRole("button", { name: "Hand off to another lead…" }));
    expect(onHandOff).toHaveBeenCalledOnce();
  });

  it("opens the Crews settings section at the selected crew", () => {
    const model = makeModel();
    renderWithI18n(<CrewRosterPanel model={model} compact={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit crews in settings" }));
    expect(usePanelStore.getState().settingsSection).toBe("crews");
    expect(usePanelStore.getState().settingsAnchor).toBe("crews.crew-review");
  });

  it("uses installed GUI model labels even when the provider is not a helper option", () => {
    const options: CrewHelperOptions = {
      ...helperOptions,
      providers: helperOptions.providers.slice(0, 1),
      modelLabelOf: (member) => (member.model === "opus-5.5" ? "Opus 5.5" : member.model),
    };
    renderWithI18n(
      <CrewRosterPanel model={makeModel({ helperOptions: options })} compact={false} />,
    );
    expect(screen.getAllByText("Opus 5.5").length).toBeGreaterThan(0);
  });

  it("changes only the model from the quick label picker, keeping a still-valid effort", async () => {
    const onLeadChange = vi.fn<(next: CrewMemberSelection) => void>();
    const model = makeModel({
      onLeadChange,
      // One provider keeps the "Opus 5.5" row unique in the menu.
      leadProviders: helperOptions.providers.slice(0, 1),
    });
    renderWithI18n(<CrewRosterPanel model={model} compact={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Model for Lead" }));
    const listbox = await screen.findByRole("listbox", { name: "Models" });
    const option = within(listbox).getByText("Opus 5.5").closest('[role="option"]')!;
    fireEvent.click(option);
    await waitFor(() =>
      expect(onLeadChange).toHaveBeenCalledWith({
        agentKind: "codex",
        model: "opus-5.5",
        effort: "high",
      }),
    );
  });

  it("changes only the effort from the quick reasoning label", async () => {
    const onBindingChange = vi.fn<(next: ThreadCrewBinding) => void>();
    const model = makeModel({ onBindingChange });
    renderWithI18n(<CrewRosterPanel model={model} compact={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Reasoning for Scout" }));
    const option = await screen.findByRole("option", { name: "High" });
    fireEvent.click(option);
    await waitFor(() =>
      expect(onBindingChange).toHaveBeenCalledWith(
        expect.objectContaining({
          roles: [
            expect.objectContaining({
              selection: expect.objectContaining({
                agentKind: "claude",
                model: "opus-5.5",
                effort: "high",
              }),
            }),
          ],
        }),
      ),
    );
  });

  it("expands role details for helpers only and edits role fields", async () => {
    const secondRole: CrewRole = {
      id: "builder",
      label: "Builder",
      selection: { agentKind: "codex", model: "gpt-5.5", effort: "low" },
    };
    const onBindingChange = vi.fn<(next: ThreadCrewBinding) => void>();
    const base = makeModel();
    const model = makeModel({
      binding: { ...base.binding, roles: [role, secondRole] },
      onBindingChange,
    });
    renderWithI18n(<CrewRosterPanel model={model} compact={false} />);

    // The lead has no details button — helpers only (one per role row).
    expect(screen.getAllByRole("button", { name: "Role details" })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Role details" })[0]!);
    fireEvent.change(screen.getByRole("textbox", { name: "Role name" }), {
      target: { value: "Watcher" },
    });
    expect(onBindingChange).toHaveBeenCalledWith(
      expect.objectContaining({
        roles: [
          expect.objectContaining({ id: "scout", label: "Watcher" }),
          expect.objectContaining({ id: "builder" }),
        ],
      }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "When to use" }), {
      target: { value: "Only on Fridays" },
    });
    expect(onBindingChange).toHaveBeenCalledWith(
      expect.objectContaining({
        roles: [
          expect.objectContaining({ brief: "Only on Fridays" }),
          expect.objectContaining({ id: "builder" }),
        ],
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove role" }));
    expect(onBindingChange).toHaveBeenCalledWith(
      expect.objectContaining({ roles: [expect.objectContaining({ id: "builder" })] }),
    );
  });
  it("closes the roster before opening the settings section", () => {
    const onClose = vi.fn<() => void>();
    const openSettingsSection = vi.fn<(section: string, target?: string) => void>();
    usePanelStore.setState({ openSettingsSection });
    renderWithI18n(<CrewRosterPanel model={makeModel()} compact={false} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit crews in settings" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(openSettingsSection).toHaveBeenCalledWith("crews", expect.anything());
  });
  it("closes the open roster when Settings opens from elsewhere", async () => {
    usePanelStore.setState({ settingsOpen: false });
    renderWithI18n(<CrewRosterMenu model={makeModel()} />);
    fireEvent.click(screen.getByRole("button", { name: "Crew members" }));
    expect(await screen.findByRole("button", { name: "Model for Lead" })).toBeTruthy();
    act(() => usePanelStore.setState({ settingsOpen: true }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Model for Lead" })).toBeNull(),
    );
  });
});

describe("CrewRosterPanel templates", () => {
  it("starts an unsaved crew from a template, keeping the lead", async () => {
    const { savedCrew: _saved, ...model } = makeModel({
      onBindingChange: vi.fn<(next: ThreadCrewBinding) => void>(),
    });
    renderWithI18n(<CrewRosterPanel model={model} compact={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Start from a template" }));
    fireEvent.click(await screen.findByRole("option", { name: /^Review board/u }));
    await waitFor(() =>
      expect(model.onBindingChange).toHaveBeenCalledWith(
        expect.objectContaining({
          policy: "crew-only",
          roles: [expect.objectContaining({ id: "reviewer", parallel: 2 })],
        }),
      ),
    );
    expect(model.onLeadChange).not.toHaveBeenCalled();
  });
});
