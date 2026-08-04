import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";

const mocks = vi.hoisted(() => {
  const bridge = {
    gitAddWorktree:
      vi.fn<(input: unknown) => Promise<{ path: string; changesTransferred?: boolean }>>(),
  };
  const appState = {
    updateProjectDraftConfig: vi.fn<(projectId: string, config: unknown) => void>(),
    view: { kind: "home" as const },
    threads: [] as Thread[],
    createThread: vi.fn<(input: unknown) => Thread>(),
    queueThreadLaunch: vi.fn<(threadId: string, prompt: string, segments?: unknown[]) => void>(),
  };
  const remoteState = {
    servers: [] as Array<{
      desktopId: string;
      hostMode?: "desktop" | "helper";
      transport?: { kind: "direct" } | { kind: "ssh" };
    }>,
    runtime: {} as Record<string, { status: string }>,
    launchRemoteThread: vi.fn<(input: unknown) => Promise<void>>(),
  };
  return {
    bridge,
    appState,
    remoteState,
    primeWorktreeGitState: vi.fn<(project: Project, path: string) => Promise<void>>(),
    runWorktreeSetupScript:
      vi.fn<(project: Project, path: string, script: string) => Promise<void>>(),
    refreshGitProject: vi.fn<(project: unknown, reason: string, scope: string) => Promise<void>>(),
    generateTitleAsync: vi.fn<(...args: unknown[]) => void>(),
  };
});

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => mocks.bridge,
}));

vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: {
    getState: () => mocks.appState,
  },
}));

vi.mock("@/renderer/state/remoteServersStore", () => ({
  useRemoteServersStore: {
    getState: () => mocks.remoteState,
  },
}));

vi.mock("@/renderer/state/agentStatusesStore", () => ({
  useAgentStatusesStore: {
    getState: () => ({ agentStatuses: [], wslAgentStatuses: [] }),
  },
}));

vi.mock("@/renderer/state/experimentStore", () => ({
  findExperimentByGroupId: () => undefined,
}));

vi.mock("@/renderer/state/gitRefresh", () => ({
  refreshGitProject: mocks.refreshGitProject,
}));

vi.mock("@/renderer/state/fileCheckpointActions", () => ({
  captureFileCheckpoint: vi.fn<(input: unknown) => Promise<void>>(),
}));

vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: {
    getState: () => ({
      pushRecentModel: vi.fn<(...args: unknown[]) => void>(),
    }),
  },
}));

vi.mock("@/renderer/analytics/posthog", () => ({
  captureThreadPromptSubmitted: vi.fn<(...args: unknown[]) => void>(),
  captureThreadStarted: vi.fn<(...args: unknown[]) => void>(),
}));

vi.mock("@/renderer/utils/titleGen", () => ({
  generateTitleAsync: mocks.generateTitleAsync,
}));

vi.mock("./worktreePlacement", () => ({
  worktreePlacementPayload: () => ({ worktreeRoot: "C:\\shared-worktrees" }),
}));

vi.mock("./worktreeLaunchActions", () => ({
  primeWorktreeGitState: mocks.primeWorktreeGitState,
  runWorktreeSetupScript: mocks.runWorktreeSetupScript,
}));

import { startThreadFromDraft } from "./threadLaunchActions";

const localProject: Project = {
  id: "local-project",
  name: "Local",
  location: { kind: "windows", path: "C:\\repo" },
  scripts: { actions: [], setupScript: "pnpm install" },
  createdAt: "2026-01-01T00:00:00.000Z",
};

const remoteProject: Project = {
  ...localProject,
  id: "remote:d1:p1",
  name: "Remote",
  location: {
    kind: "posix",
    path: "/srv/repo",
    remoteServerId: "d1",
  },
  remoteServerId: "d1",
  remoteId: "p1",
};

