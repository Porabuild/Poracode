import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AgentStatusesResponse,
  CloseThreadPayload,
  InterruptThreadPayload,
  ListProjectTreeResult,
  McpProbeResult,
  PrData,
  Project,
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
  StartThreadPayload,
  StartThreadResult,
  TerminalShellSnapshot,
  Thread,
  ThreadRuntimeSnapshot,
} from "@/shared/contracts";
import type { RemoteProjectCommand, RemoteProjectCommandResult } from "@/shared/remote";
import { defaultSharedSettings } from "@/shared/settings";
import type { ScheduleService } from "../schedules/ScheduleService";
import type { CreateAppThreadRequest, CreateAppThreadResult } from "../threads/appThreadLauncher";
import { AppControlsMcpIngress, type AppControlsMcpIngressDeps } from "./AppControlsMcpIngress";

type SC = AppControlsMcpIngressDeps["supervisor"];

let ingress: AppControlsMcpIngress | null = null;

afterEach(() => {
  ingress?.dispose();
  ingress = null;
});

const thread = {
  id: "thread-1",
  projectId: "project-1",
  title: "Caller",
  agentKind: "codex",
  config: { model: "gpt-5.6", effort: "high" },
  status: "working",
  attention: "none",
  presentationMode: "gui",
  archived: false,
  done: false,
  starred: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as Thread;

function deps(overrides: Partial<AppControlsMcpIngressDeps> = {}): AppControlsMcpIngressDeps {
  return {
    scheduleService: {
      list: vi.fn<() => ScheduledTask[]>(() => []),
      create: vi.fn<(input: ScheduledTaskInput) => ScheduledTask>(
        (input) => ({ id: "created", ...input }) as ScheduledTask,
      ),
    } as unknown as ScheduleService,
    getThread: (id) => (id === thread.id ? thread : null),
    getThreads: () => [thread],
    getProjects: () => [{ id: "project-1", name: "Alpha" } as Project],
    getProject: (id) => (id === "project-1" ? ({ id, name: "Alpha" } as Project) : null),
    getProjectNotes: () => null,
    directoryExists: () => true,
    applyProjectCommand: vi.fn<
      (command: RemoteProjectCommand) => Promise<RemoteProjectCommandResult>
    >(async () => ({ projects: [] })),
    updateProject: vi.fn<(project: Project) => void>(),
    settings: {
      read: () => defaultSharedSettings,
      write: vi.fn<(next: typeof defaultSharedSettings) => void>(),
    },
    getAppInfo: () => ({ version: "0.0.0-test", platform: "linux", hasRendererWindow: false }),
    supervisor: {
      getThreadSnapshots: vi.fn<() => Promise<ThreadRuntimeSnapshot[]>>(async () => [
        { threadId: "thread-1", status: "working", attention: "none", canResumeWithConfig: false },
      ]),
      getTerminalShellSnapshots: vi.fn<() => Promise<TerminalShellSnapshot[]>>(async () => []),
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
        async () => ({ snapshots: [], fromCache: true }),
      ),
      refreshProviderUsage: vi.fn<
        (payload: ProviderUsagePayload) => Promise<ProviderUsageResponse>
      >(async () => ({ snapshots: [], fromCache: false })),
      searchProjectFiles: vi.fn<
        (payload: SearchProjectFilesPayload) => Promise<SearchProjectFilesResult>
      >(async () => ({ entries: [], totalIndexed: 0 })),
      readTerminalScrollback: vi.fn<() => Promise<string>>(async () => ""),
      setPendingSteer: vi.fn<() => Promise<void>>(async () => undefined),
      clearPendingSteer: vi.fn<() => Promise<void>>(async () => undefined),
      stageThreadInput: vi.fn<() => Promise<void>>(async () => undefined),
      rollbackThreadConversation: vi.fn<() => Promise<void>>(async () => undefined),
      getAgentStatuses: vi.fn<() => Promise<AgentStatusesResponse>>(async () => ({
        windows: [],
        wsl: [],
        fromCache: true,
      })),
      refreshAgentStatuses: vi.fn<() => Promise<AgentStatusesResponse>>(async () => ({
        windows: [],
        wsl: [],
        fromCache: false,
      })),
      listProjectTree: vi.fn<() => Promise<ListProjectTreeResult>>(async () => ({
        directoryPath: "",
        entries: [],
      })),
      readProjectFile: vi.fn<() => Promise<ReadProjectFileResult>>(async () => ({
        path: "",
        status: "ready",
        modifiedAtMs: 0,
        content: "",
      })),
      searchProjectTree: vi.fn<() => Promise<SearchProjectTreeResult>>(async () => ({
        entries: [],
      })),
      gitProjectSnapshot: vi.fn<SC["gitProjectSnapshot"]>(async () => ({
        status: null,
        branches: null,
        worktrees: null,
        ghAvailable: null,
      })),
      getGitDiff: vi.fn<SC["getGitDiff"]>(async () => ({ diff: "" })),
      getGitDiffBatch: vi.fn<SC["getGitDiffBatch"]>(async () => ({ staged: {}, unstaged: {} })),
      gitStage: vi.fn<SC["gitStage"]>(async () => undefined),
      gitUnstage: vi.fn<SC["gitUnstage"]>(async () => undefined),
      gitStageAll: vi.fn<SC["gitStageAll"]>(async () => undefined),
      gitUnstageAll: vi.fn<SC["gitUnstageAll"]>(async () => undefined),
      gitRevert: vi.fn<SC["gitRevert"]>(async () => undefined),
      gitRevertAll: vi.fn<SC["gitRevertAll"]>(async () => undefined),
      gitCommit: vi.fn<SC["gitCommit"]>(async () => ({ hash: "abc", message: "m" })),
      gitListBranches: vi.fn<SC["gitListBranches"]>(async () => ({
        current: "main",
        branches: [],
      })),
      gitSwitchBranch: vi.fn<SC["gitSwitchBranch"]>(async () => ({
        branch: "main",
        created: false,
        tracking: "",
        ahead: 0,
        behind: 0,
      })),
      gitFetch: vi.fn<SC["gitFetch"]>(async () => undefined),
      gitPull: vi.fn<SC["gitPull"]>(async () => undefined),
      gitPullRebase: vi.fn<SC["gitPullRebase"]>(async () => undefined),
      gitPush: vi.fn<SC["gitPush"]>(async () => undefined),
      gitListWorktrees: vi.fn<SC["gitListWorktrees"]>(async () => ({ worktrees: [] })),
      gitRemoveWorktree: vi.fn<SC["gitRemoveWorktree"]>(async () => undefined),
      gitWorktreeStatusBatch: vi.fn<SC["gitWorktreeStatusBatch"]>(async () => ({ statuses: {} })),
      gitGetWorktreeSourceBranch: vi.fn<SC["gitGetWorktreeSourceBranch"]>(async () => ({
        sourceBranch: "main",
        commitsAhead: 0,
        sourceAhead: 0,
      })),
      gitMergeToSource: vi.fn<SC["gitMergeToSource"]>(async () => ({
        merged: true,
        fastForward: false,
        newSourceCommit: "def",
      })),
      gitPullFromSource: vi.fn<SC["gitPullFromSource"]>(async () => ({
        merged: true,
        fastForward: false,
      })),
      gitAbortMerge: vi.fn<SC["gitAbortMerge"]>(async () => ({})),
      gitFinishMerge: vi.fn<SC["gitFinishMerge"]>(async () => ({ success: true })),
      ghCheckAvailable: vi.fn<SC["ghCheckAvailable"]>(async () => ({ available: true })),
      ghListPullRequests: vi.fn<SC["ghListPullRequests"]>(async () => ({ pullRequests: [] })),
      ghGetPrDetails: vi.fn<SC["ghGetPrDetails"]>(async () => ({
        details: {
          number: 1,
          title: "",
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
        },
      })),
      ghGetPrChecks: vi.fn<SC["ghGetPrChecks"]>(async () => ({ checks: [] })),
      ghGetPrFiles: vi.fn<SC["ghGetPrFiles"]>(async () => ({ files: [] })),
      ghGetPrDiff: vi.fn<SC["ghGetPrDiff"]>(async () => ({ diff: "" })),
      ghCreatePr: vi.fn<SC["ghCreatePr"]>(
        async () =>
          ({
            number: 1,
            state: "open",
            title: "",
            url: "",
            baseBranch: "main",
            isDraft: false,
            updatedAt: "2026-01-01T00:00:00.000Z",
          }) as PrData,
      ),
      ghPostPrComment: vi.fn<SC["ghPostPrComment"]>(async () => ({
        id: "c1",
        author: { login: "octocat" },
        body: "",
        createdAt: "2026-01-01T00:00:00.000Z",
      })),
      ghMergePr: vi.fn<SC["ghMergePr"]>(async () => undefined),
      ghClosePr: vi.fn<SC["ghClosePr"]>(async () => undefined),
      ghReopenPr: vi.fn<SC["ghReopenPr"]>(async () => undefined),
      ghMarkPrReady: vi.fn<SC["ghMarkPrReady"]>(async () => undefined),
      ghUpdatePrBranch: vi.fn<SC["ghUpdatePrBranch"]>(async () => undefined),
      probeMcpServer: vi.fn<SC["probeMcpServer"]>(
        async () =>
          ({
            status: "unavailable",
            toolCount: 0,
            latencyMs: 0,
            environment: { runtime: "host", projectScoped: false },
            error: { code: "probe-unavailable", message: "n/a" },
          }) as McpProbeResult,
      ),
      reloadAgentMcpServers: vi.fn<SC["reloadAgentMcpServers"]>(async () => undefined),
      getMcpOauthStatus: vi.fn<SC["getMcpOauthStatus"]>(async () => ({ authenticatedUrls: [] })),
      scanSkills: vi.fn<SC["scanSkills"]>(async () => ({
        skills: [],
        effectiveSkillIds: [],
        invocation: null,
        issues: [],
        canLinkToGlobal: false,
      })),
      setSkillEnabled: vi.fn<SC["setSkillEnabled"]>(async () => undefined),
    },
    createThread: vi.fn<(request: CreateAppThreadRequest) => Promise<CreateAppThreadResult>>(
      async (request) => ({
        threadId: "created-thread",
        title: request.title ?? "New thread",
        projectId: request.projectId,
      }),
    ),
    emitRemoteThreadCommand: vi.fn<(command: RemoteThreadCommand) => boolean>(() => true),
    updateThreadRow: vi.fn<(threadId: string, mutate: (thread: Thread) => Thread) => void>(),
    openThreadInUi: vi.fn<(threadId: string) => boolean>(() => true),
    notifyUser: vi.fn<() => { delivered: boolean; note?: string }>(() => ({ delivered: true })),
    checkForUpdate: vi.fn<() => Promise<{ supported: boolean }>>(async () => ({ supported: true })),
    ...overrides,
  };
}

