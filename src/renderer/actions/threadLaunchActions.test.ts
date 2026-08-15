import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import type { RemoteThreadLaunchResult } from "@/renderer/state/remoteServers/types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const mocks = vi.hoisted(() => {
  const appState = {
    updateProjectDraftConfig: vi.fn<(projectId: string, config: unknown) => void>(),
    view: { kind: "home" } as { kind: string; panes?: string[]; activeGroupId?: string },
    projects: [] as Project[],
    threads: [] as Thread[],
    provisioningWorktreeThreadIds: {} as Record<string, true>,
    createThread: vi.fn<(input: unknown) => Thread>(),
    queueThreadLaunch:
      vi.fn<
        (threadId: string, prompt: string, segments?: unknown[], userMessageItemId?: string) => void
      >(),
    setThreadWorktree:
      vi.fn<
        (
          threadId: string,
          worktreePath: string,
          worktreeBranch?: string,
          options?: { preserveProvisioning?: boolean },
        ) => void
      >(),
    applyRuntimeEvent: vi.fn<(threadId: string, event: unknown) => void>(),
    updateThreadRuntime: vi.fn<(threadId: string, input: unknown) => void>(),
    setThreadMcpLaunchCustomServerNames:
      vi.fn<(threadId: string, names: readonly string[]) => void>(),
  };
  const remoteClient = {
    startThread: vi.fn<(input: unknown) => Promise<{ threadId: string }>>(),
  };
  const remoteState = {
    servers: [] as Array<{
      desktopId: string;
      hostMode?: "desktop" | "helper";
      transport?: { kind: "direct" } | { kind: "ssh" };
    }>,
    runtime: {} as Record<string, { status: string }>,
    launchRemoteThread:
      vi.fn<
        (
          input: unknown,
          options?: { isPendingLaunchOwned?: () => boolean },
        ) => Promise<RemoteThreadLaunchResult>
      >(),
    withClient:
      vi.fn<
        (
          desktopId: string,
          invoke: (client: typeof remoteClient) => Promise<unknown>,
        ) => Promise<unknown>
      >(),
  };
  const bridge = {
    startThread: vi.fn<(input: unknown) => Promise<{ threadId: string }>>(),
  };
  return {
    appState,
    remoteState,
    remoteClient,
    bridge,
    createWorktree:
      vi.fn<
        (
          project: Project,
          input: unknown,
        ) => Promise<{ path: string; changesTransferred?: boolean }>
      >(),
    primeWorktreeGitState: vi.fn<(project: Project, path: string) => Promise<void>>(),
    runWorktreeSetupScript:
      vi.fn<(project: Project, path: string, script: string) => Promise<void>>(),
    performWorktreeRemoval:
      vi.fn<(project: Project, path: string, branch?: string) => Promise<boolean>>(),
    refreshGitProject: vi.fn<(project: unknown, reason: string, scope: string) => Promise<void>>(),
    generateTitleAsync: vi.fn<(...args: unknown[]) => void>(),
  };
});

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
      mcpServers: [],
      disabledBuiltInMcpServers: {},
      disabledBuiltInMcpTools: {},
    }),
  },
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => mocks.bridge,
}));

vi.mock("@/renderer/analytics/posthog", () => ({
  captureThreadPromptSubmitted: vi.fn<(...args: unknown[]) => void>(),
  captureThreadStarted: vi.fn<(...args: unknown[]) => void>(),
}));

vi.mock("@/renderer/utils/titleGen", () => ({
  generateTitleAsync: mocks.generateTitleAsync,
}));

vi.mock("./worktreeLaunchActions", () => ({
  createWorktree: mocks.createWorktree,
  primeWorktreeGitState: mocks.primeWorktreeGitState,
  runWorktreeSetupScript: mocks.runWorktreeSetupScript,
}));

vi.mock("./worktreeActions", () => ({
  performWorktreeRemoval: mocks.performWorktreeRemoval,
}));