describe("startThreadFromDraft host transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.appState.view = { kind: "home" };
    mocks.appState.threads = [];
    mocks.appState.createThread.mockReturnValue({
      id: "local-thread",
      projectId: localProject.id,
    } as Thread);
    mocks.bridge.gitAddWorktree.mockResolvedValue({
      path: "C:\\shared-worktrees\\feature",
      changesTransferred: true,
    });
    mocks.remoteState.servers = [];
    mocks.remoteState.runtime = { d1: { status: "online" } };
    mocks.remoteState.launchRemoteThread.mockResolvedValue(undefined);
    mocks.primeWorktreeGitState.mockResolvedValue(undefined);
    mocks.runWorktreeSetupScript.mockResolvedValue(undefined);
  });

  it("uses the shared transport flow for a local worktree launch", async () => {
    await startThreadFromDraft(localProject, {
      agentKind: "codex",
      config: { model: "gpt-5.6" },
      prompt: "build it",
      worktreeBranch: "feature",
      worktreeIsNewBranch: true,
    });

    expect(mocks.bridge.gitAddWorktree).toHaveBeenCalledWith(
      expect.objectContaining({
        projectLocation: localProject.location,
        branch: "feature",
        createBranch: true,
        worktreeRoot: "C:\\shared-worktrees",
      }),
    );
    expect(mocks.appState.createThread).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: localProject.id,
        worktreePath: "C:\\shared-worktrees\\feature",
      }),
    );
    expect(mocks.primeWorktreeGitState).toHaveBeenCalledWith(
      localProject,
      "C:\\shared-worktrees\\feature",
    );
    expect(mocks.runWorktreeSetupScript).toHaveBeenCalledWith(
      localProject,
      "C:\\shared-worktrees\\feature",
      "pnpm install",
    );
  });

  it("launches a helper thread through the same flow and runs setup from the client", async () => {
    mocks.remoteState.servers = [{ desktopId: "d1", hostMode: "helper" }];
    mocks.bridge.gitAddWorktree.mockResolvedValue({
      path: "/srv/worktrees/feature",
      changesTransferred: true,
    });

    await startThreadFromDraft(remoteProject, {
      agentKind: "codex",
      config: { model: "gpt-5.6" },
      prompt: "build it",
      worktreeBranch: "feature",
      worktreeIsNewBranch: true,
    });

    expect(mocks.bridge.gitAddWorktree).toHaveBeenCalledWith(
      expect.objectContaining({
        projectLocation: remoteProject.location,
        branch: "feature",
        createBranch: true,
      }),
    );
    expect(mocks.bridge.gitAddWorktree).not.toHaveBeenCalledWith(
      expect.objectContaining({ worktreeRoot: expect.anything() }),
    );
    expect(mocks.remoteState.launchRemoteThread).toHaveBeenCalledWith({
      desktopId: "d1",
      projectId: "p1",
      agentKind: "codex",
      config: { model: "gpt-5.6" },
      prompt: "build it",
      presentationMode: "terminal",
      worktreePath: "/srv/worktrees/feature",
      worktreeBranch: "feature",
      isNewWorktree: true,
    });
    expect(mocks.runWorktreeSetupScript).toHaveBeenCalledWith(
      remoteProject,
      "/srv/worktrees/feature",
      "pnpm install",
    );
  });

  it("refuses to launch on a remote project whose server is offline", async () => {
    mocks.remoteState.servers = [{ desktopId: "d1", hostMode: "helper" }];
    mocks.remoteState.runtime = { d1: { status: "offline" } };

    await startThreadFromDraft(remoteProject, {
      agentKind: "codex",
      config: { model: "gpt-5.6" },
      prompt: "build it",
      worktreeBranch: "feature",
      worktreeIsNewBranch: true,
    });

    // Bails before creating a worktree we would have to unwind.
    expect(mocks.bridge.gitAddWorktree).not.toHaveBeenCalled();
    expect(mocks.remoteState.launchRemoteThread).not.toHaveBeenCalled();
  });

  it("does not duplicate setup owned by a desktop remote host", async () => {
    mocks.remoteState.servers = [{ desktopId: "d1", hostMode: "desktop" }];
    mocks.bridge.gitAddWorktree.mockResolvedValue({
      path: "/srv/worktrees/feature",
      changesTransferred: true,
    });

    await startThreadFromDraft(remoteProject, {
      agentKind: "codex",
      config: { model: "" },
      prompt: "build it",
      worktreeBranch: "feature",
    });

    expect(mocks.remoteState.launchRemoteThread).toHaveBeenCalledOnce();
    expect(mocks.runWorktreeSetupScript).not.toHaveBeenCalled();
  });
});
