// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, PrWatch, Project } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const project: Project = {
  id: "project-1",
  name: "Poracode",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-07-25T00:00:00.000Z",
};

const agent: AgentStatus = {
  kind: "codex",
  label: "Codex",
  installed: true,
  authState: "authenticated",
  capabilities: {
    models: [
      { id: "gpt-5.6", label: "GPT-5.6" },
      { id: "gpt-5.7", label: "GPT-5.7" },
    ],
    efforts: ["high"],
    modelEfforts: { "gpt-5.6": ["high"] },
    defaultEffort: "high",
    modes: [],
    approvalPolicies: [],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "terminal",
    presentationMode: "gui",
    settingDefs: [],
  },
};

const bridge = vi.hoisted(() => ({
  getPrWatch: vi.fn<() => Promise<PrWatch | null>>(),
  upsertPrWatch: vi.fn<(input: unknown) => Promise<PrWatch>>(),
  deletePrWatch: vi.fn<() => Promise<void>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

vi.mock("@/renderer/components/common", () => ({
  ToggleSwitch: (props: {
    "aria-label": string;
    isSelected: boolean;
    isDisabled?: boolean;
    onChange: (selected: boolean) => void;
  }) => (
    <button
      type="button"
      role="switch"
      aria-label={props["aria-label"]}
      aria-checked={props.isSelected}
      disabled={props.isDisabled}
      onClick={() => props.onChange(!props.isSelected)}
    />
  ),
}));

vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: (selector: (state: { projects: Project[] }) => unknown) =>
    selector({ projects: [project] }),
}));

vi.mock("@/renderer/state/agentStatusesStore", () => {
  const getState = () => ({ agentStatuses: [agent], wslAgentStatuses: [] });
  const useAgentStatusesStore = Object.assign(
    (selector: (state: ReturnType<typeof getState>) => unknown) => selector(getState()),
    { getState },
  );
  return { useAgentStatusesStore };
});

vi.mock("@/renderer/state/sharedSettingsStore", () => {
  const getState = () => ({
    conflictResolverProvider: "codex",
    conflictResolverModel: "gpt-5.7",
    conflictResolverEffort: "high",
    conflictResolverFast: false,
    conflictResolverPresentationMode: "gui" as const,
    wslConflictResolverProvider: "auto",
    wslConflictResolverModel: "",
    wslConflictResolverEffort: "",
    wslConflictResolverFast: false,
    wslConflictResolverPresentationMode: "gui" as const,
  });
  const useSharedSettings = Object.assign(
    (selector: (state: ReturnType<typeof getState>) => unknown) => selector(getState()),
    { getState },
  );
  return { useSharedSettings };
});

import { PrWatchControls } from "./PrWatchControls";

describe("PrWatchControls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.getPrWatch.mockResolvedValue(null);
    bridge.upsertPrWatch.mockImplementation(async (input) => ({
      ...(input as Omit<
        PrWatch,
        | "lastCommentCursor"
        | "lastReviewCommentCursor"
        | "lastReviewCursor"
        | "lastCheckKey"
        | "activeThreadId"
        | "lastError"
      >),
      lastCommentCursor: null,
      lastReviewCommentCursor: null,
      lastReviewCursor: null,
      lastCheckKey: null,
      activeThreadId: null,
      lastError: null,
    }));
    bridge.deletePrWatch.mockResolvedValue(undefined);
  });

  it("enables watching with the AI Helpers conflict resolver model", async () => {
    render(
      <PrWatchControls
        projectId={project.id}
        prNumber={42}
        headBranch="feature/pr-watch"
        worktreePath="/repo-worktree"
      />,
    );
    await waitFor(() => expect(bridge.getPrWatch).toHaveBeenCalledOnce());

    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "PR automation" }));
    fireEvent.click(screen.getByRole("switch", { name: "Watch PR" }));

    await waitFor(() =>
      expect(bridge.upsertPrWatch).toHaveBeenCalledWith({
        projectId: project.id,
        prNumber: 42,
        headBranch: "feature/pr-watch",
        worktreePath: "/repo-worktree",
        watchEnabled: true,
        autoMerge: false,
        agentKind: "codex",
        config: { model: "gpt-5.7", effort: "high" },
      }),
    );
  });

  it("can enable auto-merge without launching an agent", async () => {
    render(<PrWatchControls projectId={project.id} prNumber={42} headBranch="feature/pr-watch" />);
    await waitFor(() => expect(bridge.getPrWatch).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("button", { name: "PR automation" }));
    fireEvent.click(screen.getByRole("switch", { name: "Auto-merge" }));

    await waitFor(() =>
      expect(bridge.upsertPrWatch).toHaveBeenCalledWith({
        projectId: project.id,
        prNumber: 42,
        headBranch: "feature/pr-watch",
        watchEnabled: false,
        autoMerge: true,
      }),
    );
  });

  it("refreshes the visible PR while Poracode is watching it", async () => {
    bridge.getPrWatch.mockResolvedValue({
      projectId: project.id,
      prNumber: 42,
      headBranch: "feature/pr-watch",
      watchEnabled: true,
      autoMerge: false,
      agentKind: "codex",
      config: { model: "gpt-5.6", effort: "high" },
      lastCommentCursor: null,
      lastReviewCommentCursor: null,
      lastReviewCursor: null,
      lastCheckKey: null,
      activeThreadId: "thread-1",
      lastError: null,
    });
    const onRefreshPr = vi.fn<() => Promise<void>>(async () => undefined);

    render(
      <PrWatchControls
        projectId={project.id}
        prNumber={42}
        headBranch="feature/pr-watch"
        onRefreshPr={onRefreshPr}
      />,
    );

    await waitFor(() => expect(onRefreshPr).toHaveBeenCalledOnce());
    expect(bridge.upsertPrWatch).toHaveBeenCalledWith({
      projectId: project.id,
      prNumber: 42,
      headBranch: "feature/pr-watch",
      watchEnabled: true,
      autoMerge: false,
      agentKind: "codex",
      config: { model: "gpt-5.7", effort: "high" },
    });
  });
});
