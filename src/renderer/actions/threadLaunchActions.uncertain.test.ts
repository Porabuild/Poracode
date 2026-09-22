import { beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteClientError } from "@/shared/remote/client";
import type { Project, Thread } from "@/shared/contracts";

const mocks = vi.hoisted(() => ({
  appState: {
    threads: [] as Thread[],
    projects: [] as Project[],
    applyRuntimeEvent: vi.fn<(threadId: string, event: unknown) => void>(),
    updateThreadRuntime: vi.fn<(threadId: string, input: unknown) => void>(),
    updateProjectDraftConfig: vi.fn<(projectId: string, config: unknown) => void>(),
    setThreadMcpLaunchCustomServerNames:
      vi.fn<(threadId: string, names: readonly string[]) => void>(),
  },
  remoteState: {
    runtime: {} as Record<string, { status: string }>,
    withClient:
      vi.fn<
        (
          desktopId: string,
          invoke: (client: {
            startThread: (input: unknown) => Promise<unknown>;
          }) => Promise<unknown>,
        ) => Promise<unknown>
      >(),
    launchRemoteThread:
      vi.fn<
        (
          input: unknown,
          options?: { isPendingLaunchOwned?: () => boolean },
        ) => Promise<"started" | "cancelled" | "cancellation-failed">
      >(),
  },
  startThread: vi.fn<(input: unknown) => Promise<unknown>>(),
  bridge: {
    startThread: vi.fn<(input: unknown) => Promise<unknown>>(),
  },
  notify: vi.fn<() => void>(),
  reconcile: vi.fn<(thread: Thread) => Promise<boolean>>(),
  reconcileRemote: vi.fn<(desktopId: string, remoteId: string) => Promise<boolean>>(),
  captureThreadStarted: vi.fn<(thread: Thread) => void>(),
}));

vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: { getState: () => mocks.appState },
}));
vi.mock("@/renderer/state/remoteServersStore", () => ({
  useRemoteServersStore: { getState: () => mocks.remoteState },
}));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => mocks.bridge,
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
vi.mock("@/renderer/analytics/posthog", () => ({
  captureThreadPromptSubmitted: vi.fn<(...args: unknown[]) => void>(),
  captureThreadStarted: mocks.captureThreadStarted,
}));
vi.mock("@/renderer/state/experimentStore", () => ({
  findExperimentByGroupId: () => undefined,
}));
vi.mock("@/renderer/state/agentStatusesStore", () => ({
  useAgentStatusesStore: {
    getState: () => ({ agentStatuses: [], wslAgentStatuses: [] }),
  },
}));
vi.mock("@/renderer/state/workspaceStore", () => ({
  getActiveWorkspaceId: () => null,
}));
vi.mock("@/renderer/utils/titleGen", () => ({
  generateTitleAsync: vi.fn<(...args: unknown[]) => void>(),
}));
vi.mock("@/renderer/state/gitRefresh", () => ({
  refreshGitProject: vi.fn<(project: unknown, reason: string, scope: string) => Promise<void>>(),
}));
vi.mock("./worktreeLaunchActions", () => ({
  createWorktree: vi.fn<(project: Project, input: unknown) => Promise<unknown>>(),
  primeWorktreeGitState: vi.fn<(project: Project, path: string) => Promise<void>>(),
  runWorktreeSetupScript:
    vi.fn<(project: Project, path: string, script: string) => Promise<void>>(),
}));
vi.mock("./worktreeActions", () => ({
  performWorktreeRemoval:
    vi.fn<(project: Project, path: string, branch?: string) => Promise<boolean>>(),
}));
vi.mock("./threadCommandOutcomeActions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./threadCommandOutcomeActions")>();
  return {
    ...actual,
    notifyThreadCommandOutcomeUncertain: mocks.notify,
    reconcileThreadCommandOutcome: mocks.reconcile,
    reconcileRemoteThreadCommandOutcome: mocks.reconcileRemote,
  };
});

import { performInitialThreadLaunch, startThreadFromDraft } from "./threadLaunchActions";

const projectLocation = { kind: "posix", path: "/repo" } as const;

function createRemoteThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "remote:desktop-1:thread:remote-thread",
    projectId: "remote:desktop-1:project:project-1",
    title: "Thread",
    agentKind: "codex",
    config: { model: "codex/model" },
    status: "inactive",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "terminal",
    remoteServerId: "desktop-1",
    remoteId: "remote-thread",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as Thread;
}

function createLocalThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "Thread",
    agentKind: "codex",
    config: { model: "codex/model" },
    status: "inactive",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "terminal",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as Thread;
}

function uncertainError(): RemoteClientError {
  return new RemoteClientError(
    "Remote command outcome is uncertain and was not repeated.",
    409,
    "command_outcome_uncertain",
  );
}

