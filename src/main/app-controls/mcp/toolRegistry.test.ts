import { describe, expect, it, vi } from "vitest";
import type {
  AgentStatusesResponse,
  CloseThreadPayload,
  GitProjectSnapshotResult,
  GitWorktreeInfo,
  InterruptThreadPayload,
  ListProjectTreeResult,
  McpProbeResult,
  PrComment,
  PrData,
  PrDetails,
  Project,
  ProjectNotes,
  ProviderUsagePayload,
  ProviderUsageResponse,
  ReadProjectFileResult,
  RemoteThreadCommand,
  ScheduledTask,
  ScheduledTaskInput,
  SearchProjectFilesPayload,
  SearchProjectFilesResult,
  SearchProjectTreeResult,
  SendThreadInputPayload,
  SkillScanResult,
  StartThreadPayload,
  StartThreadResult,
  Thread,
  ThreadRuntimeSnapshot,
} from "@/shared/contracts";
import type { RemoteProjectCommand, RemoteProjectCommandResult } from "@/shared/remote";
import { defaultSharedSettings, type SharedSettings } from "@/shared/settings";
import type { ScheduleService } from "../../schedules/ScheduleService";
import type {
  CreateAppThreadRequest,
  CreateAppThreadResult,
} from "../../threads/appThreadLauncher";
import { ThreadStateBroker } from "../../threads/threadStateBroker";
import {
  dispatchTool,
  type AppControlsSupervisorCaller,
  type AppControlsToolContext,
} from "./toolRegistry";

type SC = AppControlsSupervisorCaller;

const thread = {
  id: "thread-1",
  projectId: "project-1",
  agentKind: "codex",
  config: { model: "gpt-5.6", effort: "high", fast: true },
} as Thread;

