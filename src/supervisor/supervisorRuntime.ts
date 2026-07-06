import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import type {
  AgentKind,
  AgentHookPluginMutationResult,
  AgentHookPluginPayload,
  AgentHookPluginStatus,
  AgentStatusesResponse,
  ProviderUsagePayload,
  ProviderUsageResponse,
  AcpRegistryListResult,
  AcpRegistryMutationResult,
  CloseThreadPayload,
  CreateFileCheckpointPayload,
  CreateFileCheckpointResult,
  CreateProjectEntryPayload,
  DeleteProjectEntryPayload,
  DetectSetupScriptPayload,
  DetectSetupScriptResult,
  ExtractContextPayload,
  ExtractContextResult,
  FinalizeFileCheckpointPayload,
  FinalizeFileCheckpointResult,
  GenerateCommitMessagePayload,
  GenerateCommitMessageResult,
  GeneratePrSummaryPayload,
  GeneratePrSummaryResult,
  GenerateTitlePayload,
  GenerateTitleResult,
  GetAgentStatusesPayload,
  GetAgentHookPluginStatusesPayload,
  GetGitBranchesPayload,
  GetGitDiffBatchPayload,
  GetGitDiffPayload,
  CloneRepoPayload,
  CloneRepoResult,
  GetGitFileContentPayload,
  GetGitStatusPayload,
  GhCheckAvailableResult,
  GhCreatePrPayload,
  GhListAccountsPayload,
  GhListAccountsResult,
  GhListReposPayload,
  GhListReposResult,
  GhGetPrChecksPayload,
  GhGetPrChecksResult,
  GhGetPrDetailsPayload,
  GhGetPrDetailsResult,
  GhGetPrDiffPayload,
  GhGetPrDiffResult,
  GhGetPrFilesPayload,
  GhGetPrFilesResult,
  GhGetPrForBranchPayload,
  GhListPrsPayload,
  GhListPrsResult,
  GhMergePrPayload,
  GhClosePrPayload,
  GhMarkPrReadyPayload,
  GhPostPrCommentPayload,
  GhReopenPrPayload,
  GhSubmitPrReviewPayload,
  GhUpdatePrBranchPayload,
  PrComment,
  GitAbortMergePayload,
  GitAddRemotePayload,
  GitAddWorktreePayload,
  GitAddWorktreeResult,
  GitBranchListResult,
  GitCommitPayload,
  GitCommitResult,
  GitDeleteBranchPayload,
  GitDiffBatchResult,
  GitDiffResult,
  GitFetchPayload,
  GitFileContentResult,
  GitFinishMergePayload,
  GitFinishMergeResult,
  GitGetWorktreeSourceBranchPayload,
  GitGetWorktreeSourceBranchResult,
  GitInitPayload,
  GitProjectSnapshotPayload,
  GitProjectSnapshotResult,
  GitWorktreeStatusBatchPayload,
  GitWorktreeStatusBatchResult,
  ListFileCheckpointsPayload,
  ListFileCheckpointsResult,
  GitListWorktreesPayload,
  GitMergeToSourcePayload,
  GitMergeToSourceResult,
  GitPullFromSourcePayload,
  GitPullFromSourceResult,
  GitPullPayload,
  GitPruneWorktreesPayload,
  GitPushPayload,
  ProjectLocation,
  RelocateProjectPayload,
  RelocateProjectResult,
  GitRemoveWorktreePayload,
  GitRevertAllPayload,
  GitRevertPayload,
  GitStageAllPayload,
  GitStagePayload,
  GitStatusResult,
  GitSwitchBranchPayload,
  GitSwitchBranchResult,
  GitSyncPayload,
  GitSyncResult,
  GitUnstageAllPayload,
  GitUnstagePayload,
  GitUnwatchProjectPayload,
  GitWatchProjectPayload,
  GitWatchWorktreesPayload,
  GitWorktreeListResult,
  AuthenticateAcpAgentPayload,
  InterruptThreadPayload,
  InstallAcpRegistryAgentPayload,
  LogoutAcpAgentPayload,
  SetAcpRegistryAgentAuthPayload,
  UpdateAcpRegistryAgentPayload,
  UpdateAgentBinaryPayload,
  UpdateAgentBinaryResult,
  GetLatestAgentVersionPayload,
  GetLatestAgentVersionResult,
  GetAntigravityAccountPayload,
  GetAntigravityAccountResult,
  SetPendingSteerPayload,
  ClearPendingSteerPayload,
  ListProjectTreePayload,
  ListProjectTreeResult,
  BrowseHostDirectoryPayload,
  BrowseHostDirectoryResult,
  MoveProjectEntryPayload,
  PrData,
  ReadAbsoluteFilePayload,
  ReadAbsoluteFileResult,
  ReadExternalFilePayload,
  ReadExternalFileResult,
  ReadProjectFilePayload,
  ReadProjectFileResult,
  RenameProjectEntryPayload,
  RemoveAcpRegistryAgentPayload,
  ResizeTerminalPayload,
  ResolveThreadServerRequestPayload,
  RestoreFileCheckpointPayload,
  RollbackThreadConversationPayload,
  SearchProjectFilesPayload,
  SearchProjectFilesResult,
  SearchProjectTreePayload,
  SearchProjectTreeResult,
  SendThreadInputPayload,
  StartShellPayload,
  StartThreadPayload,
  StartThreadResult,
  StageThreadInputPayload,
  TerminalSize,
  ThreadRuntimeSnapshot,
  WriteExternalFilePayload,
  WriteExternalFileResult,
  WriteProjectFilePayload,
  WriteProjectFileResult,
  WriteTerminalPayload,
} from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import type { LspMessagePayload, LspStartPayload, LspStopPayload } from "@/shared/lsp";
import { resolveLightcodePaths } from "@/shared/lightcodePaths";
import { joinProjectPosixPath } from "@/shared/wsl";
import { prefetchNativeNodeRuntime } from "./runtime/prefetchNativeNode";
import {
  setSessionFsBridgeClient,
  setWslProcessBridgeClient,
  type AgentAdapter,
} from "./agents/base";
import { setWslAttachmentBridgeClient } from "./runtime/threadAttachments";
import { FileIndexService } from "./fileIndex";
import { GitService, resolveBuiltInWorktreeRoot } from "./git";
import { resolveWorktreePlacement } from "@/shared/worktree";
import { GitCheckpointService } from "./git/checkpointService";
import { GitHubService } from "./github";
import { ProjectWatcher } from "./projectWatcher";
import { LanguageServerManager } from "./lsp";
import { ProjectTreeService } from "./projectTree";
import { detectWindowsShell, type WindowsShellPreference } from "./shellPreference";
import { AgentStatusService, detectWslAgentStatuses } from "./runtime/agentStatusService";
import { createLocalUsageCollectors } from "./runtime/localUsageCollectors";
import { UsageService } from "./runtime/usageService";
import { AgentRegistryService } from "./runtime/agentRegistryService";
import { GenerationService } from "./runtime/generationService";
import { type SessionRuntime, type ShellSessionRuntime } from "./runtime/sessionTypes";
import { ThreadSessionManager, writeSubmittedPrompt } from "./runtime/threadSessionManager";
import { CliHookPluginCoordinator } from "./runtime/cliHookPluginCoordinator";
import { OrchestratorThreadManager } from "./subagentMcp/OrchestratorThreadManager";
import { SubagentMcpIngress } from "./subagentMcp/SubagentMcpIngress";
import { SubagentRunManager } from "./subagentMcp/SubagentRunManager";
import { buildSpawnableAgents } from "./subagentMcp/toolRegistry";
import { dispatchAgentEvent } from "./runtime/agentEventDispatcher";
import { hookDebugEnvelope, isLightcodeHookDebug } from "./runtime/hookDebug";
import { SupervisorSharedSettingsCache } from "./runtime/supervisorSharedSettings";
import { WslBridgeServer } from "./wsl/bridge";
import { WslBridgeClient } from "./wsl/bridge/client";
import { resolveWslHelpersDir } from "./wsl/wslDeploy";
import { resolveWslHostAccess } from "./wsl/hostAccess";

