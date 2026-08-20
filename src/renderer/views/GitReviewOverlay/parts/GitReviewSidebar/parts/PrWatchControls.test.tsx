// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { toast } from "@heroui/react";
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

const settings = vi.hoisted(() => ({
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
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: (selector: (state: { projects: Project[] }) => unknown) =>
    selector({ projects: [project] }),
}));

vi.mock("@/renderer/state/agentStatusesStore", () => {
  let state: { agentStatuses: AgentStatus[]; wslAgentStatuses: AgentStatus[] } | undefined;
  const getState = () =>
    (state ??= {
      agentStatuses: [agent],
      wslAgentStatuses: [],
    });
  const useAgentStatusesStore = Object.assign(
    (selector: (state: ReturnType<typeof getState>) => unknown) => selector(getState()),
    { getState },
  );
  return { useAgentStatusesStore };
});

vi.mock("@/renderer/state/sharedSettingsStore", () => {
  const getState = () => settings;
  const useSharedSettings = Object.assign(
    (selector: (state: ReturnType<typeof getState>) => unknown) => selector(getState()),
    { getState },
  );
  return { useSharedSettings };
});

import { PrWatchControls } from "./PrWatchControls";

const toastDanger = vi.spyOn(toast, "danger").mockImplementation(() => undefined as never);

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
      blockedReason: null,
    }));
    bridge.deletePrWatch.mockResolvedValue(undefined);
  });

  it("shows a newly created PR's automation immediately while reconciling it", () => {
    bridge.getPrWatch.mockReturnValue(new Promise(() => undefined));
    const onInitialWatchUsed = vi.fn<() => void>();
    const initialWatch: PrWatch = {
      projectId: project.id,
      prNumber: 42,
      headBranch: "feature/pr-watch",
      watchEnabled: true,
      autoMerge: true,
      agentKind: "codex",
      config: { model: "gpt-5.7", effort: "high" },
      lastCommentCursor: null,
      lastReviewCommentCursor: null,
      lastReviewCursor: null,
      lastCheckKey: null,
      activeThreadId: null,
      lastError: null,
      blockedReason: null,
    };

    render(
      <PrWatchControls
        projectId={project.id}
        prNumber={42}
        headBranch="feature/pr-watch"
        initialWatch={initialWatch}
        onInitialWatchUsed={onInitialWatchUsed}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "PR automation: Auto Merge" }));
    const slider = screen.getByRole("slider", { name: "PR automation" });
    expect(slider).toHaveValue("2");
    expect(slider).not.toBeDisabled();
    expect(onInitialWatchUsed).toHaveBeenCalledOnce();
  });

  it("indicates the selected automation mode on the trigger icon and label", async () => {
    bridge.getPrWatch.mockResolvedValue({
      projectId: project.id,
      prNumber: 42,
      headBranch: "feature/pr-watch",
      watchEnabled: true,
      autoMerge: false,
      agentKind: "codex",
      config: { model: "gpt-5.7", effort: "high" },
      lastCommentCursor: null,
      lastReviewCommentCursor: null,
      lastReviewCursor: null,
      lastCheckKey: null,
      activeThreadId: null,
      lastError: null,
      blockedReason: null,
    });

    const { container } = render(
      <PrWatchControls projectId={project.id} prNumber={42} headBranch="feature/pr-watch" />,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "PR automation: Auto Fix" })).toBeInTheDocument(),
    );
    expect(container.querySelector("svg.lucide-wrench")).not.toBeNull();
    expect(container.querySelector("svg.lucide-git-merge")).toBeNull();
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

    expect(screen.queryByRole("slider", { name: "PR automation" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "PR automation" }));
    const slider = screen.getByRole("slider", { name: "PR automation" });
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    fireEvent.keyUp(slider, { key: "ArrowRight" });

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

  it("watches and fixes blockers before auto-merging", async () => {
    render(<PrWatchControls projectId={project.id} prNumber={42} headBranch="feature/pr-watch" />);
    await waitFor(() => expect(bridge.getPrWatch).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("button", { name: "PR automation" }));
    const slider = screen.getByRole("slider", { name: "PR automation" });
    fireEvent.keyDown(slider, { key: "End" });
    fireEvent.keyUp(slider, { key: "End" });

    await waitFor(() =>
      expect(bridge.upsertPrWatch).toHaveBeenCalledWith({
        projectId: project.id,
        prNumber: 42,
        headBranch: "feature/pr-watch",
        watchEnabled: true,
        autoMerge: true,
        agentKind: "codex",
        config: { model: "gpt-5.7", effort: "high" },
      }),
    );
  });

  it("shows the remote connection error when an automation action fails", async () => {
    bridge.upsertPrWatch.mockRejectedValue(
      new Error("Can't reach the remote server. Check that it is online, then reconnect it."),
    );
    render(<PrWatchControls projectId={project.id} prNumber={42} headBranch="feature/pr-watch" />);
    await waitFor(() => expect(bridge.getPrWatch).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("button", { name: "PR automation" }));
    const slider = screen.getByRole("slider", { name: "PR automation" });
    fireEvent.keyDown(slider, { key: "End" });
    fireEvent.keyUp(slider, { key: "End" });

    await waitFor(() =>
      expect(toastDanger).toHaveBeenCalledWith(
        "Can't reach the remote server. Check that it is online, then reconnect it.",
      ),
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
      blockedReason: null,
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
    // Reading the watch must not rewrite it. The helper agent is kept current by
    // the app-scoped sync, so a stale model here is not this popover's to repair —
    // when it was, a watch only caught up while its PR row was on screen.
    expect(bridge.upsertPrWatch).not.toHaveBeenCalled();
  });

  it("explains why automation is holding off instead of looking watched", async () => {
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
      activeThreadId: null,
      lastError: null,
      blockedReason: "worktree-unavailable",
    });

    render(<PrWatchControls projectId={project.id} prNumber={42} headBranch="feature/pr-watch" />);
    await waitFor(() => expect(bridge.getPrWatch).toHaveBeenCalledOnce());
    const trigger = screen.getByRole("button", { name: "PR automation paused: Auto Fix" });
    expect(trigger).toHaveClass("text-warning");
    fireEvent.click(trigger);

    expect(await screen.findByRole("status")).toHaveTextContent(
      /this PR's branch could not be checked out/,
    );
  });

  it("describes an unavailable configured helper without assuming it is disconnected", async () => {
    bridge.getPrWatch.mockResolvedValue({
      projectId: project.id,
      prNumber: 42,
      headBranch: "feature/pr-watch",
      watchEnabled: true,
      autoMerge: false,
      agentKind: "codex",
      config: { model: "custom-model", effort: "high" },
      lastCommentCursor: null,
      lastReviewCommentCursor: null,
      lastReviewCursor: null,
      lastCheckKey: null,
      activeThreadId: null,
      lastError: null,
      blockedReason: "agent-unavailable",
    });

    render(<PrWatchControls projectId={project.id} prNumber={42} headBranch="feature/pr-watch" />);
    const trigger = await screen.findByRole("button", {
      name: "PR automation paused: Auto Fix",
    });
    fireEvent.click(trigger);

    expect(await screen.findByRole("status")).toHaveTextContent(
      /configured helper agent is unavailable/,
    );
  });

  it("shows a fresh launch error instead of a stale block", async () => {
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
      activeThreadId: null,
      lastError: "supervisor rejected the launch",
      blockedReason: "agent-unavailable",
    });

    render(<PrWatchControls projectId={project.id} prNumber={42} headBranch="feature/pr-watch" />);
    await waitFor(() => expect(bridge.getPrWatch).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "PR automation: Auto Fix" }));

    expect(await screen.findByText("supervisor rejected the launch")).toBeInTheDocument();
    expect(screen.queryByText(/configured helper agent is unavailable/)).not.toBeInTheDocument();
  });

  it("falls back to the watch's stored agent when resolution is transiently empty", async () => {
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
      activeThreadId: null,
      lastError: null,
      blockedReason: null,
    });
    // A provider that resolves to nothing (agent detection gap / logged out).
    settings.conflictResolverProvider = "grok";

    render(<PrWatchControls projectId={project.id} prNumber={42} headBranch="feature/pr-watch" />);
    await waitFor(() => expect(bridge.getPrWatch).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("button", { name: "PR automation: Auto Fix" }));
    const slider = screen.getByRole("slider", { name: "PR automation" });
    fireEvent.keyDown(slider, { key: "End" });
    fireEvent.keyUp(slider, { key: "End" });

    // The toggle must not dead-end; the stored agent carries the change and the
    // app-scoped sync repoints it once resolution recovers.
    await waitFor(() =>
      expect(bridge.upsertPrWatch).toHaveBeenCalledWith(
        expect.objectContaining({
          autoMerge: true,
          agentKind: "codex",
          config: { model: "gpt-5.6", effort: "high" },
        }),
      ),
    );
    settings.conflictResolverProvider = "codex";
  });

  it("re-resolves the current helper agent when the mode changes", async () => {
    bridge.getPrWatch.mockResolvedValue({
      projectId: project.id,
      prNumber: 42,
      headBranch: "feature/pr-watch",
      watchEnabled: true,
      autoMerge: false,
      // A watch still carrying the agent it was created with.
      agentKind: "codex",
      config: { model: "gpt-5.6", effort: "high" },
      lastCommentCursor: null,
      lastReviewCommentCursor: null,
      lastReviewCursor: null,
      lastCheckKey: null,
      activeThreadId: null,
      lastError: null,
      blockedReason: null,
    });

    render(<PrWatchControls projectId={project.id} prNumber={42} headBranch="feature/pr-watch" />);
    await waitFor(() => expect(bridge.getPrWatch).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("button", { name: "PR automation: Auto Fix" }));
    const slider = screen.getByRole("slider", { name: "PR automation" });
    fireEvent.keyDown(slider, { key: "End" });
    fireEvent.keyUp(slider, { key: "End" });

    await waitFor(() =>
      expect(bridge.upsertPrWatch).toHaveBeenCalledWith(
        expect.objectContaining({
          autoMerge: true,
          agentKind: "codex",
          // The settings model, not the model stored on the watch.
          config: { model: "gpt-5.7", effort: "high" },
        }),
      ),
    );
  });
});
