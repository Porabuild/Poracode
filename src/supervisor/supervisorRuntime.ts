import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import type {
  AgentKind,
  CaptureExperimentSnapshotPayload,
  CaptureExperimentSnapshotResult,
  CloneRepoPayload,
  CloneRepoResult,
  DetectSetupScriptPayload,
  DetectSetupScriptResult,
  GitProjectSnapshotPayload,
  GitProjectSnapshotResult,
  GitPruneWorktreesPayload,
  GitRemoveWorktreePayload,
  GitSyncPayload,
  GitSyncResult,
  JudgeExperimentSnapshotPayload,
  JudgeExperimentSnapshotResult,
  ProjectLocation,
  RemoveExperimentWorktreesPayload,
  RemoveExperimentWorktreesResult,
  RelocateProjectPayload,
  RelocateProjectResult,
} from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import type { ConfirmCrossagentRoutingOverridePayload } from "@/shared/ipc/procedures/mcp";
import { msg } from "@/shared/messages";
import { resolvePoracodePaths } from "@/shared/poracodePaths";
import { joinProjectPosixPath } from "@/shared/wsl";
import { prefetchNativeNodeRuntime } from "./runtime/prefetchNativeNode";
import {
  setSessionFsBridgeClient,
  setWslProcessBridgeClient,
  type AgentAdapter,
} from "./agents/base";
import { setWslAttachmentBridgeClient } from "./runtime/threadAttachments";
import { FileIndexService } from "./fileIndex";
import { GitService, resolveBuiltInWorktreeRoot, type CapturedExperimentSnapshot } from "./git";
import { normalizeWorktreePathForComparison, resolveWorktreePlacement } from "@/shared/worktree";
import { GitCheckpointService } from "./git/checkpointService";
import { GitHubService } from "./github";
import { ProjectWatcher } from "./projectWatcher";
import { LanguageServerManager } from "./lsp";
import { ProjectTreeService } from "./projectTree";
import { detectWindowsShell, type WindowsShellPreference } from "./shellPreference";
import { AgentStatusService, detectWslAgentStatuses } from "./runtime/agentStatusService";
import { createLocalUsageCollectors } from "./runtime/localUsageCollectors";
import { UsageService } from "./runtime/usageService";
import { setWslCredentialProjectScope } from "./runtime/wslCredentials";
import { AgentRegistryService } from "./runtime/agentRegistryService";
import { GenerationService } from "./runtime/generationService";
import { type SessionRuntime, type ShellSessionRuntime } from "./runtime/sessionTypes";
import { ThreadSessionManager, writeSubmittedPrompt } from "./runtime/threadSessionManager";
import { CliHookPluginCoordinator } from "./runtime/cliHookPluginCoordinator";
import { CrossagentMcpIngress } from "./crossagentMcp/CrossagentMcpIngress";
import { SubagentRunManager } from "./crossagentMcp/SubagentRunManager";
import { RoutingOverridePersistence } from "./crossagentMcp/RoutingOverridePersistence";
import {
  visibleCrossagentCapabilitiesForAdapter,
  type CrossagentVisibilitySettings,
} from "./crossagentMcp/availability";
import { buildSpawnableAgents, crossagentRoutingSnapshot } from "./crossagentMcp/toolRegistry";
import { dispatchAgentEvent } from "./runtime/agentEventDispatcher";
import { hookDebugEnvelope, isPoracodeHookDebug } from "./runtime/hookDebug";
import { SupervisorSharedSettingsCache } from "./runtime/supervisorSharedSettings";
import { WslBridgeServer } from "./wsl/bridge";
import { WslBridgeClient } from "./wsl/bridge/client";
import { resolveWslHelpersDir } from "./wsl/wslDeploy";
import { resolveWslHostAccess } from "./wsl/hostAccess";
import { McpOAuthService } from "./mcp/McpOAuthService";
import { McpProbeService } from "./mcp/McpProbeService";
import { prepareMcpToolFilters } from "./mcp/McpToolFilterService";
import { ExternalMcpDiscoveryService } from "./mcp/ExternalMcpDiscoveryService";
import { SkillsService } from "./skills/SkillsService";
import { captureExperimentResponseSnapshot } from "./experimentResponseSnapshot";

export { detectWslAgentStatuses, writeSubmittedPrompt };

function toPublicExperimentSnapshot(
  snapshot: CapturedExperimentSnapshot,
): CaptureExperimentSnapshotResult {
  return {
    hash: snapshot.hash,
    candidates: snapshot.candidates.map(({ diff: _diff, ...candidate }) => candidate),
  };
}