function makeThread(overrides: Partial<Thread>): Thread {
  return {
    id: "t",
    projectId: "project-1",
    title: "Thread",
    agentKind: "codex",
    config: { model: "gpt-5.6" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as Thread;
}

function context(
  options: {
    tasks?: ScheduledTask[];
    threads?: Thread[];
    projects?: Project[];
    snapshots?: ThreadRuntimeSnapshot[];
    createThread?: (request: CreateAppThreadRequest) => Promise<CreateAppThreadResult>;
    projectNotes?: Record<string, ProjectNotes>;
    directoryExists?: (path: string) => boolean;
    settings?: SharedSettings;
    usageResponse?: ProviderUsageResponse;
    fileSearchResult?: SearchProjectFilesResult;
    appInfo?: { version: string; platform: string; hasRendererWindow: boolean };
    /** Whether a renderer receives emitRemoteThreadCommand (desktop) or not (headless). */
    rendererConnected?: boolean;
    /** Whether a UI is available for openThreadInUi. */
    uiConnected?: boolean;
    scrollback?: string;
    agentStatuses?: AgentStatusesResponse;
    projectTree?: ListProjectTreeResult;
    readFile?: ReadProjectFileResult;
    searchTree?: SearchProjectTreeResult;
    /** Whether an OS notification was actually shown (desktop) or not (headless). */
    notificationDelivered?: boolean;
    gitSnapshot?: GitProjectSnapshotResult;
    worktrees?: GitWorktreeInfo[];
    sourceBranch?: string | null;
    ghAvailable?: boolean;
    prDetails?: PrDetails;
    prDiff?: string;
    probeResult?: McpProbeResult;
    authenticatedUrls?: string[];
    skillScan?: SkillScanResult;
  } = {},
) {
  const tasks = options.tasks ?? [];
  const service = {
    list: vi.fn<() => ScheduledTask[]>(() => tasks),
    get: vi.fn<(id: string) => ScheduledTask | null>(
      (id) => tasks.find((task) => task.id === id) ?? null,
    ),
    create: vi.fn<(input: ScheduledTaskInput) => ScheduledTask>(
      (input) => ({ id: "created", ...input }) as ScheduledTask,
    ),
    update: vi.fn<(id: string, input: ScheduledTaskInput) => ScheduledTask>(
      (id, input) => ({ id, ...input }) as ScheduledTask,
    ),
    runNow: vi.fn<(id: string) => ScheduledTask>(
      (id) => ({ id, lastStatus: "running" }) as ScheduledTask,
    ),
    delete: vi.fn<(id: string) => void>(),
  } as unknown as ScheduleService;
  const threads = options.threads ?? [thread];
  const usageResponse = options.usageResponse ?? { snapshots: [], fromCache: true };
  const fileSearchResult = options.fileSearchResult ?? { entries: [], totalIndexed: 0 };
  const supervisor = {
    getThreadSnapshots: vi.fn<() => Promise<ThreadRuntimeSnapshot[]>>(
      async () => options.snapshots ?? [],
    ),
    startThread: vi.fn<(payload: StartThreadPayload) => Promise<StartThreadResult>>(
      async (payload) => ({ threadId: payload.threadId ?? "resumed" }),
    ),
    sendThreadInput: vi.fn<(payload: SendThreadInputPayload) => Promise<void>>(
      async () => undefined,
    ),
    interruptThread: vi.fn<(payload: InterruptThreadPayload) => Promise<void>>(
      async () => undefined,
    ),
    closeThread: vi.fn<(payload: CloseThreadPayload) => Promise<void>>(async () => undefined),
    getProviderUsage: vi.fn<(payload: ProviderUsagePayload) => Promise<ProviderUsageResponse>>(
      async () => usageResponse,
    ),
    refreshProviderUsage: vi.fn<(payload: ProviderUsagePayload) => Promise<ProviderUsageResponse>>(
      async () => usageResponse,
    ),
    searchProjectFiles: vi.fn<
      (payload: SearchProjectFilesPayload) => Promise<SearchProjectFilesResult>
    >(async () => fileSearchResult),
    readTerminalScrollback: vi.fn<() => Promise<string>>(async () => options.scrollback ?? ""),
    setPendingSteer: vi.fn<() => Promise<void>>(async () => undefined),
    clearPendingSteer: vi.fn<() => Promise<void>>(async () => undefined),
    stageThreadInput: vi.fn<() => Promise<void>>(async () => undefined),
    rollbackThreadConversation: vi.fn<() => Promise<void>>(async () => undefined),
    getAgentStatuses: vi.fn<() => Promise<AgentStatusesResponse>>(
      async () => options.agentStatuses ?? { windows: [], wsl: [], fromCache: true },
    ),
    refreshAgentStatuses: vi.fn<() => Promise<AgentStatusesResponse>>(
      async () => options.agentStatuses ?? { windows: [], wsl: [], fromCache: false },
    ),
    listProjectTree: vi.fn<() => Promise<ListProjectTreeResult>>(
      async () => options.projectTree ?? { directoryPath: "", entries: [] },
    ),
    readProjectFile: vi.fn<() => Promise<ReadProjectFileResult>>(
      async () => options.readFile ?? { path: "", status: "ready", modifiedAtMs: 0, content: "" },
    ),
    searchProjectTree: vi.fn<() => Promise<SearchProjectTreeResult>>(
      async () => options.searchTree ?? { entries: [] },
    ),
    gitProjectSnapshot: vi.fn<SC["gitProjectSnapshot"]>(
      async () =>
        options.gitSnapshot ?? {
          status: null,
          branches: null,
          worktrees: null,
          ghAvailable: null,
        },
    ),
    getGitDiff: vi.fn<SC["getGitDiff"]>(async () => ({ diff: "diff-one-file" })),
    getGitDiffBatch: vi.fn<SC["getGitDiffBatch"]>(async () => ({ staged: {}, unstaged: {} })),
    gitStage: vi.fn<SC["gitStage"]>(async () => undefined),
    gitUnstage: vi.fn<SC["gitUnstage"]>(async () => undefined),
    gitStageAll: vi.fn<SC["gitStageAll"]>(async () => undefined),
    gitUnstageAll: vi.fn<SC["gitUnstageAll"]>(async () => undefined),
    gitRevert: vi.fn<SC["gitRevert"]>(async () => undefined),
    gitRevertAll: vi.fn<SC["gitRevertAll"]>(async () => undefined),
    gitCommit: vi.fn<SC["gitCommit"]>(async (payload) => ({
      hash: "abc123",
      message: payload.message,
    })),
    gitListBranches: vi.fn<SC["gitListBranches"]>(async () => ({ current: "main", branches: [] })),
    gitSwitchBranch: vi.fn<SC["gitSwitchBranch"]>(async (payload) => ({
      branch: payload.branch,
      created: payload.createNew ?? false,
      tracking: "",
      ahead: 0,
      behind: 0,
    })),
    gitFetch: vi.fn<SC["gitFetch"]>(async () => undefined),
    gitPull: vi.fn<SC["gitPull"]>(async () => undefined),
    gitPullRebase: vi.fn<SC["gitPullRebase"]>(async () => undefined),
    gitPush: vi.fn<SC["gitPush"]>(async () => undefined),
    gitListWorktrees: vi.fn<SC["gitListWorktrees"]>(async () => ({
      worktrees: options.worktrees ?? [],
    })),
    gitRemoveWorktree: vi.fn<SC["gitRemoveWorktree"]>(async () => undefined),
    gitWorktreeStatusBatch: vi.fn<SC["gitWorktreeStatusBatch"]>(async () => ({ statuses: {} })),
    gitGetWorktreeSourceBranch: vi.fn<SC["gitGetWorktreeSourceBranch"]>(async () => ({
      sourceBranch: options.sourceBranch === undefined ? "main" : options.sourceBranch,
      commitsAhead: 0,
      sourceAhead: 0,
    })),
    gitMergeToSource: vi.fn<SC["gitMergeToSource"]>(async () => ({
      merged: true,
      fastForward: false,
      newSourceCommit: "def456",
    })),
    gitPullFromSource: vi.fn<SC["gitPullFromSource"]>(async () => ({
      merged: true,
      fastForward: false,
    })),
    gitAbortMerge: vi.fn<SC["gitAbortMerge"]>(async () => ({})),
    gitFinishMerge: vi.fn<SC["gitFinishMerge"]>(async () => ({ success: true })),
    ghCheckAvailable: vi.fn<SC["ghCheckAvailable"]>(async () => ({
      available: options.ghAvailable ?? true,
    })),
    ghListPullRequests: vi.fn<SC["ghListPullRequests"]>(async () => ({ pullRequests: [] })),
    ghGetPrDetails: vi.fn<SC["ghGetPrDetails"]>(async () => ({
      details:
        options.prDetails ??
        ({
          number: 7,
          title: "PR",
          body: "",
          baseBranch: "main",
          headBranch: "feature",
          additions: 0,
          deletions: 0,
          changedFiles: 0,
          commits: [],
          comments: [],
          reviews: [],
          checks: [],
        } as PrDetails),
    })),
    ghGetPrChecks: vi.fn<SC["ghGetPrChecks"]>(async () => ({ checks: [] })),
    ghGetPrFiles: vi.fn<SC["ghGetPrFiles"]>(async () => ({ files: [] })),
    ghGetPrDiff: vi.fn<SC["ghGetPrDiff"]>(async () => ({ diff: options.prDiff ?? "pr-diff" })),
    ghCreatePr: vi.fn<SC["ghCreatePr"]>(
      async () =>
        ({
          number: 7,
          state: "open",
          title: "PR",
          url: "https://example.test/pr/7",
          baseBranch: "main",
          isDraft: false,
          updatedAt: "2026-01-01T00:00:00.000Z",
        }) as PrData,
    ),
    ghPostPrComment: vi.fn<SC["ghPostPrComment"]>(
      async () =>
        ({
          id: "c1",
          author: { login: "octocat" },
          body: "hi",
          createdAt: "2026-01-01T00:00:00.000Z",
        }) as PrComment,
    ),
    ghMergePr: vi.fn<SC["ghMergePr"]>(async () => undefined),
    ghClosePr: vi.fn<SC["ghClosePr"]>(async () => undefined),
    ghReopenPr: vi.fn<SC["ghReopenPr"]>(async () => undefined),
    ghMarkPrReady: vi.fn<SC["ghMarkPrReady"]>(async () => undefined),
    ghUpdatePrBranch: vi.fn<SC["ghUpdatePrBranch"]>(async () => undefined),
    probeMcpServer: vi.fn<SC["probeMcpServer"]>(
      async () =>
        options.probeResult ??
        ({
          status: "available",
          toolCount: 2,
          tools: ["a", "b"],
          latencyMs: 5,
          environment: { runtime: "host", projectScoped: false },
        } as McpProbeResult),
    ),
    reloadAgentMcpServers: vi.fn<SC["reloadAgentMcpServers"]>(async () => undefined),
    getMcpOauthStatus: vi.fn<SC["getMcpOauthStatus"]>(async () => ({
      authenticatedUrls: options.authenticatedUrls ?? [],
    })),
    scanSkills: vi.fn<SC["scanSkills"]>(
      async () =>
        options.skillScan ?? {
          skills: [],
          effectiveSkillIds: [],
          invocation: null,
          issues: [],
          canLinkToGlobal: false,
        },
    ),
    setSkillEnabled: vi.fn<SC["setSkillEnabled"]>(async () => undefined),
  };
  const notifyUser = vi.fn<() => { delivered: boolean; note?: string }>(() =>
    options.notificationDelivered === false
      ? { delivered: false, note: "No display connected." }
      : { delivered: true },
  );
  const checkForUpdate = vi.fn<() => Promise<{ supported: boolean; currentVersion?: string }>>(
    async () => ({ supported: true, currentVersion: "9.9.9" }),
  );
  const createThread =
    options.createThread ??
    vi.fn<(request: CreateAppThreadRequest) => Promise<CreateAppThreadResult>>(async (request) => ({
      threadId: "new-thread",
      title: request.title ?? "New thread",
      projectId: request.projectId,
    }));
  const emitRemoteThreadCommand = vi.fn<(command: RemoteThreadCommand) => boolean>(
    () => options.rendererConnected ?? true,
  );
  const updatedRows: Thread[] = [];
  const updateThreadRow = vi.fn<(threadId: string, mutate: (thread: Thread) => Thread) => void>(
    (threadId, mutate) => {
      const current = threads.find((entry) => entry.id === threadId);
      if (!current) return;
      updatedRows.push(mutate(current));
    },
  );
  const openThreadInUi = vi.fn<(threadId: string) => boolean>(() => options.uiConnected ?? true);
  const applyProjectCommand = vi.fn<
    (command: RemoteProjectCommand) => Promise<RemoteProjectCommandResult>
  >(async () => ({ projects: options.projects ?? [] }));
  const updateProject = vi.fn<(project: Project) => void>();
  const settingsWrite = vi.fn<(next: SharedSettings) => void>();
  const settingsValue = options.settings ?? defaultSharedSettings;
  const ctx: AppControlsToolContext = {
    identity: { threadId: thread.id, title: "Schedule this" },
    scheduleService: service,
    getThread: (id) => threads.find((entry) => entry.id === id) ?? null,
    getThreads: () => threads,
    getProjects: () => options.projects ?? [],
    getProject: (id) => options.projects?.find((project) => project.id === id) ?? null,
    getProjectNotes: (id) => options.projectNotes?.[id] ?? null,
    directoryExists: options.directoryExists ?? (() => true),
    applyProjectCommand,
    updateProject,
    settings: { read: () => settingsValue, write: settingsWrite },
    getAppInfo: () =>
      options.appInfo ?? { version: "9.9.9", platform: "darwin", hasRendererWindow: true },
    supervisor,
    createThread,
    emitRemoteThreadCommand,
    updateThreadRow,
    openThreadInUi,
    notifyUser,
    checkForUpdate,
    threadStates: new ThreadStateBroker(),
  };
  return {
    ctx,
    service,
    supervisor,
    createThread,
    emitRemoteThreadCommand,
    updateThreadRow,
    updatedRows,
    openThreadInUi,
    notifyUser,
    checkForUpdate,
    applyProjectCommand,
    updateProject,
    settingsWrite,
  };
}

describe("Poracode app control tools — schedules", () => {
  it("creates a schedule with the calling thread's agent defaults", async () => {
    const { ctx, service } = context();
    await dispatchTool(
      "create_schedule",
      {
        name: "Daily brief",
        prompt: "Summarize priorities",
        recurrence: { kind: "weekly", days: [1, 2, 3, 4, 5], time: "08:00" },
      },
      ctx,
    );

    expect(service.create).toHaveBeenCalledWith({
      name: "Daily brief",
      prompt: "Summarize priorities",
      recurrence: { kind: "weekly", days: [1, 2, 3, 4, 5], time: "08:00" },
      enabled: true,
      agentKind: "codex",
      // project-1 is a real project id, so the schedule inherits it.
      projectId: "project-1",
      config: { model: "gpt-5.6", effort: "high", fast: true },
    });
  });

  it("updates only the requested schedule fields", async () => {
    const task = {
      id: "d2ac39e9-14ac-4776-9279-37a1e455a5db",
      name: "Old name",
      prompt: "Keep this prompt",
      agentKind: "claude:home",
      config: { model: "claude-fable-5", effort: "medium" },
      recurrence: { kind: "hourly", minute: 0 },
      enabled: true,
    } as ScheduledTask;
    const { ctx, service } = context({ tasks: [task] });

    await dispatchTool("update_schedule", { id: task.id, name: "New name", enabled: false }, ctx);

    expect(service.update).toHaveBeenCalledWith(
      task.id,
      expect.objectContaining({
        name: "New name",
        prompt: "Keep this prompt",
        enabled: false,
        recurrence: { kind: "hourly", minute: 0 },
      }),
    );
  });
});

describe("Poracode app control tools — threads", () => {
  it("lists all threads merged with live runtime snapshots and applies filters", async () => {
    const threads = [
      makeThread({ id: "a", projectId: "project-1", status: "idle" }),
      makeThread({ id: "b", projectId: "project-2", status: "idle" }),
    ];
    const projects = [
      { id: "project-1", name: "Alpha" } as Project,
      { id: "project-2", name: "Beta" } as Project,
    ];
    const snapshots: ThreadRuntimeSnapshot[] = [
      { threadId: "a", status: "working", attention: "none", canResumeWithConfig: false },
    ];
    const { ctx } = context({ threads, projects, snapshots });

    const all = (await dispatchTool("list_threads", {}, ctx)) as {
      count: number;
      threads: Array<{ threadId: string; status: string; projectName?: string }>;
    };
    expect(all.count).toBe(2);
    // Live snapshot status overrides the persisted row.
    expect(all.threads.find((t) => t.threadId === "a")?.status).toBe("working");
    expect(all.threads.find((t) => t.threadId === "a")?.projectName).toBe("Alpha");

    const filtered = (await dispatchTool("list_threads", { projectId: "project-2" }, ctx)) as {
      count: number;
    };
    expect(filtered.count).toBe(1);
  });

  it("create_thread inherits the calling thread's agent, model, effort, and fast", async () => {
    const { ctx, createThread } = context();
    await dispatchTool("create_thread", { projectId: "project-9", prompt: "Do the thing" }, ctx);
    expect(createThread).toHaveBeenCalledWith({
      projectId: "project-9",
      prompt: "Do the thing",
      agentKind: "codex",
      model: "gpt-5.6",
      effort: "high",
      fast: true,
    });
  });

  it("create_thread requests a worktree only when enabled", async () => {
    const { ctx, createThread } = context();
    await dispatchTool(
      "create_thread",
      { projectId: "p", prompt: "x", worktree: { enabled: true, branch: "feature/x" } },
      ctx,
    );
    expect(createThread).toHaveBeenCalledWith(
      expect.objectContaining({ worktree: { branch: "feature/x" } }),
    );
  });

  it("update_thread dispatches the matching remote thread commands", async () => {
    const threads = [makeThread({ id: "a" })];
    const { ctx, emitRemoteThreadCommand } = context({ threads });
    const result = (await dispatchTool(
      "update_thread",
      { threadId: "a", rename: "Renamed", done: true, archived: true },
      ctx,
    )) as { applied: string[] };
    expect(result.applied).toEqual(["rename", "done", "archived"]);
    expect(emitRemoteThreadCommand).toHaveBeenCalledWith({
      kind: "rename",
      threadId: "a",
      title: "Renamed",
    });
    expect(emitRemoteThreadCommand).toHaveBeenCalledWith({
      kind: "set-done",
      threadId: "a",
      done: true,
    });
    expect(emitRemoteThreadCommand).toHaveBeenCalledWith({ kind: "archive", threadId: "a" });
  });

  it("send_to_thread interrupts first when requested then sends", async () => {
    const threads = [makeThread({ id: "a" })];
    const { ctx, supervisor } = context({ threads });
    await dispatchTool(
      "send_to_thread",
      { threadId: "a", message: "hello", interruptFirst: true },
      ctx,
    );
    expect(supervisor.interruptThread).toHaveBeenCalledWith({ threadId: "a" });
    expect(supervisor.sendThreadInput).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: "a", prompt: "hello" }),
    );
    expect(supervisor.startThread).not.toHaveBeenCalled();
  });

  it("send_to_thread resumes a thread whose live session is gone, delivering the message as the first input", async () => {
    const threads = [
      makeThread({
        id: "a",
        projectId: "p1",
        agentKind: "codex",
        presentationMode: "gui",
        sessionRef: { providerSessionId: "sess-1", discoveredAt: "2026-01-01T00:00:00.000Z" },
        worktreePath: "/work/alpha/.poracode/worktrees/wt",
      }),
    ];
    const projects = [
      { id: "p1", name: "Alpha", location: { kind: "posix", path: "/work/alpha" } } as Project,
    ];
    const { ctx, supervisor } = context({ threads, projects });
    // The supervisor no longer has a live session for this thread.
    supervisor.sendThreadInput.mockRejectedValueOnce(new Error("Unknown thread session: a"));

    const result = (await dispatchTool(
      "send_to_thread",
      { threadId: "a", message: "resume please" },
      ctx,
    )) as { delivered: boolean; resumed?: boolean };

    expect(result.delivered).toBe(true);
    expect(result.resumed).toBe(true);
    expect(supervisor.startThread).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "a",
        prompt: "resume please",
        agentKind: "codex",
        presentationMode: "gui",
        sessionRef: { providerSessionId: "sess-1", discoveredAt: "2026-01-01T00:00:00.000Z" },
        projectLocation: expect.objectContaining({ kind: "posix" }),
      }),
    );
  });

  it("send_to_thread refuses a non-resumable dead thread and points to create_thread", async () => {
    const threads = [makeThread({ id: "a", projectId: "p1", canResumeWithConfig: false })];
    const projects = [
      { id: "p1", name: "Alpha", location: { kind: "posix", path: "/work/alpha" } } as Project,
    ];
    const { ctx, supervisor } = context({ threads, projects });
    supervisor.sendThreadInput.mockRejectedValueOnce(new Error("Unknown thread session: a"));

    await expect(
      dispatchTool("send_to_thread", { threadId: "a", message: "hi" }, ctx),
    ).rejects.toThrow(/create_thread/);
    expect(supervisor.startThread).not.toHaveBeenCalled();
  });

  it("update_thread falls back to a direct DB row write when no renderer is connected", async () => {
    const threads = [makeThread({ id: "a", title: "Old", status: "finished" })];
    const { ctx, emitRemoteThreadCommand, updateThreadRow, updatedRows } = context({
      threads,
      rendererConnected: false,
    });
    const result = (await dispatchTool(
      "update_thread",
      { threadId: "a", rename: "New", done: true, acknowledge: true },
      ctx,
    )) as { applied: string[]; note?: string };

    expect(result.applied).toEqual(["rename", "done", "acknowledge"]);
    expect(result.note).toMatch(/No Poracode UI is connected/);
    // Commands are still emitted (attempted), but no renderer received them.
    expect(emitRemoteThreadCommand).toHaveBeenCalled();
    expect(updateThreadRow).toHaveBeenCalledWith("a", expect.any(Function));
    const row = updatedRows.at(-1)!;
    expect(row.title).toBe("New");
    expect(row.done).toBe(true);
    // acknowledge cleared the finished marker (finished → idle).
    expect(row.status).toBe("idle");
  });

  it("update_thread persists the DB row even when a renderer is connected", async () => {
    const threads = [makeThread({ id: "a" })];
    const { ctx, updateThreadRow } = context({ threads, rendererConnected: true });
    const result = (await dispatchTool("update_thread", { threadId: "a", rename: "New" }, ctx)) as {
      applied: string[];
      note?: string;
    };
    expect(result.applied).toEqual(["rename"]);
    expect(result.note).toBeUndefined();
    expect(updateThreadRow).toHaveBeenCalledWith("a", expect.any(Function));
  });

  it("open_thread notes when no UI is connected instead of reporting success", async () => {
    const threads = [makeThread({ id: "a" })];
    const { ctx } = context({ threads, uiConnected: false });
    const result = (await dispatchTool("open_thread", { threadId: "a" }, ctx)) as {
      opened: boolean;
      note?: string;
    };
    expect(result.opened).toBe(false);
    expect(result.note).toMatch(/No Poracode UI is connected/);
  });

  it("rejects unknown thread ids with a clear error", async () => {
    const { ctx } = context({ threads: [] });
    await expect(dispatchTool("get_thread", { threadId: "missing" }, ctx)).rejects.toThrow(
      /Thread not found/,
    );
  });

  it("refuses to stop/interrupt/wait on the calling thread", async () => {
    const threads = [makeThread({ id: "thread-1" })];
    const { ctx } = context({ threads });
    await expect(dispatchTool("stop_thread", { threadId: "thread-1" }, ctx)).rejects.toThrow(
      /your own thread/,
    );
    await expect(dispatchTool("interrupt_thread", { threadId: "thread-1" }, ctx)).rejects.toThrow(
      /your own thread/,
    );
    await expect(dispatchTool("wait_for_thread", { threadIds: ["thread-1"] }, ctx)).rejects.toThrow(
      /your own thread/,
    );
  });

  it("wait_for_thread returns immediately when a thread is already settled", async () => {
    const threads = [makeThread({ id: "a", status: "idle" })];
    const { ctx } = context({ threads });
    const result = (await dispatchTool(
      "wait_for_thread",
      { threadIds: ["a"], timeoutSeconds: 5 },
      ctx,
    )) as { timedOut: boolean; settled: string[] };
    expect(result.timedOut).toBe(false);
    expect(result.settled).toEqual(["a"]);
  });

  it("open_thread asks the renderer to open the thread", async () => {
    const threads = [makeThread({ id: "a" })];
    const { ctx, openThreadInUi } = context({ threads });
    await dispatchTool("open_thread", { threadId: "a" }, ctx);
    expect(openThreadInUi).toHaveBeenCalledWith("a");
  });
});