export { detectWslAgentStatuses, writeSubmittedPrompt };

export class SupervisorRuntime {
  private readonly isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
  private readonly baseDir: string;
  private readonly logsDir: string;
  private readonly settingsPath: string;
  private readonly acpIconsDir: string;
  private readonly sharedSettingsCache: SupervisorSharedSettingsCache;
  private readonly gitService = new GitService();
  private readonly gitCheckpointService = new GitCheckpointService();
  private _projectWatcher: ProjectWatcher | undefined;
  private readonly githubService = new GitHubService();
  private readonly fileIndexService = new FileIndexService();
  private readonly projectTreeService = new ProjectTreeService();
  private readonly adapters = new Map<AgentKind, AgentAdapter>();
  private readonly windowsShell: WindowsShellPreference;
  private readonly agentStatusService: AgentStatusService;
  private readonly usageService: UsageService;
  private readonly agentRegistryService: AgentRegistryService;
  private readonly generationService: GenerationService;
  private readonly threadSessionManager: ThreadSessionManager;
  private readonly lspManager: LanguageServerManager;
  private readonly cliHookPluginCoordinator: CliHookPluginCoordinator;
  private readonly subagentMcpIngress: SubagentMcpIngress;
  private readonly subagentRunManager: SubagentRunManager;
  private readonly orchestratorThreadManager: OrchestratorThreadManager;
  private wslHookBridge: WslBridgeServer | undefined;

  readonly sessions: Map<string, SessionRuntime>;
  readonly shellSessions: Map<string, ShellSessionRuntime>;

  private get projectWatcher(): ProjectWatcher {
    if (!this._projectWatcher) {
      const watcher = new ProjectWatcher({
        onGitChanged: (projectId) => {
          this.emit({ type: "git-changed", projectId });
        },
        onTreeChanged: (projectId) => {
          this.projectTreeService.invalidateAllCaches();
          this.emit({ type: "project-tree-changed", projectId });
        },
      });
      if (this.wslBridgeClient) watcher.setWslClient(this.wslBridgeClient);
      this._projectWatcher = watcher;
    }
    return this._projectWatcher;
  }

  private wslBridgeClient: WslBridgeClient | undefined;