export class SupervisorRuntime {
  private readonly isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
  private readonly baseDir: string;
  private readonly logsDir: string;
  private readonly settingsPath: string;
  private readonly acpIconsDir: string;
  private readonly sharedSettingsCache: SupervisorSharedSettingsCache;
  // The service cluster is public on purpose: `createSupervisorIpcHandlers`
  // maps IPC procedures straight onto these services — this class only wires
  // them together and hosts the few cross-service orchestrations below.
  readonly gitService = new GitService();
  readonly gitCheckpointService = new GitCheckpointService();
  private _projectWatcher: ProjectWatcher | undefined;
  readonly githubService = new GitHubService();
  readonly fileIndexService = new FileIndexService();
  readonly projectTreeService = new ProjectTreeService();
  private readonly adapters = new Map<AgentKind, AgentAdapter>();
  private readonly windowsShell: WindowsShellPreference;
  readonly agentStatusService: AgentStatusService;
  readonly usageService: UsageService;
  readonly agentRegistryService: AgentRegistryService;
  readonly generationService: GenerationService;
  readonly threadSessionManager: ThreadSessionManager;
  readonly lspManager: LanguageServerManager;
  readonly cliHookPluginCoordinator: CliHookPluginCoordinator;
  readonly externalMcpDiscoveryService = new ExternalMcpDiscoveryService();
  readonly mcpOAuthService: McpOAuthService;
  readonly mcpProbeService: McpProbeService;
  readonly skillsService: SkillsService;
  private readonly crossagentMcpIngress: CrossagentMcpIngress;
  private readonly subagentRunManager: SubagentRunManager;
  private readonly routingOverridePersistence: RoutingOverridePersistence;
  private readonly disposeWslCredentialProjectScope: () => void;
  private wslHookBridge: WslBridgeServer | undefined;

  readonly sessions: Map<string, SessionRuntime>;
  readonly shellSessions: Map<string, ShellSessionRuntime>;