describe("Poracode app control tools — projects", () => {
  const projects = [
    { id: "p1", name: "Alpha", location: { kind: "posix", path: "/work/alpha" } } as Project,
    { id: "p2", name: "Beta", location: { kind: "posix", path: "/work/beta" } } as Project,
  ];

  it("lists projects with thread counts", async () => {
    const threads = [
      makeThread({ id: "a", projectId: "p1", archived: false, done: false }),
      makeThread({ id: "b", projectId: "p1", done: true }),
    ];
    const { ctx } = context({ projects, threads });
    const result = (await dispatchTool("list_projects", {}, ctx)) as {
      count: number;
      projects: Array<{ id: string; path: string; threadCount: number; openThreadCount: number }>;
    };
    expect(result.count).toBe(2);
    const alpha = result.projects.find((p) => p.id === "p1");
    expect(alpha?.path).toBe("/work/alpha");
    expect(alpha?.threadCount).toBe(2);
    expect(alpha?.openThreadCount).toBe(1);
  });

  it("create_project rejects a directory that does not exist", async () => {
    const { ctx, applyProjectCommand } = context({
      projects,
      directoryExists: () => false,
    });
    await expect(dispatchTool("create_project", { path: "/nope/missing" }, ctx)).rejects.toThrow(
      /does not exist/,
    );
    expect(applyProjectCommand).not.toHaveBeenCalled();
  });

  it("create_project registers an existing directory via the shared command", async () => {
    const created = { id: "p3", name: "Gamma" } as Project;
    const { ctx, applyProjectCommand } = context({ projects, directoryExists: () => true });
    applyProjectCommand.mockResolvedValueOnce({ projects, project: created });
    const result = (await dispatchTool(
      "create_project",
      { path: "/work/gamma", name: "Gamma" },
      ctx,
    )) as { created: boolean; project: Project | null };
    expect(applyProjectCommand).toHaveBeenCalledWith({
      kind: "add-existing",
      path: "/work/gamma",
      name: "Gamma",
    });
    expect(result.created).toBe(true);
    expect(result.project?.id).toBe("p3");
  });

  it("update_project renames while preserving other fields", async () => {
    const { ctx, updateProject } = context({ projects });
    await dispatchTool("update_project", { projectId: "p1", name: "Renamed" }, ctx);
    expect(updateProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p1", name: "Renamed" }),
    );
  });
});