import { performInitialThreadLaunch, startThreadFromDraft } from "./threadLaunchActions";

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
    mocks.appState.projects = [];
    mocks.appState.threads = [];
    mocks.appState.provisioningWorktreeThreadIds = {};
    mocks.appState.createThread.mockImplementation((input) => {
      const values = input as Partial<Thread> & {
        threadId?: string;
        worktreeProvisioning?: boolean;
      };
      const thread = {
        id: values.threadId ?? "local-thread",
        projectId: values.projectId ?? localProject.id,
        archived: false,
        config: values.config ?? {},
        ...(values.presentationMode ? { presentationMode: values.presentationMode } : {}),
        ...(values.remoteServerId ? { remoteServerId: values.remoteServerId } : {}),
        ...(values.remoteId ? { remoteId: values.remoteId } : {}),
      } as Thread;
      mocks.appState.threads = [thread];
      // The real createThread focuses the new thread's pane.
      mocks.appState.view = { kind: "thread", panes: [thread.id] };
      if (values.worktreeProvisioning) {
        mocks.appState.provisioningWorktreeThreadIds[thread.id] = true;
      }
      return thread;
    });
    mocks.createWorktree.mockResolvedValue({
      path: "C:\\shared-worktrees\\feature",
      changesTransferred: true,
    });
    mocks.remoteState.servers = [];
    mocks.remoteState.runtime = { d1: { status: "online" } };
    mocks.remoteState.launchRemoteThread.mockResolvedValue("started");
    mocks.remoteState.withClient.mockImplementation((desktopId, invoke) =>
      invoke(mocks.remoteClient),
    );
    mocks.remoteClient.startThread.mockResolvedValue({ threadId: "rt-1" });
    mocks.bridge.startThread.mockResolvedValue({ threadId: "local-thread" });
    mocks.primeWorktreeGitState.mockResolvedValue(undefined);
    mocks.runWorktreeSetupScript.mockResolvedValue(undefined);
    mocks.performWorktreeRemoval.mockResolvedValue(true);
  });

  it("opens a local thread before its new worktree finishes provisioning", async () => {
    let resolveWorktree!: (result: { path: string; changesTransferred?: boolean }) => void;
    mocks.createWorktree.mockReturnValue(
      new Promise((resolve) => {
        resolveWorktree = resolve;
      }),
    );

    const launch = startThreadFromDraft(
      localProject,
      {
        agentKind: "codex",
        config: { model: "gpt-5.6" },
        prompt: "build it",
        presentationMode: "gui",
        worktreeBranch: "feature",
        worktreeIsNewBranch: true,
      },
      { replacePaneId: "draft:local-project" },
    );

    expect(mocks.appState.createThread).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: localProject.id,
        worktreeBranch: "feature",
        worktreeProvisioning: true,
        replacePaneId: "draft:local-project",
      }),
    );
    expect(mocks.appState.createThread.mock.calls[0]?.[0]).not.toHaveProperty("worktreePath");
    expect(mocks.appState.setThreadWorktree).not.toHaveBeenCalled();
    expect(mocks.appState.queueThreadLaunch).not.toHaveBeenCalled();
    expect(mocks.appState.applyRuntimeEvent).toHaveBeenCalledTimes(2);
    const optimisticStartCall = mocks.appState.applyRuntimeEvent.mock.calls[0];
    if (!optimisticStartCall) throw new Error("Expected an optimistic user message event");
    const optimisticItemId = (optimisticStartCall[1] as { itemId?: string }).itemId;
    expect(optimisticItemId).toEqual(expect.stringMatching(/^user-/));
    expect(mocks.appState.applyRuntimeEvent).toHaveBeenNthCalledWith(
      1,
      "local-thread",
      expect.objectContaining({
        type: "item.started",
        itemId: optimisticItemId,
        itemType: "user_message",
        payload: { content: [{ kind: "text", text: "build it" }] },
      }),
    );
    expect(mocks.appState.updateThreadRuntime).not.toHaveBeenCalled();

    resolveWorktree({
      path: "C:\\shared-worktrees\\feature",
      changesTransferred: true,
    });
    await launch;

    expect(mocks.createWorktree).toHaveBeenCalledWith(localProject, {
      branch: "feature",
      createBranch: true,
      keepChangesInSource: false,
      transferUncommitted: false,
    });
    expect(mocks.appState.setThreadWorktree).toHaveBeenCalledWith(
      "local-thread",
      "C:\\shared-worktrees\\feature",
      "feature",
    );
    expect(mocks.appState.queueThreadLaunch).not.toHaveBeenCalled();
    expect(mocks.bridge.startThread).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "local-thread",
        prompt: "build it",
        projectLocation: { kind: "windows", path: "C:\\shared-worktrees\\feature" },
        userMessageItemId: optimisticItemId,
        initialSize: expect.objectContaining({ cols: expect.any(Number) }),
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

  it("launches inline when the thread's pane was closed during worktree provisioning", async () => {
    let resolveWorktree!: (result: { path: string; changesTransferred?: boolean }) => void;
    mocks.createWorktree.mockReturnValue(
      new Promise((resolve) => {
        resolveWorktree = resolve;
      }),
    );

    const launch = startThreadFromDraft(localProject, {
      agentKind: "codex",
      config: { model: "gpt-5.6" },
      prompt: "build it",
      presentationMode: "gui",
      worktreeBranch: "feature",
      worktreeIsNewBranch: true,
    });
    const optimisticStartCall = mocks.appState.applyRuntimeEvent.mock.calls[0];
    if (!optimisticStartCall) throw new Error("Expected an optimistic user message event");
    const optimisticItemId = (optimisticStartCall[1] as { itemId?: string }).itemId;

    // The user switched to another thread while the worktree was provisioning,
    // so no mounted ThreadView will ever consume a queued launch.
    mocks.appState.view = { kind: "thread", panes: ["another-thread"] };
    resolveWorktree({ path: "C:\\shared-worktrees\\feature" });
    await launch;

    expect(mocks.appState.queueThreadLaunch).not.toHaveBeenCalled();
    expect(mocks.bridge.startThread).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "local-thread",
        prompt: "build it",
        projectLocation: { kind: "windows", path: "C:\\shared-worktrees\\feature" },
        userMessageItemId: optimisticItemId,
        initialSize: expect.objectContaining({ cols: expect.any(Number) }),
      }),
    );
    expect(mocks.runWorktreeSetupScript).toHaveBeenCalledWith(
      localProject,
      "C:\\shared-worktrees\\feature",
      "pnpm install",
    );
  });

  it("marks the thread failed when the inline launch cannot start", async () => {
    mocks.bridge.startThread.mockRejectedValue(new Error("spawn failed"));
    let resolveWorktree!: (result: { path: string; changesTransferred?: boolean }) => void;
    mocks.createWorktree.mockReturnValue(
      new Promise((resolve) => {
        resolveWorktree = resolve;
      }),
    );

    const launch = startThreadFromDraft(localProject, {
      agentKind: "codex",
      config: { model: "gpt-5.6" },
      prompt: "build it",
      presentationMode: "gui",
      worktreeBranch: "feature",
      worktreeIsNewBranch: true,
    });
    mocks.appState.view = { kind: "thread", panes: ["another-thread"] };
    resolveWorktree({ path: "C:\\shared-worktrees\\feature" });
    await expect(launch).rejects.toThrow("spawn failed");

    expect(mocks.appState.queueThreadLaunch).not.toHaveBeenCalled();
    expect(mocks.appState.applyRuntimeEvent).toHaveBeenCalledWith("local-thread", {
      type: "error",
      threadId: "local-thread",
      message: "spawn failed",
    });
    expect(mocks.appState.updateThreadRuntime).toHaveBeenCalledWith("local-thread", {
      status: "error",
      attention: "error",
      errorMessage: "spawn failed",
      canResumeWithConfig: false,
    });
    expect(mocks.performWorktreeRemoval).not.toHaveBeenCalled();
  });

  it("launches a local non-worktree thread inline over the bridge", async () => {
    await startThreadFromDraft(localProject, {
      agentKind: "codex",
      config: { model: "gpt-5.6" },
      prompt: "build it",
      presentationMode: "gui",
    });

    expect(mocks.appState.queueThreadLaunch).not.toHaveBeenCalled();
    expect(mocks.bridge.startThread).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "local-thread",
        prompt: "build it",
        projectLocation: localProject.location,
        initialSize: expect.objectContaining({ cols: expect.any(Number) }),
      }),
    );
  });

  it("marks a local non-worktree thread failed when the bridge launch fails", async () => {
    mocks.bridge.startThread.mockRejectedValue(new Error("spawn failed"));

    await expect(
      startThreadFromDraft(localProject, {
        agentKind: "codex",
        config: { model: "gpt-5.6" },
        prompt: "build it",
        presentationMode: "gui",
      }),
    ).rejects.toThrow("spawn failed");

    expect(mocks.appState.applyRuntimeEvent).toHaveBeenCalledWith("local-thread", {
      type: "error",
      threadId: "local-thread",
      message: "spawn failed",
    });
    expect(mocks.appState.updateThreadRuntime).toHaveBeenCalledWith("local-thread", {
      status: "error",
      attention: "error",
      errorMessage: "spawn failed",
      canResumeWithConfig: false,
    });
  });

  it("shows a provisioning failure on the thread opened for a new local worktree", async () => {
    mocks.createWorktree.mockRejectedValue(new Error("Branch already exists"));

    await expect(
      startThreadFromDraft(localProject, {
        agentKind: "codex",
        config: { model: "gpt-5.6" },
        prompt: "build it",
        worktreeBranch: "feature",
        worktreeIsNewBranch: true,
      }),
    ).rejects.toThrow("Branch already exists");

    expect(mocks.appState.applyRuntimeEvent).toHaveBeenCalledWith("local-thread", {
      type: "error",
      threadId: "local-thread",
      message: "Branch already exists",
    });
    expect(mocks.appState.updateThreadRuntime).toHaveBeenCalledWith("local-thread", {
      status: "error",
      attention: "error",
      errorMessage: "Branch already exists",
      canResumeWithConfig: false,
    });
    expect(mocks.appState.queueThreadLaunch).not.toHaveBeenCalled();
  });

  it("removes a new worktree if its optimistic thread was deleted while provisioning", async () => {
    let resolveWorktree!: (result: { path: string; changesTransferred?: boolean }) => void;
    mocks.createWorktree.mockReturnValue(
      new Promise((resolve) => {
        resolveWorktree = resolve;
      }),
    );

    const launch = startThreadFromDraft(localProject, {
      agentKind: "codex",
      config: { model: "gpt-5.6" },
      prompt: "build it",
      worktreeBranch: "feature",
      worktreeIsNewBranch: true,
    });
    mocks.appState.threads = [];

    resolveWorktree({ path: "C:\\shared-worktrees\\feature" });
    await launch;

    expect(mocks.performWorktreeRemoval).toHaveBeenCalledWith(
      localProject,
      "C:\\shared-worktrees\\feature",
      "feature",
    );
    expect(mocks.appState.setThreadWorktree).not.toHaveBeenCalled();
    expect(mocks.appState.queueThreadLaunch).not.toHaveBeenCalled();
    expect(mocks.runWorktreeSetupScript).not.toHaveBeenCalled();
  });

  it("keeps an archived optimistic thread stopped after worktree provisioning", async () => {
    mocks.appState.createThread.mockImplementation(() => {
      const thread = {
        id: "local-thread",
        projectId: localProject.id,
        archived: true,
      } as Thread;
      mocks.appState.threads = [thread];
      return thread;
    });

    await startThreadFromDraft(localProject, {
      agentKind: "codex",
      config: { model: "gpt-5.6" },
      prompt: "build it",
      worktreeBranch: "feature",
      worktreeIsNewBranch: true,
    });

    expect(mocks.appState.setThreadWorktree).toHaveBeenCalledWith(
      "local-thread",
      "C:\\shared-worktrees\\feature",
      "feature",
    );
    expect(mocks.appState.updateThreadRuntime).toHaveBeenCalledWith("local-thread", {
      status: "inactive",
      attention: "none",
      canResumeWithConfig: false,
    });
    expect(mocks.appState.queueThreadLaunch).not.toHaveBeenCalled();
  });

  it("launches a helper thread through the same flow and runs setup from the client", async () => {
    mocks.remoteState.servers = [{ desktopId: "d1", hostMode: "helper" }];
    mocks.createWorktree.mockResolvedValue({
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

    expect(mocks.createWorktree).toHaveBeenCalledWith(remoteProject, {
      branch: "feature",
      createBranch: true,
      keepChangesInSource: false,
      transferUncommitted: false,
    });
    expect(mocks.remoteState.launchRemoteThread).toHaveBeenCalledWith(
      {
        threadId: expect.any(String),
        desktopId: "d1",
        projectId: "p1",
        agentKind: "codex",
        config: { model: "gpt-5.6" },
        prompt: "build it",
        presentationMode: "terminal",
        worktreePath: "/srv/worktrees/feature",
        worktreeBranch: "feature",
        isNewWorktree: true,
      },
      { isPendingLaunchOwned: expect.any(Function) },
    );
    expect(mocks.runWorktreeSetupScript).toHaveBeenCalledWith(
      remoteProject,
      "/srv/worktrees/feature",
      "pnpm install",
    );
  });

  it("shows the same optimistic GUI launch while a remote worktree is provisioning", async () => {
    mocks.remoteState.servers = [{ desktopId: "d1", hostMode: "helper" }];
    let resolveWorktree!: (result: { path: string; changesTransferred?: boolean }) => void;
    mocks.createWorktree.mockReturnValue(
      new Promise((resolve) => {
        resolveWorktree = resolve;
      }),
    );

    const launch = startThreadFromDraft(remoteProject, {
      agentKind: "codex",
      config: { model: "gpt-5.6" },
      prompt: "build remotely",
      presentationMode: "gui",
      worktreeBranch: "feature",
      worktreeIsNewBranch: true,
    });

    const createInput = mocks.appState.createThread.mock.calls[0]?.[0] as
      | (Partial<Thread> & { threadId?: string; worktreeProvisioning?: boolean })
      | undefined;
    expect(createInput).toMatchObject({
      projectId: remoteProject.id,
      remoteServerId: "d1",
      worktreeBranch: "feature",
      worktreeProvisioning: true,
      presentationMode: "gui",
    });
    expect(createInput?.remoteId).toEqual(expect.any(String));
    expect(createInput?.threadId).toBe(`remote:d1:thread:${createInput?.remoteId}`);
    expect(mocks.appState.applyRuntimeEvent).toHaveBeenCalledWith(
      createInput?.threadId,
      expect.objectContaining({
        type: "item.started",
        itemType: "user_message",
        payload: { content: [{ kind: "text", text: "build remotely" }] },
      }),
    );
    expect(mocks.remoteState.launchRemoteThread).not.toHaveBeenCalled();

    const optimisticItemId = (
      mocks.appState.applyRuntimeEvent.mock.calls[0]?.[1] as { itemId?: string } | undefined
    )?.itemId;
    resolveWorktree({ path: "/srv/worktrees/feature", changesTransferred: true });
    await launch;

    expect(mocks.appState.updateThreadRuntime).toHaveBeenCalledWith(createInput?.threadId, {
      status: "working",
      attention: "working",
      canResumeWithConfig: false,
    });
    expect(mocks.remoteState.launchRemoteThread).toHaveBeenCalledWith(
      {
        threadId: createInput?.remoteId,
        desktopId: "d1",
        projectId: "p1",
        agentKind: "codex",
        config: { model: "gpt-5.6" },
        prompt: "build remotely",
        presentationMode: "gui",
        worktreePath: "/srv/worktrees/feature",
        worktreeBranch: "feature",
        isNewWorktree: true,
        userMessageItemId: optimisticItemId,
      },
      { isPendingLaunchOwned: expect.any(Function) },
    );
    expect(mocks.appState.setThreadWorktree).toHaveBeenNthCalledWith(
      1,
      createInput?.threadId,
      "/srv/worktrees/feature",
      "feature",
      { preserveProvisioning: true },
    );
    expect(mocks.appState.setThreadWorktree).toHaveBeenLastCalledWith(
      createInput?.threadId,
      "/srv/worktrees/feature",
      "feature",
    );
  });

  it("removes the host thread and worktree when the provisional remote row is deleted mid-start", async () => {
    mocks.remoteState.servers = [{ desktopId: "d1", hostMode: "helper" }];
    const remoteStart = deferred<RemoteThreadLaunchResult>();
    mocks.remoteState.launchRemoteThread.mockReturnValue(remoteStart.promise);
    mocks.createWorktree.mockResolvedValue({ path: "/srv/worktrees/feature" });

    const launch = startThreadFromDraft(remoteProject, {
      agentKind: "codex",
      config: { model: "gpt-5.6" },
      prompt: "build remotely",
      worktreeBranch: "feature",
      worktreeIsNewBranch: true,
    });
    await vi.waitFor(() => expect(mocks.remoteState.launchRemoteThread).toHaveBeenCalledOnce());
    mocks.appState.threads = [];
    remoteStart.resolve("cancelled");
    await launch;

    expect(mocks.performWorktreeRemoval).toHaveBeenCalledWith(
      remoteProject,
      "/srv/worktrees/feature",
      "feature",
    );
  });

  it("retains the worktree when cancellation cannot remove the host thread", async () => {
    mocks.remoteState.servers = [{ desktopId: "d1", hostMode: "helper" }];
    mocks.createWorktree.mockResolvedValue({ path: "/srv/worktrees/feature" });
    mocks.remoteState.launchRemoteThread.mockResolvedValue("cancellation-failed");

    await startThreadFromDraft(remoteProject, {
      agentKind: "codex",
      config: { model: "gpt-5.6" },
      prompt: "build remotely",
      worktreeBranch: "feature",
      worktreeIsNewBranch: true,
    });

    expect(mocks.performWorktreeRemoval).not.toHaveBeenCalled();
    expect(mocks.primeWorktreeGitState).not.toHaveBeenCalled();
  });

  it("retains remote worktree context when host startup fails", async () => {
    mocks.remoteState.servers = [{ desktopId: "d1", hostMode: "helper" }];
    mocks.createWorktree.mockResolvedValue({ path: "/srv/worktrees/feature" });
    mocks.remoteState.launchRemoteThread.mockRejectedValue(new Error("Host refused launch"));

    await expect(
      startThreadFromDraft(remoteProject, {
        agentKind: "codex",
        config: { model: "gpt-5.6" },
        prompt: "build remotely",
        worktreeBranch: "feature",
        worktreeIsNewBranch: true,
      }),
    ).rejects.toThrow("Host refused launch");

    expect(mocks.appState.setThreadWorktree).toHaveBeenCalledWith(
      expect.any(String),
      "/srv/worktrees/feature",
      "feature",
      { preserveProvisioning: true },
    );
    expect(mocks.appState.updateThreadRuntime).toHaveBeenLastCalledWith(expect.any(String), {
      status: "error",
      attention: "error",
      errorMessage: "Host refused launch",
      canResumeWithConfig: false,
    });
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
    expect(mocks.createWorktree).not.toHaveBeenCalled();
    expect(mocks.remoteState.launchRemoteThread).not.toHaveBeenCalled();
  });

  it("does not duplicate setup owned by a desktop remote host", async () => {
    mocks.remoteState.servers = [{ desktopId: "d1", hostMode: "desktop" }];
    mocks.createWorktree.mockResolvedValue({
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

describe("performInitialThreadLaunch host transport", () => {
  const initialSize = { cols: 120, rows: 30 };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.appState.projects = [];
    mocks.remoteState.withClient.mockImplementation((desktopId, invoke) =>
      invoke(mocks.remoteClient),
    );
    mocks.remoteClient.startThread.mockResolvedValue({ threadId: "rt-1" });
    mocks.bridge.startThread.mockResolvedValue({ threadId: "local-thread" });
  });

  const localThread = {
    id: "local-thread",
    projectId: localProject.id,
    agentKind: "codex",
    config: { model: "" },
    presentationMode: "terminal",
    status: "launching",
  } as Thread;

  const remoteThread = {
    id: "remote:d1:thread:rt-1",
    projectId: remoteProject.id,
    remoteServerId: "d1",
    remoteId: "rt-1",
    agentKind: "codex",
    config: { model: "" },
    presentationMode: "terminal",
    status: "launching",
  } as Thread;

  it("launches a mirrored remote thread on its host without client MCP servers", async () => {
    await performInitialThreadLaunch({
      thread: remoteThread,
      projectLocation: { kind: "posix", path: "/srv/repo", remoteServerId: "d1" },
      prompt: "",
      initialSize,
    });

    expect(mocks.remoteState.withClient).toHaveBeenCalledWith("d1", expect.any(Function));
    const startInput = mocks.remoteClient.startThread.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(startInput).toMatchObject({
      threadId: "rt-1",
      // Projection marker stripped — the host receives its own native location.
      projectLocation: { kind: "posix", path: "/srv/repo" },
      agentKind: "codex",
      prompt: "",
      initialSize,
    });
    // The host resolves MCP from its own settings; clients must not inject any.
    expect(startInput).not.toHaveProperty("mcpServers");
    expect(mocks.bridge.startThread).not.toHaveBeenCalled();
  });

  it("launches a local thread over the bridge with the MCP launch snapshot", async () => {
    await performInitialThreadLaunch({
      thread: localThread,
      projectLocation: localProject.location,
      prompt: "",
      initialSize,
    });

    expect(mocks.bridge.startThread).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "local-thread",
        projectLocation: localProject.location,
        mcpServers: [],
        disabledBuiltInMcpServerIds: [],
      }),
    );
    expect(mocks.remoteState.withClient).not.toHaveBeenCalled();
  });

  it("reuses an optimistic user message created before provider launch", async () => {
    const thread = {
      ...localThread,
      presentationMode: "gui",
    } as Thread;

    await performInitialThreadLaunch({
      thread,
      projectLocation: localProject.location,
      prompt: "build it",
      userMessageItemId: "user-provisioning",
      initialSize,
    });

    expect(mocks.appState.applyRuntimeEvent).not.toHaveBeenCalled();
    expect(mocks.appState.updateThreadRuntime).toHaveBeenCalledWith("local-thread", {
      status: "working",
      attention: "working",
      canResumeWithConfig: undefined,
    });
    expect(mocks.bridge.startThread).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "local-thread",
        prompt: "build it",
        userMessageItemId: "user-provisioning",
      }),
    );
  });
});
