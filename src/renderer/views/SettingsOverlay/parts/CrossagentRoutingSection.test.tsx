import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type { AgentStatus } from "@/shared/contracts";
import type { CrossagentRoutingState } from "@/shared/crossagentRanking";
import { CrossagentRoutingSection } from "./CrossagentRoutingSection";

const mocks = vi.hoisted(() => ({
  getCrossagentRouting: vi.fn<() => Promise<CrossagentRoutingState>>(),
  removeCrossagentRoutingOverride:
    vi.fn<
      (payload: {
        tags: string[];
      }) => Promise<ReturnType<typeof useSharedSettings.getState>["crossagentRoutingOverrides"]>
    >(),
  removeCrossagentMemoryEntry: vi.fn<(payload: { entry: unknown }) => Promise<unknown[]>>(),
  updateCrossagentMemoryEntryTags:
    vi.fn<(payload: { entry: unknown; tags: string[] }) => Promise<unknown[]>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    appVersion: "desktop",
    getCrossagentRouting: mocks.getCrossagentRouting,
    removeCrossagentRoutingOverride: mocks.removeCrossagentRoutingOverride,
    removeCrossagentMemoryEntry: mocks.removeCrossagentMemoryEntry,
    updateCrossagentMemoryEntryTags: mocks.updateCrossagentMemoryEntryTags,
  }),
  isRemoteSession: () => false,
}));

function makeStatus(kind: string, label: string, model: string): AgentStatus {
  return {
    kind,
    label,
    installed: true,
    authState: "authenticated",
    capabilities: {
      models: [{ id: model, label: model.toUpperCase() }],
      efforts: ["high", "max"],
      defaultEffort: "high",
      modelEfforts: {},
      modes: ["agent"],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "terminal",
      presentationMode: "terminal",
      presentationModes: ["terminal", "gui"],
      settingDefs: [],
    },
  } as AgentStatus;
}