describe("Poracode app control tools — settings", () => {
  function settingsWithSecret(): SharedSettings {
    return {
      ...defaultSharedSettings,
      themeMode: "light",
      agentSettings: {
        cursor: { structuredRuntime: "sdk", sdkApiKey: "lc-safe:cursor-secret-token" },
      },
      acpRegistryInstalledAgents: { registryAgent: { source: "x" } as never },
      agentInstances: {
        claudeProfile: {
          id: "claudeProfile",
          driver: "claude",
          environment: {
            ANTHROPIC_API_KEY: { value: "enc:super-secret-token", sensitive: true },
            PLAIN: { value: "visible" },
          },
        },
        acpAgent: { id: "acpAgent", driver: "acp-generic" },
      },
      mcpServers: [
        {
          id: "http-server",
          name: "remote-api",
          description: "",
          enabled: true,
          timeoutMs: 30_000,
          transport: {
            type: "http",
            url: "https://example.test/mcp?token=url-secret-value&v=2",
            headers: { Authorization: "Bearer http-secret-token", "X-Api-Key": "http-key-value" },
          },
        },
        {
          id: "stdio-server",
          name: "local-tool",
          description: "",
          enabled: true,
          timeoutMs: 30_000,
          transport: {
            type: "stdio",
            command: "run-tool",
            args: ["--api-key=arg-secret-value", "--verbose"],
            env: { SERVICE_TOKEN: "stdio-secret-env" },
          },
        },
      ],
    };
  }

  it("get_settings never leaks secret environment values", async () => {
    const { ctx } = context({ settings: settingsWithSecret() });
    const result = (await dispatchTool("get_settings", {}, ctx)) as {
      settings: { agentInstances: Record<string, { environment?: Record<string, unknown> }> };
    };
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("super-secret-token");
    expect(serialized).not.toContain("cursor-secret-token");
    expect(serialized).not.toContain("visible");
    expect(
      (result.settings as unknown as { agentSettings: Record<string, Record<string, string>> })
        .agentSettings.cursor?.sdkApiKey,
    ).toBe("«redacted»");
    const env = result.settings.agentInstances.claudeProfile?.environment;
    expect(env).toEqual({
      ANTHROPIC_API_KEY: { sensitive: true },
      PLAIN: { sensitive: false },
    });
  });

  it("get_settings never leaks MCP server transport headers or stdio env values", async () => {
    const { ctx } = context({ settings: settingsWithSecret() });
    const result = (await dispatchTool("get_settings", {}, ctx)) as {
      settings: { mcpServers: Array<{ transport: Record<string, unknown> }> };
    };
    const serialized = JSON.stringify(result);
    // No secret value leaks anywhere in the serialized output.
    expect(serialized).not.toContain("http-secret-token");
    expect(serialized).not.toContain("http-key-value");
    expect(serialized).not.toContain("stdio-secret-env");
    // Key names are preserved; values are masked.
    const [httpServer, stdioServer] = result.settings.mcpServers;
    expect(httpServer?.transport.headers).toEqual({
      Authorization: "«redacted»",
      "X-Api-Key": "«redacted»",
    });
    expect(stdioServer?.transport.env).toEqual({ SERVICE_TOKEN: "«redacted»" });
  });

  it("get_settings masks secret-shaped stdio args and URL query values", async () => {
    const { ctx } = context({ settings: settingsWithSecret() });
    const result = (await dispatchTool("get_settings", {}, ctx)) as {
      settings: { mcpServers: Array<{ transport: Record<string, unknown> }> };
    };
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("arg-secret-value");
    expect(serialized).not.toContain("url-secret-value");
    const [httpServer, stdioServer] = result.settings.mcpServers;
    expect(httpServer?.transport.url).toBe(
      "https://example.test/mcp?token=«redacted»&v=«redacted»",
    );
    expect(stdioServer?.transport.args).toEqual(["--api-key=«redacted»", "--verbose"]);
  });

  it("get_settings section=mcpServers returns the same redacted servers", async () => {
    const { ctx } = context({ settings: settingsWithSecret() });
    const result = (await dispatchTool("get_settings", { section: "mcpServers" }, ctx)) as {
      section: string;
      value: Array<{ transport: Record<string, unknown> }>;
    };
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("http-secret-token");
    expect(serialized).not.toContain("stdio-secret-env");
    expect(result.value[0]?.transport.headers).toEqual({
      Authorization: "«redacted»",
      "X-Api-Key": "«redacted»",
    });
    expect(result.value[1]?.transport.env).toEqual({ SERVICE_TOKEN: "«redacted»" });
  });

  it("get_settings returns a single named section", async () => {
    const { ctx } = context({ settings: settingsWithSecret() });
    const result = (await dispatchTool("get_settings", { section: "themeMode" }, ctx)) as {
      section: string;
      value: unknown;
    };
    expect(result.section).toBe("themeMode");
    expect(result.value).toBe("light");
  });

  it("update_settings refuses secret-bearing fields", async () => {
    const { ctx, settingsWrite } = context({ settings: settingsWithSecret() });
    await expect(
      dispatchTool("update_settings", { patch: { agentInstances: {} } }, ctx),
    ).rejects.toThrow(/managed elsewhere/);
    expect(settingsWrite).not.toHaveBeenCalled();
  });

  it("update_settings refuses sensitive agent settings", async () => {
    const { ctx, settingsWrite } = context({ settings: settingsWithSecret() });
    await expect(
      dispatchTool(
        "update_settings",
        {
          patch: { agentSettings: { cursor: { sdkApiKey: "replacement" } } },
        },
        ctx,
      ),
    ).rejects.toThrow(/cursor\.sdkApiKey/);
    expect(settingsWrite).not.toHaveBeenCalled();
  });

  it("update_settings refuses mcpServers and points to the dedicated tools", async () => {
    const { ctx, settingsWrite } = context({ settings: settingsWithSecret() });
    await expect(
      dispatchTool("update_settings", { patch: { mcpServers: [] } }, ctx),
    ).rejects.toThrow(/add_mcp_server, update_mcp_server, and remove_mcp_server/);
    expect(settingsWrite).not.toHaveBeenCalled();
  });

  it("update_settings deep-merges and preserves supervisor-managed fields", async () => {
    const { ctx, settingsWrite } = context({ settings: settingsWithSecret() });
    await dispatchTool(
      "update_settings",
      { patch: { themeMode: "dark", notificationStatuses: { error: false } } },
      ctx,
    );
    expect(settingsWrite).toHaveBeenCalledTimes(1);
    const written = settingsWrite.mock.calls[0]![0];
    // Patched field applied.
    expect(written.themeMode).toBe("dark");
    // Deep-merge kept sibling keys of the nested object.
    expect(written.notificationStatuses).toEqual({
      done: true,
      needsAttention: true,
      error: false,
    });
    // Guard preserved supervisor-managed instances + encrypted env from disk.
    expect(written.agentInstances.acpAgent).toBeDefined();
    expect(written.agentInstances.claudeProfile?.environment?.ANTHROPIC_API_KEY?.value).toBe(
      "enc:super-secret-token",
    );
    expect(Object.keys(written.acpRegistryInstalledAgents)).toEqual(["registryAgent"]);
  });
});