  get projectWatcher(): ProjectWatcher {
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
    const rawBaseDir = process.env.PORACODE_DATA_DIR?.trim();
    const envBaseDir =
      rawBaseDir && rawBaseDir !== "undefined" && isAbsolute(rawBaseDir) ? rawBaseDir : undefined;
    const baseDir = envBaseDir ?? join(homedir(), ".poracode");
    this.baseDir = baseDir;
    this.mcpOAuthService = new McpOAuthService({ baseDir });
    this.mcpProbeService = new McpProbeService({
      applyAuthorization: (server) => this.mcpOAuthService.applyAuthorizationToServer(server),
    });
    const paths = resolvePoracodePaths(baseDir);
    this.logsDir = paths.terminalLogsDir;
    this.settingsPath = paths.settingsPath;
    this.acpIconsDir = paths.acpIconsDir;
    this.sharedSettingsCache = new SupervisorSharedSettingsCache(this.settingsPath);
    this.routingOverridePersistence = new RoutingOverridePersistence({
      emit,
      invalidateSettings: () => this.sharedSettingsCache.invalidate(),
    });
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
    this.skillsService = new SkillsService({
      adapters: this.adapters,
      resolveAgentVersion: (kind, wslDistro) =>
        this.agentStatusService.getCachedVersion(kind, wslDistro),
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
        if (isPoracodeHookDebug()) {
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
          if (isPoracodeHookDebug()) {
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
        ...(process.env.PORACODE_HOOK_PORT
          ? { preferredPort: Number(process.env.PORACODE_HOOK_PORT) }
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
          if (isPoracodeHookDebug()) {
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

    // Crossagents: an in-process MCP server (CrossagentMcpIngress)
    // lets any agent spawn the other connected agents as subagents. The run
    // manager owns child structured sessions; the ingress mints per-thread
    // tokens and routes tools/call to the caller's parent thread. The run
    // manager's host is the thread session manager (assigned just below — the
    // closures resolve it lazily at call time).
    this.subagentRunManager = new SubagentRunManager({
      adapters: this.adapters,
      // Validate spawn selections against the persisted status pipeline — the
      // same source list_agents/get_agent (and the composer) are served from —
      // so the executor never disagrees with the roster it advertised.
      getStatusCapabilities: (kind) => {
        const adapter = this.adapters.get(kind);
        if (!adapter) return null;
        const settings = this.sharedSettingsCache.read();
        const cachedCapabilities = this.agentStatusService.getCachedCapabilities(kind);
        if (cachedCapabilities === null) return null;
        return visibleCrossagentCapabilitiesForAdapter(adapter, cachedCapabilities, settings);
      },
      host: {
        getParentContext: (threadId) =>
          this.threadSessionManager.getSubagentParentContext(threadId),
        resolveParentMcpAccess: (threadId, identity, targetAgentKind) =>
          this.threadSessionManager.resolveSubagentParentMcpAccess(
            threadId,
            identity,
            targetAgentKind,
          ),
        appendRuntimeEvent: (parentThreadId, event) =>
          this.threadSessionManager.appendSubagentRuntimeEvent(parentThreadId, event),
      },
    });
    this.crossagentMcpIngress = new CrossagentMcpIngress({
      runManager: this.subagentRunManager,
      getSpawnableAgents: (tags) => this.getCrossagentSpawnableAgents(tags),
      resolveProviderSessionThreadId: (sessionId) =>
        this.threadSessionManager.getThreadIdByProviderSessionId(sessionId),
      // User-configured routing guidance, read live from shared settings (the
      // cache invalidates on file change) so edits take effect on the next turn
      // without a supervisor restart. Empty/whitespace-only = no guidance.
      getRoutingGuide: () => {
        const guide = this.sharedSettingsCache.read().crossagentRoutingGuide.trim();
        return guide.length > 0 ? guide : undefined;
      },
      recordExplicitSelections: (selections) => {
        const validSelections = selections.flatMap(({ selection, explicitFields, tags }) =>
          selection.model
            ? [
                {
                  agentKind: selection.agent,
                  modelId: selection.model,
                  ...(selection.effort ? { effort: selection.effort } : {}),
                  fast: selection.fast === true,
                  ...(tags.length > 0 ? { tags } : {}),
                  explicitFields,
                },
              ]
            : [],
        );
        if (validSelections.length === 0) return;
        emit({
          type: "crossagent-selection-used",
          selections: validSelections,
        });
      },
      listRoutingOverrides: () => this.sharedSettingsCache.read().crossagentRoutingOverrides,
      setRoutingOverride: (override) => {
        return this.routingOverridePersistence.persist({ action: "set", override });
      },
      removeRoutingOverride: (tags) => {
        return this.routingOverridePersistence.persist({
          action: "remove",
          tags: [...tags],
        });
      },
    });
    void this.crossagentMcpIngress.start().catch((error) => {
      console.warn("[supervisor] Crossagents MCP ingress failed to start:", error);
    });

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
      crossagentMcp: {
        register: (threadId, disabledTools) =>
          this.crossagentMcpIngress.registerThread(threadId, disabledTools),
        registerProviderSession: (threadId, disabledTools) =>
          this.crossagentMcpIngress.registerProviderSessionThread(threadId, disabledTools),
        unregister: (threadId) => this.crossagentMcpIngress.unregisterThread(threadId),
        cancelForeground: (threadId) => this.subagentRunManager.cancelForegroundForThread(threadId),
        cancelAll: (threadId) => this.subagentRunManager.cancelAllForThread(threadId),
        resolveChildRequest: (requestId, response) =>
          this.subagentRunManager.resolveChildServerRequest(requestId, response),
      },
      wslHostAccess: {
        resolveHostAccess: (distro) => resolveWslHostAccess(distro),
      },
      applyMcpServerAuthorization: (servers) => this.mcpOAuthService.applyAuthorization(servers),
      prepareMcpToolFilters,
      prepareSkillsForLaunch: async (projectLocation, agentKind) => {
        try {
          await this.skillsService.prepareForLaunch(projectLocation, agentKind);
        } catch (error) {
          console.warn("[skills] failed to prepare provider skill projections:", error);
        }
      },
      buildSkillTurnInjection: async (input) => {
        try {
          return await this.skillsService.buildTurnSkillInjection(input);
        } catch (error) {
          // Skill delivery is best-effort; a failed inline must never block a turn.
          console.warn("[skills] failed to build inline skill instructions:", error);
          return undefined;
        }
      },
      rewriteTerminalSkillSegments: async (input) => {
        try {
          return await this.skillsService.rewriteTerminalSkillSegments(input);
        } catch (error) {
          // Best-effort: fall back to the original segments (plain invocation).
          console.warn("[skills] failed to rewrite terminal skill segments:", error);
          return [...input.segments];
        }
      },
    });
    this.sessions = this.threadSessionManager.sessions;
    this.shellSessions = this.threadSessionManager.shellSessions;

    // The usage credential WSL fallback boots every installed distro (and
    // keeps its VM alive via the resident bridge) just to look for tokens.
    // Restrict it to when the user actually uses WSL — a watched WSL project
    // or a live WSL session — so a Windows-only setup never spins up VmmemWSL.
    this.disposeWslCredentialProjectScope = setWslCredentialProjectScope(() =>
      this.hasActiveWslContext(),
    );
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
      readTerminalScrollback: (threadId) =>
        this.threadSessionManager.readTerminalScrollback(threadId),
      wslBridgeClient: this.wslBridgeClient,
    });

    // One-time-per-machine icon repair: localize any acp-generic icon still on
    // a remote CDN URL so sidebar rows paint from disk instead of flickering
    // through a network round-trip on every start. No-op (no network) once all
    // icons are local. Fire-and-forget — never blocks the window from opening.
    void this.agentRegistryService.cacheLocalAcpIconsOnLaunch();
  }

  async getCrossagentSpawnableAgents(contextTags: readonly string[] = []) {
    const { windows } = await this.agentStatusService.getAgentStatuses({ wslDistros: [] });
    const settings: CrossagentVisibilitySettings = this.sharedSettingsCache.read();
    return buildSpawnableAgents(this.adapters, windows, settings, contextTags);
  }

  async getCrossagentRoutingSnapshot() {
    return crossagentRoutingSnapshot(await this.getCrossagentSpawnableAgents());
  }

  confirmCrossagentRoutingOverride(payload: ConfirmCrossagentRoutingOverridePayload): void {
    this.routingOverridePersistence.confirm(payload);
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
   * True when the user actively uses WSL: a watched (non-disabled) project
   * lives in a distro, or a live session does. Gates the usage credential
   * WSL fallback so it never boots a distro on its own.
   */
  private hasActiveWslContext(): boolean {
    if (this._projectWatcher?.hasWslProjects()) return true;
    for (const session of this.sessions.values()) {
      if (!session.ptyExited && session.projectLocation.kind === "wsl") return true;
    }
    return false;
  }

  async gitRemoveWorktree(payload: GitRemoveWorktreePayload): Promise<void> {
    await this.prepareWorktreeRemovals([payload.path]);
    return this.gitService.removeWorktree(
      payload.projectLocation,
      payload.path,
      payload.force,
      payload.deleteBranch,
      payload.expectedBranch,
      payload.expectedOwnerToken,
    );
  }

  async removeExperimentWorktrees(
    payload: RemoveExperimentWorktreesPayload,
  ): Promise<RemoveExperimentWorktreesResult> {
    return this.gitService.removeExperimentWorktrees(payload, async (worktrees) => {
      await this.prepareWorktreeRemovals(worktrees.map((worktree) => worktree.path));
    });
  }

  async captureExperimentSnapshot(
    payload: CaptureExperimentSnapshotPayload,
  ): Promise<CaptureExperimentSnapshotResult> {
    const snapshot = await this.gitService.captureExperimentSnapshot(payload);
    return toPublicExperimentSnapshot(snapshot);
  }

  async judgeExperimentSnapshot(
    payload: JudgeExperimentSnapshotPayload,
  ): Promise<JudgeExperimentSnapshotResult> {
    if (payload.mode === "responses") {
      const snapshot = captureExperimentResponseSnapshot(
        payload,
        (threadId) => this.threadSessionManager.readTerminalScrollback(threadId),
        (candidate) => {
          this.emit({
            type: "experiment-judge-progress",
            experimentId: payload.experimentId,
            progress: {
              kind: "captured-response",
              threadId: candidate.threadId,
              characters: candidate.characters,
            },
          });
        },
      );
      this.emit({
        type: "experiment-judge-progress",
        experimentId: payload.experimentId,
        progress: { kind: "judging" },
      });
      const judgement = await this.generationService.judgeExperiment({
        experimentId: payload.experimentId,
        projectLocation: payload.projectLocation,
        agentKind: payload.agentKind,
        ...(payload.model ? { model: payload.model } : {}),
        ...(payload.effort ? { effort: payload.effort } : {}),
        ...(payload.fast !== undefined ? { fast: payload.fast } : {}),
        mode: "responses",
        prompt: payload.prompt,
        candidates: snapshot.candidates,
      });
      return { hash: snapshot.hash, ...judgement };
    }

    const snapshot = await this.gitService.captureExperimentSnapshot(payload, (candidate) => {
      this.emit({
        type: "experiment-judge-progress",
        experimentId: payload.experimentId,
        progress: {
          kind: "captured",
          threadId: candidate.threadId,
          files: candidate.files,
          insertions: candidate.insertions,
          deletions: candidate.deletions,
          ...(candidate.omittedFiles ? { omittedFiles: candidate.omittedFiles } : {}),
        },
      });
    });
    if (snapshot.candidates.every((candidate) => !candidate.diff.trim())) {
      throw new Error(msg("experiment.judge.noChanges"));
    }
    this.emit({
      type: "experiment-judge-progress",
      experimentId: payload.experimentId,
      progress: { kind: "judging" },
    });
    const judgement = await this.generationService.judgeExperiment({
      experimentId: payload.experimentId,
      projectLocation: payload.projectLocation,
      agentKind: payload.agentKind,
      ...(payload.model ? { model: payload.model } : {}),
      ...(payload.effort ? { effort: payload.effort } : {}),
      ...(payload.fast !== undefined ? { fast: payload.fast } : {}),
      mode: "changes",
      prompt: payload.prompt,
      candidates: snapshot.candidates.map((candidate) => ({
        threadId: candidate.threadId,
        diff: candidate.diff,
        ...(candidate.omittedFiles ? { omittedFiles: candidate.omittedFiles } : {}),
      })),
    });
    return { ...toPublicExperimentSnapshot(snapshot), ...judgement };
  }

  private async prepareWorktreeRemovals(paths: readonly string[]): Promise<void> {
    const normalizePath = (path: string) => normalizeWorktreePathForComparison(path, true);
    const normalizedTargets = new Set(paths.map(normalizePath));
    const threadIds = new Set<string>();

    for (const [threadId, session] of this.sessions) {
      const sessionPath =
        session.projectLocation.kind === "wsl"
          ? session.projectLocation.uncPath
          : session.projectLocation.path;
      if (normalizedTargets.has(normalizePath(sessionPath))) {
        threadIds.add(threadId);
      }
    }

    for (const [threadId, shell] of this.shellSessions) {
      const shellPath = shell.worktreePath ? normalizePath(shell.worktreePath) : undefined;
      if (shellPath && normalizedTargets.has(shellPath)) {
        threadIds.add(threadId);
      }
    }

    await Promise.all(
      [...threadIds].map((threadId) =>
        this.threadSessionManager.closeThread({ threadId }).catch((error) => {
          console.warn(
            `[supervisor] failed to close thread ${threadId} during worktree removal:`,
            error,
          );
        }),
      ),
    );
    await Promise.all(paths.map((path) => this.projectWatcher.unwatchWorktree(path)));
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

  /** Fetch, then pull (merge or rebase) when behind, then push when ahead. */
  async gitSync(payload: GitSyncPayload, rebase: boolean): Promise<GitSyncResult> {
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

  releaseWslBridgeIfUnused(distro: string): void {
    const hasLiveSession = [...this.sessions.values()].some(
      (session) =>
        session.status !== "inactive" &&
        session.projectLocation.kind === "wsl" &&
        session.projectLocation.distro === distro,
    );
    if (!hasLiveSession) {
      this.wslHookBridge?.releaseBridge(distro);
    }
  }

  dispose(): void {
    void this.disposeAsync();
  }

  async disposeAsync(): Promise<void> {
    this.disposeWslCredentialProjectScope();
    this.routingOverridePersistence.dispose();
    this.usageService.stop();
    this.mcpProbeService.dispose();
    this.mcpOAuthService.dispose();
    this.lspManager.dispose();
    await this._projectWatcher?.dispose();
    await this.threadSessionManager.dispose();
    this.crossagentMcpIngress.dispose();
    this.sharedSettingsCache.dispose();
    await this.cliHookPluginCoordinator.dispose().catch((error) => {
      console.warn("[supervisor] CLI hook plugin coordinator dispose failed:", error);
    });
    const { shutdownSpawnedOpenCodeServers } = await import("./agents/opencode/sdkClient");
    shutdownSpawnedOpenCodeServers();
    const { shutdownSpawnedCodexAppServers } = await import("./agents/codex/serverPool");
    shutdownSpawnedCodexAppServers();
  }

  private handlePtyData(session: SessionRuntime, data: string): void {
    this.threadSessionManager.handlePtyDataForTests(session, data);
  }

  private spawnThread(input: unknown): unknown {
    return this.threadSessionManager.spawnThreadForTests(
      input as Parameters<typeof this.threadSessionManager.spawnThreadForTests>[0],
    );
  }
}
