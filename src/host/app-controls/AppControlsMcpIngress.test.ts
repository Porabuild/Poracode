import type { AppControlsRuntime } from "./mcp/tools/types";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import appControlsManifest from "../../../resources/plugins/app-controls/plugin.json";
import {
  AGENT_PLUGINS_MANIFEST_SCHEMA_URL,
  AGENT_PLUGINS_MCP_SCHEMA_URL,
} from "@/shared/plugins/spec";
import { PluginRegistry } from "@/supervisor/plugins/PluginRegistry";
import { PluginCatalogService } from "@/supervisor/plugins/PluginCatalogService";
import { GitService } from "@/supervisor/git";
import { disposeGitExecWorker, disposeNativeGitHelper } from "@/supervisor/git/exec";
import { agentCapabilitySchema, getGitFileContentPayloadSchema } from "@/shared/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
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
import { runtimeHistoryNoticeExactToken } from "@/shared/runtimeHistoryNotice";
import {
  closeDatabase,
  dbReplaceThreadCompletedTurns,
  dbReplaceThreadRuntimeItems,
  dbUpsertProject,
  dbUpsertThread,
  initDatabase,
} from "@/host/db";
import { getSqlite } from "@/host/db/connection";
import { dbSetMemoryThreadState, dbUpsertMemorySuggestion } from "@/host/db/memoryStore";
import { handleMemoryCommand } from "@/host/memory/runtime";
import { setMemorySettingsReader } from "@/host/memory/settingsReader";
import { defaultMemorySettings } from "@/shared/memory";
import { DeviceWorkspaceService } from "@/host/devices/DeviceWorkspaceService";
import {
  DEVICE_WORKSPACE_AGENT_KEY_ENV,
  deviceThreadProof,
} from "@/shared/deviceWorkspaceAgentProof";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";
import type { ScheduleService } from "../schedules/ScheduleService";
import type { CreateAppThreadRequest, CreateAppThreadResult } from "../threads/appThreadLauncher";
import { AppControlsMcpIngress, type AppControlsMcpIngressDeps } from "./AppControlsMcpIngress";

type SC = AppControlsMcpIngressDeps["supervisor"];

let ingress: AppControlsMcpIngress | null = null;