describe("Poracode app control tools — usage", () => {
  it("passes providerId through and honors refresh", async () => {
    const usageResponse = { snapshots: [{ providerId: "claude" } as never], fromCache: false };
    const { ctx, supervisor } = context({ usageResponse });
    const result = (await dispatchTool(
      "get_usage",
      { providerId: "claude", refresh: true },
      ctx,
    )) as { fromCache: boolean; count: number };
    expect(supervisor.refreshProviderUsage).toHaveBeenCalledWith({ providerIds: ["claude"] });
    expect(supervisor.getProviderUsage).not.toHaveBeenCalled();
    expect(result.count).toBe(1);
    expect(result.fromCache).toBe(false);
  });

  it("reads cached usage for all providers by default", async () => {
    const { ctx, supervisor } = context();
    await dispatchTool("get_usage", {}, ctx);
    expect(supervisor.getProviderUsage).toHaveBeenCalledWith({});
    expect(supervisor.refreshProviderUsage).not.toHaveBeenCalled();
  });
});

describe("Poracode app control tools — search", () => {
  const projects = [
    { id: "p1", name: "Alpha", location: { kind: "posix", path: "/work/alpha" } } as Project,
  ];

  it("scopes threads + projects by default and skips files without a projectId", async () => {
    const threads = [
      makeThread({ id: "a", title: "Fix the flaky login test" }),
      makeThread({ id: "b", title: "Unrelated" }),
    ];
    const { ctx, supervisor } = context({ threads, projects });
    const result = (await dispatchTool("search", { query: "login" }, ctx)) as {
      threads: Array<{ threadId: string }>;
      projects: unknown[];
      files?: unknown;
    };
    expect(result.threads.map((t) => t.threadId)).toEqual(["a"]);
    expect(result.files).toBeUndefined();
    expect(supervisor.searchProjectFiles).not.toHaveBeenCalled();
  });

  it("file scope requires a projectId", async () => {
    const { ctx } = context({ projects });
    await expect(dispatchTool("search", { query: "x", scope: "files" }, ctx)).rejects.toThrow(
      /projectId is required/,
    );
  });

  it("file scope calls the supervisor with the project location", async () => {
    const fileSearchResult = {
      entries: [{ path: "src/a.ts", name: "a.ts", type: "file" as const }],
      totalIndexed: 42,
    };
    const { ctx, supervisor } = context({ projects, fileSearchResult });
    const result = (await dispatchTool(
      "search",
      { query: "a.ts", scope: "files", projectId: "p1" },
      ctx,
    )) as { files: { count: number; totalIndexed: number } };
    expect(supervisor.searchProjectFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        projectLocation: { kind: "posix", path: "/work/alpha" },
        query: "a.ts",
      }),
    );
    expect(result.files.count).toBe(1);
    expect(result.files.totalIndexed).toBe(42);
  });
});

describe("Poracode app control tools — app", () => {
  it("reports read-only app facts without secrets", async () => {
    const projects = [
      { id: "p1", name: "Alpha", location: { kind: "posix", path: "/work/alpha" } } as Project,
    ];
    const threads = [makeThread({ id: "a", archived: false, done: false })];
    const { ctx } = context({
      projects,
      threads,
      appInfo: { version: "1.2.3", platform: "linux", hasRendererWindow: false },
    });
    const result = (await dispatchTool("get_app_info", {}, ctx)) as {
      version: string;
      platform: string;
      renderer: string;
      projectCount: number;
      threadCount: number;
      mcpServer: { name: string; version: string };
    };
    expect(result.version).toBe("1.2.3");
    expect(result.platform).toBe("linux");
    expect(result.renderer).toBe("headless");
    expect(result.projectCount).toBe(1);
    expect(result.threadCount).toBe(1);
    expect(result.mcpServer.name).toBe("poracode");
  });

  it("notify_user reports non-delivery when no display is connected", async () => {
    const { ctx, notifyUser } = context({ notificationDelivered: false });
    const result = (await dispatchTool("notify_user", { title: "Done", body: "Ready" }, ctx)) as {
      delivered: boolean;
      note?: string;
    };
    expect(notifyUser).toHaveBeenCalledWith({ title: "Done", body: "Ready", threadId: "thread-1" });
    expect(result.delivered).toBe(false);
    expect(result.note).toMatch(/No display/);
  });

  it("check_for_update returns the update-check result from the context", async () => {
    const { ctx, checkForUpdate } = context();
    const result = (await dispatchTool("check_for_update", {}, ctx)) as {
      supported: boolean;
      currentVersion?: string;
    };
    expect(checkForUpdate).toHaveBeenCalled();
    expect(result.supported).toBe(true);
    expect(result.currentVersion).toBe("9.9.9");
  });
});

