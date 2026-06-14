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
  SetPendingSteerPayload,
  ClearPendingSteerPayload,
  ListProjectTreePayload,
  ListProjectTreeResult,
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
import {
  acpGenericKind,
  extractAcpGenericInstanceId,
  verifyAcpGenericAuthentication,
} from "./agents/acp-generic";
import {
  dispatchAcpAuthenticate,
  dispatchAcpLogout,
  envContextFromPayload,
  isUnsupportedAcpLogoutError,
} from "./agents/acp";
import { buildAgentRegistry } from "./agents/registry";
import {
  autoUpdateAcpRegistryAgents,
  backfillAcpRegistryAgentIcons,
  cacheLocalAcpRegistryIcons,
  fetchAcpRegistry,
  installAcpRegistryAgent as installAcpRegistryAgentFromRegistry,
  readAcpRegistrySettings,
  removeAcpRegistryAgent as removeAcpRegistryAgentFromRegistry,
  setAcpGenericAgentAuthAcknowledged,
  setAcpRegistryAgentAuth as setAcpRegistryAgentAuthInRegistry,
  updateAcpRegistryAgent as updateAcpRegistryAgentFromRegistry,
} from "./agents/acpRegistry";
import { prefetchNativeNodeRuntime } from "./runtime/prefetchNativeNode";
import {
  setSessionFsBridgeClient,
  setWslProcessBridgeClient,
  type AgentAdapter,
  type AgentEnvContext,
} from "./agents/base";
import { setWslAttachmentBridgeClient } from "./runtime/threadAttachments";
import { getLatestVersionForAdapter, runUpdateCommandWithFallback } from "./agents/updateAgent";
import { clearAgentBinaryPathCache } from "./agents/binaryResolver";
import { generateCommitMessage } from "./commitMessageGenerator";
import {
  extractContext as extractContextFn,
  extractContextFromScrollback,
} from "./contextExtractor";
import { FileIndexService } from "./fileIndex";
import { GitService } from "./git";
import { GitCheckpointService } from "./git/checkpointService";
import { GitHubService } from "./github";
import { ProjectWatcher } from "./projectWatcher";
import { LanguageServerManager } from "./lsp";
import { ProjectTreeService } from "./projectTree";
import { generatePrSummary } from "./prSummaryGenerator";
import { detectWindowsShell, type WindowsShellPreference } from "./shellPreference";
import { generateTitle } from "./titleGenerator";
import { AgentStatusService, detectWslAgentStatuses } from "./runtime/agentStatusService";
import { createLocalUsageCollectors } from "./runtime/localUsageCollectors";
import { UsageService } from "./runtime/usageService";
import { type SessionRuntime, type ShellSessionRuntime } from "./runtime/sessionTypes";
import { ThreadSessionManager, writeSubmittedPrompt } from "./runtime/threadSessionManager";
import { CliHookPluginCoordinator } from "./runtime/cliHookPluginCoordinator";
import { dispatchAgentEvent } from "./runtime/agentEventDispatcher";
import { hookDebugEnvelope, isLightcodeHookDebug } from "./runtime/hookDebug";
import { SupervisorSharedSettingsCache } from "./runtime/supervisorSharedSettings";
import { WslBridgeServer } from "./wsl/bridge";
import { WslBridgeClient } from "./wsl/bridge/client";
import { resolveWslHelpersDir } from "./wsl/wslDeploy";

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
  private readonly threadSessionManager: ThreadSessionManager;
  private readonly lspManager: LanguageServerManager;
  private readonly cliHookPluginCoordinator: CliHookPluginCoordinator;
  private wslHookBridge: WslBridgeServer | undefined;
  private extractionAbortControllers = new Map<string, AbortController>();

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
    const baseDir = envBaseDir ?? join(homedir(), ".lightcode");
    this.baseDir = baseDir;
    const paths = resolveLightcodePaths(baseDir);
    this.logsDir = paths.terminalLogsDir;
    this.settingsPath = paths.settingsPath;
    this.acpIconsDir = paths.acpIconsDir;
    this.sharedSettingsCache = new SupervisorSharedSettingsCache(this.settingsPath);
    this.refreshAgentRegistryAdapters();
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

    this.threadSessionManager = new ThreadSessionManager({
      emit,
      isDev: this.isDev,
      logsDir: this.logsDir,
      settingsPath: this.settingsPath,
      readDisableCliHookPlugin: () => this.sharedSettingsCache.read().disableCliHookPlugin,
      adapters: this.adapters,
      windowsShell: this.windowsShell,
      ...(this.wslHookBridge ? { wslBridge: this.wslHookBridge } : {}),
      resolvePluginEnvForSpawn: (input) =>
        this.cliHookPluginCoordinator.resolvePluginEnvForSpawn(input),
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

    // One-time-per-machine icon repair: localize any acp-generic icon still on
    // a remote CDN URL so sidebar rows paint from disk instead of flickering
    // through a network round-trip on every start. No-op (no network) once all
    // icons are local. Fire-and-forget — never blocks the window from opening.
    void this.cacheLocalAcpIconsOnLaunch();
  }

  async listWslDistros(): Promise<string[]> {
    return this.agentStatusService.listWslDistros();
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

  /**
   * Convert remote acp-generic icon URLs to locally-cached ones at launch so
   * the renderer receives `lightcode-local://` icons this session (and
   * instantly on every future launch).
   */
  private async cacheLocalAcpIconsOnLaunch(): Promise<void> {
    try {
      const changed = await cacheLocalAcpRegistryIcons({
        settingsPath: this.settingsPath,
        iconsDir: this.acpIconsDir,
      });
      if (changed) await this.propagateAcpRegistryChange();
    } catch (error) {
      console.warn("[supervisor] launch ACP icon cache failed", error);
    }
  }

  /**
   * Propagate an acp-generic settings change (icon localization, registry
   * update): invalidate the settings cache, rebuild adapters, and refresh the
   * affected acp-generic statuses so the renderer picks up fresh icons/auth.
   * Best-effort — refresh failures are swallowed so callers stay resilient.
   */
  private async propagateAcpRegistryChange(): Promise<void> {
    this.sharedSettingsCache.invalidate();
    this.refreshAgentRegistryAdapters();
    const settings = readAcpRegistrySettings(this.settingsPath);
    const acpKinds = Object.entries(settings.agentInstances)
      .filter(([, instance]) => instance.driver === "acp-generic")
      .map(([id]) => acpGenericKind(id));
    if (acpKinds.length === 0) return;
    try {
      const wslDistros = await this.agentStatusService.listWslDistros();
      await this.agentStatusService.refreshAgentStatuses({
        wslDistros,
        scope: { agentKinds: acpKinds },
      });
    } catch (error) {
      console.warn("[supervisor] refresh after acp-generic settings change failed", error);
    }
  }

  private refreshAgentRegistryAdapters(): void {
    const settings = readAcpRegistrySettings(this.settingsPath);
    const adapters = buildAgentRegistry(Object.values(settings.agentInstances));
    const nextKinds = new Set(adapters.map((adapter) => adapter.kind));
    for (const kind of [...this.adapters.keys()]) {
      if (!nextKinds.has(kind)) {
        this.adapters.delete(kind);
      }
    }
    for (const adapter of adapters) {
      this.adapters.set(adapter.kind, adapter);
    }
  }

  private async refreshAffectedAgentStatus(agentKind: string): Promise<void> {
    try {
      const wslDistros = await this.agentStatusService.listWslDistros();
      await this.agentStatusService.refreshAgentStatuses({
        wslDistros,
        scope: { agentKinds: [agentKind] },
      });
    } catch (error) {
      console.warn(`[supervisor] refreshAffectedAgentStatus failed for ${agentKind}`, error);
    }
  }

  async getAgentStatuses(payload: GetAgentStatusesPayload): Promise<AgentStatusesResponse> {
    this.sharedSettingsCache.invalidate();
    this.refreshAgentRegistryAdapters();
    return this.agentStatusService.getAgentStatuses(payload);
  }

  async refreshAgentStatuses(payload: GetAgentStatusesPayload): Promise<AgentStatusesResponse> {
    this.sharedSettingsCache.invalidate();
    this.refreshAgentRegistryAdapters();
    return this.agentStatusService.refreshAgentStatuses(payload);
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
    const registry = await fetchAcpRegistry();
    let changed = await backfillAcpRegistryAgentIcons({
      registry,
      settingsPath: this.settingsPath,
      iconsDir: this.acpIconsDir,
    });
    const autoUpdate = await autoUpdateAcpRegistryAgents({
      registry,
      baseDir: this.baseDir,
      settingsPath: this.settingsPath,
      iconsDir: this.acpIconsDir,
    });
    if (autoUpdate.updated.length > 0) changed = true;
    if (changed) await this.propagateAcpRegistryChange();
    return registry;
  }

  async installAcpRegistryAgent(
    payload: InstallAcpRegistryAgentPayload,
  ): Promise<AcpRegistryMutationResult> {
    const installed = await installAcpRegistryAgentFromRegistry({
      agentId: payload.agentId,
      baseDir: this.baseDir,
      settingsPath: this.settingsPath,
      iconsDir: this.acpIconsDir,
    });
    this.sharedSettingsCache.invalidate();
    this.refreshAgentRegistryAdapters();
    await this.refreshAffectedAgentStatus(acpGenericKind(payload.agentId));
    return { installed };
  }

  async updateAcpRegistryAgent(
    payload: UpdateAcpRegistryAgentPayload,
  ): Promise<AcpRegistryMutationResult> {
    const installed = await updateAcpRegistryAgentFromRegistry({
      agentId: payload.agentId,
      baseDir: this.baseDir,
      settingsPath: this.settingsPath,
      iconsDir: this.acpIconsDir,
    });
    this.sharedSettingsCache.invalidate();
    this.refreshAgentRegistryAdapters();
    await this.refreshAffectedAgentStatus(acpGenericKind(payload.agentId));
    return { installed };
  }

  async updateAgentBinary(payload: UpdateAgentBinaryPayload): Promise<UpdateAgentBinaryResult> {
    const adapter = this.adapters.get(payload.agentKind);
    if (!adapter) {
      return {
        ok: false,
        strategy: "unsupported",
        output: `No adapter registered for agent kind "${payload.agentKind}".`,
      };
    }

    const envContext: AgentEnvContext = {
      envKind: payload.envKind,
      ...(payload.wslDistro ? { wslDistro: payload.wslDistro } : {}),
      baseDir: this.baseDir,
    };

    const wslDistros = await this.agentStatusService.listWslDistros();
    const statuses = await this.agentStatusService.getAgentStatuses({ wslDistros });
    const pool = payload.envKind === "wsl" ? statuses.wsl : statuses.windows;
    const status = pool.find(
      (entry) =>
        entry.kind === payload.agentKind &&
        (payload.envKind !== "wsl" || entry.envDistro === payload.wslDistro),
    );
    if (!status || !status.installed) {
      return {
        ok: false,
        strategy: "unsupported",
        output: `${adapter.label} is not installed in the requested environment.`,
      };
    }

    const result = await runUpdateCommandWithFallback(adapter, status, envContext);
    if (result.ok) {
      // Drop the cached executable path so the next detection probe runs a
      // fresh `command -v` / `where.exe`. Without this we keep returning the
      // old path; for most package managers the path doesn't change after
      // an update, but for nvm/fnm/asdf and similar version-managed setups
      // the new binary can land at a different prefix and the cached entry
      // would resolve to a stale shim.
      clearAgentBinaryPathCache();
      await this.refreshAffectedAgentStatus(payload.agentKind);
    }
    return result;
  }

  async getLatestAgentVersion(
    payload: GetLatestAgentVersionPayload,
  ): Promise<GetLatestAgentVersionResult> {
    const adapter = this.adapters.get(payload.agentKind);
    if (!adapter) return { source: "unknown" };
    return getLatestVersionForAdapter(adapter);
  }

  async removeAcpRegistryAgent(
    payload: RemoveAcpRegistryAgentPayload,
  ): Promise<AcpRegistryMutationResult> {
    const installed = removeAcpRegistryAgentFromRegistry({
      agentId: payload.agentId,
      baseDir: this.baseDir,
      settingsPath: this.settingsPath,
    });
    this.sharedSettingsCache.invalidate();
    this.refreshAgentRegistryAdapters();
    return { installed };
  }

  async setAcpRegistryAgentAuth(
    payload: SetAcpRegistryAgentAuthPayload,
  ): Promise<AcpRegistryMutationResult> {
    const installed = setAcpRegistryAgentAuthInRegistry({
      agentId: payload.agentId,
      environment: payload.environment,
      settingsPath: this.settingsPath,
    });
    this.sharedSettingsCache.invalidate();
    this.refreshAgentRegistryAdapters();
    void this.refreshAffectedAgentStatus(acpGenericKind(payload.agentId));
    return { installed };
  }

  async authenticateAcpAgent(payload: AuthenticateAcpAgentPayload): Promise<void> {
    const adapter = this.adapters.get(payload.agentKind);
    if (!adapter) {
      throw new Error(`Unknown agent: ${payload.agentKind}`);
    }
    const ctx = envContextFromPayload(payload.envKind, payload.wslDistro);
    await dispatchAcpAuthenticate({
      adapter,
      methodId: payload.methodId,
      ...(payload.envKind ? { envKind: payload.envKind } : {}),
      ...(payload.wslDistro ? { wslDistro: payload.wslDistro } : {}),
    });
    // Generic ACP instances persist a per-env login acknowledgement so the
    // detection probe (which can't always tell whether the agent is signed in)
    // reports `authState: "authenticated"` on the next refresh. Native ACP
    // adapters (copilot/gemini/cursor) probe their own auth state directly
    // and don't need an ack.
    const instanceId = extractAcpGenericInstanceId(payload.agentKind);
    if (instanceId !== undefined) {
      const instance = readAcpRegistrySettings(this.settingsPath).agentInstances[instanceId];
      const verified =
        instance !== undefined && (await verifyAcpGenericAuthentication(instance, ctx));
      if (!verified) {
        setAcpGenericAgentAuthAcknowledged(this.settingsPath, instanceId, ctx, false);
        this.sharedSettingsCache.invalidate();
        this.refreshAgentRegistryAdapters();
        void this.refreshAffectedAgentStatus(payload.agentKind);
        throw new Error("ACP authentication was not completed.");
      }
      setAcpGenericAgentAuthAcknowledged(this.settingsPath, instanceId, ctx, true);
    } else {
      const status = await adapter.detectInstall(ctx);
      if (status.authState === "missing") {
        void this.refreshAffectedAgentStatus(payload.agentKind);
        throw new Error("ACP authentication was not completed.");
      }
    }
    this.sharedSettingsCache.invalidate();
    this.refreshAgentRegistryAdapters();
    void this.refreshAffectedAgentStatus(payload.agentKind);
  }

  async logoutAcpAgent(payload: LogoutAcpAgentPayload): Promise<void> {
    const adapter = this.adapters.get(payload.agentKind);
    if (!adapter) {
      throw new Error(`Unknown agent: ${payload.agentKind}`);
    }
    const ctx = envContextFromPayload(payload.envKind, payload.wslDistro);
    const instanceId = extractAcpGenericInstanceId(payload.agentKind);
    // Best-effort ACP-side logout only applies to generic ACP instances. The
    // local ack is their source of truth, so unsupported ACP logout can still
    // clear the UI state. Native adapters must not report success unless the
    // agent actually accepts the logout request.
    try {
      await dispatchAcpLogout({
        adapter,
        ...(payload.envKind ? { envKind: payload.envKind } : {}),
        ...(payload.wslDistro ? { wslDistro: payload.wslDistro } : {}),
      });
    } catch (error) {
      if (instanceId === undefined || !isUnsupportedAcpLogoutError(error)) throw error;
    }
    if (instanceId !== undefined) {
      setAcpGenericAgentAuthAcknowledged(this.settingsPath, instanceId, ctx, false);
    }
    this.sharedSettingsCache.invalidate();
    this.refreshAgentRegistryAdapters();
    void this.refreshAffectedAgentStatus(payload.agentKind);
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
    const adapter = this.requireAdapter(payload.agentKind);
    return {
      message: await generateCommitMessage(
        payload.projectLocation,
        adapter,
        payload.model,
        payload.effort,
      ),
    };
  }

  async generateTitle(payload: GenerateTitlePayload): Promise<GenerateTitleResult> {
    const adapter = this.requireAdapter(payload.agentKind);
    return {
      title: await generateTitle(
        payload.projectLocation,
        adapter,
        payload.prompt,
        payload.model,
        payload.effort,
      ),
    };
  }

  async generatePrSummary(payload: GeneratePrSummaryPayload): Promise<GeneratePrSummaryResult> {
    const adapter = this.requireAdapter(payload.agentKind);
    return generatePrSummary(
      payload.projectLocation,
      adapter,
      payload.branch,
      payload.baseBranch,
      payload.model,
      payload.effort,
    );
  }

  async extractContext(payload: ExtractContextPayload): Promise<ExtractContextResult> {
    const adapter = this.requireAdapter(payload.agentKind);
    const abortController = new AbortController();
    this.extractionAbortControllers.set(payload.threadId, abortController);

    try {
      try {
        return await extractContextFn(
          payload.projectLocation,
          adapter,
          payload.sessionRef,
          payload.worktreePath,
          payload.model,
          payload.effort,
          abortController.signal,
        );
      } catch {
        const scrollback = this.readTerminalScrollback(payload.threadId);
        if (scrollback) {
          return extractContextFromScrollback(
            payload.projectLocation,
            adapter,
            scrollback,
            payload.agentKind,
            payload.sessionRef.providerSessionId,
            payload.worktreePath,
            payload.model,
            payload.effort,
            abortController.signal,
          );
        }
        throw new Error(
          `Cannot extract context from ${adapter.label}: no session resume or scrollback available`,
        );
      }
    } finally {
      this.extractionAbortControllers.delete(payload.threadId);
    }
  }

  cancelExtractContext(threadId: string): void {
    const controller = this.extractionAbortControllers.get(threadId);
    if (controller) {
      controller.abort();
      this.extractionAbortControllers.delete(threadId);
    }
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
        await this.closeThread({ threadId }).catch(() => undefined);
      }
    }

    for (const [threadId, shell] of this.shellSessions) {
      if (shell.worktreePath?.replace(/\\/g, "/").toLowerCase() === normalizedTarget) {
        await this.closeThread({ threadId }).catch(() => undefined);
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
    return this.gitService.pruneWorktrees(payload.projectLocation, payload.activeWorktreePaths);
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
    this.lspManager.dispose();
    await this._projectWatcher?.dispose();
    await this.threadSessionManager.dispose();
    this.sharedSettingsCache.dispose();
    await this.cliHookPluginCoordinator.dispose().catch(() => undefined);
    const { shutdownSpawnedOpenCodeServers } = await import("./agents/opencode/sdkClient");
    shutdownSpawnedOpenCodeServers();
  }

  private requireAdapter(kind: AgentKind) {
    const adapter = this.adapters.get(kind);
    if (!adapter) {
      throw new Error(`Unsupported agent adapter: ${kind}`);
    }
    return adapter;
  }

  private handlePtyData(session: SessionRuntime, data: string): void {
    this.threadSessionManager.handlePtyDataForTests(session, data);
  }

  private spawnThread(input: unknown): unknown {
    return (
      this.threadSessionManager as unknown as { spawnThread: (value: unknown) => unknown }
    ).spawnThread(input);
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