const remoteProject: Project = {
  id: "remote:desktop-1:project:project-1",
  name: "Remote",
  location: { kind: "posix", path: "/srv/repo", remoteServerId: "desktop-1" },
  remoteServerId: "desktop-1",
  remoteId: "project-1",
  scripts: { actions: [] },
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("performInitialThreadLaunch uncertain outcomes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reconcile.mockResolvedValue(true);
    mocks.appState.threads = [];
    mocks.appState.projects = [];
    mocks.remoteState.withClient.mockImplementation((_desktopId, invoke) =>
      invoke({ startThread: mocks.startThread }),
    );
    mocks.startThread.mockResolvedValue({ threadId: "remote-thread" });
    mocks.bridge.startThread.mockResolvedValue({ threadId: "thread-1" });
  });

  it("reconciles once and never reports success for an uncertain remote start", async () => {
    const thread = createRemoteThread();
    mocks.startThread.mockRejectedValue(uncertainError());

    await expect(
      performInitialThreadLaunch({
        thread,
        projectLocation,
        prompt: "",
        initialSize: { cols: 80, rows: 24 },
      }),
    ).rejects.toMatchObject({ status: 409, code: "command_outcome_uncertain" });

    expect(mocks.startThread).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.reconcile).toHaveBeenCalledExactlyOnceWith(thread);
    expect(mocks.captureThreadStarted).not.toHaveBeenCalled();
  });

  it("reconciles a remote start whose transport failure was wrapped by the store", async () => {
    const thread = createRemoteThread();
    // The remote-servers store wraps a dispatched transport failure into a
    // localized error whose cause keeps the transport evidence.
    mocks.startThread.mockRejectedValue(
      new Error("Remote server unreachable.", {
        cause: new RemoteClientError("timed out", 0, "timeout", {
          requestPhase: "dispatched",
          requestMayHaveCommitted: true,
        }),
      }),
    );

    await expect(
      performInitialThreadLaunch({
        thread,
        projectLocation,
        prompt: "",
        initialSize: { cols: 80, rows: 24 },
      }),
    ).rejects.toMatchObject({ message: "Remote server unreachable." });

    expect(mocks.startThread).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.reconcile).toHaveBeenCalledExactlyOnceWith(thread);
    expect(mocks.captureThreadStarted).not.toHaveBeenCalled();
  });

  it("keeps a definite remote start failure on the ordinary path", async () => {
    const thread = createRemoteThread();
    const error = new RemoteClientError("conflict", 409, "command_id_conflict");
    mocks.startThread.mockRejectedValue(error);

    await expect(
      performInitialThreadLaunch({
        thread,
        projectLocation,
        prompt: "",
        initialSize: { cols: 80, rows: 24 },
      }),
    ).rejects.toBe(error);

    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("handles an uncertain local start the same way", async () => {
    const thread = createLocalThread();
    mocks.bridge.startThread.mockRejectedValue(uncertainError());

    await expect(
      performInitialThreadLaunch({
        thread,
        projectLocation,
        prompt: "",
        initialSize: { cols: 80, rows: 24 },
      }),
    ).rejects.toMatchObject({ code: "command_outcome_uncertain" });

    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.reconcile).toHaveBeenCalledExactlyOnceWith(thread);
  });

  it("does not touch uncertainty handling on a successful start", async () => {
    const thread = createLocalThread();

    await expect(
      performInitialThreadLaunch({
        thread,
        projectLocation,
        prompt: "",
        initialSize: { cols: 80, rows: 24 },
      }),
    ).resolves.toBeUndefined();

    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.captureThreadStarted).toHaveBeenCalledTimes(1);
  });
});

describe("startThreadFromDraft remote uncertain outcomes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reconcile.mockResolvedValue(true);
    mocks.reconcileRemote.mockResolvedValue(true);
    mocks.appState.threads = [];
    mocks.appState.projects = [remoteProject];
    mocks.remoteState.runtime = { "desktop-1": { status: "online" } };
    mocks.remoteState.launchRemoteThread.mockResolvedValue("started");
  });

  it("reads the client-chosen host thread id back once and never resends", async () => {
    mocks.remoteState.launchRemoteThread.mockRejectedValue(uncertainError());

    await expect(
      startThreadFromDraft(remoteProject, {
        agentKind: "codex",
        config: { model: "codex/model" },
        prompt: "hello",
      }),
    ).rejects.toMatchObject({ code: "command_outcome_uncertain" });

    expect(mocks.remoteState.launchRemoteThread).toHaveBeenCalledTimes(1);
    const [launchInput] = mocks.remoteState.launchRemoteThread.mock.calls[0]!;
    const hostThreadId = (launchInput as { threadId?: string }).threadId;
    expect(typeof hostThreadId).toBe("string");
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.reconcileRemote).toHaveBeenCalledExactlyOnceWith("desktop-1", hostThreadId);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("keeps the definite remote draft failure on the ordinary path", async () => {
    const error = new RemoteClientError("conflict", 409, "command_id_conflict");
    mocks.remoteState.launchRemoteThread.mockRejectedValue(error);

    await expect(
      startThreadFromDraft(remoteProject, {
        agentKind: "codex",
        config: { model: "codex/model" },
        prompt: "hello",
      }),
    ).rejects.toBe(error);

    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.reconcileRemote).not.toHaveBeenCalled();
  });
});