  constructor(private readonly emit: (event: SupervisorEvent) => void) {
    // Defensive: `process.env.X = undefined` coerces to the literal string
    // "undefined" in Node, and we've been bitten by that path creating
    // `./undefined/settings.json` in cwd. Also reject bare relative paths —
    // the supervisor must always operate out of an absolute baseDir so
    // writes land somewhere predictable regardless of cwd at spawn time.
    const rawBaseDir = process.env.LIGHTCODE_DATA_DIR?.trim();
    const envBaseDir =
      rawBaseDir && rawBaseDir !== "undefined" && isAbsolute(rawBaseDir) ? rawBaseDir : undefined;
    const baseDir = envBaseDir ?? join(homedir(), ".poracode");
    this.baseDir = baseDir;
    const paths = resolveLightcodePaths(baseDir);
    this.logsDir = paths.terminalLogsDir;
    this.settingsPath = paths.settingsPath;
    this.acpIconsDir = paths.acpIconsDir;
    this.sharedSettingsCache = new SupervisorSharedSettingsCache(this.settingsPath);
    // The agent/ACP registry cluster. Constructed up front so the initial
    // adapter build below can run before the later-created services exist; those
    // dependencies (status/usage/hook-plugin/sessions) resolve lazily at call
    // time via the getter closures.
    this.agentRegistryService = new AgentRegistryService({
      adapters: this.adapters,
      settingsPath: this.settingsPath,
      baseDir,
      acpIconsDir: this.acpIconsDir,
      sharedSettingsCache: this.sharedSettingsCache,
      getAgentStatusService: () => this.agentStatusService,
    });
    this.agentRegistryService.refreshAgentRegistryAdapters();
    mkdirSync(paths.cacheDir, { recursive: true });
    mkdirSync(this.logsDir, { recursive: true });

    // Prefetch the native Node resolver so the login-shell probe runs in
    // parallel with the rest of the supervisor boot. By the time providers'
    // `installPlugin` calls `resolveInstallNodePath`, the shared promise is
    // typically already settled. Failures surface as a single warn line.
    void prefetchNativeNodeRuntime(baseDir);

    this.lspManager = new LanguageServerManager(emit);
    this.windowsShell =
      process.platform === "win32"
        ? detectWindowsShell()
        : { shell: process.env.SHELL || "/bin/bash", kind: "cmd", args: [] };

    this.agentStatusService = new AgentStatusService({
      adapters: this.adapters,
      settingsPath: this.settingsPath,
      statusCachePath: paths.statusCachePath,
      emit,
    });

    // Boot the CLI hook plugin coordinator BEFORE the thread session manager so
    // the manager can pull `resolvePluginEnvForSpawn` off it. The coordinator
    // owns the singleton hook ingress; `startIngress()` is non-blocking — the
    // Electron window opens regardless of how long `listen()` takes.
    const runHookDispatch = (
      envelope: import("@/shared/contracts").AgentEventEnvelope,
      source: "hook-ingress" | "wsl-bridge",
    ): void => {
      // Dev-only toggle: drop hook envelopes on the supervisor side so the UI
      // falls back to L2 (OSC 9;4 progress) without uninstalling the plugin
      // or touching the agent's settings. Install + `--settings <path>` +
      // `preferredNotifChannel: "iterm2"` all stay in place so L2 keeps
      // flowing; we just ignore the L1 signal here.
      if (this.sharedSettingsCache.read().disableCliHookPlugin) {
        if (isLightcodeHookDebug()) {
          console.log(`[supervisor] hook-debug: L1 envelope dropped (dev toggle) ← ${source}`, {
            threadId: envelope.threadId,
            sessionId: envelope.sessionId,
            intent: envelope.intent,
            agentKind: envelope.agentKind,
          });
        }
        return;
      }
      hookDebugEnvelope(source, envelope);
      dispatchAgentEvent(envelope, {
        lookupSession: (input) => this.threadSessionManager.findSessionForCliHookPlugin(input),
        applyCliHookPluginState: (session, change) =>
          this.threadSessionManager.applyCliHookPluginState(session, change),
        onRoutedEvent: (session, env) =>
          this.threadSessionManager.noteCliHookPluginActivity(session, env),
        onUnroutable: (env) => {
          if (isLightcodeHookDebug()) {
            console.warn(
              `[supervisor] hook-debug: envelope NOT ROUTED (no live thread) ← ${source}`,
              {
                threadId: env.threadId,
                sessionId: env.sessionId,
                intent: env.intent,
                agentKind: env.agentKind,
              },
            );
          }
        },
      });
    };
    const dispatchEnvelope = (envelope: import("@/shared/contracts").AgentEventEnvelope): void =>
      runHookDispatch(envelope, "hook-ingress");

    this.cliHookPluginCoordinator = new CliHookPluginCoordinator(
      {
        adapters: this.adapters,
        settingsPath: this.settingsPath,
        baseDir,
        ...(process.env.LIGHTCODE_HOOK_PORT
          ? { preferredPort: Number(process.env.LIGHTCODE_HOOK_PORT) }
          : {}),
      },
      dispatchEnvelope,
    );

    // Construct the WSL hook bridge manager only when bundled helpers are
    // available. Plugins inside a WSL distro can't reach the host
    // `HookIngress` over WSL2 NAT loopback; the bridge stages and runs
    // `bridge.mjs` inside the distro instead, sharing the supervisor's
    // bearer secret + protocol version. Native (Windows / macOS / Linux)
    // spawns continue to use the HookIngress directly.
    if (process.platform === "win32" && resolveWslHelpersDir()) {
      const bridge = new WslBridgeServer({
        onEvent: (envelope) => runHookDispatch(envelope, "wsl-bridge"),
        onBridgeExit: (distro) => this._projectWatcher?.handleWslBridgeExit(distro),
        onError: (message, error) => {
          if (isLightcodeHookDebug()) {
            console.warn(`[supervisor] hook-debug: ${message}`, error);
          }
        },
        secret: this.cliHookPluginCoordinator.getHookSecret(),
        protocolVersion: this.cliHookPluginCoordinator.getProtocolVersion(),
      });
      this.wslHookBridge = bridge;
      this.cliHookPluginCoordinator.setWslHookBridge(bridge);
      const client = new WslBridgeClient(bridge);
      this.wslBridgeClient = client;
      this.gitService.setWslClient(client);
      this.gitCheckpointService.setWslClient(client);
      this.projectTreeService.setWslClient(client);
      this.githubService.setWslClient(client);
      this._projectWatcher?.setWslClient(client);
      setSessionFsBridgeClient(client);
      setWslProcessBridgeClient(client);
      setWslAttachmentBridgeClient(client);
    }

    this.cliHookPluginCoordinator.startIngress();

    // Cross-provider subagents: an in-process MCP server (SubagentMcpIngress)
    // lets any agent spawn the other connected agents as subagents. The run
    // manager owns child structured sessions; the ingress mints per-thread
    // tokens and routes tools/call to the caller's parent thread. The run
    // manager's host is the thread session manager (assigned just below — the
    // closures resolve it lazily at call time).
    this.subagentRunManager = new SubagentRunManager({
      adapters: this.adapters,
      host: {
        getParentContext: (threadId) =>
          this.threadSessionManager.getSubagentParentContext(threadId),
        appendRuntimeEvent: (parentThreadId, event) =>
          this.threadSessionManager.appendSubagentRuntimeEvent(parentThreadId, event),
      },
    });
    // Orchestrator lane of the subagents MCP: creates first-class child
    // threads. Creation is main-orchestrated — the manager emits an
    // `orchestrator-thread-created` supervisor event; main upserts the DB row,
    // mirrors it to the renderer, and calls startThread back into this
    // process. Host closures resolve the thread session manager lazily, same
    // as the run manager above.
    this.orchestratorThreadManager = new OrchestratorThreadManager({
      adapters: this.adapters,
      emit: (event) => this.emit(event),
      host: {
        getParentContext: (threadId) =>
          this.threadSessionManager.getSubagentParentContext(threadId),
        getThreadState: (threadId) =>
          this.threadSessionManager.getOrchestratorThreadState(threadId),
        readThreadHistory: (threadId) => this.threadSessionManager.readThreadHistory(threadId),
        sendThreadInput: (payload) => this.threadSessionManager.sendThreadInput(payload),
        interruptThread: (threadId) => this.threadSessionManager.interruptThread({ threadId }),
        // Tear down the child's runtime session to free a cap slot. Reuses the
        // same closeThread that removes the session from the TSM map (which is
        // what makes getOrchestratorThreadState — and thus the live-child count
        // — drop the child). The persisted thread row + worktree remain.
        closeThread: (threadId) => this.threadSessionManager.closeThread({ threadId }),
      },
      // Same worktree pipeline the renderer-driven `gitAddWorktree` procedure
      // uses, with placement resolved from global settings (per-project
      // overrides live in the renderer DB and aren't visible here).
      createWorktree: async ({ location, branch, baseBranch }) => {
        const placement = resolveWorktreePlacement(
          this.sharedSettingsCache.read(),
          undefined,
          location,
        );
        const result = await this.gitService.addWorktree(
          location,
          undefined,
          branch,
          true,
          baseBranch,
          undefined,
          false,
          false,
          {
            ...(placement.root ? { root: placement.root } : {}),
            ...(placement.omitRepoDir ? { omitRepoDir: true } : {}),
          },
        );
        return { path: result.path };
      },
      // Roll back a worktree created by a create_thread call that then failed to
      // launch (force removal + branch delete), so a ticket-keyed retry isn't
      // poisoned by a leftover branch.
      removeWorktree: async ({ location, path }) => {
        await this.gitService.removeWorktree(location, path, true, true);
      },
    });
    this.subagentMcpIngress = new SubagentMcpIngress({
      runManager: this.subagentRunManager,
      orchestrator: this.orchestratorThreadManager,
      getSpawnableAgents: async () => {
        const { windows } = await this.agentStatusService.getAgentStatuses({ wslDistros: [] });
        return buildSpawnableAgents(this.adapters, windows);
      },
      // User-configured routing guidance, read live from shared settings (the
      // cache invalidates on file change) so edits take effect on the next turn
      // without a supervisor restart. Empty/whitespace-only = no guidance.
      getRoutingGuide: () => {
        const guide = this.sharedSettingsCache.read().subagentRoutingGuide.trim();
        return guide.length > 0 ? guide : undefined;
      },
    });
    void this.subagentMcpIngress.start().catch((error) => {
      console.warn("[supervisor] subagent MCP ingress failed to start:", error);
    });

    this.threadSessionManager = new ThreadSessionManager({
      // Tap the outbound stream so the orchestrator lane can track child
      // thread-state transitions (wait_for_thread) without polling.
      emit: (event) => {
        this.orchestratorThreadManager.observeSupervisorEvent(event);
        emit(event);
      },
      isDev: this.isDev,
      logsDir: this.logsDir,
      settingsPath: this.settingsPath,
      readDisableCliHookPlugin: () => this.sharedSettingsCache.read().disableCliHookPlugin,
      adapters: this.adapters,
      windowsShell: this.windowsShell,
      ...(this.wslHookBridge ? { wslBridge: this.wslHookBridge } : {}),
      resolvePluginEnvForSpawn: (input) =>
        this.cliHookPluginCoordinator.resolvePluginEnvForSpawn(input),
      subagentMcp: {
        register: (threadId) => this.subagentMcpIngress.registerThread(threadId),
        unregister: (threadId) => this.subagentMcpIngress.unregisterThread(threadId),
        cancelAll: (threadId) => this.subagentRunManager.cancelAllForThread(threadId),
        resolveChildRequest: (requestId, response) =>
          this.subagentRunManager.resolveChildServerRequest(requestId, response),
      },
      subagentMcpHostAccess: {
        resolveHostAccess: (distro) => resolveWslHostAccess(distro),
      },
    });
    this.sessions = this.threadSessionManager.sessions;
    this.shellSessions = this.threadSessionManager.shellSessions;

    this.usageService = new UsageService({
      emit,
      cachePath: join(paths.cacheDir, "provider-usage.json"),
      cacheDir: paths.cacheDir,
      settingsPath: this.settingsPath,
      localCollectors: createLocalUsageCollectors({
        getActiveAntigravityWslDistros: () => this.getActiveAntigravityWslDistros(),
      }),
    });
    this.usageService.startAutoRefresh();

    this.generationService = new GenerationService({
      adapters: this.adapters,
      readTerminalScrollback: (threadId) => this.readTerminalScrollback(threadId),
    });

    // One-time-per-machine icon repair: localize any acp-generic icon still on
    // a remote CDN URL so sidebar rows paint from disk instead of flickering
    // through a network round-trip on every start. No-op (no network) once all
    // icons are local. Fire-and-forget — never blocks the window from opening.
    void this.agentRegistryService.cacheLocalAcpIconsOnLaunch();
  }