describe("Poracode app control tools — terminal / steer / rollback", () => {
  it("read_terminal returns the tail and flags truncation", async () => {
    const scrollback = "x".repeat(60_000);
    const threads = [makeThread({ id: "a" })];
    const { ctx } = context({ threads, scrollback });
    const result = (await dispatchTool("read_terminal", { threadId: "a" }, ctx)) as {
      text: string;
      truncated?: boolean;
      length: number;
    };
    expect(result.truncated).toBe(true);
    expect(result.length).toBe(50_000);
    expect(result.text.length).toBe(50_000);
  });

  it("read_terminal notes when the thread has no live terminal session", async () => {
    const threads = [makeThread({ id: "a" })];
    const { ctx } = context({ threads, scrollback: "" });
    const result = (await dispatchTool("read_terminal", { threadId: "a" }, ctx)) as {
      note?: string;
      text?: string;
    };
    expect(result.text).toBeUndefined();
    expect(result.note).toMatch(/no live terminal session/);
  });

  it("steer_thread queues guidance with the thread's config", async () => {
    const threads = [makeThread({ id: "a", config: { model: "gpt-5.6" } })];
    const { ctx, supervisor } = context({ threads });
    await dispatchTool("steer_thread", { threadId: "a", prompt: "focus on tests" }, ctx);
    expect(supervisor.setPendingSteer).toHaveBeenCalledWith({
      threadId: "a",
      prompt: "focus on tests",
      config: { model: "gpt-5.6" },
    });
  });

  it("steer_thread clears the pending steer when clear is set", async () => {
    const threads = [makeThread({ id: "a" })];
    const { ctx, supervisor } = context({ threads });
    await dispatchTool("steer_thread", { threadId: "a", clear: true }, ctx);
    expect(supervisor.clearPendingSteer).toHaveBeenCalledWith({ threadId: "a" });
    expect(supervisor.setPendingSteer).not.toHaveBeenCalled();
  });

  it("steer_thread refuses the calling thread", async () => {
    const threads = [makeThread({ id: "thread-1" })];
    const { ctx } = context({ threads });
    await expect(
      dispatchTool("steer_thread", { threadId: "thread-1", prompt: "x" }, ctx),
    ).rejects.toThrow(/your own thread/);
  });

  it("stage_thread_input types into the composer without submitting", async () => {
    const threads = [makeThread({ id: "a" })];
    const { ctx, supervisor } = context({ threads });
    const result = (await dispatchTool(
      "stage_thread_input",
      { threadId: "a", prompt: "draft text" },
      ctx,
    )) as { staged: boolean };
    expect(supervisor.stageThreadInput).toHaveBeenCalledWith({
      threadId: "a",
      prompt: "draft text",
    });
    expect(result.staged).toBe(true);
  });

  it("rollback_thread refuses the calling thread", async () => {
    const threads = [makeThread({ id: "thread-1" })];
    const { ctx } = context({ threads });
    await expect(
      dispatchTool("rollback_thread", { threadId: "thread-1", numTurns: 2 }, ctx),
    ).rejects.toThrow(/your own thread/);
  });

  it("rollback_thread discards the requested turns with the thread config", async () => {
    const threads = [makeThread({ id: "a", config: { model: "gpt-5.6" } })];
    const { ctx, supervisor } = context({ threads });
    await dispatchTool("rollback_thread", { threadId: "a", numTurns: 3 }, ctx);
    expect(supervisor.rollbackThreadConversation).toHaveBeenCalledWith({
      threadId: "a",
      numTurns: 3,
      config: { model: "gpt-5.6" },
    });
  });
});

describe("Poracode app control tools — agents", () => {
  it("list_installed_agents projects native + WSL inventory and passes project distros", async () => {
    const projects = [
      { id: "p1", name: "Alpha", location: { kind: "wsl", distro: "Ubuntu" } } as Project,
    ];
    const agentStatuses: AgentStatusesResponse = {
      windows: [
        {
          kind: "codex",
          label: "Codex",
          installed: true,
          version: "1.2.3",
          authState: "authenticated",
          capabilities: {} as never,
        } as never,
      ],
      wsl: [],
      fromCache: true,
    };
    const { ctx, supervisor } = context({ projects, agentStatuses });
    const result = (await dispatchTool("list_installed_agents", {}, ctx)) as {
      fromCache: boolean;
      native?: Array<{ kind: string; version?: string }>;
    };
    expect(supervisor.getAgentStatuses).toHaveBeenCalledWith({ wslDistros: ["Ubuntu"] });
    expect(result.fromCache).toBe(true);
    expect(result.native?.[0]?.kind).toBe("codex");
    expect(result.native?.[0]?.version).toBe("1.2.3");
  });

  it("list_installed_agents refresh forces a fresh detection sweep", async () => {
    const { ctx, supervisor } = context();
    await dispatchTool("list_installed_agents", { refresh: true }, ctx);
    expect(supervisor.refreshAgentStatuses).toHaveBeenCalled();
    expect(supervisor.getAgentStatuses).not.toHaveBeenCalled();
  });
});

describe("Poracode app control tools — files", () => {
  const projects = [
    { id: "p1", name: "Alpha", location: { kind: "posix", path: "/work/alpha" } } as Project,
  ];

  it("list_project_files lists one directory level for a project", async () => {
    const projectTree: ListProjectTreeResult = {
      directoryPath: "src",
      entries: [{ path: "src/a.ts", name: "a.ts", type: "file" }],
    };
    const { ctx, supervisor } = context({ projects, projectTree });
    const result = (await dispatchTool(
      "list_project_files",
      { projectId: "p1", directoryPath: "src" },
      ctx,
    )) as { count: number; entries: Array<{ path: string }> };
    expect(supervisor.listProjectTree).toHaveBeenCalledWith({
      projectLocation: { kind: "posix", path: "/work/alpha" },
      directoryPath: "src",
    });
    expect(result.count).toBe(1);
    expect(result.entries[0]?.path).toBe("src/a.ts");
  });

  it("read_project_file truncates long content and flags it", async () => {
    const readFile: ReadProjectFileResult = {
      path: "big.txt",
      status: "ready",
      modifiedAtMs: 0,
      content: "y".repeat(120_000),
    };
    const { ctx } = context({ projects, readFile });
    const result = (await dispatchTool(
      "read_project_file",
      { projectId: "p1", path: "big.txt" },
      ctx,
    )) as { content: string; truncated?: boolean };
    expect(result.truncated).toBe(true);
    expect(result.content.length).toBe(100_000);
  });

  it("read_project_file returns a status note for binary files", async () => {
    const readFile: ReadProjectFileResult = { path: "logo.png", status: "binary", modifiedAtMs: 0 };
    const { ctx } = context({ projects, readFile });
    const result = (await dispatchTool(
      "read_project_file",
      { projectId: "p1", path: "logo.png" },
      ctx,
    )) as { status: string; content?: string; note?: string };
    expect(result.status).toBe("binary");
    expect(result.content).toBeUndefined();
    expect(result.note).toMatch(/binary/);
  });

  it("read_project_file reads from a worktree when worktreePath is given", async () => {
    const readFile: ReadProjectFileResult = {
      path: "a.ts",
      status: "ready",
      modifiedAtMs: 0,
      content: "ok",
    };
    const worktrees: GitWorktreeInfo[] = [
      {
        path: "/work/alpha/.poracode/worktrees/wt",
        branch: "feature/x",
        commit: "a".repeat(40),
        isMain: false,
      },
    ];
    const { ctx, supervisor } = context({ projects, readFile, worktrees });
    await dispatchTool(
      "read_project_file",
      { projectId: "p1", path: "a.ts", worktreePath: "/work/alpha/.poracode/worktrees/wt" },
      ctx,
    );
    expect(supervisor.readProjectFile).toHaveBeenCalledWith({
      projectLocation: { kind: "posix", path: "/work/alpha/.poracode/worktrees/wt" },
      path: "a.ts",
    });
  });

  it("read_project_file rejects a worktreePath outside the project's worktree set", async () => {
    const { ctx } = context({ projects, worktrees: [] });
    await expect(
      dispatchTool(
        "read_project_file",
        { projectId: "p1", path: "a.ts", worktreePath: "/somewhere/else" },
        ctx,
      ),
    ).rejects.toThrow(/No worktree found/);
  });

  it("find_files fuzzy-searches filenames with the default limit", async () => {
    const searchTree: SearchProjectTreeResult = {
      entries: [{ path: "src/a.ts", name: "a.ts", type: "file" }],
    };
    const { ctx, supervisor } = context({ projects, searchTree });
    const result = (await dispatchTool("find_files", { projectId: "p1", query: "a.ts" }, ctx)) as {
      count: number;
    };
    expect(supervisor.searchProjectTree).toHaveBeenCalledWith({
      projectLocation: { kind: "posix", path: "/work/alpha" },
      query: "a.ts",
      limit: 30,
    });
    expect(result.count).toBe(1);
  });

  it("file tools reject an unknown projectId", async () => {
    const { ctx } = context({ projects });
    await expect(dispatchTool("list_project_files", { projectId: "missing" }, ctx)).rejects.toThrow(
      /Project not found/,
    );
  });
});