async function callTool(url: string, token: string, name: string, args: Record<string, unknown>) {
  const response = await fetch(`${url}/mcp?thread=thread-1`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    result?: { isError?: boolean; content?: Array<{ text?: string }> };
  };
  const text = body.result?.content?.[0]?.text;
  return {
    isError: body.result?.isError === true,
    payload: text ? (JSON.parse(text) as Record<string, unknown>) : undefined,
  };
}

describe("AppControlsMcpIngress", () => {
  it("serves schedule tools and applies calling-thread defaults over Streamable HTTP", async () => {
    const d = deps();
    ingress = new AppControlsMcpIngress(d);
    const info = await ingress.start();

    const { isError } = await callTool(info.url, info.token, "create_schedule", {
      name: "Daily brief",
      prompt: "Summarize priorities",
      recurrence: { kind: "hourly", minute: 15 },
    });

    expect(isError).toBe(false);
    expect(d.scheduleService.create).toHaveBeenCalledWith({
      name: "Daily brief",
      prompt: "Summarize priorities",
      recurrence: { kind: "hourly", minute: 15 },
      enabled: true,
      agentKind: "codex",
      projectId: "project-1",
      config: { model: "gpt-5.6", effort: "high" },
    });
  });

  it("lists threads joined with live runtime snapshots", async () => {
    ingress = new AppControlsMcpIngress(deps());
    const info = await ingress.start();

    const { isError, payload } = await callTool(info.url, info.token, "list_threads", {});
    expect(isError).toBe(false);
    expect(payload?.count).toBe(1);
    const threads = payload?.threads as Array<Record<string, unknown>>;
    expect(threads[0]?.threadId).toBe("thread-1");
    expect(threads[0]?.status).toBe("working");
    expect(threads[0]?.projectName).toBe("Alpha");
  });

  it("create_thread inherits the calling thread's agent config", async () => {
    const d = deps();
    ingress = new AppControlsMcpIngress(d);
    const info = await ingress.start();

    const { isError, payload } = await callTool(info.url, info.token, "create_thread", {
      projectId: "project-1",
      prompt: "Investigate the flaky test",
    });
    expect(isError).toBe(false);
    expect(payload?.threadId).toBe("created-thread");
    expect(d.createThread).toHaveBeenCalledWith({
      projectId: "project-1",
      prompt: "Investigate the flaky test",
      agentKind: "codex",
      model: "gpt-5.6",
      effort: "high",
    });
  });
});