  /** Distinct WSL distros hosting a live `antigravity` session (the only
   * locations the usage scanner needs — native scanning is host-wide). */
  private getActiveAntigravityWslDistros(): string[] {
    const distros = new Set<string>();
    for (const session of this.sessions.values()) {
      if (session.agentKind !== "antigravity" || session.ptyExited) continue;
      if (session.projectLocation.kind === "wsl") distros.add(session.projectLocation.distro);
    }
    return [...distros];
  }

  async listWslDistros(): Promise<string[]> {
    return this.agentRegistryService.listWslDistros();
  }

  async getAgentStatuses(payload: GetAgentStatusesPayload): Promise<AgentStatusesResponse> {
    return this.agentRegistryService.getAgentStatuses(payload);
  }

  async refreshAgentStatuses(payload: GetAgentStatusesPayload): Promise<AgentStatusesResponse> {
    return this.agentRegistryService.refreshAgentStatuses(payload);
  }

  async getProviderUsage(payload: ProviderUsagePayload): Promise<ProviderUsageResponse> {
    return this.usageService.getProviderUsage(payload);
  }

  async refreshProviderUsage(payload: ProviderUsagePayload): Promise<ProviderUsageResponse> {
    return this.usageService.refreshProviderUsage(payload);
  }

  async getAgentHookPluginStatuses(
    payload: GetAgentHookPluginStatusesPayload,
  ): Promise<AgentHookPluginStatus[]> {
    return this.cliHookPluginCoordinator.getStatuses(payload);
  }

  async installAgentHookPlugin(
    payload: AgentHookPluginPayload,
  ): Promise<AgentHookPluginMutationResult> {
    return this.cliHookPluginCoordinator.installPlugin(payload);
  }

  async uninstallAgentHookPlugin(
    payload: AgentHookPluginPayload,
  ): Promise<AgentHookPluginMutationResult> {
    return this.cliHookPluginCoordinator.uninstallPlugin(payload);
  }

  async listAcpRegistry(): Promise<AcpRegistryListResult> {
    return this.agentRegistryService.listAcpRegistry();
  }

  async installAcpRegistryAgent(
    payload: InstallAcpRegistryAgentPayload,
  ): Promise<AcpRegistryMutationResult> {
    return this.agentRegistryService.installAcpRegistryAgent(payload);
  }

  async updateAcpRegistryAgent(
    payload: UpdateAcpRegistryAgentPayload,
  ): Promise<AcpRegistryMutationResult> {
    return this.agentRegistryService.updateAcpRegistryAgent(payload);
  }

  async updateAgentBinary(payload: UpdateAgentBinaryPayload): Promise<UpdateAgentBinaryResult> {
    return this.agentRegistryService.updateAgentBinary(payload);
  }

  async getLatestAgentVersion(
    payload: GetLatestAgentVersionPayload,
  ): Promise<GetLatestAgentVersionResult> {
    return this.agentRegistryService.getLatestAgentVersion(payload);
  }

  async getAntigravityAccount(
    payload: GetAntigravityAccountPayload,
  ): Promise<GetAntigravityAccountResult> {
    return this.agentRegistryService.getAntigravityAccount(payload);
  }

  async removeAcpRegistryAgent(
    payload: RemoveAcpRegistryAgentPayload,
  ): Promise<AcpRegistryMutationResult> {
    return this.agentRegistryService.removeAcpRegistryAgent(payload);
  }