describe("CrossagentRoutingSection", () => {
  beforeEach(() => {
    mocks.removeCrossagentRoutingOverride.mockResolvedValue([]);
    mocks.getCrossagentRouting.mockImplementation(async () => {
      const { disabledAgents, crossagentPausedProviders, crossagentHiddenModels } =
        useSharedSettings.getState();
      const kimiRanked =
        !disabledAgents.includes("kimi") &&
        !crossagentPausedProviders.includes("kimi") &&
        !(crossagentHiddenModels.kimi ?? []).includes("k3");
      const claudeEntry = (rank: number): CrossagentRoutingState["ranked"][number] => ({
        provider: "claude",
        label: "Claude Code",
        execution: "structured",
        rank,
        source: "favorite",
        usageCount: 0,
        model: { id: "sonnet", label: "SONNET" },
        reasoning: "high",
        fast: false,
        learnedTags: [{ tag: "frontend", count: 3 }],
      });
      return {
        ranked: kimiRanked
          ? [
              {
                provider: "kimi",
                label: "Kimi Code",
                execution: "one-shot",
                rank: 1,
                source: "crossagent-usage",
                usageCount: 4,
                model: { id: "k3", label: "K3" },
                reasoning: "max",
                fast: false,
                learnedTags: [
                  { tag: "mobile", count: 4 },
                  { tag: "simulator", count: 4 },
                ],
              },
              claudeEntry(2),
            ]
          : [claudeEntry(1)],
        providers: [
          ...(disabledAgents.includes("kimi")
            ? []
            : [
                {
                  kind: "kimi",
                  label: "Kimi Code",
                  execution: "one-shot" as const,
                  paused: crossagentPausedProviders.includes("kimi"),
                },
              ]),
          {
            kind: "claude",
            label: "Claude Code",
            execution: "structured" as const,
            paused: false,
          },
        ],
      };
    });
    useAgentStatusesStore.setState({
      agentStatuses: [
        makeStatus("claude", "Claude Code", "sonnet"),
        makeStatus("kimi", "Kimi Code", "k3"),
      ],
    });
    useSharedSettings.setState({
      crossagentRoutingGuide: "",
      disabledAgents: [],
      hiddenModels: {},
      crossagentPausedProviders: [],
      crossagentHiddenModels: {},
      favoriteModels: [{ agentKind: "claude", modelId: "sonnet", presentationMode: "gui" }],
      agentSelectionUsage: [],
      crossagentSelectionUsage: [
        {
          agentKind: "kimi",
          modelId: "k3",
          effort: "max",
          fast: false,
          count: 4,
          lastUsedAt: 10,
        },
      ],
      crossagentRoutingOverrides: [
        {
          tags: ["frontend", "design"],
          agentKind: "claude",
          modelId: "sonnet",
          effort: "high",
          fast: true,
          updatedAt: 11,
        },
      ],
    });
  });

  it("shows the supervisor's active learned order and refreshes it when availability changes", async () => {
    render(<CrossagentRoutingSection />);

    expect(await screen.findByText("Kimi Code · K3")).toBeInTheDocument();
    expect(screen.getByText("Crossagents usage")).toBeInTheDocument();
    expect(screen.getByText("4 uses")).toBeInTheDocument();
    expect(screen.getByText("#mobile (4) · #simulator (4)")).toBeInTheDocument();
    expect(screen.getByText("#frontend + #design")).toBeInTheDocument();
    expect(screen.getByText("claude · sonnet · High · Fast")).toBeInTheDocument();
    expect(screen.getAllByText("#1")).toHaveLength(1);

    act(() => useSharedSettings.setState({ disabledAgents: ["kimi"] }));

    await waitFor(() => expect(screen.queryByText("Kimi Code · K3")).not.toBeInTheDocument());
    expect(screen.getByText("Claude Code · SONNET")).toBeInTheDocument();
    expect(screen.getByText("Favorite")).toBeInTheDocument();
    expect(screen.getAllByText("#1")).toHaveLength(1);
  });

  it("shows unavailable pinned routes and removes them from Settings", async () => {
    useSharedSettings.setState({
      crossagentRoutingOverrides: [
        {
          tags: ["review"],
          agentKind: "removed-provider",
          modelId: "gone",
          updatedAt: 20,
        },
      ],
    });
    render(<CrossagentRoutingSection />);

    expect(await screen.findByText("#review")).toBeInTheDocument();
    expect(screen.getByText("removed-provider · gone · Unavailable provider")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove pinned route for #review" }));

    await waitFor(() =>
      expect(mocks.removeCrossagentRoutingOverride).toHaveBeenCalledWith({ tags: ["review"] }),
    );
    expect(useSharedSettings.getState().crossagentRoutingOverrides).toEqual([]);
  });

  it("pauses a provider by unchecking it in the global filter and resumes it", async () => {
    render(<CrossagentRoutingSection />);

    fireEvent.click(await screen.findByRole("button", { name: "Crossagents auto-selection" }));
    fireEvent.click(await screen.findByRole("option", { name: /Kimi Code/ }));
    expect(useSharedSettings.getState().crossagentPausedProviders).toEqual(["kimi"]);

    // Paused providers drop out of the ranked list but stay in the checklist,
    // and the closed-state note calls them out.
    await waitFor(() =>
      expect(screen.getByText("Skipped by Crossagents: Kimi Code")).toBeInTheDocument(),
    );
    await waitFor(() => expect(screen.queryByText("Crossagents usage")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("option", { name: /Kimi Code/ }));
    expect(useSharedSettings.getState().crossagentPausedProviders).toEqual([]);
  });

  it("filters Crossagent models from the global filter without touching global visibility", async () => {
    render(<CrossagentRoutingSection />);

    fireEvent.click(await screen.findByRole("button", { name: "Crossagents auto-selection" }));
    fireEvent.click(await screen.findByRole("option", { name: /k3/i }));

    expect(useSharedSettings.getState().crossagentHiddenModels).toEqual({ kimi: ["k3"] });
    expect(useSharedSettings.getState().hiddenModels).toEqual({});
  });

  it("treats Hide all and Show all as inverses across providers and models", async () => {
    render(<CrossagentRoutingSection />);

    fireEvent.click(await screen.findByRole("button", { name: "Crossagents auto-selection" }));
    fireEvent.click(await screen.findByRole("button", { name: "Hide all" }));

    // Nothing is usable afterwards: every model hidden and every provider unchecked.
    expect(useSharedSettings.getState().crossagentHiddenModels).toEqual({
      claude: ["sonnet"],
      kimi: ["k3"],
    });
    expect(useSharedSettings.getState().crossagentPausedProviders.toSorted()).toEqual([
      "claude",
      "kimi",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Show all" }));

    expect(useSharedSettings.getState().crossagentHiddenModels).toEqual({ claude: [], kimi: [] });
    expect(useSharedSettings.getState().crossagentPausedProviders).toEqual([]);
    expect(useSharedSettings.getState().hiddenModels).toEqual({});
  });

  it("shows a fully filtered provider as unchecked rather than partially checked", async () => {
    useSharedSettings.setState({ crossagentHiddenModels: { kimi: ["k3"] } });
    render(<CrossagentRoutingSection />);

    fireEvent.click(await screen.findByRole("button", { name: "Crossagents auto-selection" }));

    const [kimiHeader] = await screen.findAllByRole("option", { name: /Kimi Code/ });
    expect(kimiHeader).toHaveAccessibleName(/Unchecked/);
    const [claudeHeader] = screen.getAllByRole("option", { name: /Claude Code/ });
    expect(claudeHeader).toHaveAccessibleName(/Checked/);
    expect(
      screen.getByText(
        "Unchecked providers and models are excluded from automatic Crossagents routing, but remain available for manual agent threads.",
      ),
    ).toBeInTheDocument();
  });

  it("edits tags and removes learned memory entries", async () => {
    useSharedSettings.setState({
      crossagentSelectionUsage: [
        {
          agentKind: "kimi",
          modelId: "k3",
          effort: "max",
          fast: false,
          count: 4,
          lastUsedAt: 10,
          tags: ["mobile", "simulator"],
          explicitFields: { provider: false, model: true, effort: true, fast: false },
        },
      ],
    });
    mocks.updateCrossagentMemoryEntryTags.mockImplementation(async ({ tags }) => [
      {
        agentKind: "kimi",
        modelId: "k3",
        effort: "max",
        fast: false,
        count: 4,
        lastUsedAt: 10,
        tags,
        explicitFields: { provider: false, model: true, effort: true, fast: false },
      },
    ]);
    mocks.removeCrossagentMemoryEntry.mockResolvedValue([]);
    render(<CrossagentRoutingSection />);

    expect(await screen.findByText("Learned selections")).toBeInTheDocument();
    expect(screen.getByText("#mobile · #simulator")).toBeInTheDocument();
    expect(screen.getByText("#mobile · #simulator").closest("div.max-h-80")).toHaveClass(
      "overflow-y-auto",
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit tags for Kimi Code" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove tag mobile" }));
    await waitFor(() =>
      expect(mocks.updateCrossagentMemoryEntryTags).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: ["simulator"],
          entry: expect.objectContaining({
            explicitFields: { provider: false, model: true, effort: true, fast: false },
          }),
        }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove memory entry for Kimi Code" }));
    await waitFor(() => expect(mocks.removeCrossagentMemoryEntry).toHaveBeenCalled());
    expect(useSharedSettings.getState().crossagentSelectionUsage).toEqual([]);
  });
});
