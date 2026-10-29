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
    renderWithI18n(<CrewRosterPanel model={model} />);

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
    renderWithI18n(<CrewRosterPanel model={model} />);
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
    renderWithI18n(<CrewRosterPanel model={model} />);
    fireEvent.click(screen.getByRole("button", { name: "Fast for Lead" }));
    expect(onLeadChange).toHaveBeenCalledWith({ ...selection, fast: true });
    fireEvent.click(screen.getByRole("button", { name: "Hand off to another lead…" }));
    expect(onHandOff).toHaveBeenCalledOnce();
  });

  it("renders and dispatches the authoritative lead Fast descriptor", () => {
    const descriptorOnChange = vi.fn<(value: boolean) => void>();
    const onLeadChange = vi.fn<(next: CrewMemberSelection) => void>();
    const model = makeModel({
      isDraft: false,
      onLeadChange,
      leadFastControl: {
        kind: "toggle",
        label: "Fast",
        // Encoded family Fast can be on while the saved carrier stays inert.
        isSelected: true,
        onChange: descriptorOnChange,
      },
    });
    renderWithI18n(<CrewRosterPanel model={model} />);

    const fast = screen.getByRole("button", { name: "Fast for Lead" });
    expect(fast).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(fast);
    expect(descriptorOnChange).toHaveBeenCalledWith(false);
    expect(onLeadChange).not.toHaveBeenCalled();
  });

  it("keeps an unavailable lead Fast descriptor inert", () => {
    const descriptorOnChange = vi.fn<(value: boolean) => void>();
    const model = makeModel({
      leadFastControl: {
        kind: "toggle",
        label: "Fast",
        isSelected: false,
        disabledReason: "Fast is unavailable for this pairing",
        onChange: descriptorOnChange,
      },
    });
    renderWithI18n(<CrewRosterPanel model={model} />);

    const fast = screen.getByRole("button", { name: "Fast for Lead" });
    expect(fast).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(fast);
    expect(descriptorOnChange).not.toHaveBeenCalled();
  });

  it("updates the helper binding from per-member Fast", () => {
    const onBindingChange = vi.fn<(next: ThreadCrewBinding) => void>();
    const model = makeModel({ onBindingChange });
    renderWithI18n(<CrewRosterPanel model={model} />);
    fireEvent.click(screen.getByRole("button", { name: "Fast for Scout" }));
    expect(onBindingChange).toHaveBeenCalledWith(
      expect.objectContaining({
        roles: [
          expect.objectContaining({
            id: "scout",
            selection: expect.objectContaining({
              agentKind: "claude",
              model: "opus-5.5",
              effort: "low",
              fast: true,
            }),
          }),
        ],
      }),
    );
  });

  it("updates the lead selection from Lead Fast", () => {
    const onLeadChange = vi.fn<(next: CrewMemberSelection) => void>();
    const model = makeModel({ onLeadChange });
    renderWithI18n(<CrewRosterPanel model={model} />);
    fireEvent.click(screen.getByRole("button", { name: "Fast for Lead" }));
    expect(onLeadChange).toHaveBeenCalledWith({ ...selection, fast: true });
  });

  it("opens the Crews settings section at the selected crew", () => {
    const model = makeModel();
    renderWithI18n(<CrewRosterPanel model={model} />);
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
    renderWithI18n(<CrewRosterPanel model={makeModel({ helperOptions: options })} />);
    expect(screen.getAllByText("Opus 5.5").length).toBeGreaterThan(0);
  });

  it("changes only the model from the quick label picker, keeping a still-valid effort", async () => {
    const onLeadChange = vi.fn<(next: CrewMemberSelection) => void>();
    const model = makeModel({
      onLeadChange,
      // One provider keeps the "Opus 5.5" row unique in the menu.
      leadProviders: helperOptions.providers.slice(0, 1),
    });
    renderWithI18n(<CrewRosterPanel model={model} />);
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
    renderWithI18n(<CrewRosterPanel model={model} />);
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
    renderWithI18n(<CrewRosterPanel model={model} />);

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
    renderWithI18n(<CrewRosterPanel model={makeModel()} onClose={onClose} />);
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

describe("CrewRosterPanel subprovider metadata", () => {
  it("shows explicit model subprovider metadata beside the lead's model", () => {
    const subCapability: AgentCapability = {
      ...capability,
      modelSubProvider: { "gpt-5.5": "opencode-go" },
      subProviders: [{ id: "opencode-go", label: "OpenCode Go" }],
    };
    const model = makeModel({
      leadProviders: helperOptions.providers.map((provider) =>
        provider.kind === "codex" ? { ...provider, capabilities: subCapability } : provider,
      ),
    });
    renderWithI18n(<CrewRosterPanel model={model} />);

    const subProvider = screen.getByText("OpenCode Go");
    expect(subProvider).toHaveAttribute("title", "OpenCode Go");
    const modelLine = subProvider.parentElement!;
    expect(within(modelLine).getByRole("button", { name: "Model for Lead" })).toBeInTheDocument();
    expect(within(modelLine).queryByText("High")).toBeNull();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.queryByText("·")).toBeNull();
  });

  it("shows explicit model subprovider metadata beside a helper's model", () => {
    const subCapability: AgentCapability = {
      ...capability,
      modelSubProvider: { "opus-5.5": "opencode-go" },
      subProviders: [{ id: "opencode-go", label: "OpenCode Go" }],
    };
    const providers = helperOptions.providers.map((provider) =>
      provider.kind === "claude" ? { ...provider, capabilities: subCapability } : provider,
    );
    const model = makeModel({
      helperOptions: { ...helperOptions, providers },
      leadProviders: providers,
    });
    renderWithI18n(<CrewRosterPanel model={model} />);

    const subProvider = screen.getByText("OpenCode Go");
    const modelLine = subProvider.parentElement!;
    expect(within(modelLine).getByRole("button", { name: "Model for Scout" })).toBeInTheDocument();
    expect(within(modelLine).queryByText("Low")).toBeNull();
    expect(screen.getByText("Low")).toBeInTheDocument();
  });

  it("derives the subprovider from a namespace when no mapping exists", () => {
    const modelId = "acme/model-x";
    const subCapability: AgentCapability = {
      ...capability,
      models: [...capability.models, { id: modelId, label: "Model X" }],
      modelEfforts: { ...capability.modelEfforts, [modelId]: ["low", "high"] },
      subProviders: [{ id: "acme", label: "Acme Labs" }],
    };
    const model = makeModel({
      lead: { ...selection, model: modelId },
      leadProviders: [{ kind: "codex", label: "Codex", capabilities: subCapability }],
    });
    renderWithI18n(<CrewRosterPanel model={model} />);

    const subProvider = screen.getByText("Acme Labs");
    const modelLine = subProvider.parentElement!;
    expect(within(modelLine).getByRole("button", { name: "Model for Lead" })).toBeInTheDocument();
    expect(within(modelLine).queryByText("High")).toBeNull();
    expect(screen.getByText("High")).toBeInTheDocument();
  });

  it("adds no subprovider label to a plain model", () => {
    renderWithI18n(<CrewRosterPanel model={makeModel()} />);

    expect(screen.queryByText("OpenCode Go")).toBeNull();
    expect(screen.queryByText("·")).toBeNull();
  });

  it("suppresses a subprovider that restates its parent provider", () => {
    const modelId = "codex/gpt-5.5";
    const subCapability: AgentCapability = {
      ...capability,
      models: [...capability.models, { id: modelId, label: "GPT-5.5" }],
      modelEfforts: { ...capability.modelEfforts, [modelId]: ["low", "high"] },
      subProviders: [{ id: "codex", label: "Codex" }],
    };
    const model = makeModel({
      lead: { ...selection, model: modelId },
      leadProviders: [{ kind: "codex", label: "Codex", capabilities: subCapability }],
    });
    renderWithI18n(<CrewRosterPanel model={model} />);

    expect(screen.queryByText("Codex")).toBeNull();
  });

  it("suppresses a subprovider that repeats the model name", () => {
    const modelId = "model-1";
    const subCapability: AgentCapability = {
      ...capability,
      models: [...capability.models, { id: modelId, label: "Model 1" }],
      modelEfforts: { ...capability.modelEfforts, [modelId]: ["low", "high"] },
      modelSubProvider: { [modelId]: "family" },
      subProviders: [{ id: "family", label: " model 1 " }],
    };
    const options: CrewHelperOptions = {
      ...helperOptions,
      modelLabelOf: (member) => (member.model === modelId ? "Model 1" : member.model),
    };
    const model = makeModel({
      lead: { ...selection, model: modelId },
      helperOptions: options,
      leadProviders: [{ kind: "codex", label: "Codex", capabilities: subCapability }],
    });
    renderWithI18n(<CrewRosterPanel model={model} />);

    expect(screen.getAllByText(/^model 1$/i)).toHaveLength(1);
  });

  it("suppresses a subprovider on a projected family member while a plain model keeps it", () => {
    const familyCapability: AgentCapability = {
      ...capability,
      models: [
        { id: "pair-a", label: "Pair A" },
        { id: "pair-b", label: "Pair B" },
        ...capability.models,
      ],
      modelEfforts: {
        "pair-a": ["low", "high"],
        "pair-b": ["low", "high"],
        ...capability.modelEfforts,
      },
      modelSubProvider: { "pair-b": "opencode-go", "gpt-5.5": "opencode-go" },
      subProviders: [{ id: "opencode-go", label: "OpenCode Go" }],
      modelFamilies: [
        {
          model: "pair-a",
          label: "Pair",
          bindings: { effort: "config", fast: "config" },
          selectors: [
            {
              id: "mode",
              labelKey: "modelSelection.lead",
              options: [
                { id: "a", label: "Alpha" },
                { id: "b", label: "Beta" },
              ],
            },
          ],
          members: [
            { model: "pair-a", selections: { mode: "a" } },
            { model: "pair-b", selections: { mode: "b" } },
          ],
        },
      ],
    };
    const providers = helperOptions.providers.map((provider) => ({
      ...provider,
      capabilities: familyCapability,
    }));
    const options: CrewHelperOptions = {
      ...helperOptions,
      providers,
      modelLabelOf: (member) =>
        member.model === "pair-b"
          ? "Pair B"
          : member.model === "gpt-5.5"
            ? "GPT-5.5"
            : member.model,
    };
    const plainHelper: CrewRole = {
      ...role,
      selection: { agentKind: "codex", model: "gpt-5.5", effort: "low" },
    };
    const base = makeModel();
    const model = makeModel({
      binding: { ...base.binding, roles: [plainHelper] },
      lead: { agentKind: "codex", model: "pair-b", effort: "low" },
      helperOptions: options,
      leadProviders: providers,
    });
    renderWithI18n(<CrewRosterPanel model={model} />);

    expect(
      within(screen.getByRole("button", { name: "Model for Lead" })).getByText("Pair B"),
    ).toBeInTheDocument();
    const subProvider = screen.getByText("OpenCode Go");
    expect(screen.getAllByText("OpenCode Go")).toHaveLength(1);
    expect(
      within(subProvider.parentElement!).getByRole("button", { name: "Model for Scout" }),
    ).toBeInTheDocument();
  });

  it("shows a subprovider without effort and no separator", () => {
    const modelId = "acme/model-x";
    const subCapability: AgentCapability = {
      ...capability,
      models: [...capability.models, { id: modelId, label: "Model X" }],
      efforts: [],
      modelEfforts: {},
      fastModels: [],
      modelSubProvider: { [modelId]: "acme" },
      subProviders: [{ id: "acme", label: "Acme Labs" }],
    };
    const model = makeModel({
      lead: { agentKind: "codex", model: modelId },
      leadProviders: [{ kind: "codex", label: "Codex", capabilities: subCapability }],
    });
    renderWithI18n(<CrewRosterPanel model={model} />);

    const subProvider = screen.getByText("Acme Labs");
    const modelLine = subProvider.parentElement!;
    expect(within(modelLine).getByRole("button", { name: "Model for Lead" })).toBeInTheDocument();
    expect(modelLine).not.toHaveTextContent("·");
    expect(screen.queryByRole("button", { name: "Reasoning for Lead" })).toBeNull();
  });
});

describe("CrewRosterPanel templates", () => {
  it("starts an unsaved crew from a template, keeping the lead", async () => {
    const { savedCrew: _saved, ...model } = makeModel({
      onBindingChange: vi.fn<(next: ThreadCrewBinding) => void>(),
    });
    renderWithI18n(<CrewRosterPanel model={model} />);
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