  async setAcpRegistryAgentAuth(
    payload: SetAcpRegistryAgentAuthPayload,
  ): Promise<AcpRegistryMutationResult> {
    return this.agentRegistryService.setAcpRegistryAgentAuth(payload);
  }

  async authenticateAcpAgent(payload: AuthenticateAcpAgentPayload): Promise<void> {
    return this.agentRegistryService.authenticateAcpAgent(payload);
  }

  async logoutAcpAgent(payload: LogoutAcpAgentPayload): Promise<void> {
    return this.agentRegistryService.logoutAcpAgent(payload);
  }

  getThreadSnapshots(): ThreadRuntimeSnapshot[] {
    return this.threadSessionManager.getThreadSnapshots();
  }

  async startThread(payload: StartThreadPayload): Promise<StartThreadResult> {
    return this.threadSessionManager.startThread(payload);
  }

  async sendThreadInput(payload: SendThreadInputPayload): Promise<void> {
    return this.threadSessionManager.sendThreadInput(payload);
  }

  async interruptThread(payload: InterruptThreadPayload): Promise<void> {
    return this.threadSessionManager.interruptThread(payload);
  }

  async rollbackThreadConversation(payload: RollbackThreadConversationPayload): Promise<void> {
    return this.threadSessionManager.rollbackThreadConversation(payload);
  }

  async setPendingSteer(payload: SetPendingSteerPayload): Promise<void> {
    return this.threadSessionManager.setPendingSteer(payload);
  }

  async clearPendingSteer(payload: ClearPendingSteerPayload): Promise<void> {
    return this.threadSessionManager.clearPendingSteer(payload);
  }

  async writeTerminal(payload: WriteTerminalPayload): Promise<void> {
    return this.threadSessionManager.writeTerminal(payload);
  }

  async stageThreadInput(payload: StageThreadInputPayload): Promise<void> {
    return this.threadSessionManager.stageThreadInput(payload);
  }

  async resizeTerminal(payload: ResizeTerminalPayload): Promise<void> {
    return this.threadSessionManager.resizeTerminal(payload);
  }

  async closeThread(payload: CloseThreadPayload): Promise<void> {
    return this.threadSessionManager.closeThread(payload);
  }

  async startShell(payload: StartShellPayload): Promise<void> {
    return this.threadSessionManager.startShell(payload);
  }

  async resolveThreadServerRequest(payload: ResolveThreadServerRequestPayload): Promise<void> {
    return this.threadSessionManager.resolveThreadServerRequest(payload);
  }

  readTerminalScrollback(threadId: string): string {
    return this.threadSessionManager.readTerminalScrollback(threadId);
  }

  readTerminalSize(threadId: string): TerminalSize | null {
    return this.threadSessionManager.readTerminalSize(threadId);
  }

  subagentSubscribe(payload: { threadId: string; parentItemId: string }): {
    history: import("@/shared/contracts").RuntimeEvent[];
  } {
    return this.threadSessionManager.subagentSubscribe(payload);
  }

  subagentUnsubscribe(payload: { threadId: string; parentItemId: string }): void {
    this.threadSessionManager.subagentUnsubscribe(payload);
  }

  async workflowGetRun(
    payload: import("@/shared/ipc").WorkflowGetRunPayload,
  ): Promise<import("@/shared/ipc").WorkflowGetRunResult> {
    const { readWorkflowRun } = await import("./workflows/transcriptReader");
    // `run` is null when the manifest hasn't been written yet (normal for the
    // first few seconds after a workflow launches). Pass it through verbatim
    // so the renderer keeps the row in a "starting…" state while polling.
    const run = await readWorkflowRun({
      manifestPath: payload.manifestPath,
      location: payload.location,
      ...(payload.transcriptDir ? { transcriptDir: payload.transcriptDir } : {}),
      ...(payload.includeAgentChats ? { includeAgentChats: true } : {}),
    });
    return { run };
  }

  async getGitStatus(payload: GetGitStatusPayload): Promise<GitStatusResult> {
    return this.gitService.getStatus(payload.projectLocation);
  }

  async createFileCheckpoint(
    payload: CreateFileCheckpointPayload,
  ): Promise<CreateFileCheckpointResult> {
    return {
      checkpoint: await this.gitCheckpointService.create(payload),
    };
  }

  async finalizeFileCheckpoint(
    payload: FinalizeFileCheckpointPayload,
  ): Promise<FinalizeFileCheckpointResult> {
    return {
      checkpoint: await this.gitCheckpointService.finalize(payload),
    };
  }

  async listFileCheckpoints(
    payload: ListFileCheckpointsPayload,
  ): Promise<ListFileCheckpointsResult> {
    return this.gitCheckpointService.list(payload);
  }

  async restoreFileCheckpoint(payload: RestoreFileCheckpointPayload): Promise<void> {
    await this.gitCheckpointService.restore(payload);
  }

  async getGitDiff(payload: GetGitDiffPayload): Promise<GitDiffResult> {
    return this.gitService.getDiff(payload.projectLocation, payload.filePath, payload.staged);
  }

  async getGitDiffBatch(payload: GetGitDiffBatchPayload): Promise<GitDiffBatchResult> {
    return this.gitService.getDiffBatch(payload.projectLocation, payload.untrackedPaths);
  }

  async getGitFileContent(payload: GetGitFileContentPayload): Promise<GitFileContentResult> {
    return this.gitService.getFileContent(
      payload.projectLocation,
      payload.filePath,
      payload.staged,
    );
  }

  async gitStage(payload: GitStagePayload): Promise<void> {
    return this.gitService.stage(payload.projectLocation, payload.filePath);
  }

  async gitUnstage(payload: GitUnstagePayload): Promise<void> {
    return this.gitService.unstage(payload.projectLocation, payload.filePath);
  }

  async gitRevert(payload: GitRevertPayload): Promise<void> {
    return this.gitService.revert(payload.projectLocation, payload.filePath);
  }

  async gitStageAll(payload: GitStageAllPayload): Promise<void> {
    return this.gitService.stageAll(payload.projectLocation);
  }

  async gitUnstageAll(payload: GitUnstageAllPayload): Promise<void> {
    return this.gitService.unstageAll(payload.projectLocation);
  }

  async gitRevertAll(payload: GitRevertAllPayload): Promise<void> {
    return this.gitService.revertAll(payload.projectLocation);
  }

  async gitCommit(payload: GitCommitPayload): Promise<GitCommitResult> {
    const { hash } = await this.gitService.commit(
      payload.projectLocation,
      payload.message,
      payload.addAll ?? false,
    );
    return { hash, message: payload.message };
  }