describe("Poracode app control tools — git", () => {
  const projects = [
    { id: "p1", name: "Alpha", location: { kind: "posix", path: "/work/alpha" } } as Project,
  ];

  it("git_status returns the combined project snapshot", async () => {
    const gitSnapshot: GitProjectSnapshotResult = {
      status: null,
      branches: { current: "main", branches: [] },
      worktrees: [],
      ghAvailable: null,
    };
    const { ctx, supervisor } = context({ projects, gitSnapshot });
    const result = (await dispatchTool("git_status", { projectId: "p1" }, ctx)) as {
      snapshot: GitProjectSnapshotResult;
    };
    expect(supervisor.gitProjectSnapshot).toHaveBeenCalledWith({
      projectLocation: { kind: "posix", path: "/work/alpha" },
      includeGhCheck: false,
    });
    expect(result.snapshot.branches?.current).toBe("main");
  });

  it("git_discard requires exactly one of paths or all", async () => {
    const { ctx, supervisor } = context({ projects });
    await expect(dispatchTool("git_discard", { projectId: "p1" }, ctx)).rejects.toThrow(
      /exactly one of paths or all/,
    );
    await expect(
      dispatchTool("git_discard", { projectId: "p1", all: true, paths: ["a.ts"] }, ctx),
    ).rejects.toThrow(/exactly one of paths or all/);
    expect(supervisor.gitRevertAll).not.toHaveBeenCalled();
    expect(supervisor.gitRevert).not.toHaveBeenCalled();
  });

  it("git_discard all reverts every change; paths reverts each file", async () => {
    const { ctx, supervisor } = context({ projects });
    await dispatchTool("git_discard", { projectId: "p1", all: true }, ctx);
    expect(supervisor.gitRevertAll).toHaveBeenCalledWith({
      projectLocation: { kind: "posix", path: "/work/alpha" },
    });
    await dispatchTool("git_discard", { projectId: "p1", paths: ["a.ts", "b.ts"] }, ctx);
    expect(supervisor.gitRevert).toHaveBeenCalledTimes(2);
    expect(supervisor.gitRevert).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: "a.ts" }),
    );
  });

  it("git_status resolves a worktree location when worktreePath is given", async () => {
    const worktrees: GitWorktreeInfo[] = [
      {
        path: "/work/alpha/.poracode/worktrees/wt",
        branch: "feature/x",
        commit: "a".repeat(40),
        isMain: false,
      },
    ];
    const { ctx, supervisor } = context({ projects, worktrees });
    await dispatchTool(
      "git_status",
      { projectId: "p1", worktreePath: "/work/alpha/.poracode/worktrees/wt" },
      ctx,
    );
    expect(supervisor.gitProjectSnapshot).toHaveBeenCalledWith({
      projectLocation: { kind: "posix", path: "/work/alpha/.poracode/worktrees/wt" },
      includeGhCheck: false,
    });
  });

  it("git tools reject a worktreePath that is not one of the project's worktrees", async () => {
    const { ctx, supervisor } = context({ projects, worktrees: [] });
    await expect(
      dispatchTool(
        "git_discard",
        { projectId: "p1", worktreePath: "/somewhere/else", all: true },
        ctx,
      ),
    ).rejects.toThrow(/No worktree found/);
    expect(supervisor.gitRevertAll).not.toHaveBeenCalled();
  });

  it("remove_worktree refuses while an open thread references it, listing the blockers", async () => {
    const worktreePath = "/work/alpha/.poracode/worktrees/wt";
    const threads = [makeThread({ id: "blk", worktreePath, archived: false })];
    const { ctx, supervisor } = context({ projects, threads });
    await expect(
      dispatchTool("remove_worktree", { projectId: "p1", worktreePath }, ctx),
    ).rejects.toThrow(/blk/);
    expect(supervisor.gitRemoveWorktree).not.toHaveBeenCalled();
  });

  it("remove_worktree proceeds when only archived threads reference it", async () => {
    const worktreePath = "/work/alpha/.poracode/worktrees/wt";
    const threads = [makeThread({ id: "old", worktreePath, archived: true })];
    const { ctx, supervisor } = context({ projects, threads });
    await dispatchTool("remove_worktree", { projectId: "p1", worktreePath }, ctx);
    expect(supervisor.gitRemoveWorktree).toHaveBeenCalledWith({
      projectLocation: { kind: "posix", path: "/work/alpha" },
      path: worktreePath,
      force: false,
      deleteBranch: false,
    });
  });

  it("merge_worktree resolves the worktree branch, source branch, and expected commit", async () => {
    const worktreePath = "/work/alpha/.poracode/worktrees/wt";
    const worktrees: GitWorktreeInfo[] = [
      { path: worktreePath, branch: "feature/x", commit: "a".repeat(40), isMain: false },
    ];
    const { ctx, supervisor } = context({ projects, worktrees, sourceBranch: "develop" });
    await dispatchTool("merge_worktree", { projectId: "p1", worktreePath, action: "merge" }, ctx);
    expect(supervisor.gitGetWorktreeSourceBranch).toHaveBeenCalledWith({
      projectLocation: { kind: "posix", path: "/work/alpha" },
      branch: "feature/x",
    });
    expect(supervisor.gitMergeToSource).toHaveBeenCalledWith({
      projectLocation: { kind: "posix", path: "/work/alpha" },
      worktreeLocation: { kind: "posix", path: worktreePath },
      worktreeBranch: "feature/x",
      sourceBranch: "develop",
      expectedWorktreeCommit: "a".repeat(40),
    });
  });

  it("merge_worktree abort skips source-branch resolution", async () => {
    const worktreePath = "/work/alpha/.poracode/worktrees/wt";
    const { ctx, supervisor } = context({ projects });
    await dispatchTool("merge_worktree", { projectId: "p1", worktreePath, action: "abort" }, ctx);
    expect(supervisor.gitAbortMerge).toHaveBeenCalledWith({
      worktreeLocation: { kind: "posix", path: worktreePath },
    });
    expect(supervisor.gitGetWorktreeSourceBranch).not.toHaveBeenCalled();
  });
});

describe("Poracode app control tools — github", () => {
  const projects = [
    { id: "p1", name: "Alpha", location: { kind: "posix", path: "/work/alpha" } } as Project,
  ];

  it("gh_get_pr resolves checks by the PR head branch and caps the diff", async () => {
    const prDetails = {
      number: 7,
      title: "PR",
      body: "",
      baseBranch: "main",
      headBranch: "feature/x",
      additions: 0,
      deletions: 0,
      changedFiles: 0,
      commits: [],
      comments: [],
      reviews: [],
      checks: [],
    } as PrDetails;
    const { ctx, supervisor } = context({
      projects,
      prDetails,
      prDiff: "z".repeat(90_000),
    });
    const result = (await dispatchTool(
      "gh_get_pr",
      { projectId: "p1", prNumber: 7, include: ["details", "checks", "diff"] },
      ctx,
    )) as { diff: string; diffTruncated?: boolean; checks: unknown };
    expect(supervisor.ghGetPrChecks).toHaveBeenCalledWith({
      projectLocation: { kind: "posix", path: "/work/alpha" },
      branch: "feature/x",
    });
    expect(result.diffTruncated).toBe(true);
    expect(result.diff.length).toBe(80_000);
  });

  it("github tools fail clearly when the gh CLI is unavailable", async () => {
    const { ctx, supervisor } = context({ projects, ghAvailable: false });
    await expect(dispatchTool("gh_list_prs", { projectId: "p1" }, ctx)).rejects.toThrow(
      /gh.*not available|not available.*gh/i,
    );
    expect(supervisor.ghListPullRequests).not.toHaveBeenCalled();
  });

  it("gh_create_pr can run from a worktree checkout", async () => {
    const worktrees: GitWorktreeInfo[] = [
      {
        path: "/work/alpha/.poracode/worktrees/wt",
        branch: "feature/x",
        commit: "a".repeat(40),
        isMain: false,
      },
    ];
    const { ctx, supervisor } = context({ projects, worktrees });
    await dispatchTool(
      "gh_create_pr",
      {
        projectId: "p1",
        worktreePath: "/work/alpha/.poracode/worktrees/wt",
        branch: "feature/x",
        title: "New",
        body: "Body",
      },
      ctx,
    );
    expect(supervisor.ghCreatePr).toHaveBeenCalledWith(
      expect.objectContaining({
        projectLocation: { kind: "posix", path: "/work/alpha/.poracode/worktrees/wt" },
        branch: "feature/x",
      }),
    );
  });

  it("gh_create_pr rejects a worktreePath outside the project's worktree set", async () => {
    const { ctx, supervisor } = context({ projects, worktrees: [] });
    await expect(
      dispatchTool(
        "gh_create_pr",
        {
          projectId: "p1",
          worktreePath: "/somewhere/else",
          branch: "feature/x",
          title: "New",
          body: "Body",
        },
        ctx,
      ),
    ).rejects.toThrow(/No worktree found/);
    expect(supervisor.ghCreatePr).not.toHaveBeenCalled();
  });
});

