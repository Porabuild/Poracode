import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type { AgentStatus } from "@/shared/contracts";
import type { CrossagentRoutingSnapshotEntry } from "@/shared/crossagentRanking";
import { CrossagentRoutingSection } from "./CrossagentRoutingSection";

const mocks = vi.hoisted(() => ({
  getCrossagentRouting: vi.fn<() => Promise<CrossagentRoutingSnapshotEntry[]>>(),
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
    mocks.getCrossagentRouting.mockImplementation(async () =>
      useSharedSettings.getState().disabledAgents.includes("kimi") ||
      useSharedSettings.getState().crossagentPausedProviders.includes("kimi")
        ? [
            {
              provider: "claude",
              label: "Claude Code",
              execution: "structured",
              rank: 1,
              source: "favorite",
              usageCount: 0,
              model: { id: "sonnet", label: "SONNET" },
              reasoning: "high",
              fast: false,
              learnedTags: [{ tag: "frontend", count: 3 }],
            },
          ]
        : [
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
            {
              provider: "claude",
              label: "Claude Code",
              execution: "structured",
              rank: 2,
              source: "favorite",
              usageCount: 0,
              model: { id: "sonnet", label: "SONNET" },
              reasoning: "high",
              fast: false,
              learnedTags: [{ tag: "frontend", count: 3 }],
            },
          ],
    );
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

    expect(await screen.findByText("Kimi Code")).toBeInTheDocument();
    expect(screen.getByText("Crossagents usage")).toBeInTheDocument();
    expect(screen.getByText("4 uses")).toBeInTheDocument();
    expect(screen.getByText("#mobile (4) · #simulator (4)")).toBeInTheDocument();
    expect(screen.getByText("#frontend + #design")).toBeInTheDocument();
    expect(screen.getByText("claude · sonnet · High · Fast")).toBeInTheDocument();
    expect(screen.getAllByText("#1")).toHaveLength(1);

    act(() => useSharedSettings.setState({ disabledAgents: ["kimi"] }));

    await waitFor(() => expect(screen.queryByText("Kimi Code")).not.toBeInTheDocument());
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
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

  it("pauses a provider from the rotation and resumes it", async () => {
    render(<CrossagentRoutingSection />);

    fireEvent.click(await screen.findByRole("button", { name: "Pause Kimi Code" }));
    expect(useSharedSettings.getState().crossagentPausedProviders).toEqual(["kimi"]);

    await waitFor(() => expect(screen.getByText("Paused providers")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Resume Kimi Code" }));
    expect(useSharedSettings.getState().crossagentPausedProviders).toEqual([]);
  });

  it("filters Crossagent models per provider without touching global visibility", async () => {
    render(<CrossagentRoutingSection />);

    fireEvent.click(await screen.findByRole("button", { name: "Crossagent models for Kimi Code" }));
    fireEvent.click(await screen.findByRole("option", { name: /k3/i }));

    expect(useSharedSettings.getState().crossagentHiddenModels).toEqual({ kimi: ["k3"] });
    expect(useSharedSettings.getState().hiddenModels).toEqual({});
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
      },
    ]);
    mocks.removeCrossagentMemoryEntry.mockResolvedValue([]);
    render(<CrossagentRoutingSection />);

    expect(await screen.findByText("Learned routing memory")).toBeInTheDocument();
    expect(screen.getByText("#mobile · #simulator")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit tags for Kimi Code" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove tag mobile" }));
    await waitFor(() =>
      expect(mocks.updateCrossagentMemoryEntryTags).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ["simulator"] }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove memory entry for Kimi Code" }));
    await waitFor(() => expect(mocks.removeCrossagentMemoryEntry).toHaveBeenCalled());
    expect(useSharedSettings.getState().crossagentSelectionUsage).toEqual([]);
  });
});