  async gitInit(payload: GitInitPayload): Promise<void> {
    return this.gitService.init(payload.projectLocation);
  }

  async gitAddRemote(payload: GitAddRemotePayload): Promise<void> {
    return this.gitService.addRemote(payload.projectLocation, payload.remote, payload.url);
  }

  async generateCommitMessage(
    payload: GenerateCommitMessagePayload,
  ): Promise<GenerateCommitMessageResult> {
    return this.generationService.generateCommitMessage(payload);
  }

  async generateTitle(payload: GenerateTitlePayload): Promise<GenerateTitleResult> {
    return this.generationService.generateTitle(payload);
  }

  async generatePrSummary(payload: GeneratePrSummaryPayload): Promise<GeneratePrSummaryResult> {
    return this.generationService.generatePrSummary(payload);
  }

  async extractContext(payload: ExtractContextPayload): Promise<ExtractContextResult> {
    return this.generationService.extractContext(payload);
  }

  cancelExtractContext(threadId: string): void {
    this.generationService.cancelExtractContext(threadId);
  }

  async gitListBranches(payload: GetGitBranchesPayload): Promise<GitBranchListResult> {
    return this.gitService.listBranches(payload.projectLocation, payload.includeRemote);
  }

  async gitFetch(payload: GitFetchPayload): Promise<void> {
    return this.gitService.fetch(payload.projectLocation, payload.remote, payload.prune);
  }

  async gitListWorktrees(payload: GitListWorktreesPayload): Promise<GitWorktreeListResult> {
    return this.gitService.listWorktrees(payload.projectLocation);
  }

  async gitAddWorktree(payload: GitAddWorktreePayload): Promise<GitAddWorktreeResult> {
    return this.gitService.addWorktree(
      payload.projectLocation,
      payload.path,
      payload.branch,
      payload.createBranch,
      payload.startPoint,
      payload.copyIgnoredPatterns,
      payload.transferUncommitted,
      payload.keepChangesInSource,
      {
        ...(payload.worktreeRoot ? { root: payload.worktreeRoot } : {}),
        ...(payload.worktreeOmitRepoDir ? { omitRepoDir: true } : {}),
      },
    );
  }

  async gitRemoveWorktree(payload: GitRemoveWorktreePayload): Promise<void> {
    const normalizedTarget = payload.path.replace(/\\/g, "/").toLowerCase();

    for (const [threadId, session] of this.sessions) {
      const sessionPath =
        session.projectLocation.kind === "wsl"
          ? session.projectLocation.uncPath
          : session.projectLocation.path;
      if (sessionPath.replace(/\\/g, "/").toLowerCase() === normalizedTarget) {
        await this.closeThread({ threadId }).catch((error) => {
          console.warn(
            `[supervisor] failed to close thread ${threadId} during worktree removal:`,
            error,
          );
        });
      }
    }

    for (const [threadId, shell] of this.shellSessions) {
      if (shell.worktreePath?.replace(/\\/g, "/").toLowerCase() === normalizedTarget) {
        await this.closeThread({ threadId }).catch((error) => {
          console.warn(
            `[supervisor] failed to close shell thread ${threadId} during worktree removal:`,
            error,
          );
        });
      }
    }

    await this.projectWatcher.unwatchWorktree(payload.path);
    return this.gitService.removeWorktree(
      payload.projectLocation,
      payload.path,
      payload.force,
      payload.deleteBranch,
    );
  }

  async gitPruneWorktrees(payload: GitPruneWorktreesPayload): Promise<void> {
    const managedRoots = await this.collectManagedWorktreeRoots(payload.projectLocation);
    return this.gitService.pruneWorktrees(
      payload.projectLocation,
      payload.activeWorktreePaths,
      managedRoots,
    );
  }

  /**
   * The worktree roots Poracode considers "managed" for prune: the built-in
   * default, the resolved global root (custom base or project-relative), and the
   * project-relative root. Per-project custom bases are excluded on purpose so we
   * never auto-delete a user-chosen directory.
   */
  private async collectManagedWorktreeRoots(location: ProjectLocation): Promise<string[]> {
    const settings = this.sharedSettingsCache.read();
    const builtIn = await resolveBuiltInWorktreeRoot(location);
    const global = resolveWorktreePlacement(settings, undefined, location);
    const projectRelative = resolveWorktreePlacement(
      settings,
      { mode: "project-relative" },
      location,
    );
    const roots = [builtIn, global.root, projectRelative.root].filter((root): root is string =>
      Boolean(root),
    );
    return [...new Set(roots)];
  }

  async relocateProject(payload: RelocateProjectPayload): Promise<RelocateProjectResult> {
    const { newLocation } = payload;

    // The moved repo's linked worktrees still point their `.git` files at the old
    // main-repo path; `worktree repair` rewrites those back-pointers. This also
    // implicitly validates that `newLocation` is a real git repository (it errors
    // otherwise), which we surface to the caller.
    const repairedWorktrees = await this.gitService.repairWorktrees(newLocation);

    // Path-keyed caches were built under the old location identity; drop them so
    // the next read recomputes against the new path.
    this.projectTreeService.invalidateAllCaches();
    this.fileIndexService.invalidateCacheForLocation(newLocation);

    // Re-point the file watcher at the new path (idempotent: replaces the old entry).
    this.projectWatcher.watch(payload.projectId, newLocation);

    return { repairedWorktrees };
  }

  async gitDeleteBranch(payload: GitDeleteBranchPayload): Promise<void> {
    if (payload.remote) {
      return this.gitService.deleteRemoteBranch(
        payload.projectLocation,
        payload.remote,
        payload.branch,
      );
    }
    return this.gitService.deleteBranch(payload.projectLocation, payload.branch, payload.force);
  }

  async gitSwitchBranch(payload: GitSwitchBranchPayload): Promise<GitSwitchBranchResult> {
    return this.gitService.switchBranch(payload.projectLocation, payload.branch, payload.createNew);
  }

  async gitPull(payload: GitPullPayload): Promise<void> {
    return this.gitService.pull(payload.projectLocation, payload.remote ?? "origin");
  }

  async gitPullRebase(payload: GitPullPayload): Promise<void> {
    return this.gitService.pullRebase(payload.projectLocation, payload.remote ?? "origin");
  }

  async gitPush(payload: GitPushPayload): Promise<void> {
    return this.gitService.push(
      payload.projectLocation,
      payload.remote ?? "origin",
      payload.branch,
      payload.setUpstream ?? false,
    );
  }

  async gitSync(payload: GitSyncPayload): Promise<GitSyncResult> {
    return this.runSync(payload, false);
  }