afterEach(async () => {
  await ingress?.dispose();
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
    isExperimentGroup: () => false,
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
      editField: async () => {
        throw new Error("Unexpected settings edit");
      },
      editPreferences: async () => {
        throw new Error("Unexpected settings edit");
      },
    },
    assertCanPersistSecrets: () => undefined,
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
      gitInit: vi.fn<SC["gitInit"]>(async () => undefined),
      gitAddRemote: vi.fn<SC["gitAddRemote"]>(async () => undefined),
      gitDeleteBranch: vi.fn<SC["gitDeleteBranch"]>(async () => undefined),
      gitAddWorktree: vi.fn<SC["gitAddWorktree"]>(async () => ({ path: "/fixture/checkout" })),
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
      gitSync: vi.fn<SC["gitSync"]>(async () => ({ pulled: false, pushed: false })),
      gitSyncRebase: vi.fn<SC["gitSyncRebase"]>(async () => ({ pulled: false, pushed: false })),
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
      forgeGetRepository: vi.fn<SC["forgeGetRepository"]>(),
      forgeEditPr: vi.fn<SC["forgeEditPr"]>(),
      forgeCreatePr: vi.fn<SC["forgeCreatePr"]>(),
      forgeListPullRequests: vi.fn<SC["forgeListPullRequests"]>(),
      forgeMergePr: vi.fn<SC["forgeMergePr"]>(),
      forgeMergePrAtHead: vi.fn<SC["forgeMergePrAtHead"]>(),
      forgeClosePr: vi.fn<SC["forgeClosePr"]>(),
      forgeReopenPr: vi.fn<SC["forgeReopenPr"]>(),
      forgeMarkPrReady: vi.fn<SC["forgeMarkPrReady"]>(),
      forgeUpdatePrBranch: vi.fn<SC["forgeUpdatePrBranch"]>(),
      forgeGetPrChecks: vi.fn<SC["forgeGetPrChecks"]>(),
      forgeGetPrFiles: vi.fn<SC["forgeGetPrFiles"]>(),
      forgeGetPrDiff: vi.fn<SC["forgeGetPrDiff"]>(),
      forgeGetPrDetails: vi.fn<SC["forgeGetPrDetails"]>(),
      forgeGetPrReviewComments: vi.fn<SC["forgeGetPrReviewComments"]>(),
      forgePostPrComment: vi.fn<SC["forgePostPrComment"]>(),
      forgeSubmitPrReview: vi.fn<SC["forgeSubmitPrReview"]>(),
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
      ghMergePrAtHead: vi.fn<SC["ghMergePrAtHead"]>(async () => undefined),
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
      pluginCatalog: vi.fn<SC["pluginCatalog"]>(async () => ({ catalogs: [], installations: [] })),
      pluginAccounts: vi.fn<SC["pluginAccounts"]>(async () => ({ accounts: [] })),
      listSkillMarketplace: vi.fn<SC["listSkillMarketplace"]>(async () => ({
        marketplace: "skills-sh",
        skills: [],
        total: 0,
      })),
      installMarketplaceSkill: vi.fn<SC["installMarketplaceSkill"]>(async () => ({
        installed: "/skills/test",
      })),
      importSkills: vi.fn<SC["importSkills"]>(async () => ({ imported: [] })),
      deleteSkill: vi.fn<SC["deleteSkill"]>(async () => undefined),
      discoverExternalMcpServers: vi.fn<SC["discoverExternalMcpServers"]>(async () => ({
        groups: [],
      })),
      listPlugins: vi.fn<SC["listPlugins"]>(async () => ({
        plugins: [],
        userPluginsDir: "/plugins",
      })),
      beginMcpServerOauth: vi.fn<SC["beginMcpServerOauth"]>(async () => ({ status: "authorized" })),
      waitMcpServerOauth: vi.fn<SC["waitMcpServerOauth"]>(async () => ({ status: "authorized" })),
      clearMcpServerOauth: vi.fn<SC["clearMcpServerOauth"]>(async () => undefined),
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

async function callTool(
  url: string,
  token: string,
  name: string,
  args: Record<string, unknown>,
  proof?: string,
) {
  const endpoint = new URL(`${url}/mcp?thread=thread-1`);
  if (proof) endpoint.searchParams.set("deviceProof", proof);
  const response = await fetch(endpoint, {
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
  const isError = body.result?.isError === true;
  return {
    isError,
    error: isError ? text : undefined,
    payload: text && !isError ? (JSON.parse(text) as Record<string, unknown>) : undefined,
  };
}

describe("AppControlsMcpIngress", () => {
  it("advertises the complete tool catalog to a standard MCP client", async () => {
    ingress = new AppControlsMcpIngress(deps());
    const info = await ingress.start();
    const client = new Client({ name: "catalog-regression", version: "1.0.0" });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`${info.url}/mcp?thread=thread-1`), {
          requestInit: { headers: { Authorization: `Bearer ${info.token}` } },
        }) as Transport,
      );
      const { tools } = await client.listTools();
      expect(tools.every(({ annotations }) => annotations !== undefined)).toBe(true);
      const annotations = (name: string) => tools.find((tool) => tool.name === name)?.annotations;
      expect(annotations("read_project_file")).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      });
      expect(annotations("review_get_pr")).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      });
      expect(annotations("remove_workspace")).toEqual({
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false,
      });
      for (const name of [
        "manage_experiment",
        "manage_provider_auth",
        "probe_mcp_server",
        "close_local_port",
      ]) {
        expect(annotations(name)).toEqual({
          readOnlyHint: false,
          destructiveHint: true,
          openWorldHint: true,
        });
      }
      expect(tools.map(({ name }) => name)).toEqual(
        expect.arrayContaining([
          "list_plugins",
          "list_plugin_catalogs",
          "inspect_plugin_package",
          "install_plugin",
          "manage_plugin_accounts",
          "discover_mcp_servers",
          "install_marketplace_skill",
          "clone_project",
          "list_mcp_servers",
          "create_thread",
          "read_thread_history",
          "delete_worktree_group",
          "move_thread_to_worktree",
          "handoff_thread",
          "thread_transfer",
          "reorder_project",
          "reorder_thread",
          "set_project_draft_config",
          "update_project_notes",
          "list_schedules",
          "thread_follow_ups",
          "thread_goal",
          "reopen_thread",
          "list_thread_checkpoints",
          "restore_thread_checkpoint",
          "thread_session_actions",
          "thread_context",
          "list_importable_sessions",
          "import_session",
          "thread_background_tasks",
          "get_project_notes",
          "manage_project_file",
          "manage_memory",
          "manage_experiment",
          "list_local_ports",
          "open_local_port",
          "close_local_port",
          "manage_model_providers",
          "manage_provider_credentials",
          "manage_provider_plugins",
          "manage_provider_auth",
          "manage_provider_installation",
          "manage_provider_hooks",
          "manage_provider_profiles",
          "git_file_content",
          "github_actions",
          "generate_commit_message",
          "generate_pr_summary",
          "review_manage",
          "pr_watch",
          "manage_terminal",
          "project_action",
          "git_repository",
          "create_worktree",
        ]),
      );
      expect(client.getServerVersion()?.version).toBe(appControlsManifest.version);
      expect(tools.find((tool) => tool.name === "git_file_content")?.inputSchema).toMatchObject({
        type: "object",
        required: ["filePath", "staged", "projectId"],
        properties: {
          staged: { type: "boolean" },
          oldOffset: { type: "integer", default: 0 },
          newOffset: { type: "integer", default: 0 },
          maxChars: { type: "integer", default: 8_000 },
        },
      });
      for (const name of ["git_sync", "merge_worktree", "git_repository", "git_branch"]) {
        const schema = tools.find((tool) => tool.name === name)?.inputSchema;
        expect(schema).toMatchObject({
          type: "object",
          properties: { action: { type: "string", enum: expect.any(Array) } },
        });
        expect(schema).not.toHaveProperty("oneOf");
      }
      expect(tools.find((tool) => tool.name === "read_thread_history")?.inputSchema).toMatchObject({
        type: "object",
        required: expect.arrayContaining(["action", "threadId"]),
        properties: {
          action: { type: "string", enum: ["items", "turns", "detail"] },
          itemId: { type: "string" },
        },
      });
      expect(
        tools.find((tool) => tool.name === "read_thread_history")?.inputSchema,
      ).not.toHaveProperty("oneOf");
      expect(
        tools.find((tool) => tool.name === "delete_worktree_group")?.inputSchema,
      ).toMatchObject({
        type: "object",
        required: ["projectId", "worktreePath", "threadIds"],
      });
      expect(tools.find((tool) => tool.name === "manage_terminal")?.inputSchema).toMatchObject({
        type: "object",
        properties: { action: { type: "string", enum: expect.arrayContaining(["list", "start"]) } },
      });
      expect(tools.find((tool) => tool.name === "thread_follow_ups")?.inputSchema).toMatchObject({
        type: "object",
        properties: {
          action: { type: "string", enum: expect.arrayContaining(["list", "enqueue", "steer"]) },
        },
      });
      expect(tools.find((tool) => tool.name === "control_device")?.inputSchema).toMatchObject({
        type: "object",
        properties: {
          kind: { type: "string", enum: expect.arrayContaining(["tap", "text", "fold"]) },
        },
      });
    } finally {
      await client.close();
    }
  });

  it("reads staged and unstaged comparisons from the app's Git service over MCP", async () => {
    const path = mkdtempSync(join(tmpdir(), "poracode-mcp-git-"));
    const project = {
      id: thread.projectId,
      name: "Git fixture",
      location: { kind: process.platform === "win32" ? "windows" : "posix", path },
    } as Project;
    const runGit = (...args: string[]) =>
      execFileSync("git", ["-C", path, ...args], { stdio: "pipe" });
    const filePath = "changes.txt";
    try {
      runGit("init");
      writeFileSync(join(path, filePath), "committed\n");
      runGit("add", "--", filePath);
      runGit(
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.test",
        "-c",
        "commit.gpgsign=false",
        "-c",
        `core.hooksPath=${join(path, "no-hooks")}`,
        "commit",
        "-m",
        "Add fixture",
      );
      writeFileSync(join(path, filePath), "staged\n");
      runGit("add", "--", filePath);
      writeFileSync(join(path, filePath), "working\n");

      const git = new GitService();
      const call = vi.fn<AppControlsRuntime["call"]>(async (procedure, payload) => {
        expect(procedure).toBe("getGitFileContent");
        const request = getGitFileContentPayloadSchema.parse(payload);
        return (await git.getFileContent(
          request.projectLocation,
          request.filePath,
          request.staged,
        )) as never;
      });
      ingress = new AppControlsMcpIngress(
        deps({
          getProject: (id) => (id === project.id ? project : null),
          runtime: { call },
        }),
      );
      const { url, token } = await ingress.start();
      const input = { projectId: project.id, filePath };
      const staged = await callTool(url, token, "git_file_content", { ...input, staged: true });
      expect(staged.payload).toMatchObject({
        old: { content: "committed\n" },
        new: { content: "staged\n" },
      });
      const unstaged = await callTool(url, token, "git_file_content", { ...input, staged: false });
      expect(unstaged.payload).toMatchObject({
        old: { content: "staged\n" },
        new: { content: "working\n" },
      });
    } finally {
      await ingress?.dispose();
      disposeNativeGitHelper();
      await disposeGitExecWorker();
      rmSync(path, { recursive: true, force: true });
    }
  });

  it("discovers experiments and resolves candidate stats from the owned checkout", async () => {
    const projectId = thread.projectId;
    const projectLocation = { kind: "posix" as const, path: "/fixture/project" };
    const worktree = {
      path: "/fixture/candidate",
      branch: "candidate",
      commit: "a".repeat(40),
      isMain: false,
    };
    const experiment = {
      id: "experiment-1",
      projectId,
      title: "Compare models",
      status: "running" as const,
      baseBranch: "main",
      baseCommit: "b".repeat(40),
      prompt: "Original comparison prompt",
      candidates: [
        {
          agentKind: "codex",
          threadId: "candidate-1",
          worktreePath: worktree.path,
          worktreeBranch: worktree.branch,
          worktreeOwnerToken: "private-token",
          worktreeState: "owned" as const,
        },
        {
          agentKind: "codex",
          threadId: "candidate-2",
          worktreeBranch: "candidate-two",
          worktreeOwnerToken: "private-two",
          worktreeState: "pending" as const,
        },
      ],
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    };
    const supervisor = deps().supervisor;
    vi.mocked(supervisor.gitListWorktrees).mockResolvedValue({ worktrees: [worktree] });
    const call = vi.fn<AppControlsRuntime["call"]>(
      async () => ({ files: 1, insertions: 2, deletions: 0 }) as never,
    );
    const edit = vi.fn<NonNullable<AppControlsMcpIngressDeps["experiments"]>["edit"]>(async () => ({
      ok: true,
      revision: "new",
    }));
    const run = vi.fn<NonNullable<NonNullable<AppControlsMcpIngressDeps["experiments"]>["run"]>>(
      async () => ({ ok: true, experimentId: experiment.id }),
    );
    ingress = new AppControlsMcpIngress(
      deps({
        getProject: (id) =>
          id === projectId
            ? { id, name: "Fixture", location: projectLocation, createdAt: thread.createdAt }
            : null,
        runtime: { call },
        supervisor,
        experiments: {
          read: () => ({ revision: "current", experiments: { [experiment.id]: experiment } }),
          edit,
          run,
        },
      }),
    );
    const { url, token } = await ingress.start();
    const manage = (args: Record<string, unknown>) =>
      callTool(url, token, "manage_experiment", args);
    const listed = await manage({ action: "list", projectId });
    expect(listed.payload).toMatchObject({
      revision: "current",
      count: 1,
      experiments: [{ id: experiment.id, candidateCount: 2 }],
    });
    expect(JSON.stringify(listed.payload)).not.toContain(experiment.prompt);
    const detail = await manage({
      action: "get",
      experimentId: experiment.id,
      includePrompt: true,
    });
    expect(detail.payload).toMatchObject({ experiment: { prompt: experiment.prompt } });
    expect(JSON.stringify(detail.payload)).not.toContain("worktreeOwnerToken");
    await expect(
      manage({ action: "candidate_stats", experimentId: experiment.id, threadId: "candidate-2" }),
    ).resolves.toMatchObject({ isError: true });
    await expect(
      manage({ action: "candidate_stats", experimentId: experiment.id, threadId: "candidate-1" }),
    ).resolves.toMatchObject({ payload: { stats: { files: 1, insertions: 2, deletions: 0 } } });
    expect(call).toHaveBeenCalledExactlyOnceWith("getExperimentCandidateStats", {
      projectLocation: { ...projectLocation, path: worktree.path },
      baseRef: experiment.baseCommit,
    });
    const rename = {
      action: "rename",
      experimentId: experiment.id,
      revision: "current",
      title: "New title",
    };
    await expect(manage(rename)).resolves.toMatchObject({ payload: { ok: true, revision: "new" } });
    expect(edit).toHaveBeenCalledExactlyOnceWith(rename);
    const judge = {
      action: "judge",
      experimentId: experiment.id,
      revision: "current",
      operationKey: "compare-models-1",
      selection: { agentKind: "codex", model: "fixture", fast: false, mode: "responses" },
    };
    await expect(manage(judge)).resolves.toMatchObject({
      payload: { ok: true, experimentId: experiment.id },
    });
    expect(run).toHaveBeenCalledExactlyOnceWith(judge, thread.id);
    await expect(
      manage({ action: "cancel_judge", experimentId: experiment.id }),
    ).resolves.toMatchObject({
      payload: { cancellationRequested: true },
    });
    expect(call).toHaveBeenLastCalledWith("cancelJudgeExperiment", { experimentId: experiment.id });
  });

  it("uses the desktop's exact listener identity for port operations", async () => {
    const listener = {
      port: 4173,
      address: "127.0.0.1",
      pid: 401,
      processStartedAt: "start-token",
      url: "http://127.0.0.1:4173",
      processName: "node",
      canClose: true,
    };
    const localPorts = vi.fn<NonNullable<AppControlsMcpIngressDeps["localPorts"]>>(
      async (command) => {
        if (command.action === "list") {
          return { action: "list", ports: [listener, { ...listener, port: 5173, url: null }] };
        }
        if (command.action === "open")
          return { action: "open", opened: true, target: command.target };
        return { action: "close", closed: false };
      },
    );
    ingress = new AppControlsMcpIngress(deps({ localPorts }));
    const { url, token } = await ingress.start();
    await expect(callTool(url, token, "list_local_ports", { limit: 1 })).resolves.toMatchObject({
      payload: { count: 2, nextOffset: 1, ports: [listener] },
    });
    await expect(
      callTool(url, token, "list_local_ports", { port: listener.port }),
    ).resolves.toMatchObject({
      payload: { count: 1, ports: [listener] },
    });
    const { port, address, pid, processStartedAt } = listener;
    await expect(
      callTool(url, token, "close_local_port", { port, address, pid }),
    ).resolves.toMatchObject({
      isError: true,
    });
    expect(localPorts).toHaveBeenCalledTimes(2);
    await expect(
      callTool(url, token, "close_local_port", { port, address, pid, processStartedAt }),
    ).resolves.toMatchObject({
      payload: { closed: false },
    });
    expect(localPorts).toHaveBeenLastCalledWith({
      action: "close",
      port,
      address,
      pid,
      processStartedAt,
    });
    await expect(callTool(url, token, "open_local_port", { port, address })).resolves.toMatchObject(
      {
        payload: { opened: true, target: "app" },
      },
    );
    expect(localPorts).toHaveBeenLastCalledWith({ action: "open", target: "app", port, address });
  });

  it("uses the provider settings services and keeps credentials out of replies", async () => {
    const agentKind = "fixture";
    const env = { kind: "wsl", distro: "Fixture Linux" } as const;
    const provider = {
      id: "route",
      name: "Route",
      protocol: "openai-responses",
      modelIds: ["model"],
      baseURL: "https://fixture.test/v1?token=private-query#private-fragment",
    };
    const account = { id: "provider-account", label: "Example" };
    const pkg = {
      target: "fixture-package",
      status: "configured",
      outdated: false,
      server: true,
      terminal: false,
    };
    const supervisor = deps().supervisor;
    const call = vi.fn<AppControlsRuntime["call"]>(async (procedure, request) => {
      if (procedure === "manageAgentPlugins") return { packages: [pkg] } as never;
      if (procedure === "manageAgentCredentials") {
        return {
          providers:
            "action" in request && request.action === "remove"
              ? []
              : [{ ...account, token: "private-account-token" }],
        } as never;
      }
      if ("revision" in request && request.revision === "stale")
        return { ok: false, reason: "conflict" } as never;
      return {
        ok: true,
        revision: "current",
        catalog: [],
        providers: [
          {
            ...provider,
            custom: true,
            removable: true,
            credentialConfigured: true,
            apiKey: "private-key",
          },
        ],
      } as never;
    });
    const assertCanPersistSecrets = vi.fn<() => void>();
    ingress = new AppControlsMcpIngress(
      deps({ assertCanPersistSecrets, supervisor, runtime: { call } }),
    );
    const { url, token } = await ingress.start();
    const models = (args: Record<string, unknown>) =>
      callTool(url, token, "manage_model_providers", { agentKind, env, ...args });
    const accounts = (args: Record<string, unknown>) =>
      callTool(url, token, "manage_provider_credentials", { agentKind, env, ...args });
    const listed = await models({ action: "list" });
    expect(listed.payload).toMatchObject({
      ok: true,
      revision: "current",
      providers: [{ id: "route", baseURL: "https://fixture.test/v1", credentialConfigured: true }],
    });
    expect(JSON.stringify(listed.payload)).not.toContain("private-");
    const change = { action: "save", create: false, provider, revision: "current" };
    await expect(models({ ...change, revision: "stale" })).resolves.toMatchObject({
      payload: { ok: false, reason: "conflict" },
    });
    expect(supervisor.refreshAgentStatuses).not.toHaveBeenCalled();
    assertCanPersistSecrets.mockImplementationOnce(() => {
      throw new Error("Credential store is locked.");
    });
    await expect(models({ ...change, apiKey: "fixture-new-key" })).resolves.toMatchObject({
      isError: true,
      error: expect.stringContaining("locked"),
    });
    expect(call).toHaveBeenCalledTimes(2);
    const saved = await models({ ...change, apiKey: "fixture-new-key" });
    expect(saved.payload).toMatchObject({ ok: true });
    expect(JSON.stringify(saved.payload)).not.toContain("fixture-new-key");
    expect(call).toHaveBeenLastCalledWith("manageModelProviders", {
      ...change,
      agentKind,
      env,
      apiKey: "fixture-new-key",
    });
    const { baseURL: _storedUrl, ...providerWithoutUrl } = provider;
    const edit = { ...change, provider: { ...providerWithoutUrl, modelIds: ["another-model"] } };
    await expect(models(edit)).resolves.toMatchObject({ payload: { ok: true } });
    expect(call).toHaveBeenLastCalledWith("manageModelProviders", {
      ...edit,
      provider: { ...edit.provider, baseURL: provider.baseURL },
      agentKind,
      env,
    });
    expect((await accounts({ action: "list" })).payload).toEqual({ providers: [account] });
    await expect(accounts({ action: "remove", credentialId: account.id })).resolves.toMatchObject({
      payload: { providers: [] },
    });
    expect(call).toHaveBeenLastCalledWith("manageAgentCredentials", {
      agentKind,
      env,
      action: "remove",
      credentialId: account.id,
    });
    expect(supervisor.refreshAgentStatuses).toHaveBeenLastCalledWith({
      wslDistros: [env.distro],
      scope: { agentKinds: [agentKind], envs: [env] },
    });
    const plugins = (args: Record<string, unknown>) =>
      callTool(url, token, "manage_provider_plugins", { agentKind, env, ...args });
    await expect(plugins({ action: "check" })).resolves.toMatchObject({
      payload: { packages: [pkg] },
    });
    await expect(plugins({ action: "install" })).resolves.toMatchObject({ isError: true });
    expect(call).toHaveBeenLastCalledWith("manageAgentPlugins", {
      agentKind,
      env,
      action: "check",
    });
    await expect(plugins({ action: "update", target: pkg.target })).resolves.toMatchObject({
      payload: { packages: [pkg] },
    });
    expect(call).toHaveBeenLastCalledWith("manageAgentPlugins", {
      agentKind,
      env,
      action: "update",
      target: pkg.target,
    });
  });

  it("routes provider auth without exposing login commands or method environment values", async () => {
    const status: AgentStatusesResponse["wsl"][number] = {
      kind: "fixture",
      label: "Fixture",
      installed: true,
      authState: "missing",
      capabilities: agentCapabilitySchema.parse({}),
      loginCommand: "private-provider-command",
      authLogoutSupported: true,
      authMethods: [
        { id: "browser", name: "Browser", type: "agent" },
        { id: "terminal", name: "Terminal", type: "terminal", env: { PRIVATE: "private-value" } },
        {
          id: "env",
          name: "Environment",
          type: "env_var",
          vars: [{ name: "USER_KEY", secret: true }],
        },
      ],
    };
    const supervisor = deps().supervisor;
    vi.mocked(supervisor.refreshAgentStatuses).mockResolvedValue({
      windows: [],
      wsl: [{ ...status, envKind: "wsl", envDistro: "Fixture Linux" }],
      fromCache: false,
    });
    const call = vi.fn<AppControlsRuntime["call"]>(async () => undefined as never);
    const openProviderLogin = vi.fn<NonNullable<AppControlsMcpIngressDeps["openProviderLogin"]>>(
      async () => ({ opened: true }),
    );
    ingress = new AppControlsMcpIngress(deps({ supervisor, openProviderLogin, runtime: { call } }));
    const { url, token } = await ingress.start();
    const target = { agentKind: "fixture", env: { kind: "wsl", distro: "Fixture Linux" } };
    const auth = (args: Record<string, unknown>) =>
      callTool(url, token, "manage_provider_auth", { ...target, ...args });
    const observed = await auth({ action: "status" });
    expect(observed.payload).toMatchObject({
      terminalLogin: true,
      signOutSupported: true,
      methods: [
        { id: "browser", type: "agent" },
        { id: "terminal", type: "terminal" },
        { id: "env", type: "env_var", variables: ["USER_KEY"] },
      ],
    });
    expect(JSON.stringify(observed.payload)).not.toContain("private-");
    await expect(auth({ action: "sign_in", methodId: "env" })).resolves.toMatchObject({
      isError: true,
    });
    expect(call).not.toHaveBeenCalled();
    await expect(auth({ action: "sign_in", methodId: "terminal" })).resolves.toMatchObject({
      payload: { opened: true, interaction: "desktop" },
    });
    expect(openProviderLogin).toHaveBeenCalledExactlyOnceWith({ ...target, methodId: "terminal" });
    await expect(auth({ action: "sign_in", methodId: "browser" })).resolves.toMatchObject({
      payload: { authenticated: true },
    });
    expect(call).toHaveBeenLastCalledWith("authenticateAcpAgent", {
      agentKind: "fixture",
      methodId: "browser",
      envKind: "wsl",
      wslDistro: "Fixture Linux",
    });
    await expect(auth({ action: "sign_out" })).resolves.toMatchObject({
      payload: { loggedOut: true },
    });
    expect(call).toHaveBeenLastCalledWith("logoutAcpAgent", {
      agentKind: "fixture",
      envKind: "wsl",
      wslDistro: "Fixture Linux",
    });
  });

  it("uses the owning provider installation and hook operations with exact environments", async () => {
    const own = {
      id: "own-fixture",
      name: "Own",
      version: "1.0.0",
      installedAt: thread.createdAt,
      adapterKind: thread.agentKind,
      installKind: "first-class" as const,
    };
    const other = { ...own, id: "other-fixture", adapterKind: "another-agent" };
    const env = { kind: "wsl", distro: "Fixture Linux" } as const;
    const hook = {
      agentKind: other.adapterKind,
      env,
      supported: true,
      installed: false,
      canUninstall: false,
      bundledVersion: "1.0.0",
    };
    const call = vi.fn<AppControlsRuntime["call"]>(async (procedure) => {
      if (procedure === "getAgentHookPluginStatuses") return [hook] as never;
      if (procedure === "installAgentHookPlugin")
        return { status: { ...hook, installed: true } } as never;
      if (procedure === "updateAgentBinary")
        return { ok: true, strategy: "installer", output: "raw updater output" } as never;
      if (procedure === "listAcpRegistry") {
        return {
          version: "1.0.0",
          agents: [
            {
              id: other.id,
              name: "Other",
              description: "Fixture registry agent",
              version: "1.0.0",
              distribution: { npx: { package: "private-command" } },
            },
          ],
        } as never;
      }
      return { installed: [other] } as never;
    });
    const d = deps();
    d.settings.read = () => ({
      ...defaultSharedSettings,
      acpRegistryInstalledAgents: { [own.id]: own, [other.id]: other },
    });
    ingress = new AppControlsMcpIngress({ ...d, runtime: { call } });
    const { url, token } = await ingress.start();
    const installations = (input: Record<string, unknown>) =>
      callTool(url, token, "manage_provider_installation", input);
    const hooks = (input: Record<string, unknown>) =>
      callTool(url, token, "manage_provider_hooks", { agentKind: other.adapterKind, ...input });
    await expect(installations({ action: "installed", limit: 1 })).resolves.toMatchObject({
      payload: { installed: [own], count: 2, nextOffset: 1 },
    });
    await expect(installations({ action: "remove", agentId: own.id })).resolves.toMatchObject({
      isError: true,
    });
    expect(call).not.toHaveBeenCalled();
    const registry = await installations({ action: "registry", query: "fixture" });
    expect(registry.payload).toMatchObject({
      count: 1,
      agents: [{ id: other.id, version: "1.0.0" }],
    });
    expect(JSON.stringify(registry.payload)).not.toContain("private-command");
    await expect(
      installations({ action: "install", agentId: other.id, target: env }),
    ).resolves.toMatchObject({
      payload: { installed: [other] },
    });
    expect(call).toHaveBeenLastCalledWith("installAcpRegistryAgent", {
      agentId: other.id,
      target: env,
    });
    expect(
      (await installations({ action: "update_binary", agentKind: other.adapterKind, env })).payload,
    ).toEqual({ ok: true, strategy: "installer" });
    expect(call).toHaveBeenLastCalledWith("updateAgentBinary", {
      agentKind: other.adapterKind,
      envKind: "wsl",
      wslDistro: env.distro,
    });
    await expect(hooks({ action: "status", envs: [env] })).resolves.toMatchObject({
      payload: { statuses: [hook] },
    });
    await expect(hooks({ action: "install", env })).resolves.toMatchObject({
      payload: { status: { ...hook, installed: true } },
    });
    expect(call).toHaveBeenLastCalledWith("installAgentHookPlugin", {
      agentKind: other.adapterKind,
      env,
    });
    await installations({ action: "remove", agentId: other.id });
    expect(call).toHaveBeenLastCalledWith("removeAcpRegistryAgent", { agentId: other.id });
  });

  it("revision-guards provider profile changes, seals environment values and removes scoped settings", async () => {
    let settings = defaultSharedSettings;
    const committed = {
      status: "committed" as const,
      authorityId: "fixture",
      sequence: 1,
      changes: [],
      revisions: {},
    };
    const d = deps();
    d.settings = {
      ...d.settings,
      read: () => settings,
      editField: async (field, compute) => {
        const next = compute(settings);
        if (next !== undefined) settings = { ...settings, [field]: next };
        return committed;
      },
      editFields: async (_fields, compute) => {
        settings = { ...settings, ...compute(settings) };
        return committed;
      },
    };
    const assertCanPersistSecrets = vi.fn<() => void>();
    ingress = new AppControlsMcpIngress({ ...d, assertCanPersistSecrets });
    const { url, token } = await ingress.start();
    const profiles = (input: Record<string, unknown>) =>
      callTool(url, token, "manage_provider_profiles", input);
    const instanceId = "mcp-fixture-profile";
    const originalKey = "fixture-private-key";
    await expect(
      profiles({
        action: "create",
        driver: "claude",
        id: instanceId,
        displayName: "Fixture",
        config: { configDir: "~/fixture-profile" },
        environment: {
          PRESERVED_TOKEN: { value: originalKey, sensitive: true },
          REMOVED_NAME: { value: "initial" },
        },
      }),
    ).resolves.toMatchObject({ payload: { saved: true, instanceId } });
    expect(assertCanPersistSecrets).toHaveBeenCalledOnce();
    const original = settings.agentInstances[instanceId]?.environment?.PRESERVED_TOKEN?.value;
    expect(original).toMatch(/^lc-safe:/u);
    const read = await profiles({ action: "get", instanceId });
    expect(read.payload).toMatchObject({
      instanceId,
      enabled: true,
      environment: [
        { name: "PRESERVED_TOKEN", sensitive: true },
        { name: "REMOVED_NAME", sensitive: false },
      ],
    });
    expect(JSON.stringify(read.payload)).not.toContain(originalKey);
    expect(JSON.stringify(read.payload)).not.toContain("lc-safe:");
    const revision = z.string().parse(read.payload?.revision);
    await expect(
      profiles({ action: "update", instanceId, revision, enabled: false }),
    ).resolves.toMatchObject({
      payload: { saved: true, instanceId },
    });
    expect(settings.agentInstances[instanceId]?.enabled).toBe(false);
    await expect(profiles({ action: "remove", instanceId, revision })).resolves.toMatchObject({
      isError: true,
      error: expect.stringContaining("profile changed"),
    });
    const fresh = await profiles({ action: "get", instanceId });
    await expect(
      profiles({
        action: "set_environment",
        instanceId,
        revision: fresh.payload?.revision,
        environment: { ADDED_NAME: { value: "new" } },
        remove: ["REMOVED_NAME"],
      }),
    ).resolves.toMatchObject({ payload: { saved: true, instanceId } });
    expect(settings.agentInstances[instanceId]?.environment).toEqual({
      PRESERVED_TOKEN: { value: original, sensitive: true },
      ADDED_NAME: { value: "new" },
    });
    settings = { ...settings, providerOrder: [`claude:${instanceId}`, "another-provider"] };
    const profile = await profiles({ action: "get", instanceId });
    await expect(
      profiles({ action: "remove", instanceId, revision: profile.payload?.revision }),
    ).resolves.toMatchObject({
      payload: { removed: instanceId },
    });
    expect(settings.agentInstances[instanceId]).toBeUndefined();
    expect(settings.providerOrder).toEqual(["another-provider"]);
  });

  it("lists live reply tokens and forwards typed replies to the owning supervisor", async () => {
    const requestToken = "1f338956-c24e-4c0e-94f1-141c7084ff2a";
    const call = vi.fn<AppControlsRuntime["call"]>(async (_procedure, payload) => {
      if (
        "input" in payload &&
        payload.input &&
        typeof payload.input === "object" &&
        "action" in payload.input &&
        payload.input.action === "list"
      ) {
        return {
          action: "list",
          requests: [
            {
              requestToken,
              requestId: 42,
              requestType: "tool_call_approval",
              payload: { summary: "Confirm", details: { privateValue: "private-fixture" } },
            },
          ],
        } as never;
      }
      return { action: "reply", submitted: true } as never;
    });
    ingress = new AppControlsMcpIngress(deps({ runtime: { call } }));
    const { url, token } = await ingress.start();
    const context = (args: Record<string, unknown>) =>
      callTool(url, token, "thread_context", { threadId: thread.id, ...args });
    const read = await context({ action: "live_requests" });
    expect(read.payload).toMatchObject({ requests: [{ requestId: "42", requestToken }] });
    expect(JSON.stringify(read.payload)).not.toContain("private-fixture");
    const reply = {
      action: "reply",
      requestId: "42",
      requestToken,
      reply: { kind: "options", optionIds: ["deny"] },
    };
    await expect(context(reply)).resolves.toMatchObject({ payload: { submitted: true } });
    expect(call).toHaveBeenLastCalledWith("appThreadRequests", {
      version: 1,
      input: { ...reply, threadId: thread.id },
    });
  });

  it("uses the shell launch contract and binds terminal operations to the selected checkout", async () => {
    const projectLocation = { kind: "posix" as const, path: "/fixture/project" };
    const worktreePath = "/fixture/worktree";
    const checkout = { ...projectLocation, path: worktreePath };
    const supervisor = deps().supervisor;
    vi.mocked(supervisor.gitListWorktrees).mockResolvedValue({
      worktrees: [
        { path: worktreePath, branch: "refs/heads/fix", commit: "abc123", isMain: false },
      ],
    });
    const call = vi.fn<AppControlsRuntime["call"]>();
    ingress = new AppControlsMcpIngress(
      deps({
        getThread: () => ({ ...thread, worktreePath }),
        getProject: (id) =>
          id === thread.projectId
            ? ({ id, name: "Alpha", location: projectLocation } as Project)
            : null,
        supervisor,
        runtime: { call },
      }),
    );
    const { url, token } = await ingress.start();
    const terminal = (input: Record<string, unknown>) =>
      callTool(url, token, "manage_terminal", input);

    const initialSize = { rows: 25, cols: 100 };
    const start = await terminal({ action: "start", initialSize });
    const terminalId = start.payload?.terminalId;
    expect(start).toMatchObject({ payload: { projectId: thread.projectId, worktreePath } });
    expect(terminalId).toMatch(/^shell:/);
    expect(call).toHaveBeenLastCalledWith("startShell", {
      shellId: terminalId,
      projectLocation: checkout,
      worktreePath,
      initialSize,
    });
    expect((await terminal({ action: "start", worktreePath: "/outside" })).isError).toBe(true);
    expect((await terminal({ action: "start", shellId: "inject" })).isError).toBe(true);
    expect((await terminal({ action: "resize", terminalId, cols: 1, rows: 0 })).isError).toBe(true);
    expect(call).toHaveBeenCalledTimes(1);
    vi.mocked(supervisor.getTerminalShellSnapshots).mockResolvedValue([
      { terminalId: "shell:other", projectLocation, outputLength: 7 },
      { terminalId: "shell:caller", projectLocation: checkout, worktreePath, outputLength: 3 },
      {
        terminalId: "9e490d6c-b06d-4c93-b50f-8cdeaec50d5f",
        projectLocation: checkout,
        outputLength: 4,
      },
    ]);
    await expect(terminal({ action: "list" })).resolves.toMatchObject({
      payload: {
        count: 2,
        terminals: [
          { terminalId: "shell:caller", outputLength: 3 },
          { terminalId: "9e490d6c-b06d-4c93-b50f-8cdeaec50d5f", outputLength: 4 },
        ],
      },
    });
    await expect(terminal({ action: "list", worktreePath: null })).resolves.toMatchObject({
      payload: { count: 1, terminals: [{ terminalId: "shell:other", outputLength: 7 }] },
    });
    call.mockResolvedValueOnce({ action: "write" });
    await expect(
      terminal({ action: "write", terminalId, data: "pwd\r", worktreePath }),
    ).resolves.toMatchObject({
      payload: { terminalId, action: "write" },
    });
    expect(call).toHaveBeenLastCalledWith("controlWorkspaceTerminal", {
      version: 1,
      terminalId,
      projectLocation: checkout,
      worktreePath,
      command: { action: "write", data: "pwd\r" },
    });
    vi.mocked(supervisor.gitListWorktrees).mockResolvedValue({ worktrees: [] });
    await expect(terminal({ action: "start" })).resolves.toMatchObject({
      isError: true,
      error: expect.stringContaining("No worktree found"),
    });
    expect(call).toHaveBeenCalledTimes(2);
    await expect(terminal({ action: "list" })).resolves.toMatchObject({ payload: { count: 2 } });
  });

  it("extracts and cancels using the owning thread’s session and registered checkout", async () => {
    const worktreePath = "/fixture/worktree";
    const projectLocation = { kind: "posix", path: "/fixture/repo" } as const;
    const sessionRef = {
      providerSessionId: "session",
      discoveredAt: thread.createdAt,
      executionIdentity: "fixture-account",
    };
    const d = deps({
      getThread: () => ({ ...thread, worktreePath, sessionRef }),
      getProject: () => ({
        id: thread.projectId,
        name: "Fixture",
        location: projectLocation,
        createdAt: thread.createdAt,
      }),
    });
    vi.mocked(d.supervisor.gitListWorktrees).mockResolvedValue({
      worktrees: [{ path: worktreePath, branch: "feature", isMain: false, commit: "head" }],
    });
    const call = vi.fn<AppControlsRuntime["call"]>(
      async (name) =>
        (name === "extractContext"
          ? { summary: "Fixture summary", sourceProvider: thread.agentKind }
          : undefined) as never,
    );
    ingress = new AppControlsMcpIngress({ ...d, runtime: { call } });
    const { url, token } = await ingress.start();
    const context = (args: Record<string, unknown>) =>
      callTool(url, token, "thread_context", { threadId: thread.id, ...args });
    const selection = { model: "fixture-model", effort: "", fast: false };
    await expect(
      context({ action: "extract", sessionRef: { providerSessionId: "wrong" } }),
    ).resolves.toMatchObject({ isError: true });
    await expect(context({ action: "extract", selection })).resolves.toMatchObject({
      payload: { summary: "Fixture summary" },
    });
    await expect(context({ action: "cancel" })).resolves.toMatchObject({
      payload: { cancellationRequested: true },
    });
    expect(call.mock.calls).toEqual([
      [
        "extractContext",
        {
          threadId: thread.id,
          agentKind: thread.agentKind,
          sessionRef,
          projectLocation,
          worktreePath,
          selection,
        },
      ],
      ["cancelExtractContext", { threadId: thread.id }],
    ]);
  });

  it.skipIf(!sqliteAvailable)(
    "reads stored handoff context and current request previews",
    async () => {
      const previousBinding = process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
      if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
      try {
        initDatabase(":memory:");
        const project = {
          id: thread.projectId,
          name: "Fixture",
          location: { kind: "posix", path: "/fixture" },
          createdAt: thread.createdAt,
        } satisfies Project;
        dbUpsertProject(project, 0);
        dbUpsertThread(thread, 0);
        await dbReplaceThreadRuntimeItems(thread.id, [
          {
            id: "reply",
            type: "assistant_message",
            state: "completed",
            streams: { assistant_text: "The parser is ready to review." },
          },
          {
            id: "request",
            type: "pending_request",
            state: "started",
            streams: {},
            payload: {
              requestId: "pending-input",
              requestType: "tool_user_input",
              payload: {
                summary: "Which checkout should we review?",
                options: [{ optionId: "main", label: "Main" }],
                details: {
                  privateValue: "fixture-private",
                  userInputForm: {
                    questions: [
                      {
                        id: "checkout",
                        question: "Which checkout?",
                        options: [{ optionId: "main", label: "Main" }],
                      },
                      { id: "credential", question: "Enter the token", isSecret: true },
                    ],
                  },
                },
              },
            },
          },
          {
            id: "resolved",
            type: "pending_request",
            state: "completed",
            streams: {},
            payload: {
              requestId: "already-answered",
              requestType: "tool_user_input",
              payload: { summary: "Closed earlier" },
            },
          },
        ]);
        let status: Thread["status"] = "needs_reply";
        ingress = new AppControlsMcpIngress(
          deps({
            getThread: () => ({ ...thread, status }),
            getProject: () => project,
          }),
        );
        const { url, token } = await ingress.start();
        const context = (action: string) =>
          callTool(url, token, "thread_context", { threadId: thread.id, action });
        const requests = await context("requests");
        expect(requests.payload).toMatchObject({
          status: "needs_reply",
          requests: [
            {
              requestId: "pending-input",
              requestType: "tool_user_input",
              summary: "Which checkout should we review?",
              responseMode: "questions",
              options: [{ optionId: "main", label: "Main" }],
            },
          ],
        });
        expect(JSON.stringify(requests)).not.toContain("fixture-private");
        const details = await callTool(url, token, "thread_context", {
          threadId: thread.id,
          action: "requests",
          requestId: "pending-input",
          includeDetails: true,
        });
        expect(details.payload).toMatchObject({
          requests: [
            {
              requestId: "pending-input",
              details: {
                questions: [
                  { id: "checkout", options: [{ optionId: "main" }] },
                  { id: "credential", isSecret: true },
                ],
              },
            },
          ],
        });
        expect(JSON.stringify(details.payload)).not.toContain("fixture-private");
        await expect(
          callTool(url, token, "thread_context", {
            threadId: thread.id,
            action: "requests",
            requestId: "already-answered",
            includeDetails: true,
          }),
        ).resolves.toMatchObject({ payload: { requests: [] } });
        status = "inactive";
        await expect(context("requests")).resolves.toMatchObject({
          payload: { status: "inactive", requests: [] },
        });
        await expect(context("transcript")).resolves.toMatchObject({
          payload: {
            context: {
              contentKind: "transcript",
              summary: expect.stringContaining("The parser is ready to review."),
            },
          },
        });
        await expect(context("usage")).resolves.toMatchObject({
          payload: { contextUsage: null, tokenUsage: null },
        });
      } finally {
        await ingress?.dispose();
        ingress = null;
        closeDatabase();
        if (previousBinding === undefined)
          delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
        else process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = previousBinding;
      }
    },
  );

  it("uses the app's CLI session filters and forwards the selected import", async () => {
    const session = {
      id: "fixture:session-1",
      agentKind: "fixture",
      providerSessionId: "session-1",
      path: "/fixture/store/session-1.jsonl",
      cwd: "/fixture/project",
      cwdExists: true,
      updatedAt: thread.createdAt,
      preview: "Review the parser",
    };
    const listed = {
      sessions: [session],
      truncated: false,
      facets: { agentKinds: ["fixture"], folders: [session.cwd] },
    };
    const call = vi.fn<AppControlsRuntime["call"]>(async () => listed as never);
    const importSession = vi.fn<NonNullable<AppControlsMcpIngressDeps["importSession"]>>(
      async ({ projectId }) => ({ projectId, threadId: "imported-row", outcome: "imported" }),
    );
    ingress = new AppControlsMcpIngress(deps({ runtime: { call }, importSession }));
    const { url, token } = await ingress.start();
    const filters = { agentKind: session.agentKind, cwd: session.cwd, query: "parser" };
    await expect(callTool(url, token, "list_importable_sessions", filters)).resolves.toMatchObject({
      payload: listed,
    });
    expect(call).toHaveBeenCalledExactlyOnceWith("listImportableSessions", filters);
    const { agentKind, path, providerSessionId } = session;
    const input = {
      agentKind,
      path,
      providerSessionId,
      title: session.preview,
      projectId: thread.projectId,
      model: "fixture-model",
    };
    await expect(
      callTool(url, token, "import_session", { ...input, threadId: "client-assigned" }),
    ).resolves.toMatchObject({ isError: true });
    await expect(callTool(url, token, "import_session", input)).resolves.toMatchObject({
      payload: { threadId: "imported-row", projectId: thread.projectId, outcome: "imported" },
    });
    expect(importSession).toHaveBeenCalledExactlyOnceWith(input);
  });

  it("creates a worktree through MCP without launching a thread", async () => {
    const d = deps();
    const projectLocation = { kind: "posix", path: "/fixture/project" } as const;
    d.getProject = (id) =>
      id === thread.projectId
        ? { id, name: "Project", location: projectLocation, createdAt: thread.createdAt }
        : null;
    vi.mocked(d.supervisor.gitAddWorktree).mockResolvedValue({
      path: "/fixture/checkout",
      changesTransferred: true,
    });
    ingress = new AppControlsMcpIngress(d);
    const { url, token } = await ingress.start();
    const input = {
      projectId: thread.projectId,
      path: "../checkout",
      branch: "fixture",
      createBranch: true,
      startPoint: "main",
      transferUncommitted: true,
      keepChangesInSource: true,
    };
    await expect(callTool(url, token, "create_worktree", input)).resolves.toMatchObject({
      payload: { path: "/fixture/checkout", changesTransferred: true },
    });
    const { projectId: _projectId, ...options } = input;
    expect(d.supervisor.gitAddWorktree).toHaveBeenCalledExactlyOnceWith({
      ...options,
      projectLocation,
      path: "/fixture/checkout",
    });
    expect(d.createThread).not.toHaveBeenCalled();
  });

  it.skipIf(!sqliteAvailable)("pins review actions and replays mutation receipts", async () => {
    const previousBinding = process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    try {
      initDatabase(":memory:");
      const projectId = thread.projectId;
      const projectLocation = { kind: "posix", path: "/fixture/repo" } as const;
      const forgeAccount = { forge: "github", host: "https://github.com", login: "fixture" };
      const scope = { projectId, forgeAccount, forgeRepository: "fixture/repo", prNumber: 12 };
      const { projectId: _projectId, ...remoteScope } = scope;
      const ownerScope = { ...remoteScope, projectLocation };
      const viewedFiles = { storage: "host", files: [], currentFiles: [] };
      const call = vi.fn<AppControlsRuntime["call"]>(
        async (name) =>
          (name === "forgeListPrLabelCandidates"
            ? { labels: [{ name: "needs-review" }], truncated: false }
            : name === "forgeSetPrFileViewed"
              ? viewedFiles
              : name === "forgeListPullRequestsInState"
                ? { pullRequests: [], viewerLogin: "fixture" }
                : undefined) as never,
      );
      ingress = new AppControlsMcpIngress(
        deps({
          getProject: () => ({
            id: projectId,
            name: "Fixture",
            location: projectLocation,
            createdAt: thread.createdAt,
          }),
          runtime: { call },
        }),
      );
      const { url, token } = await ingress.start();
      const review = (input: Record<string, unknown>) =>
        callTool(url, token, "review_manage", { ...scope, ...input });
      await expect(review({ action: "list_labels" })).resolves.toMatchObject({
        payload: { labels: [{ name: "needs-review" }], truncated: false },
      });
      expect(call).toHaveBeenNthCalledWith(1, "forgeListPrLabelCandidates", ownerScope);
      const update = {
        action: "set_file_viewed",
        path: "src/example.ts",
        fingerprint: null,
        operationKey: "fixture-viewed-1",
      };
      await expect(review(update)).resolves.toMatchObject({
        payload: { updated: true, viewedFiles },
      });
      await expect(review(update)).resolves.toMatchObject({
        payload: { updated: true, viewedFiles },
      });
      await expect(review({ ...update, path: "different.ts" })).resolves.toMatchObject({
        isError: true,
      });
      expect(call).toHaveBeenNthCalledWith(2, "forgeSetPrFileViewed", {
        ...ownerScope,
        path: "src/example.ts",
        fingerprint: null,
      });
      expect(call).toHaveBeenCalledTimes(2);

      const draft = {
        action: "submit_draft",
        operationKey: "fixture-inline-2",
        decision: "comment",
        body: "Review",
        expectedHeadSha: "a".repeat(40),
        comments: [
          { path: "src/example.ts", side: "LEFT", line: 5, startLine: 3, body: "Fixture comment" },
        ],
      };
      const { action: _action, operationKey: _key, ...draftPayload } = draft;
      await expect(review({ ...draft, forgeRepository: undefined })).resolves.toMatchObject({
        isError: true,
      });
      await expect(review(draft)).resolves.toMatchObject({ payload: { updated: true } });
      await expect(review(draft)).resolves.toMatchObject({ payload: { updated: true } });
      expect(call).toHaveBeenNthCalledWith(3, "forgeSubmitPrReviewDraft", {
        ...ownerScope,
        ...draftPayload,
      });
      expect(call).toHaveBeenCalledTimes(3);
      await expect(
        callTool(url, token, "review_list_prs", {
          projectId,
          forgeAccount,
          forgeRepository: scope.forgeRepository,
          state: "merged",
        }),
      ).resolves.toMatchObject({
        payload: { state: "merged", count: 0, viewerLogin: "fixture" },
      });
      expect(call).toHaveBeenNthCalledWith(4, "forgeListPullRequestsInState", {
        projectLocation,
        forgeAccount,
        forgeRepository: scope.forgeRepository,
        state: "merged",
      });
    } finally {
      await ingress?.dispose();
      ingress = null;
      closeDatabase();
      if (previousBinding === undefined) delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
      else process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = previousBinding;
    }
  });

  it("drafts Git text with the saved host preset or exact caller selection", async () => {
    const d = deps();
    const projectLocation = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/fixture/project",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\fixture\\project",
    } as const;
    const projectId = thread.projectId;
    const savedSelection = { model: "fixture-model", effort: "", fast: false };
    d.settings.read = () => ({
      ...defaultSharedSettings,
      wslCommitGenProvider: "fixture-provider",
      wslCommitGenSelection: savedSelection,
      gitTextLanguage: "fr",
    });
    d.getProject = () => ({
      id: projectId,
      name: "Fixture",
      location: projectLocation,
      createdAt: thread.createdAt,
    });
    const call = vi.fn<AppControlsRuntime["call"]>(
      async (name) =>
        (name === "generateCommitMessage"
          ? { message: "fix: décrire le changement" }
          : { title: "Fixture summary", description: "Describe the checked diff" }) as never,
    );
    ingress = new AppControlsMcpIngress({ ...d, runtime: { call } });
    const { url, token } = await ingress.start();
    await expect(
      callTool(url, token, "generate_commit_message", { projectId }),
    ).resolves.toMatchObject({
      payload: { message: "fix: décrire le changement", provider: "fixture-provider" },
    });
    expect(call).toHaveBeenNthCalledWith(1, "generateCommitMessage", {
      projectLocation,
      agentKind: "fixture-provider",
      selection: savedSelection,
      language: "French",
    });
    const selection = { model: "another-model", thinking: false, contextSize: "large" };
    await expect(
      callTool(url, token, "generate_pr_summary", {
        projectId,
        agentKind: "other-provider",
        branch: "feature",
        baseBranch: "origin/main",
        selection,
        language: "English",
      }),
    ).resolves.toMatchObject({
      payload: { title: "Fixture summary", provider: "other-provider" },
    });
    expect(call).toHaveBeenNthCalledWith(2, "generatePrSummary", {
      projectLocation,
      agentKind: "other-provider",
      branch: "feature",
      baseBranch: "origin/main",
      selection,
      language: "English",
    });
  });

  it("returns the app's compound sync outcome through tools/call", async () => {
    const d = deps();
    vi.mocked(d.supervisor.gitSyncRebase).mockResolvedValue({ pulled: true, pushed: false });
    const projectLocation = { kind: "posix", path: "/fixture/project" } as const;
    d.getProject = (id) =>
      id === thread.projectId
        ? { id, name: "Project", location: projectLocation, createdAt: thread.createdAt }
        : null;
    ingress = new AppControlsMcpIngress(d);
    const { url, token } = await ingress.start();
    const input = { projectId: thread.projectId, action: "sync_rebase", remote: "upstream" };
    await expect(callTool(url, token, "git_sync", input)).resolves.toMatchObject({
      payload: { action: "sync_rebase", pulled: true, pushed: false },
    });
    await expect(
      callTool(url, token, "git_sync", { ...input, preserveLocalChanges: true }),
    ).resolves.toMatchObject({ isError: true });
    expect(d.supervisor.gitSyncRebase).toHaveBeenCalledExactlyOnceWith({
      projectLocation,
      remote: "upstream",
    });
  });

  it("reports saved and live composer selections with the session's advertised controls", async () => {
    const d = deps();
    const savedConfig = { ...thread.config, fast: false };
    const runtimeConfig = { model: savedConfig.model, effort: "medium" };
    const options = [
      { type: "boolean" as const, id: "fast", role: "fast" as const, currentValue: false },
    ];
    const slashCommands = [{ id: "status", label: "/status" }];
    const snapshot: ThreadRuntimeSnapshot = {
      threadId: thread.id,
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
      config: runtimeConfig,
      sessionConfigOptions: options,
      slashCommands,
    };
    vi.mocked(d.supervisor.getThreadSnapshots)
      .mockResolvedValueOnce([snapshot])
      .mockResolvedValueOnce([{ ...snapshot, sessionConfigOptions: null }])
      .mockResolvedValueOnce([]);
    d.getThread = (id) =>
      id === thread.id
        ? {
            ...thread,
            config: {
              ...savedConfig,
              importedFrom: { path: "/private/transcript", importedAt: thread.createdAt },
            },
          }
        : null;
    ingress = new AppControlsMcpIngress(d);
    const { url, token } = await ingress.start();
    const getThread = () => callTool(url, token, "get_thread", { threadId: thread.id });
    const running = await getThread();
    expect(running.payload?.config).toStrictEqual(savedConfig);
    expect(running.payload).toMatchObject({
      runtimeConfig,
      sessionConfigOptions: options,
      slashCommands,
    });
    await expect(getThread()).resolves.toMatchObject({ payload: { sessionConfigOptions: null } });
    const inactive = await getThread();
    expect(inactive.payload?.config).toStrictEqual(savedConfig);
    expect(inactive.payload).not.toHaveProperty("runtimeConfig");
    expect(inactive.payload).not.toHaveProperty("sessionConfigOptions");
  });

  it.skipIf(!sqliteAvailable)(
    "shares scoped memory edits with the app catalog over MCP",
    async () => {
      const deviceWorkspace = new DeviceWorkspaceService((id) => id === thread.id);
      const projectPath = mkdtempSync(join(tmpdir(), "poracode-mcp-memory-"));
      const previousBinding = process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
      if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
      try {
        initDatabase(":memory:");
        dbUpsertProject(
          {
            id: thread.projectId,
            name: "Alpha",
            location: {
              kind: process.platform === "win32" ? "windows" : "posix",
              path: projectPath,
            },
            createdAt: thread.createdAt,
          },
          0,
        );
        dbUpsertThread(thread, 0);
        const syncMemory = vi.fn<NonNullable<AppControlsMcpIngressDeps["syncMemory"]>>(
          async () => ({ syncedHosts: 2, changed: true }),
        );
        ingress = new AppControlsMcpIngress(deps({ deviceWorkspace, syncMemory }));
        const { url, token } = await ingress.start();
        const signingKey = deviceWorkspace.supervisorExtraEnv()[DEVICE_WORKSPACE_AGENT_KEY_ENV]!;
        const proof = deviceThreadProof(signingKey, thread.id);
        await expect(
          callTool(url, token, "manage_memory", { action: "list" }),
        ).resolves.toMatchObject({
          isError: true,
          error: expect.stringContaining("host-issued device credential"),
        });
        const manage = (args: Record<string, unknown>) =>
          callTool(url, token, "manage_memory", args, proof);
        setMemorySettingsReader(() => ({
          ...defaultMemorySettings,
          enabled: true,
          syncEnabled: false,
        }));
        await expect(manage({ action: "sync" })).resolves.toMatchObject({
          isError: true,
          error: expect.stringContaining("sync is disabled"),
        });
        expect(syncMemory).not.toHaveBeenCalled();
        setMemorySettingsReader(() => ({
          ...defaultMemorySettings,
          enabled: true,
          syncEnabled: true,
        }));
        await expect(manage({ action: "sync" })).resolves.toMatchObject({
          payload: { action: "sync", result: { syncedHosts: 2, changed: true } },
        });
        expect(syncMemory).toHaveBeenCalledExactlyOnceWith();
        const entry = {
          scope: "project",
          category: "project",
          summary: "Use bun",
          body: "Use bun in this repository.",
          polarity: "fact",
          pinned: false,
        } as const;
        const created = await manage({ action: "save", entry });
        expect(created.payload).toMatchObject({
          result: { id: expect.any(String), projectId: thread.projectId, pinned: false },
        });
        const { id } = z.object({ id: z.string() }).parse(created.payload?.result);
        await expect(
          manage({ action: "save", entry: { ...entry, id, pinned: true } }),
        ).resolves.toMatchObject({
          payload: { result: { id, pinned: true } },
        });
        expect(await handleMemoryCommand({ action: "list" })).toMatchObject([
          { id, projectId: thread.projectId, ...entry, pinned: true },
        ]);
        const list = await manage({ action: "list" });
        expect(list.payload).toMatchObject({ count: 1, entries: [{ id, summary: "Use bun" }] });
        expect(z.array(z.unknown()).parse(list.payload?.entries)[0]).not.toHaveProperty("body");
        await expect(manage({ action: "list", includeBody: true })).resolves.toMatchObject({
          payload: { entries: [{ id, body: entry.body }] },
        });
        await expect(manage({ action: "status" })).resolves.toMatchObject({
          payload: { result: { entryCount: 1 } },
        });
        await expect(
          manage({ action: "thread-mode", threadId: "other", mode: "learn" }),
        ).resolves.toMatchObject({
          isError: true,
          error: expect.stringContaining("calling thread"),
        });
        await expect(manage({ action: "thread-mode", mode: "learn" })).resolves.toMatchObject({
          payload: { result: { mode: "learn" } },
        });
        expect(await handleMemoryCommand({ action: "status", threadId: thread.id })).toMatchObject({
          threadMode: "learn",
        });
        setMemorySettingsReader(() => ({ ...defaultMemorySettings, enabled: true }));
        const dream = await manage({ action: "dream" });
        const { runId } = z.object({ runId: z.string() }).parse(dream.payload?.result);
        await expect(manage({ action: "status" })).resolves.toMatchObject({
          payload: { result: { lastDreamRunId: runId } },
        });
        await expect(manage({ action: "undo", runId })).resolves.toMatchObject({
          payload: { result: { ok: true } },
        });
        await expect(manage({ action: "undo", runId })).resolves.toMatchObject({ isError: true });

        const suggestion = {
          id: "local-suggestion",
          projectId: thread.projectId,
          name: "bun-project",
          description: "Use bun in this project.",
          body: "---\nname: bun-project\ndescription: Use bun\n---\nUse bun.",
          scope: "project",
          availability: "poracode",
          why: "Repeated preference",
          status: "suggested",
          createdAt: thread.createdAt,
          updatedAt: thread.createdAt,
        } as const;
        dbUpsertMemorySuggestion(suggestion);
        dbUpsertMemorySuggestion({
          ...suggestion,
          id: "other-suggestion",
          projectId: "other-project",
        });
        dbUpsertMemorySuggestion({ ...suggestion, id: "dismiss-suggestion" });
        const suggestions = await manage({ action: "suggestions", limit: 1, includeBody: true });
        expect(suggestions.payload).toMatchObject({
          count: 2,
          nextOffset: 1,
          entries: [{ body: suggestion.body }],
        });
        await expect(
          manage({ action: "suggestion", id: "other-suggestion", decision: "dismiss" }),
        ).resolves.toMatchObject({
          isError: true,
          error: expect.stringContaining("not found"),
        });
        await expect(
          manage({ action: "suggestion", id: "dismiss-suggestion", decision: "dismiss" }),
        ).resolves.toMatchObject({
          payload: { result: { ok: true } },
        });
        await expect(
          manage({
            action: "suggestion",
            id: suggestion.id,
            decision: "approve",
            name: "bun-workflow",
          }),
        ).resolves.toMatchObject({
          payload: { result: { ok: true } },
        });
        expect(
          readFileSync(
            join(projectPath, ".poracode", "skills", "bun-workflow", "SKILL.md"),
            "utf8",
          ),
        ).toContain("name: bun-workflow");
        await expect(
          manage({ action: "delete", id, projectId: "another-project" }),
        ).resolves.toMatchObject({
          isError: true,
          error: expect.stringContaining("calling thread's project"),
        });
        await expect(manage({ action: "thread-mode", mode: "incognito" })).resolves.toMatchObject({
          payload: { result: { mode: "incognito" } },
        });
        await expect(manage({ action: "thread-mode", mode: "learn" })).resolves.toMatchObject({
          isError: true,
        });
        await expect(manage({ action: "delete", id })).resolves.toMatchObject({
          isError: true,
          error: expect.stringContaining("incognito"),
        });
        dbSetMemoryThreadState({
          threadId: thread.id,
          mode: "recall",
          updatedAt: thread.createdAt,
        });
        await expect(manage({ action: "delete", id })).resolves.toMatchObject({
          payload: { result: { ok: true } },
        });
        expect(await handleMemoryCommand({ action: "list" })).toEqual([]);
      } finally {
        await ingress?.dispose();
        await deviceWorkspace.dispose();
        closeDatabase();
        setMemorySettingsReader(() => defaultMemorySettings);
        rmSync(projectPath, { recursive: true, force: true });
        if (previousBinding === undefined)
          delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
        else process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = previousBinding;
      }
    },
  );

  it.skipIf(!sqliteAvailable)(
    "reads structured history and exact older cursors through MCP",
    async () => {
      const previousBinding = process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
      if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
      try {
        initDatabase(":memory:");
        const { id: threadId, projectId, createdAt } = thread;
        dbUpsertProject(
          {
            id: projectId,
            name: "Alpha",
            location: { kind: "posix", path: "/fixture" },
            createdAt,
          },
          0,
        );
        dbUpsertThread(thread, 0);
        const changedText = "after".repeat(650);
        await dbReplaceThreadRuntimeItems(threadId, [
          {
            id: "prompt",
            type: "user_message",
            state: "completed",
            streams: {},
            payload: { content: [{ kind: "text", text: "Edit the file" }] },
          },
          {
            id: "edit",
            type: "file_change",
            state: "completed",
            streams: {},
            payload: {
              path: "file.ts",
              changeKind: "edit",
              status: "completed",
              diffSummary: { added: 1, removed: 1 },
              args: { old_str: "before", new_str: changedText },
            },
          },
        ]);
        dbReplaceThreadCompletedTurns(threadId, [
          { startedAt: createdAt, endedAt: createdAt, anchorItemId: null },
          { startedAt: createdAt, endedAt: createdAt, anchorItemId: "edit" },
        ]);
        getSqlite()
          .prepare(
            `INSERT INTO thread_runtime_gap_notices
            (thread_id, acknowledged_token, source, reason, refused_events, refused_bytes,
             acknowledged_count, first_acknowledged_at, last_acknowledged_at)
            VALUES (?, ?, 'exact', 'age', 2, 100, 1, ?, ?)`,
          )
          .run(
            threadId,
            runtimeHistoryNoticeExactToken("b9c90777-7f24-4bd0-ac69-3a5e74ee524e"),
            Date.parse(createdAt),
            Date.parse(createdAt),
          );
        ingress = new AppControlsMcpIngress(deps());
        const { url, token } = await ingress.start();
        const history = (input: Record<string, unknown>) =>
          callTool(url, token, "read_thread_history", { threadId, ...input });

        const items = await history({ action: "items", limit: 1 });
        const runtimeNotice = { kind: "history-incomplete", reason: "age", refusedEvents: 2 };
        expect(items.payload).toMatchObject({
          action: "items",
          items: [{ id: "edit", type: "file_change", detailsDeferred: true }],
          nextCursor: expect.any(Number),
          runtimeNotice,
        });
        await expect(
          history({ action: "items", beforePosition: items.payload?.nextCursor }),
        ).resolves.toMatchObject({ payload: { items: [{ id: "prompt" }], nextCursor: null } });
        await expect(history({ action: "detail", itemId: "edit" })).resolves.toMatchObject({
          payload: {
            item: { id: "edit", payload: { args: { new_str: changedText } } },
            runtimeNotice,
          },
        });
        await expect(
          history({ action: "detail", itemId: "edit", maxBytes: 16 }),
        ).resolves.toMatchObject({ isError: true, error: expect.stringContaining("byte caps") });
        await expect(history({ action: "detail", itemId: "unknown" })).resolves.toMatchObject({
          isError: true,
          error: expect.stringContaining("History item not found"),
        });

        const turns = await history({ action: "turns", limit: 1 });
        expect(turns.payload).toMatchObject({
          turns: [{ anchorItemId: "edit" }],
          completedTurnsNextCursor: expect.stringMatching(/^ct1\./u),
          runtimeNotice,
        });
        await expect(
          history({ action: "turns", limit: 1, cursor: turns.payload?.completedTurnsNextCursor }),
        ).resolves.toMatchObject({
          payload: { turns: [{ anchorItemId: null }], completedTurnsNextCursor: null },
        });
        await expect(history({ action: "turns", cursor: "wrong-cursor" })).resolves.toMatchObject({
          isError: true,
          error: expect.stringContaining("cursor is malformed"),
        });
      } finally {
        await ingress?.dispose();
        ingress = null;
        closeDatabase();
        if (previousBinding === undefined)
          delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
        else process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = previousBinding;
      }
    },
  );

  it("passes the complete worktree group to the owner and protects the calling thread", async () => {
    const applyThreadLifecycle = vi.fn<
      NonNullable<AppControlsMcpIngressDeps["applyThreadLifecycle"]>
    >(async () => undefined);
    ingress = new AppControlsMcpIngress(deps({ applyThreadLifecycle }));
    const { url, token } = await ingress.start();
    const input = {
      projectId: "project-1",
      worktreePath: "/fixture/worktree",
      threadIds: ["first", "archived"],
    };
    const remove = (args: Record<string, unknown>) =>
      callTool(url, token, "delete_worktree_group", args);
    await expect(remove({ ...input, threadIds: ["first", thread.id] })).resolves.toMatchObject({
      isError: true,
      error: expect.stringContaining("own thread"),
    });
    await expect(remove({ ...input, threadIds: [] })).resolves.toMatchObject({ isError: true });
    await expect(remove({ ...input, threadId: "unrelated" })).resolves.toMatchObject({
      isError: true,
    });
    expect(applyThreadLifecycle).not.toHaveBeenCalled();
    await expect(remove(input)).resolves.toMatchObject({ payload: { ...input, deleted: true } });
    expect(applyThreadLifecycle).toHaveBeenCalledExactlyOnceWith({
      kind: "delete-worktree-group",
      threadId: "first",
      ...input,
    });
  });

  it("uses the move-to-worktree choice and operation key and refuses moving the caller", async () => {
    const moveThreadToWorktree = vi.fn<
      NonNullable<AppControlsMcpIngressDeps["moveThreadToWorktree"]>
    >(async ({ threadId }) => ({
      threadId,
      worktreePath: "/fixture/new-checkout",
      branch: "poracode/new-checkout",
      outcome: "moved",
      runtime: "not_reopened",
    }));
    ingress = new AppControlsMcpIngress(deps({ moveThreadToWorktree }));
    const { url, token } = await ingress.start();
    const move = (input: Record<string, unknown>) =>
      callTool(url, token, "move_thread_to_worktree", input);
    const operationKey = "move-123456";
    await expect(move({ threadId: "other", operationKey })).resolves.toMatchObject({
      payload: { outcome: "moved", worktreePath: "/fixture/new-checkout" },
    });
    expect(moveThreadToWorktree).toHaveBeenLastCalledWith({
      threadId: "other",
      operationKey,
      withChanges: false,
    });
    await expect(
      move({ threadId: "other", operationKey, withChanges: true }),
    ).resolves.toMatchObject({
      isError: false,
    });
    expect(moveThreadToWorktree).toHaveBeenLastCalledWith({
      threadId: "other",
      operationKey,
      withChanges: true,
    });
    await expect(move({ threadId: thread.id, operationKey })).resolves.toMatchObject({
      isError: true,
      error: expect.stringContaining("own thread"),
    });
    await expect(move({ threadId: "other" })).resolves.toMatchObject({ isError: true });
    expect(moveThreadToWorktree).toHaveBeenCalledTimes(2);
  });

  it("passes the target composer configuration to the handoff owner and guards self-switch", async () => {
    const handoffThread = vi.fn<NonNullable<AppControlsMcpIngressDeps["handoffThread"]>>(
      async ({ sourceThreadId }) => ({
        threadId: "continued",
        sourceThreadId,
        mode: "fork",
        context: "thread-transcript",
        sourceDisposition: "open",
      }),
    );
    ingress = new AppControlsMcpIngress(deps({ handoffThread }));
    const { url, token } = await ingress.start();
    const args = {
      sourceThreadId: thread.id,
      agentKind: "fixture-target",
      agentInstanceId: "named-target",
      config: { model: "fixture-model", fast: false },
      presentationMode: "gui",
      intent: "fork",
      operationKey: "handoff-001",
    };
    await expect(callTool(url, token, "handoff_thread", args)).resolves.toMatchObject({
      payload: { threadId: "continued", sourceDisposition: "open" },
    });
    expect(handoffThread).toHaveBeenCalledExactlyOnceWith({ ...args, withoutContext: false });
    await expect(
      callTool(url, token, "handoff_thread", { ...args, intent: "switch" }),
    ).resolves.toMatchObject({ isError: true, error: expect.stringContaining("own thread") });
    expect(handoffThread).toHaveBeenCalledTimes(1);
  });

  it("uses the paired project selector and refuses self-transfer and caller-supplied endpoints", async () => {
    const transferThread = vi.fn<NonNullable<AppControlsMcpIngressDeps["transferThread"]>>(
      async () => ({
        action: "move",
        threadId: "moved",
        destinationProjectId: "project-selection",
        targetLabel: "Machine",
        branchRenamed: false,
        sourceArchived: true,
        continueFailed: false,
      }),
    );
    ingress = new AppControlsMcpIngress(deps({ transferThread }));
    const { url, token } = await ingress.start();
    const args = {
      action: "move",
      threadId: "other",
      destinationProjectId: "project-selection",
      operationKey: "transfer-001",
      agent: { kind: "fixture-agent", config: { model: "fixture", fast: false } },
    };
    await expect(callTool(url, token, "thread_transfer", args)).resolves.toMatchObject({
      payload: { threadId: "moved", sourceArchived: true },
    });
    expect(transferThread).toHaveBeenCalledExactlyOnceWith({ ...args, stopFirst: false });
    await expect(
      callTool(url, token, "thread_transfer", { ...args, threadId: thread.id }),
    ).resolves.toMatchObject({
      isError: true,
      error: expect.stringContaining("own thread"),
    });
    await expect(
      callTool(url, token, "thread_transfer", { ...args, endpoint: "https://fixture.test" }),
    ).resolves.toMatchObject({
      isError: true,
    });
    expect(transferThread).toHaveBeenCalledTimes(1);
  });

  it("routes sidebar reorder inputs through the same catalog commands as the app", async () => {
    const editCatalog = vi.fn<NonNullable<AppControlsMcpIngressDeps["editCatalog"]>>(async () => ({
      changed: true,
    }));
    ingress = new AppControlsMcpIngress(deps({ editCatalog }));
    const { url, token } = await ingress.start();
    const project = {
      projectId: "source",
      targetProjectId: "target",
      placement: "before",
    };
    await expect(
      callTool(url, token, "reorder_project", { ...project, operationKey: "project-order-1" }),
    ).resolves.toMatchObject({ payload: { changed: true } });
    expect(editCatalog).toHaveBeenLastCalledWith(
      { kind: "reorder", ...project },
      "project-order-1",
    );

    const threadOrder = {
      projectId: "source",
      threadId: "first",
      targetThreadId: "reference",
      placement: "after",
    };
    await expect(
      callTool(url, token, "reorder_thread", { ...threadOrder, operationKey: "thread-order-1" }),
    ).resolves.toMatchObject({ payload: { changed: true } });
    expect(editCatalog).toHaveBeenLastCalledWith(
      { kind: "reorder", threadIds: ["first"], ...threadOrder },
      "thread-order-1",
    );
    await expect(
      callTool(url, token, "reorder_thread", {
        ...threadOrder,
        scope: "catalog",
        operationKey: "thread-order-2",
      }),
    ).resolves.toMatchObject({ payload: { changed: true } });
    expect(editCatalog).toHaveBeenLastCalledWith(
      { kind: "reorder-flat", ...threadOrder },
      "thread-order-2",
    );
    await expect(
      callTool(url, token, "reorder_thread", {
        ...threadOrder,
        scope: "catalog",
        threadIds: ["first", "second"],
        operationKey: "thread-order-3",
      }),
    ).resolves.toMatchObject({ isError: true });
    await expect(callTool(url, token, "reorder_project", project)).resolves.toMatchObject({
      isError: true,
    });
    expect(editCatalog).toHaveBeenCalledTimes(3);
  });

  it("routes saved and cleared project drafts through the app’s catalog mutation", async () => {
    const editCatalog = vi.fn<NonNullable<AppControlsMcpIngressDeps["editCatalog"]>>(async () => ({
      changed: true,
    }));
    const lastDraftConfig = {
      agentKind: "codex",
      model: "",
      effort: "",
      fast: false,
      worktreeMode: true,
    };
    const projectId = thread.projectId;
    const project = {
      id: projectId,
      name: "Fixture",
      location: { kind: "posix", path: "/fixture" },
      createdAt: thread.createdAt,
      lastDraftConfig,
    } satisfies Project;
    ingress = new AppControlsMcpIngress(deps({ editCatalog, getProject: () => project }));
    const { url, token } = await ingress.start();
    await expect(callTool(url, token, "get_project", { projectId })).resolves.toMatchObject({
      payload: { lastDraftConfig },
    });
    const set = (input: Record<string, unknown>) =>
      callTool(url, token, "set_project_draft_config", { projectId, ...input });
    await expect(set({ lastDraftConfig, operationKey: "save-draft-1" })).resolves.toMatchObject({
      payload: { changed: true },
    });
    await expect(
      set({ lastDraftConfig: null, operationKey: "clear-draft-2" }),
    ).resolves.toMatchObject({
      payload: { changed: true },
    });
    await expect(set({ operationKey: "missing-draft-3" })).resolves.toMatchObject({
      isError: true,
    });
    expect(editCatalog).toHaveBeenNthCalledWith(
      1,
      { kind: "set-draft-config", projectId, lastDraftConfig },
      "save-draft-1",
    );
    expect(editCatalog).toHaveBeenNthCalledWith(
      2,
      { kind: "set-draft-config", projectId, lastDraftConfig: null },
      "clear-draft-2",
    );
    expect(editCatalog).toHaveBeenCalledTimes(2);
  });

  it("passes the saved Notes revision and full editor replacement to the owning host", async () => {
    const projectId = thread.projectId;
    const replacement = { doc: null, todos: [] };
    const notes = { projectId, ...replacement, updatedAt: "saved", revision: "saved-revision" };
    const compareAndSetProjectNotes = vi.fn<
      NonNullable<AppControlsMcpIngressDeps["compareAndSetProjectNotes"]>
    >(() => ({ status: "conflict", notes }));
    ingress = new AppControlsMcpIngress(
      deps({ getProjectNotes: () => notes, compareAndSetProjectNotes }),
    );
    const { url, token } = await ingress.start();
    await expect(callTool(url, token, "get_project_notes", { projectId })).resolves.toMatchObject({
      payload: { notes },
    });
    await expect(
      callTool(url, token, "update_project_notes", {
        projectId,
        baseRevision: "stale-revision",
        replacement,
      }),
    ).resolves.toMatchObject({ payload: { status: "conflict", notes } });
    expect(compareAndSetProjectNotes).toHaveBeenCalledExactlyOnceWith({
      projectId,
      baseRevision: "stale-revision",
      replacement,
    });
    await expect(
      callTool(url, token, "update_project_notes", { projectId, replacement }),
    ).resolves.toMatchObject({
      isError: true,
    });
    expect(compareAndSetProjectNotes).toHaveBeenCalledTimes(1);
  });

  it("routes follow-ups, goal changes, and checkpoints through the owning services", async () => {
    const call = vi.fn<(name: string, payload: unknown) => Promise<unknown>>(async () => undefined);
    const reopenThread = vi.fn<NonNullable<AppControlsMcpIngressDeps["reopenThread"]>>(
      async (threadId) => ({ threadId }),
    );
    const revertCheckpoint = vi.fn<NonNullable<AppControlsMcpIngressDeps["revertCheckpoint"]>>(
      async () => ({
        outcome: "completed",
        replayed: false,
        numTurns: 1,
        providerPhase: "completed",
        filesPhase: "completed",
        truncatePhase: "completed",
        removedCompletedTurnAnchors: ["turn-1"],
      }),
    );
    const target = { ...thread, id: "target" };
    ingress = new AppControlsMcpIngress(
      deps({
        getThread: (id) => (id === target.id ? target : id === thread.id ? thread : null),
        runtime: { call: call as AppControlsRuntime["call"] },
        reopenThread,
        revertCheckpoint,
      }),
    );
    const { url, token } = await ingress.start();
    const invoke = (name: string, input: Record<string, unknown>) =>
      callTool(url, token, name, input);
    await expect(
      invoke("thread_follow_ups", {
        threadId: target.id,
        action: "enqueue",
        prompt: "Check the diff",
      }),
    ).resolves.toMatchObject({ isError: false });
    expect(call).toHaveBeenLastCalledWith("queueThreadFollowUp", {
      threadId: target.id,
      prompt: "Check the diff",
      config: target.config,
    });
    await expect(
      invoke("thread_follow_ups", {
        threadId: target.id,
        action: "edit",
        id: "follow-up-1",
        expectedStagedAt: 42,
        prompt: "Recheck the diff",
      }),
    ).resolves.toMatchObject({ isError: false });
    expect(call).toHaveBeenLastCalledWith("editQueuedThreadFollowUp", {
      threadId: target.id,
      id: "follow-up-1",
      expectedStagedAt: 42,
      prompt: "Recheck the diff",
    });
    await expect(
      invoke("thread_follow_ups", { threadId: thread.id, action: "steer", id: "self" }),
    ).resolves.toMatchObject({ isError: true, error: expect.stringContaining("own thread") });
    await expect(
      invoke("thread_goal", { threadId: target.id, action: "edit", objective: "Check parity" }),
    ).resolves.toMatchObject({ isError: false });
    expect(call).toHaveBeenLastCalledWith("controlThreadGoal", {
      threadId: target.id,
      action: "edit",
      objective: "Check parity",
    });
    await expect(
      invoke("reopen_thread", { threadId: target.id, initialSize: { rows: 30, cols: 100 } }),
    ).resolves.toMatchObject({ payload: { threadId: target.id } });
    expect(reopenThread).toHaveBeenCalledWith(target.id, { rows: 30, cols: 100 });
    const checkpoint = {
      threadId: target.id,
      checkpointItemId: "item-1",
      operationKey: "restore-001",
    };
    await expect(invoke("restore_thread_checkpoint", checkpoint)).resolves.toMatchObject({
      payload: { outcome: "completed" },
    });
    expect(revertCheckpoint).toHaveBeenCalledExactlyOnceWith(checkpoint);
  });

  it("routes project file and GitHub Actions requests with the owning checkout and account", async () => {
    const call = vi.fn<(name: string, payload: unknown) => Promise<unknown>>(async (name) =>
      name === "writeProjectFile" ? { modifiedAtMs: 13 } : undefined,
    );
    const location = { kind: "posix" as const, path: "/fixture/project" };
    const ghAccount = { login: "fixture", host: "github.com" };
    ingress = new AppControlsMcpIngress(
      deps({
        getProject: (id) =>
          id === "project-1"
            ? ({
                id,
                name: "Project",
                location,
                ghAccount,
                createdAt: "2026-01-01T00:00:00.000Z",
              } as Project)
            : null,
        runtime: { call: call as AppControlsRuntime["call"] },
      }),
    );
    const { url, token } = await ingress.start();
    const invoke = (name: string, input: Record<string, unknown>) =>
      callTool(url, token, name, input);
    await expect(
      invoke("manage_project_file", {
        projectId: "project-1",
        action: "write",
        path: "README.md",
        content: "Updated",
        baseModifiedAtMs: 12,
      }),
    ).resolves.toMatchObject({ payload: { modifiedAtMs: 13 } });
    expect(call).toHaveBeenLastCalledWith("writeProjectFile", {
      projectLocation: location,
      path: "README.md",
      content: "Updated",
      baseModifiedAtMs: 12,
    });
    const target = { projectId: "project-1", path: "README.md" };
    await expect(
      invoke("manage_project_file", { ...target, action: "create", type: "file" }),
    ).resolves.toMatchObject({ payload: { ...target, type: "file", created: true } });
    await expect(
      invoke("manage_project_file", { ...target, action: "rename", nextName: "renamed.md" }),
    ).resolves.toMatchObject({ payload: { ...target, nextName: "renamed.md", renamed: true } });
    await expect(
      invoke("manage_project_file", { ...target, action: "move", nextParentPath: "docs" }),
    ).resolves.toMatchObject({ payload: { ...target, nextParentPath: "docs", moved: true } });
    await expect(
      invoke("github_actions", {
        projectId: "project-1",
        action: "rerun",
        runId: 4,
        failedOnly: true,
      }),
    ).resolves.toMatchObject({ payload: { ok: true } });
    expect(call).toHaveBeenLastCalledWith("ghRerunWorkflowRun", {
      projectLocation: location,
      ghAccount,
      runId: 4,
      failedOnly: true,
    });
    await expect(
      invoke("manage_project_file", {
        projectId: "missing",
        action: "delete",
        path: "README.md",
      }),
    ).resolves.toMatchObject({
      isError: true,
      error: expect.stringContaining("Project not found"),
    });
    expect(call).toHaveBeenCalledTimes(5);
  });

  it("reads the full notes document and to-dos for a known project", async () => {
    const doc = { type: "doc", content: [{ type: "paragraph" }] };
    const todo = { id: "todo-1", text: "Read the notes", done: false, createdAt: "2026-01-01" };
    ingress = new AppControlsMcpIngress(
      deps({
        getProjectNotes: (projectId) => ({
          projectId,
          doc,
          todos: [todo],
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      }),
    );
    const { url, token } = await ingress.start();
    await expect(
      callTool(url, token, "get_project_notes", { projectId: "project-1" }),
    ).resolves.toMatchObject({ payload: { notes: { doc, todos: [todo] } } });
    await expect(
      callTool(url, token, "get_project_notes", { projectId: "unknown" }),
    ).resolves.toMatchObject({
      isError: true,
      error: expect.stringContaining("Project not found"),
    });
  });

  it("browses, reviews, installs, configures, updates and removes a plugin through HTTP", async () => {
    const root = mkdtempSync(join(tmpdir(), "poracode-app-controls-catalog-"));
    try {
      const source = join(root, "marketplace");
      const pkg = join(source, "notes");
      mkdirSync(pkg, { recursive: true });
      const writeManifest = (version: string) =>
        writeFileSync(
          join(pkg, "plugin.json"),
          JSON.stringify({
            $schema: AGENT_PLUGINS_MANIFEST_SCHEMA_URL,
            name: "notes",
            version,
            description: "Integration for team notes",
            extensions: { "com.poracode.client": { defaultEnabled: false } },
          }),
        );
      writeManifest("1.0.0");
      writeFileSync(
        join(pkg, "mcp.json"),
        JSON.stringify({
          $schema: AGENT_PLUGINS_MCP_SCHEMA_URL,
          mcpServers: {
            notes: {
              type: "streamable-http",
              url: "https://notes.example.invalid/mcp?secret=fixture-url-secret",
              headers: { "X-Secret": "fixture-header-secret" },
            },
          },
        }),
      );
      writeFileSync(
        join(source, "marketplace.json"),
        JSON.stringify({
          name: "Fixture catalog",
          plugins: [{ name: "notes", description: "Integration for team notes", source: "notes" }],
        }),
      );
      // Version 2 snapshots predate catalog categories. They load without migration work by the MCP.
      writeFileSync(
        join(root, "plugin-catalogs.json"),
        JSON.stringify({ version: 2, catalogs: [] }),
      );
      const registry = new PluginRegistry({
        bundledPluginsDir: () => join(process.cwd(), "resources", "plugins"),
        userPluginsDir: () => join(root, "plugins"),
      });
      const removeAccounts = vi.fn<(pluginName: string) => void>();
      const catalog = new PluginCatalogService({ baseDir: root, registry, removeAccounts });
      let settings = defaultSharedSettings;
      const base = deps();
      ingress = new AppControlsMcpIngress(
        deps({
          supervisor: {
            ...base.supervisor,
            pluginCatalog: (payload) => catalog.manage(payload),
            listPlugins: async () => ({
              plugins: registry.listPlugins(),
              userPluginsDir: registry.ensureUserPluginsDir(),
            }),
          },
          settings: {
            ...base.settings,
            read: () => settings,
            editField: async (field, compute) => {
              settings = { ...settings, [field]: compute(settings) };
              return {
                status: "committed",
                authorityId: "fixture",
                sequence: 1,
                revisions: {},
                changes: [],
              };
            },
          },
        }),
      );
      const { url, token } = await ingress.start();
      const call = (name: string, args: Record<string, unknown> = {}) =>
        callTool(url, token, name, args);
      const add = await call("manage_plugin_catalog", { action: "add", localPath: source });
      expect(add.isError).toBe(false);
      const [{ id: catalogId }] = z
        .tuple([z.object({ id: z.uuid() })])
        .parse(add.payload?.catalogs);
      const target = { catalogId, entryName: "notes" };
      await expect(call("list_plugin_catalogs", { query: "TEAM NOTES" })).resolves.toMatchObject({
        payload: { total: 1, entries: [expect.objectContaining(target)] },
      });
      const first = await call("inspect_plugin_package", target);
      expect(first).toMatchObject({
        payload: {
          package: { name: "notes", mcpServers: [{ name: "notes", headerNames: ["X-Secret"] }] },
        },
      });
      expect(JSON.stringify(first)).not.toMatch(/fixture-(?:header|url)-secret/);
      const digestOf = (result: typeof first) =>
        z.object({ reviewDigest: z.string() }).parse(result.payload?.package).reviewDigest;
      const reviewDigest = digestOf(first);
      await expect(
        call("install_plugin", { ...target, reviewDigest: "0".repeat(64) }),
      ).resolves.toMatchObject({
        isError: true,
        error: expect.stringContaining("changed after review"),
      });
      expect(registry.getPlugin("notes")).toBeUndefined();
      await expect(call("install_plugin", { ...target, reviewDigest })).resolves.toMatchObject({
        payload: { settingsSaved: true },
      });
      expect(settings.installedPlugins.notes?.enabled).toBe(false);
      await expect(
        call("configure_plugin", { pluginName: "app-controls", enabled: false }),
      ).resolves.toMatchObject({
        isError: true,
        error: expect.stringContaining("always enabled"),
      });
      await expect(
        call("configure_plugin", { pluginName: "notes", enabled: true }),
      ).resolves.toMatchObject({
        payload: { plugin: { enabled: true, effectiveEnabled: true } },
      });
      await expect(
        call("configure_plugin", {
          pluginName: "notes",
          target: "mcp-server",
          contributionId: "notes",
          enabled: false,
        }),
      ).resolves.toMatchObject({ payload: { plugin: { disabledMcpServers: ["notes"] } } });

      // Content can change while the author keeps a previous manifest version.
      writeFileSync(join(pkg, "README.md"), "New package contents");
      const sameVersion = await call("inspect_plugin_package", target);
      expect(digestOf(sameVersion)).not.toBe(reviewDigest);
      await expect(
        call("install_plugin", {
          ...target,
          action: "update",
          reviewDigest: digestOf(sameVersion),
        }),
      ).resolves.toMatchObject({ payload: { package: { version: "1.0.0" }, settingsSaved: true } });
      writeManifest("2.0.0");
      const upgrade = await call("inspect_plugin_package", target);
      await expect(
        call("install_plugin", { ...target, action: "update", reviewDigest: digestOf(upgrade) }),
      ).resolves.toMatchObject({
        payload: { package: { version: "2.0.0" }, settingsSaved: true },
      });
      expect(settings.installedPlugins.notes).toMatchObject({
        enabled: true,
        version: "2.0.0",
        disabledMcpServerNames: ["notes"],
      });
      await expect(call("remove_plugin_package", { pluginName: "notes" })).resolves.toMatchObject({
        payload: { removed: true, settingsSaved: true },
      });
      expect(registry.getPlugin("notes")).toBeUndefined();
      expect(settings.installedPlugins.notes).toBeUndefined();
      expect(removeAccounts).toHaveBeenCalledExactlyOnceWith("notes");
    } finally {
      await ingress?.dispose();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("joins a concurrent listen and refuses to advertise or restart a closed ingress", async () => {
    ingress = new AppControlsMcpIngress(deps());
    const starting = ingress.start();
    void starting.catch(() => undefined);
    const closing = ingress.dispose();
    await expect(starting).rejects.toThrow("shutting down");
    await closing;
    expect(ingress.getInfo()).toBeNull();
    await expect(ingress.start()).rejects.toThrow("shutting down");
  });

  it.each(["success", "failure"])(
    "joins an admitted HTTP tool %s before disposal finishes",
    async (outcome) => {
      const result = Promise.withResolvers<CreateAppThreadResult>();
      const entered = Promise.withResolvers<void>();
      ingress = new AppControlsMcpIngress(
        deps({
          createThread: () => {
            entered.resolve();
            return result.promise;
          },
        }),
      );
      const info = await ingress.start();
      const request = callTool(info.url, info.token, "create_thread", {
        projectId: "project-1",
        prompt: "Synthetic pending creation",
      });
      void request.catch(() => undefined);
      await entered.promise;
      let disposed = false;
      const disposal = Promise.resolve(ingress.dispose()).then(() => {
        disposed = true;
      });
      await Promise.resolve();
      try {
        expect(disposed).toBe(false);
      } finally {
        if (outcome === "success")
          result.resolve({
            threadId: "synthetic-created",
            projectId: "project-1",
            title: "Fixture",
          });
        else result.reject(new Error("synthetic pending failure"));
        await Promise.all([disposal, request.catch(() => undefined)]);
      }
    },
  );

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