describe("Poracode app control tools — mcp servers", () => {
  function settingsWithMcpSecret(): SharedSettings {
    return {
      ...defaultSharedSettings,
      mcpServers: [
        {
          id: "http-server",
          name: "remote-api",
          description: "",
          enabled: true,
          timeoutMs: 30_000,
          transport: {
            type: "http",
            url: "https://example.test/mcp",
            headers: { Authorization: "Bearer http-secret-token" },
          },
        },
      ],
    };
  }

  it("list_mcp_servers redacts transport secrets and reports OAuth status", async () => {
    const { ctx } = context({
      settings: settingsWithMcpSecret(),
      authenticatedUrls: ["https://example.test/mcp"],
    });
    const result = (await dispatchTool("list_mcp_servers", {}, ctx)) as {
      servers: Array<{ transport: { headers?: Record<string, string> }; authenticated?: boolean }>;
    };
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("http-secret-token");
    expect(result.servers[0]?.transport.headers).toEqual({ Authorization: "«redacted»" });
    expect(result.servers[0]?.authenticated).toBe(true);
  });

  it("probe_mcp_server never echoes back submitted secret header values", async () => {
    const { ctx, supervisor } = context({});
    const result = (await dispatchTool(
      "probe_mcp_server",
      {
        config: {
          id: "candidate",
          name: "candidate-server",
          transport: {
            type: "http",
            url: "https://probe.test/mcp",
            headers: { Authorization: "Bearer probe-secret-token" },
          },
        },
      },
      ctx,
    )) as { server: { transport: { headers?: Record<string, string> } }; result: unknown };
    // The supervisor receives the real config (to actually connect)...
    expect(supervisor.probeMcpServer).toHaveBeenCalledWith(
      expect.objectContaining({
        server: expect.objectContaining({
          transport: expect.objectContaining({
            headers: { Authorization: "Bearer probe-secret-token" },
          }),
        }),
      }),
    );
    // ...but the tool result never echoes the secret back.
    expect(JSON.stringify(result)).not.toContain("probe-secret-token");
    expect(result.server.transport.headers).toEqual({ Authorization: "«redacted»" });
  });

  it("probe_mcp_server rejects an invalid candidate config", async () => {
    const { ctx } = context({});
    await expect(dispatchTool("probe_mcp_server", { config: { name: "x" } }, ctx)).rejects.toThrow(
      /Invalid MCP server config/,
    );
  });

  it("add_mcp_server generates an id, appends, and returns a redacted summary", async () => {
    const { ctx, settingsWrite, supervisor } = context({});
    const result = (await dispatchTool(
      "add_mcp_server",
      {
        server: {
          name: "my-tool",
          transport: { type: "stdio", command: "run-tool", args: [], env: {} },
        },
        reloadCallingThread: true,
      },
      ctx,
    )) as { added: boolean; server: { id: string; name: string }; reloadedCallingThread: boolean };

    expect(result.added).toBe(true);
    expect(result.server.name).toBe("my-tool");
    expect(result.server.id).toMatch(/[0-9a-f-]{36}/);
    const written = settingsWrite.mock.calls[0]![0];
    expect(written.mcpServers.map((s) => s.name)).toEqual(["my-tool"]);
    // reloadCallingThread hot-reloads the calling thread's provider sessions.
    expect(result.reloadedCallingThread).toBe(true);
    expect(supervisor.reloadAgentMcpServers).toHaveBeenCalledWith({ agentKind: "codex" });
  });

  it("add_mcp_server rejects a duplicate server name", async () => {
    const { ctx, settingsWrite } = context({ settings: settingsWithMcpSecret() });
    await expect(
      dispatchTool(
        "add_mcp_server",
        {
          server: {
            name: "Remote-API",
            transport: { type: "stdio", command: "run", args: [], env: {} },
          },
        },
        ctx,
      ),
    ).rejects.toThrow(/already exists/);
    expect(settingsWrite).not.toHaveBeenCalled();
  });

  it("add_mcp_server rejects a name reserved by a built-in server", async () => {
    const { ctx, settingsWrite } = context({});
    await expect(
      dispatchTool(
        "add_mcp_server",
        {
          server: {
            name: "poracode",
            transport: { type: "stdio", command: "run", args: [], env: {} },
          },
        },
        ctx,
      ),
    ).rejects.toThrow(/reserved/);
    expect(settingsWrite).not.toHaveBeenCalled();
  });

  it("update_mcp_server preserves the stored secret when the patch echoes «redacted»", async () => {
    const { ctx, settingsWrite } = context({ settings: settingsWithMcpSecret() });
    const result = (await dispatchTool(
      "update_mcp_server",
      {
        id: "http-server",
        patch: {
          description: "renamed desc",
          transport: {
            type: "http",
            url: "https://example.test/mcp",
            headers: { Authorization: "«redacted»" },
          },
        },
      },
      ctx,
    )) as { updated: boolean; server: { transport: { headers?: Record<string, string> } } };

    expect(result.updated).toBe(true);
    // The stored settings retain the ORIGINAL secret, not the «redacted» marker.
    const written = settingsWrite.mock.calls[0]![0];
    const stored = written.mcpServers.find((s) => s.id === "http-server");
    expect(stored?.transport).toMatchObject({
      type: "http",
      headers: { Authorization: "Bearer http-secret-token" },
    });
    expect(stored?.description).toBe("renamed desc");
    // The returned summary re-redacts the preserved secret.
    expect(JSON.stringify(result)).not.toContain("http-secret-token");
    expect(result.server.transport.headers).toEqual({ Authorization: "«redacted»" });
  });

  it("update_mcp_server toggles enabled as a one-field patch", async () => {
    const { ctx, settingsWrite } = context({ settings: settingsWithMcpSecret() });
    await dispatchTool("update_mcp_server", { id: "http-server", patch: { enabled: false } }, ctx);
    const written = settingsWrite.mock.calls[0]![0];
    const stored = written.mcpServers.find((s) => s.id === "http-server");
    expect(stored?.enabled).toBe(false);
    // Untouched transport secret is preserved.
    expect(stored?.transport).toMatchObject({
      type: "http",
      headers: { Authorization: "Bearer http-secret-token" },
    });
  });

  it("remove_mcp_server errors on an unknown id", async () => {
    const { ctx, settingsWrite } = context({ settings: settingsWithMcpSecret() });
    await expect(dispatchTool("remove_mcp_server", { id: "does-not-exist" }, ctx)).rejects.toThrow(
      /Unknown MCP server id/,
    );
    expect(settingsWrite).not.toHaveBeenCalled();
  });

  it("remove_mcp_server deletes the server by id", async () => {
    const { ctx, settingsWrite } = context({ settings: settingsWithMcpSecret() });
    const result = (await dispatchTool("remove_mcp_server", { id: "http-server" }, ctx)) as {
      removed: boolean;
    };
    expect(result.removed).toBe(true);
    const written = settingsWrite.mock.calls[0]![0];
    expect(written.mcpServers).toEqual([]);
  });
});

describe("Poracode app control tools — skills", () => {
  const projects = [
    { id: "p1", name: "Alpha", location: { kind: "posix", path: "/work/alpha" } } as Project,
  ];

  it("list_skills groups global and project scopes", async () => {
    const skillScan: SkillScanResult = {
      skills: [
        {
          id: "g1",
          name: "Global Skill",
          description: "",
          folderName: "g1",
          absolutePath: "/skills/g1",
          skillFilePath: "/skills/g1/SKILL.md",
          rootPath: "/skills",
          providerId: "claude",
          providerLabel: "Claude",
          scope: "global",
          scopeLabel: "Global",
          origin: "external",
          enabled: true,
          mutable: true,
          valid: true,
          linked: false,
        },
        {
          id: "p1s",
          name: "Project Skill",
          description: "",
          folderName: "p1s",
          absolutePath: "/work/alpha/.skills/p1s",
          skillFilePath: "/work/alpha/.skills/p1s/SKILL.md",
          rootPath: "/work/alpha/.skills",
          providerId: "claude",
          providerLabel: "Claude",
          scope: "project",
          scopeLabel: "Project",
          origin: "external",
          enabled: false,
          mutable: true,
          valid: true,
          linked: false,
        },
      ] as SkillScanResult["skills"],
      effectiveSkillIds: ["g1"],
      invocation: "slash",
      issues: [],
      canLinkToGlobal: true,
    };
    const { ctx, supervisor } = context({ projects, skillScan });
    const result = (await dispatchTool("list_skills", { projectId: "p1" }, ctx)) as {
      global: Array<{ id: string }>;
      project: Array<{ id: string }>;
    };
    expect(supervisor.scanSkills).toHaveBeenCalledWith({
      projectLocation: { kind: "posix", path: "/work/alpha" },
    });
    expect(result.global.map((s) => s.id)).toEqual(["g1"]);
    expect(result.project.map((s) => s.id)).toEqual(["p1s"]);
  });

  it("set_skill_enabled toggles by absolutePath", async () => {
    const { ctx, supervisor } = context({ projects });
    await dispatchTool("set_skill_enabled", { absolutePath: "/skills/g1", enabled: false }, ctx);
    expect(supervisor.setSkillEnabled).toHaveBeenCalledWith({
      absolutePath: "/skills/g1",
      enabled: false,
    });
  });
});