  async gitSyncRebase(payload: GitSyncPayload): Promise<GitSyncResult> {
    return this.runSync(payload, true);
  }

  private async runSync(payload: GitSyncPayload, rebase: boolean): Promise<GitSyncResult> {
    const location = payload.projectLocation;
    const remote = payload.remote ?? "origin";
    await this.gitService.fetch(location, remote, false);

    const status = await this.gitService.getStatus(location);
    let pulled = false;
    let pushed = false;

    if (status.behind > 0) {
      if (rebase) {
        await this.gitService.pullRebase(location, remote);
      } else {
        await this.gitService.pull(location, remote);
      }
      pulled = true;
    }

    const afterPull = pulled ? await this.gitService.getStatus(location) : status;
    if (afterPull.ahead > 0) {
      await this.gitService.push(location, remote);
      pushed = true;
    }

    return { pulled, pushed };
  }

  async gitGetWorktreeSourceBranch(
    payload: GitGetWorktreeSourceBranchPayload,
  ): Promise<GitGetWorktreeSourceBranchResult> {
    return this.gitService.getWorktreeSourceBranch(
      payload.projectLocation,
      payload.branch,
      payload.sourceBranchOverride,
    );
  }

  async gitProjectSnapshot(payload: GitProjectSnapshotPayload): Promise<GitProjectSnapshotResult> {
    const { projectLocation, includeGhCheck } = payload;
    if (projectLocation.kind === "wsl") {
      return this.gitService.batchedWslProjectSnapshot(projectLocation, includeGhCheck);
    }
    const [statusResult, branchesResult, worktreesResult, ghResult] = await Promise.allSettled([
      this.gitService.getStatus(projectLocation),
      this.gitService.listBranches(projectLocation, true),
      this.gitService.listWorktrees(projectLocation),
      includeGhCheck
        ? this.githubService.checkGhAvailable(projectLocation).then((r) => r.available)
        : Promise.resolve<boolean | null>(null),
    ]);
    return {
      status: statusResult.status === "fulfilled" ? statusResult.value : null,
      branches: branchesResult.status === "fulfilled" ? branchesResult.value : null,
      worktrees: worktreesResult.status === "fulfilled" ? worktreesResult.value.worktrees : null,
      ghAvailable: ghResult.status === "fulfilled" ? ghResult.value : null,
    };
  }

  async gitWorktreeStatusBatch(
    payload: GitWorktreeStatusBatchPayload,
  ): Promise<GitWorktreeStatusBatchResult> {
    const statuses = await this.gitService.getWorktreeStatusBatch(
      payload.projectLocation,
      payload.worktreePaths,
      payload.detail ?? "full",
    );
    return { statuses };
  }

  async gitMergeToSource(payload: GitMergeToSourcePayload): Promise<GitMergeToSourceResult> {
    return this.gitService.mergeToSource(
      payload.projectLocation,
      payload.worktreeLocation,
      payload.worktreeBranch,
      payload.sourceBranch,
    );
  }

  async gitPullFromSource(payload: GitPullFromSourcePayload): Promise<GitPullFromSourceResult> {
    return this.gitService.pullFromSource(
      payload.worktreeLocation,
      payload.sourceBranch,
      payload.preserveLocalChanges,
    );
  }

  async ghCheckAvailable(payload: GetGitStatusPayload): Promise<GhCheckAvailableResult> {
    return this.githubService.checkGhAvailable(payload.projectLocation);
  }

  async ghListAccounts(payload: GhListAccountsPayload): Promise<GhListAccountsResult> {
    return this.githubService.listAccounts(payload.runtime);
  }

  async ghListRepos(payload: GhListReposPayload): Promise<GhListReposResult> {
    return this.githubService.listRepos(payload.runtime, payload.account);
  }

  async cloneRepo(payload: CloneRepoPayload): Promise<CloneRepoResult> {
    const { parentLocation, name, source } = payload;
    if (source.kind === "github") {
      return this.githubService.cloneRepo(
        parentLocation,
        name,
        source.nameWithOwner,
        source.account,
      );
    }
    return this.gitService.cloneFromUrl(parentLocation, name, source.url);
  }

  async ghCreatePr(payload: GhCreatePrPayload): Promise<PrData> {
    return this.githubService.createPr(
      payload.projectLocation,
      payload.branch,
      payload.baseBranch,
      payload.title,
      payload.body,
      payload.isDraft,
    );
  }

  async ghGetPrForBranch(payload: GhGetPrForBranchPayload): Promise<PrData | null> {
    return this.githubService.getPrForBranch(payload.projectLocation, payload.branch);
  }

  async ghListPrs(payload: GhListPrsPayload): Promise<GhListPrsResult> {
    return { prs: await this.githubService.listPrs(payload.projectLocation) };
  }

  async ghMergePr(payload: GhMergePrPayload): Promise<void> {
    return this.githubService.mergePr(
      payload.projectLocation,
      payload.prNumber,
      payload.method,
      payload.admin,
    );
  }

  async ghClosePr(payload: GhClosePrPayload): Promise<void> {
    return this.githubService.closePr(payload.projectLocation, payload.prNumber);
  }

  async ghReopenPr(payload: GhReopenPrPayload): Promise<void> {
    return this.githubService.reopenPr(payload.projectLocation, payload.prNumber);
  }

  async ghMarkPrReady(payload: GhMarkPrReadyPayload): Promise<void> {
    return this.githubService.markPrReady(payload.projectLocation, payload.prNumber);
  }

  async ghGetPrChecks(payload: GhGetPrChecksPayload): Promise<GhGetPrChecksResult> {
    return this.githubService.getPrChecks(payload.projectLocation, payload.branch);
  }

  async ghGetPrFiles(payload: GhGetPrFilesPayload): Promise<GhGetPrFilesResult> {
    return this.githubService.getPrFiles(payload.projectLocation, payload.prNumber);
  }

  async ghGetPrDiff(payload: GhGetPrDiffPayload): Promise<GhGetPrDiffResult> {
    return this.githubService.getPrDiff(payload.projectLocation, payload.prNumber);
  }

  async ghSubmitPrReview(payload: GhSubmitPrReviewPayload): Promise<void> {
    return this.githubService.submitPrReview(
      payload.projectLocation,
      payload.prNumber,
      payload.decision,
      payload.body,
    );
  }

  async ghUpdatePrBranch(payload: GhUpdatePrBranchPayload): Promise<void> {
    return this.githubService.updatePrBranch(
      payload.projectLocation,
      payload.prNumber,
      payload.rebase,
    );
  }

  async ghGetPrDetails(payload: GhGetPrDetailsPayload): Promise<GhGetPrDetailsResult> {
    return this.githubService.getPrDetails(payload.projectLocation, payload.prNumber);
  }

  async ghPostPrComment(payload: GhPostPrCommentPayload): Promise<PrComment> {
    return this.githubService.postPrComment(
      payload.projectLocation,
      payload.prNumber,
      payload.body,
    );
  }

  async gitAbortMerge(payload: GitAbortMergePayload): Promise<void> {
    return this.gitService.abortMerge(payload.worktreeLocation);
  }

  async gitFinishMerge(payload: GitFinishMergePayload): Promise<GitFinishMergeResult> {
    return this.gitService.finishMerge(payload.worktreeLocation);
  }

  async gitWatchProject(payload: GitWatchProjectPayload): Promise<void> {
    this.projectWatcher.watch(payload.projectId, payload.projectLocation);
  }

  async gitWatchWorktrees(payload: GitWatchWorktreesPayload): Promise<void> {
    this.projectWatcher.watchWorktrees(payload.projectId, payload.worktreePaths);
  }

  async gitUnwatchProject(payload: GitUnwatchProjectPayload): Promise<void> {
    this.projectWatcher.unwatch(payload.projectId);
  }

  async searchProjectFiles(payload: SearchProjectFilesPayload): Promise<SearchProjectFilesResult> {
    return this.fileIndexService.searchProjectFiles(payload);
  }

  async listProjectTree(payload: ListProjectTreePayload): Promise<ListProjectTreeResult> {
    return this.projectTreeService.listProjectTree(payload);
  }

  async browseHostDirectory(
    payload: BrowseHostDirectoryPayload,
  ): Promise<BrowseHostDirectoryResult> {
    return this.projectTreeService.browseHostDirectory(payload);
  }

  async searchProjectTree(payload: SearchProjectTreePayload): Promise<SearchProjectTreeResult> {
    return this.projectTreeService.searchProjectTree(payload);
  }

  async readProjectFile(payload: ReadProjectFilePayload): Promise<ReadProjectFileResult> {
    return this.projectTreeService.readProjectFile(payload);
  }

  async readAbsoluteFile(payload: ReadAbsoluteFilePayload): Promise<ReadAbsoluteFileResult> {
    return this.projectTreeService.readAbsoluteFile(payload);
  }

  async readExternalFile(payload: ReadExternalFilePayload): Promise<ReadExternalFileResult> {
    return this.projectTreeService.readExternalFile(payload);
  }

  async writeProjectFile(payload: WriteProjectFilePayload): Promise<WriteProjectFileResult> {
    return this.projectTreeService.writeProjectFile(payload);
  }

  async writeExternalFile(payload: WriteExternalFilePayload): Promise<WriteExternalFileResult> {
    return this.projectTreeService.writeExternalFile(payload);
  }

  async createProjectEntry(payload: CreateProjectEntryPayload): Promise<void> {
    return this.projectTreeService.createProjectEntry(payload);
  }

  async renameProjectEntry(payload: RenameProjectEntryPayload): Promise<void> {
    return this.projectTreeService.renameProjectEntry(payload);
  }

  async moveProjectEntry(payload: MoveProjectEntryPayload): Promise<void> {
    return this.projectTreeService.moveProjectEntry(payload);
  }

  async deleteProjectEntry(payload: DeleteProjectEntryPayload): Promise<void> {
    return this.projectTreeService.deleteProjectEntry(payload);
  }

  async detectSetupScript(payload: DetectSetupScriptPayload): Promise<DetectSetupScriptResult> {
    const candidates: { file: string; command: string }[] = [
      { file: "pnpm-lock.yaml", command: "pnpm install" },
      { file: "bun.lockb", command: "bun install" },
      { file: "bun.lock", command: "bun install" },
      { file: "yarn.lock", command: "yarn install" },
      { file: "package-lock.json", command: "npm install" },
      { file: "poetry.lock", command: "poetry install" },
      { file: "Pipfile.lock", command: "pipenv install" },
      { file: "requirements.txt", command: "pip install -r requirements.txt" },
      { file: "Cargo.lock", command: "cargo fetch" },
      { file: "go.sum", command: "go mod download" },
      { file: "Gemfile.lock", command: "bundle install" },
      { file: "composer.lock", command: "composer install" },
    ];

    const location = payload.projectLocation;
    if (location.kind === "wsl") {
      if (!this.wslBridgeClient) return {};
      const paths = candidates.map((candidate) => joinProjectPosixPath(location, candidate.file));
      const { stats } = await this.wslBridgeClient.stat(location, paths);
      for (let index = 0; index < candidates.length; index += 1) {
        if (stats[index]?.isFile) {
          return { setupScript: candidates[index]!.command };
        }
      }
      return {};
    }

    const dir = location.path;
    for (const candidate of candidates) {
      if (existsSync(join(dir, candidate.file))) {
        return { setupScript: candidate.command };
      }
    }
    return {};
  }

  async lspStart(payload: LspStartPayload): Promise<void> {
    await this.lspManager.start(payload);
  }

  async lspStop(payload: LspStopPayload): Promise<void> {
    await this.lspManager.stop(payload);
  }

  async lspSendMessage(payload: LspMessagePayload): Promise<unknown> {
    return this.lspManager.sendMessage(payload);
  }

  dispose(): void {
    void this.disposeAsync();
  }

  async disposeAsync(): Promise<void> {
    this.usageService.stop();
    this.lspManager.dispose();
    await this._projectWatcher?.dispose();
    await this.threadSessionManager.dispose();
    this.subagentMcpIngress.dispose();
    this.sharedSettingsCache.dispose();
    await this.cliHookPluginCoordinator.dispose().catch((error) => {
      console.warn("[supervisor] CLI hook plugin coordinator dispose failed:", error);
    });
    const { shutdownSpawnedOpenCodeServers } = await import("./agents/opencode/sdkClient");
    shutdownSpawnedOpenCodeServers();
  }

  private handlePtyData(session: SessionRuntime, data: string): void {
    this.threadSessionManager.handlePtyDataForTests(session, data);
  }

  private spawnThread(input: unknown): unknown {
    return this.threadSessionManager.spawnThreadForTests(
      input as Parameters<typeof this.threadSessionManager.spawnThreadForTests>[0],
    );
  }

  /**
   * Test-only accessor for the private cache reader on the agent status
   * service.  Runtime callers should use `getAgentStatuses()` instead, which
   * returns the cached payload from the RPC promise.
   */
  private readCachedStatuses(wslDistros: readonly string[]): AgentStatusesResponse {
    return (
      this.agentStatusService as unknown as {
        readCachedStatuses: (distros: readonly string[]) => AgentStatusesResponse;
      }
    ).readCachedStatuses(wslDistros);
  }
}
