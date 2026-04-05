import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { spawn, type IPty } from "node-pty";
import type {
  AgentKind,
  AgentStatus,
  CloseThreadPayload,
  GenerateCommitMessagePayload,
  GenerateCommitMessageResult,
  GenerateTitlePayload,
  GenerateTitleResult,
  GetAgentStatusesPayload,
  GetGitDiffBatchPayload,
  GetGitDiffPayload,
  GetGitStatusPayload,
  GitAddWorktreeResult,
  GitCommitPayload,
  GitCommitResult,
  GitDiffBatchResult,
  GitDiffResult,
  GitPullPayload,
  GitPushPayload,
  GitRevertAllPayload,
  GitRevertPayload,
  GitStageAllPayload,
  GitStagePayload,
  GitStatusResult,
  GitSyncPayload,
  GitSyncResult,
  DetectSetupScriptPayload,
  DetectSetupScriptResult,
  GhCheckAvailableResult,
  GhCreatePrPayload,
  GhGetPrForBranchPayload,
  GhMergePrPayload,
  GhClosePrPayload,
  GhReopenPrPayload,
  GhGetPrChecksPayload,
  GhGetPrChecksResult,
  PrData,
  SearchProjectFilesPayload,
  SearchProjectFilesResult,
  GitAddWorktreePayload,
  GitBranchListResult,
  GitFetchPayload,
  GitListWorktreesPayload,
  GitDeleteBranchPayload,
  GitGetWorktreeSourceBranchPayload,
  GitGetWorktreeSourceBranchResult,
  GitMergeToSourcePayload,
  GitMergeToSourceResult,
  GitPullFromSourcePayload,
  GitPullFromSourceResult,
  GitAbortMergePayload,
  GitRunMergetoolPayload,
  GitRunMergetoolResult,
  GitRemoveWorktreePayload,
  GitUnstageAllPayload,
  GitUnwatchProjectPayload,
  GitWatchProjectPayload,
  GitWatchWorktreesPayload,
  GitUnstagePayload,
  GitWorktreeListResult,
  GetGitBranchesPayload,
  ProjectLocation,
  ResizeTerminalPayload,
  ResolveThreadServerRequestPayload,
  SendThreadInputPayload,
  SessionRef,
  StartShellPayload,
  StartThreadPayload,
  StartThreadResult,
  TerminalSize,
  ThreadAttention,
  ThreadConfig,
  ThreadHistorySnapshot,
  ThreadRuntimeSnapshot,
  ThreadStatus,
  WriteTerminalPayload,
  PromptSegment,
} from "../shared/contracts";
import type { SupervisorEvent } from "../shared/ipc";
import { stripAnsiPreservingLayout } from "../shared/ansi";
import { resolveLightcodePaths } from "../shared/lightcodePaths";
import { normalizeSharedSettings, defaultSharedSettings } from "../shared/settings";
import { stripInternalHistoryMarkers } from "../shared/terminalHistory";
import { normalizeWslListOutput } from "../shared/wsl";
import { createAgentRegistry } from "./agents/registry";
import {
  type AgentAdapter,
  type AgentEnvContext,
  type CommandSpec,
  type StructuredSessionHandle,
  defaultFormatPromptSegments,
  getWslCommand,
  readWslCommandOutputAsync,
} from "./agents/base";
import { generateCommitMessage } from "./commitMessageGenerator";
import { generateTitle } from "./titleGenerator";
import { GitService } from "./git";
import { GitWatcher } from "./gitWatcher";
import { GitHubService } from "./github";
import { FileIndexService } from "./fileIndex";
import { resetTerminalLogFile, resetTerminalLogsDir } from "./terminalLogs";
import { detectWindowsShell, type WindowsShellPreference } from "./shellPreference";

/**
 * Stabilization delays (ms) for terminal-derived status transitions.
 * High-priority statuses (needs_approval, needs_reply, error) are immediate.
 * Lower-priority statuses wait to filter out TUI animation artifacts.
 */
const STATUS_STABILIZATION_DELAY: Partial<Record<ThreadStatus, number>> = {
  working: 150,
  idle: 300,
};

interface SessionRuntime {
  instanceId: string;
  threadId: string;
  agentKind: AgentKind;
  adapter: AgentAdapter;
  pty: IPty;
  projectLocation: ProjectLocation;
  config: ThreadConfig;
  sessionRef?: SessionRef;
  status: ThreadStatus;
  attention: ThreadAttention;
  canResumeWithConfig: boolean;
  terminalSize: TerminalSize;
  launchPrompt: string;
  logPath: string;
  outputLength: number;
  structuredSession?: StructuredSessionHandle;
  ignoreExit?: boolean;
  invalidSessionRecoveryStarted?: boolean;
  ptyExited?: boolean;
  autoResponseEmitted?: boolean;
  sessionRefDiscoveryStarted?: boolean;
  pendingLaunchPrompt?: string | undefined;
  pendingTerminalPrompt?: string | undefined;
  pendingTerminalSegments?: PromptSegment[] | undefined;
  prevChunk: string;
  /** Pending status stabilization — delays low-risk transitions to filter TUI animation noise. */
  pendingStatusHint?:
    | {
        status: ThreadStatus;
        attention: ThreadAttention;
        timer: ReturnType<typeof setTimeout>;
      }
    | undefined;
}

interface ShellSessionRuntime {
  instanceId: string;
  shellId: string;
  pty: IPty;
  logPath: string;
  outputLength: number;
  ptyExited?: boolean;
  ignoreExit?: boolean;
}

/**
 * Resolve both the UNC and absolute Linux paths for ~/.lightcode/attachments
 * inside a WSL distro. Cached per distro to avoid repeated wsl.exe spawns.
 */
const wslAttachmentDirCache = new Map<string, { uncDir: string; linuxDir: string }>();
function resolveWslAttachmentDirs(distro: string): { uncDir: string; linuxDir: string } {
  const cached = wslAttachmentDirCache.get(distro);
  if (cached) return cached;

  const result = spawnSync(
    "wsl.exe",
    ["-d", distro, "--", "sh", "-c", 'printf %s "$HOME/.lightcode/attachments"'],
    { encoding: "utf8", timeout: 5000 },
  );
  const linuxDir = result.stdout?.trim();
  if (!linuxDir) throw new Error(`Unable to resolve home for WSL distro "${distro}"`);

  // Ensure the directory exists inside WSL
  spawnSync("wsl.exe", ["-d", distro, "--", "mkdir", "-p", linuxDir], { timeout: 5000 });

  const uncDir = `\\\\wsl.localhost\\${distro}${linuxDir.replace(/\//g, "\\")}`;
  const entry = { uncDir, linuxDir };
  wslAttachmentDirCache.set(distro, entry);
  return entry;
}

/**
 * For WSL sessions, copy attachment/file segments into ~/.lightcode/attachments
 * inside the WSL distro so agents can access them.
 * Returns segments with full absolute Linux paths (not ~, since not all CLIs expand it).
 */
function rewriteSegmentsForWsl(
  segments: PromptSegment[],
  location: ProjectLocation,
): PromptSegment[] {
  if (location.kind !== "wsl") return segments;

  let dirs: { uncDir: string; linuxDir: string } | undefined;

  return segments.map((seg) => {
    if ((seg.kind !== "attachment" && seg.kind !== "file") || !seg.path) return seg;
    if (!/^[A-Za-z]:[\\/]/.test(seg.path)) return seg;

    dirs ??= resolveWslAttachmentDirs(location.distro);

    const fileName = basename(seg.path);
    const dest = join(dirs.uncDir, fileName);
    try {
      copyFileSync(seg.path, dest);
    } catch (err) {
      console.warn(`[wsl-attach] failed to copy ${seg.path} → ${dest}:`, err);
      return seg;
    }
    return { ...seg, path: `${dirs.linuxDir}/${fileName}` };
  });
}

export async function writeSubmittedPrompt(
  pty: Pick<IPty, "write">,
  chunks: readonly string[],
): Promise<void> {
  for (const chunk of chunks) {
    // @wait:N — pause for N ms without writing anything to the PTY.
    const waitMatch = chunk.match(/^@wait:(\d+)$/);
    if (waitMatch) {
      await sleep(Number(waitMatch[1]));
      continue;
    }
    // Terminal input uses \r for line breaks. On Windows ConPTY, \n in the
    // input stream gets translated to \r\n, which TUIs interpret as two
    // newlines (double-spaced text). Normalize to \r to avoid extra blanks.
    pty.write(chunk.replace(/\r?\n/g, "\r"));
    await sleep(8);
  }
}

export async function detectWslAgentStatuses(
  adapters: Iterable<AgentAdapter>,
  distros: readonly string[],
): Promise<AgentStatus[]> {
  const adapterList = [...adapters];
  const statuses = await Promise.all(
    distros.map(async (distro) => {
      const ctx: AgentEnvContext = { envKind: "wsl", wslDistro: distro };
      return Promise.all(
        adapterList.map(async (adapter) => {
          const status = await adapter.detectInstall(ctx);
          return { ...status, envKind: "wsl" as const, envDistro: distro };
        }),
      );
    }),
  );

  return statuses.flat();
}

function filterWslStatusesForDistros(
  statuses: readonly AgentStatus[],
  distros: readonly string[],
): AgentStatus[] {
  if (distros.length === 0) {
    return [];
  }

  const distroSet = new Set(distros);
  return statuses.filter((status) => {
    if (status.envDistro === undefined) {
      return true;
    }
    return distroSet.has(status.envDistro);
  });
}

export class SupervisorRuntime {
  private readonly isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
  private readonly logsDir: string;
  private readonly settingsPath: string;
  private readonly gitService = new GitService();
  private readonly gitWatcher: GitWatcher;
  private readonly githubService = new GitHubService();
  private readonly fileIndexService = new FileIndexService();
  private readonly adapters = new Map(
    createAgentRegistry().map((adapter) => [adapter.kind, adapter]),
  );
  private readonly sessions = new Map<string, SessionRuntime>();
  private readonly shellSessions = new Map<string, ShellSessionRuntime>();
  private readonly startLocks = new Map<string, Promise<void>>();
  private readonly windowsShell: WindowsShellPreference;
  private readonly statusCachePath: string;

  constructor(private readonly emit: (event: SupervisorEvent) => void) {
    this.gitWatcher = new GitWatcher((projectId) => {
      this.emit({ type: "git-changed", projectId });
    });

    const baseDir = process.env.LIGHTCODE_DATA_DIR?.trim() || join(homedir(), ".lightcode");
    const paths = resolveLightcodePaths(baseDir);
    this.logsDir = paths.terminalLogsDir;
    this.settingsPath = paths.settingsPath;
    this.statusCachePath = paths.statusCachePath;
    mkdirSync(paths.cacheDir, { recursive: true });
    resetTerminalLogsDir(this.logsDir);

    // Only detect Windows shell on Windows platform
    if (process.platform === "win32") {
      this.windowsShell = detectWindowsShell();
      console.log(
        `[supervisor] detected shell: ${this.windowsShell.kind} (${this.windowsShell.shell})`,
      );
    } else {
      // Default value for non-Windows platforms (unused but TypeScript needs it)
      this.windowsShell = { shell: "/bin/bash", kind: "cmd", args: [] };
      console.log(`[supervisor] using default shell: ${process.env.SHELL || "/bin/bash"}`);
    }
  }

  async listWslDistros(): Promise<string[]> {
    const t0 = Date.now();
    try {
      const { stdout } = await execFileAsync(getWslCommand(), ["-l", "-q"], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 5_000,
      });
      console.log(`[supervisor] listWslDistros: ${Date.now() - t0}ms`);
      return normalizeWslListOutput(stdout ?? "");
    } catch {
      console.log(`[supervisor] listWslDistros: failed (${Date.now() - t0}ms)`);
      return [];
    }
  }

  async getAgentStatuses(payload: GetAgentStatusesPayload): Promise<AgentStatus[]> {
    const wslDistros = [...new Set(payload.wslDistros)];

    // Emit cached results from disk immediately (if available).
    this.emitCachedStatuses(wslDistros);

    this.detectAllAgentStatusesBackground(wslDistros);

    // Return empty — results arrive via events.
    return [];
  }

  private emitCachedStatuses(wslDistros: readonly string[]): void {
    try {
      if (!existsSync(this.statusCachePath)) return;
      const raw = readFileSync(this.statusCachePath, "utf8");
      const cache = JSON.parse(raw) as {
        windows?: AgentStatus[];
        wsl?: AgentStatus[];
      };
      if (cache.windows?.length) {
        console.log("[supervisor] agent statuses: emitting from disk cache (windows)");
        this.emit({ type: "windows-agent-statuses", statuses: cache.windows });
      }
      const filteredWsl = filterWslStatusesForDistros(cache.wsl ?? [], wslDistros);
      if (filteredWsl.length > 0) {
        console.log("[supervisor] agent statuses: emitting from disk cache (wsl)");
        this.emit({ type: "wsl-agent-statuses", statuses: filteredWsl });
      }
    } catch {
      // Cache corrupt or missing — ignore, fresh detection will run.
    }
  }

  private writeDiskCache(windows: AgentStatus[], wsl: AgentStatus[]): void {
    try {
      writeFileSync(this.statusCachePath, JSON.stringify({ windows, wsl, updatedAt: Date.now() }));
    } catch {
      // best-effort
    }
  }

  private detectAllAgentStatusesBackground(wslDistros: readonly string[]): void {
    const t0 = Date.now();

    // Detect native platform (Windows or POSIX/macOS/Linux) — fast (~500ms), but still non-blocking.
    const nativePlatform = process.platform === "win32" ? ("windows" as const) : ("posix" as const);

    void Promise.all(
      [...this.adapters.values()].map(async (adapter) => {
        const at = Date.now();
        const status = await adapter.detectInstall();
        console.log(
          `[supervisor] detectInstall(${adapter.kind}, ${nativePlatform}): ${Date.now() - at}ms`,
        );
        return { ...status, envKind: nativePlatform };
      }),
    )
      .then((nativeStatuses) => {
        console.log(`[supervisor] ${nativePlatform} agent statuses: done (${Date.now() - t0}ms)`);
        if (nativePlatform === "windows") {
          this.emit({ type: "windows-agent-statuses", statuses: nativeStatuses });
        }
        this.detectWslAndWriteCache(nativeStatuses, wslDistros);
      })
      .catch(() => undefined);
  }

  private detectWslAndWriteCache(
    windowsStatuses: AgentStatus[],
    wslDistros: readonly string[],
  ): void {
    const t0 = Date.now();
    const distros = [...new Set(wslDistros)];
    if (distros.length === 0) {
      console.log(
        `[supervisor] wsl agent statuses: skipped (no project distros) (${Date.now() - t0}ms)`,
      );
      this.emit({ type: "wsl-agent-statuses", statuses: [] });
      this.writeDiskCache(windowsStatuses, []);
      return;
    }

    void detectWslAgentStatuses(this.adapters.values(), distros)
      .then((wslStatuses) => {
        const installedByDistro = new Map<string, number>();
        for (const status of wslStatuses) {
          const distro = status.envDistro;
          if (!distro || !status.installed) continue;
          installedByDistro.set(distro, (installedByDistro.get(distro) ?? 0) + 1);
        }
        console.log(
          `[supervisor] wsl agent statuses: done (${Date.now() - t0}ms) ${distros.join(", ")} ${JSON.stringify(Object.fromEntries(installedByDistro))}`,
        );
        this.emit({ type: "wsl-agent-statuses", statuses: wslStatuses });
        this.writeDiskCache(windowsStatuses, wslStatuses);
      })
      .catch(() => undefined);
  }

  getThreadSnapshots(): ThreadRuntimeSnapshot[] {
    return [...this.sessions.values()].map((session) => ({
      threadId: session.threadId,
      status: session.status,
      attention: session.attention,
      config: session.config,
      ...(session.sessionRef ? { sessionRef: session.sessionRef } : {}),
      canResumeWithConfig: session.canResumeWithConfig,
    }));
  }

  getThreadHistory(threadId: string): ThreadHistorySnapshot {
    const logPath = this.resolveLogPath(threadId);
    if (!existsSync(logPath)) {
      return {
        history: "",
        length: 0,
      };
    }
    const history = stripInternalHistoryMarkers(readFileSync(logPath, "utf8"));
    return {
      history,
      length: history.length,
    };
  }

  async startThread(payload: StartThreadPayload): Promise<StartThreadResult> {
    const threadId = payload.threadId ?? randomUUID();
    console.log("[supervisor] startThread", threadId, payload.agentKind);

    // Serialize starts for the same thread to prevent double app-server spawns.
    const pending = this.startLocks.get(threadId);
    if (pending) {
      console.log("[supervisor] startThread skipped (already starting)", threadId);
      return { threadId };
    }

    const resolvedPayload = { ...payload, threadId };
    const run = this.startThreadInner(resolvedPayload);
    this.startLocks.set(
      threadId,
      run.then(
        () => {},
        () => {},
      ),
    );
    try {
      return await run;
    } finally {
      this.startLocks.delete(threadId);
    }
  }

  private async startThreadInner(
    payload: StartThreadPayload & { threadId: string },
  ): Promise<StartThreadResult> {
    const t0 = Date.now();
    const elapsed = () => `${Date.now() - t0}ms`;

    await this.closeThread({ threadId: payload.threadId });
    console.log(`[supervisor] [${elapsed()}] closeThread done`);

    const adapter = this.requireAdapter(payload.agentKind);
    const isServerControlled = adapter.capabilities.liveInputMode === "server";
    const usesTerminalPresentation = adapter.capabilities.presentationMode === "terminal";
    const effectiveConfig = payload.config;
    const effectiveSessionRef = payload.sessionRef;
    // Resolve structured segments for the initial prompt, same as sendThreadInput
    const effectiveSegments = payload.segments
      ? rewriteSegmentsForWsl(payload.segments, payload.projectLocation)
      : undefined;
    const initialPrompt =
      effectiveSegments && effectiveSegments.length > 0
        ? (adapter.formatPromptSegments?.(effectiveSegments) ??
          defaultFormatPromptSegments(effectiveSegments))
        : payload.prompt.trim();
    const shouldQueueInitialPrompt =
      !effectiveSessionRef &&
      isServerControlled &&
      usesTerminalPresentation &&
      initialPrompt.length > 0 &&
      adapter.isReadyForInitialPrompt !== undefined;
    const structuredSession = await this.createStructuredSession(
      adapter,
      payload.threadId,
      payload.projectLocation,
      effectiveConfig,
      effectiveSessionRef,
    );
    console.log(`[supervisor] [${elapsed()}] createStructuredSession done`);

    // Phase 1: initialize + create thread + send initial message on the server.
    if (structuredSession?.activate) {
      try {
        await structuredSession.activate();
        console.log(`[supervisor] [${elapsed()}] activate done`);
      } catch (error) {
        await structuredSession.dispose();
        throw error;
      }
    }

    if (structuredSession?.openThread) {
      try {
        await structuredSession.openThread(effectiveConfig, effectiveSessionRef);
        console.log(`[supervisor] [${elapsed()}] openThread done`);
      } catch (error) {
        await structuredSession.dispose();
        throw error;
      }
    }

    // For new threads: fire turn/start so the rollout file gets created.
    // For resumed threads: rollout file already exists, skip this.
    // The rollout file wait is non-blocking — the PTY-backed presentation process is spawned immediately
    // with resumeThreadId and picks up output as it arrives.
    if (
      !effectiveSessionRef &&
      isServerControlled &&
      initialPrompt.length > 0 &&
      !shouldQueueInitialPrompt &&
      structuredSession?.startTurn
    ) {
      void structuredSession.startTurn(initialPrompt, effectiveConfig).catch((error) => {
        console.error("[supervisor] initial turn failed:", error);
      });
    }

    if (shouldQueueInitialPrompt) {
      await structuredSession?.ensureResumeArtifacts?.();
    }

    // Phase 2: spawn the PTY-backed presentation process with resume.
    // When attachments are present the formatted prompt contains @ paths
    // that are unsafe as CLI args (PowerShell interprets @() as array).
    // Defer to buildDirectInput after the TUI reaches idle.
    const hasAttachments =
      payload.segments?.some((s) => s.kind === "attachment") ?? false;
    const launchPrompt = isServerControlled || hasAttachments ? "" : payload.prompt;
    const command = effectiveSessionRef
      ? adapter.buildResumeCommand(
          payload.projectLocation,
          effectiveConfig,
          launchPrompt,
          effectiveSessionRef,
          structuredSession?.launchOptions,
        )
      : adapter.buildLaunchCommand(
          payload.projectLocation,
          effectiveConfig,
          launchPrompt,
          effectiveSessionRef,
          structuredSession?.launchOptions,
        );
    console.log(`[supervisor] [${elapsed()}] command built, spawning PTY…`);

    const resolvedSessionRef = effectiveSessionRef ?? command.sessionRef;
    this.spawnThread({
      threadId: payload.threadId,
      adapter,
      agentKind: payload.agentKind,
      projectLocation: payload.projectLocation,
      config: effectiveConfig,
      initialSize: payload.initialSize,
      launchPrompt,
      command,
      ...(structuredSession ? { structuredSession } : {}),
      ...(resolvedSessionRef ? { sessionRef: resolvedSessionRef } : {}),
      ...(shouldQueueInitialPrompt ? { pendingLaunchPrompt: initialPrompt } : {}),
      ...(hasAttachments && !isServerControlled ? { pendingTerminalPrompt: initialPrompt, pendingTerminalSegments: payload.segments! } : {}),
    });
    console.log(`[supervisor] [${elapsed()}] PTY spawned`);

    return { threadId: payload.threadId };
  }

  async sendThreadInput(payload: SendThreadInputPayload): Promise<void> {
    const session = this.requireSession(payload.threadId);
    if (session.status === "inactive") {
      if (session.sessionRef) {
        await this.restartThread(session, payload.prompt, payload.config);
        return;
      }
      throw new Error("This thread exited before a resumable session id was discovered.");
    }

    // Resolve structured segments into a prompt string via the adapter.
    // Each adapter formats file references its own way (Claude: @path, etc.).
    const effectiveSegments = payload.segments
      ? rewriteSegmentsForWsl(payload.segments, session.projectLocation)
      : undefined;
    const prompt =
      effectiveSegments && effectiveSegments.length > 0
        ? (session.adapter.formatPromptSegments?.(effectiveSegments) ??
          defaultFormatPromptSegments(effectiveSegments))
        : payload.prompt;

    const isServerControlled = session.adapter.capabilities.liveInputMode === "server";

    // If the supervisor auto-cleared plan mode from terminal detection but the renderer
    // hasn't caught up yet, adopt the session's mode to avoid a spurious relaunch.
    const effectiveConfig =
      payload.config.mode === "plan" && session.config.mode === undefined
        ? { ...payload.config, mode: undefined }
        : payload.config;

    const shouldRelaunch =
      !isServerControlled &&
      session.canResumeWithConfig &&
      JSON.stringify(session.config) !== JSON.stringify(effectiveConfig);

    if (shouldRelaunch && session.sessionRef) {
      await this.restartThread(session, prompt, effectiveConfig);
      return;
    }

    session.config = effectiveConfig;
    if (
      session.adapter.capabilities.liveInputMode === "server" &&
      session.structuredSession?.startTurn
    ) {
      this.updateState(session, "working", "working");
      void session.structuredSession
        .startTurn(prompt, payload.config, payload.segments)
        .catch((error) => {
          if (this.sessions.get(session.threadId)?.instanceId !== session.instanceId) {
            return;
          }

          this.updateState(
            session,
            "error",
            "error",
            error instanceof Error ? error.message : String(error),
          );
        });
      return;
    }

    this.updateState(session, "working", "working");
    await writeSubmittedPrompt(
      session.pty,
      session.adapter.buildDirectInput?.(prompt, payload.segments) ?? [prompt, "\r"],
    );

    // Claude CLI may show a "[Pasted text" confirmation instead of submitting.
    // Wait briefly, then re-send Enter if that prompt is detected.
    await sleep(300);
    if (session.prevChunk.includes("[Pasted text")) {
      session.pty.write("\r");
    }
  }

  async writeTerminal(payload: WriteTerminalPayload): Promise<void> {
    const shell = this.shellSessions.get(payload.threadId);
    if (shell) {
      shell.pty.write(payload.data);
      return;
    }
    const session = this.requireSession(payload.threadId);
    session.pty.write(payload.data);
  }

  async resizeTerminal(payload: ResizeTerminalPayload): Promise<void> {
    const shell = this.shellSessions.get(payload.threadId);
    if (shell) {
      shell.pty.resize(payload.cols, payload.rows);
      return;
    }
    const session = this.sessions.get(payload.threadId);
    if (!session) {
      return;
    }
    session.terminalSize = {
      cols: payload.cols,
      rows: payload.rows,
    };
    session.pty.resize(payload.cols, payload.rows);
  }

  async closeThread(payload: CloseThreadPayload): Promise<void> {
    const shell = this.shellSessions.get(payload.threadId);
    if (shell) {
      shell.ignoreExit = true;
      this.shellSessions.delete(payload.threadId);
      this.safeShellPtyKill(shell);
      return;
    }

    const existing = this.sessions.get(payload.threadId);
    if (!existing) {
      return;
    }

    existing.ignoreExit = true;
    if (existing.pendingStatusHint) {
      clearTimeout(existing.pendingStatusHint.timer);
      existing.pendingStatusHint = undefined;
    }
    this.sessions.delete(payload.threadId);
    await existing.structuredSession?.dispose();
    // Yield so the PTY exit event can fire before we force-kill.
    if (existing.structuredSession) {
      await sleep(150);
    }
    this.safePtyKill(existing);
  }

  async startShell(payload: StartShellPayload): Promise<void> {
    // Clean up any prior shell with the same ID.
    const existing = this.shellSessions.get(payload.shellId);
    if (existing) {
      existing.ignoreExit = true;
      this.shellSessions.delete(payload.shellId);
      this.safeShellPtyKill(existing);
    }

    const shellCmd = this.buildShellCommand(payload.projectLocation);
    const safeId = payload.shellId.replace(/:/g, "_");
    const logPath = this.resolveLogPath(safeId);
    resetTerminalLogFile(logPath);

    this.emit({ type: "thread-reset", threadId: payload.shellId });

    console.log(`[supervisor] spawning shell PTY: ${shellCmd.command} ${shellCmd.args.join(" ")}`);
    const pty = spawn(shellCmd.command, shellCmd.args, {
      name: process.platform === "win32" ? "xterm-color" : "xterm-256color",
      cols: 120,
      rows: 30,
      ...(shellCmd.cwd ? { cwd: shellCmd.cwd } : {}),
      env: {
        ...process.env,
        TERM: "xterm-256color",
      },
    });

    const session: ShellSessionRuntime = {
      instanceId: randomUUID(),
      shellId: payload.shellId,
      pty,
      logPath,
      outputLength: 0,
    };

    this.shellSessions.set(payload.shellId, session);

    pty.onData((data) => {
      if (this.shellSessions.get(payload.shellId)?.instanceId !== session.instanceId) {
        return;
      }
      session.outputLength += data.length;
      try {
        appendFileSync(logPath, data);
      } catch {
        /* ignore */
      }
      this.emit({
        type: "thread-output",
        threadId: payload.shellId,
        data,
        outputLength: session.outputLength,
      });
    });

    pty.onExit(({ exitCode }) => {
      session.ptyExited = true;
      if (session.ignoreExit) {
        return;
      }
      this.shellSessions.delete(payload.shellId);
      this.emit({
        type: "thread-exited",
        threadId: payload.shellId,
        exitCode: exitCode ?? null,
      });
    });
  }

  async getGitStatus(payload: GetGitStatusPayload): Promise<GitStatusResult> {
    return this.gitService.getStatus(payload.projectLocation);
  }

  async getGitDiff(payload: GetGitDiffPayload): Promise<GitDiffResult> {
    return this.gitService.getDiff(payload.projectLocation, payload.filePath, payload.staged);
  }

  async getGitDiffBatch(payload: GetGitDiffBatchPayload): Promise<GitDiffBatchResult> {
    return this.gitService.getDiffBatch(payload.projectLocation, payload.untrackedPaths);
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

  async generateCommitMessage(
    payload: GenerateCommitMessagePayload,
  ): Promise<GenerateCommitMessageResult> {
    const adapter = this.requireAdapter(payload.agentKind);
    const message = await generateCommitMessage(
      payload.projectLocation,
      adapter,
      payload.model,
      payload.effort,
    );
    return { message };
  }

  async generateTitle(payload: GenerateTitlePayload): Promise<GenerateTitleResult> {
    const adapter = this.requireAdapter(payload.agentKind);
    const title = await generateTitle(
      payload.projectLocation,
      adapter,
      payload.prompt,
      payload.model,
      payload.effort,
    );
    return { title };
  }

  // ── Branch & Worktree ───────────────────────────────────

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
    );
  }

  async gitRemoveWorktree(payload: GitRemoveWorktreePayload): Promise<void> {
    return this.gitService.removeWorktree(payload.projectLocation, payload.path, payload.force);
  }

  async gitDeleteBranch(payload: GitDeleteBranchPayload): Promise<void> {
    return this.gitService.deleteBranch(payload.projectLocation, payload.branch, payload.force);
  }

  async gitPull(payload: GitPullPayload): Promise<void> {
    return this.gitService.pull(payload.projectLocation, payload.remote ?? "origin");
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
    const location = payload.projectLocation;
    const remote = payload.remote ?? "origin";

    // Fetch first so ahead/behind counts are accurate
    await this.gitService.fetch(location, remote, false);

    const status = await this.gitService.getStatus(location);
    let pulled = false;
    let pushed = false;

    if (status.behind > 0) {
      await this.gitService.pull(location, remote);
      pulled = true;
    }

    // Re-check after pull — ahead count may have changed
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
    return this.gitService.getWorktreeSourceBranch(payload.projectLocation, payload.branch);
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
    return this.gitService.pullFromSource(payload.worktreeLocation, payload.sourceBranch);
  }

  // ── GitHub PR ──────────────────────────────────────────

  async ghCheckAvailable(payload: GetGitStatusPayload): Promise<GhCheckAvailableResult> {
    return this.githubService.checkGhAvailable(payload.projectLocation);
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

  async ghMergePr(payload: GhMergePrPayload): Promise<void> {
    return this.githubService.mergePr(payload.projectLocation, payload.prNumber, payload.method);
  }

  async ghClosePr(payload: GhClosePrPayload): Promise<void> {
    return this.githubService.closePr(payload.projectLocation, payload.prNumber);
  }

  async ghReopenPr(payload: GhReopenPrPayload): Promise<void> {
    return this.githubService.reopenPr(payload.projectLocation, payload.prNumber);
  }

  async ghGetPrChecks(payload: GhGetPrChecksPayload): Promise<GhGetPrChecksResult> {
    return this.githubService.getPrChecks(payload.projectLocation, payload.branch);
  }

  async gitAbortMerge(payload: GitAbortMergePayload): Promise<void> {
    return this.gitService.abortMerge(payload.worktreeLocation);
  }

  async gitRunMergetool(payload: GitRunMergetoolPayload): Promise<GitRunMergetoolResult> {
    return this.gitService.runMergetool(payload.worktreeLocation);
  }

  // ── Git watcher ────────────────────────────────────────

  async gitWatchProject(payload: GitWatchProjectPayload): Promise<void> {
    this.gitWatcher.watch(payload.projectId, payload.projectLocation);
  }

  async gitWatchWorktrees(payload: GitWatchWorktreesPayload): Promise<void> {
    this.gitWatcher.watchWorktrees(payload.projectId, payload.worktreePaths);
  }

  async gitUnwatchProject(payload: GitUnwatchProjectPayload): Promise<void> {
    this.gitWatcher.unwatch(payload.projectId);
  }

  async searchProjectFiles(payload: SearchProjectFilesPayload): Promise<SearchProjectFilesResult> {
    return this.fileIndexService.searchProjectFiles(payload);
  }

  async detectSetupScript(payload: DetectSetupScriptPayload): Promise<DetectSetupScriptResult> {
    // Lock files in priority order — first match wins.
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
      // Check files via a single WSL command for efficiency.
      const checks = candidates.map((c) => `test -f "${location.linuxPath}/${c.file}" && echo yes || echo no`);
      const script = checks.join(" && echo '---' && ");
      const result = await readWslCommandOutputAsync(location.distro, "sh", ["-c", script]);
      if (result.ok) {
        const answers = result.stdout.split("---").map((s) => s.trim());
        for (let i = 0; i < candidates.length; i++) {
          if (answers[i] === "yes") return { setupScript: candidates[i]!.command };
        }
      }
      return {};
    }

    // Native filesystem check (Windows / POSIX).
    const dir = location.path;
    for (const candidate of candidates) {
      if (existsSync(join(dir, candidate.file))) {
        return { setupScript: candidate.command };
      }
    }
    return {};
  }

  async resolveThreadServerRequest(payload: ResolveThreadServerRequestPayload): Promise<void> {
    const session = this.requireSession(payload.threadId);
    if (!session.structuredSession?.resolveServerRequest) {
      throw new Error(`Thread ${payload.threadId} does not support server request resolution.`);
    }

    await session.structuredSession.resolveServerRequest(payload.requestId, payload.response);
  }

  dispose(): void {
    for (const session of this.sessions.values()) {
      session.ignoreExit = true;
      void session.structuredSession?.dispose();
      this.safePtyKill(session);
    }
    this.sessions.clear();

    for (const shell of this.shellSessions.values()) {
      shell.ignoreExit = true;
      this.safeShellPtyKill(shell);
    }
    this.shellSessions.clear();
  }

  private safePtyKill(session: SessionRuntime): void {
    if (session.ptyExited) {
      return;
    }
    if (process.platform === "win32") {
      this.terminateWindowsProcessTree(session.pty.pid);
      return;
    }
    try {
      process.kill(session.pty.pid, 0);
    } catch {
      // Shell process already exited — skip pty.kill() to avoid
      // ConPTY's AttachConsole failure in its forked agent process.
      return;
    }
    session.pty.kill();
  }

  private safeShellPtyKill(session: ShellSessionRuntime): void {
    if (session.ptyExited) {
      return;
    }
    if (process.platform === "win32") {
      this.terminateWindowsProcessTree(session.pty.pid);
      return;
    }
    try {
      process.kill(session.pty.pid, 0);
    } catch {
      return;
    }
    session.pty.kill();
  }

  private terminateWindowsProcessTree(pid: number): void {
    if (!Number.isInteger(pid) || pid <= 0) {
      return;
    }
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }

    // Avoid node-pty's ConPTY kill path on Windows. It forks a console-list
    // agent that can throw AttachConsole errors during shutdown.
    const result = spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    if (!result.error && result.status === 0) {
      return;
    }

    try {
      process.kill(pid);
    } catch {
      // Best effort — the process may already be gone.
    }
  }

  private buildShellCommand(location: ProjectLocation): {
    command: string;
    args: string[];
    cwd?: string;
  } {
    if (location.kind === "wsl") {
      // Use WSL's default shell directly — same speed as typing `wsl` in PowerShell.
      return {
        command: getWslCommand(),
        args: ["-d", location.distro, "--cd", location.linuxPath],
      };
    }

    if (process.platform === "win32") {
      // Use the cached Windows shell preference (detected once at startup).
      return {
        command: this.windowsShell.shell,
        args: [...this.windowsShell.args],
        cwd: location.path,
      };
    }

    // macOS/Linux: use the user's default shell from $SHELL, or fallback to /bin/bash
    const shell = process.env.SHELL || "/bin/bash";
    return {
      command: shell,
      args: ["-l"],
      cwd: location.path,
    };
  }

  private resolveLogPath(threadId: string): string {
    return join(this.logsDir, `${threadId}.log`);
  }

  private resolveAgentProcessEnv(adapter: AgentAdapter): Record<string, string> {
    const settingDefs = adapter.capabilities.settingDefs ?? [];
    if (settingDefs.length === 0) return {};

    let settings = defaultSharedSettings;
    try {
      const raw = readFileSync(this.settingsPath, "utf8");
      settings = normalizeSharedSettings(JSON.parse(raw));
    } catch {
      /* use defaults */
    }

    const agentValues = settings.agentSettings[adapter.kind] ?? {};
    const env: Record<string, string> = {};
    for (const def of settingDefs) {
      if (def.platforms && !def.platforms.includes(process.platform)) continue;
      const value = agentValues[def.key] ?? def.default;
      if (value) {
        env[def.envVar] = "1";
      }
    }
    return env;
  }

  private resolveHintLogPath(threadId: string): string {
    return join(this.logsDir, `${threadId}.hints.log`);
  }

  private writeHintLog(
    session: SessionRuntime,
    stripped: string,
    hint: { status: string; attention: string } | null,
  ): void {
    const tail = stripped.slice(-300);
    const ts = new Date().toISOString();
    const entry = [
      `--- ${ts} status=${session.status} hint=${hint?.status ?? "null"} ---`,
      tail,
      "",
    ].join("\n");
    try {
      appendFileSync(this.resolveHintLogPath(session.threadId), entry);
    } catch {
      // best-effort
    }
  }

  private requireAdapter(kind: AgentKind): AgentAdapter {
    const adapter = this.adapters.get(kind);
    if (!adapter) {
      throw new Error(`Unsupported agent adapter: ${kind}`);
    }
    return adapter;
  }

  private requireSession(threadId: string): SessionRuntime {
    const session = this.sessions.get(threadId);
    if (!session) {
      throw new Error(`Unknown thread session: ${threadId}`);
    }
    return session;
  }

  private async createStructuredSession(
    adapter: AgentAdapter,
    threadId: string,
    projectLocation: ProjectLocation,
    config: ThreadConfig,
    sessionRef?: SessionRef,
  ): Promise<StructuredSessionHandle | undefined> {
    if (!adapter.createStructuredSession) {
      return undefined;
    }

    try {
      return await adapter.createStructuredSession({
        threadId,
        projectLocation,
        config,
        ...(sessionRef ? { sessionRef } : {}),
      });
    } catch (error) {
      console.error("[supervisor] structured session creation failed:", error);
      return undefined;
    }
  }

  private spawnThread(input: {
    threadId: string;
    agentKind: AgentKind;
    adapter: AgentAdapter;
    projectLocation: ProjectLocation;
    config: ThreadConfig;
    initialSize: TerminalSize;
    launchPrompt: string;
    command: CommandSpec;
    structuredSession?: StructuredSessionHandle;
    sessionRef?: SessionRef;
    pendingLaunchPrompt?: string;
    pendingTerminalPrompt?: string;
    pendingTerminalSegments?: PromptSegment[];
  }): SessionRuntime {
    const logPath = this.resolveLogPath(input.threadId);
    resetTerminalLogFile(logPath);
    this.emit({
      type: "thread-reset",
      threadId: input.threadId,
    });

    const agentEnv = this.resolveAgentProcessEnv(input.adapter);
    console.log(
      `[supervisor] spawning PTY: ${input.command.command} ${input.command.args.join(" ")}`,
    );
    const pty = spawn(input.command.command, input.command.args, {
      name: process.platform === "win32" ? "xterm-color" : "xterm-256color",
      cols: input.initialSize.cols,
      rows: input.initialSize.rows,
      cwd: input.command.cwd ?? process.cwd(),
      env: {
        ...process.env,
        TERM: "xterm-256color",
        ...agentEnv,
      },
    });

    const session: SessionRuntime = {
      instanceId: randomUUID(),
      threadId: input.threadId,
      agentKind: input.agentKind,
      adapter: input.adapter,
      pty,
      projectLocation: input.projectLocation,
      config: input.config,
      terminalSize: input.initialSize,
      launchPrompt: input.launchPrompt,
      ...(input.sessionRef ? { sessionRef: input.sessionRef } : {}),
      status: "launching",
      attention: "none",
      canResumeWithConfig: input.sessionRef !== undefined,
      logPath,
      outputLength: 0,
      pendingLaunchPrompt: input.pendingLaunchPrompt,
      pendingTerminalPrompt: input.pendingTerminalPrompt,
      pendingTerminalSegments: input.pendingTerminalSegments,
      prevChunk: "",
      ...(input.structuredSession ? { structuredSession: input.structuredSession } : {}),
    };

    // Register the session before attaching the listener so that the
    // setListener re-emit (for already-activated structured sessions)
    // passes the instanceId guard.
    this.sessions.set(input.threadId, session);
    this.emitState(session);

    input.structuredSession?.setListener({
      onClose: () => {
        if (
          this.sessions.get(session.threadId)?.instanceId !== session.instanceId ||
          session.ignoreExit
        ) {
          return;
        }
        this.handleStructuredSessionClosed(session);
      },
      onError: (errorMessage) => {
        if (
          this.sessions.get(session.threadId)?.instanceId !== session.instanceId ||
          session.ignoreExit
        ) {
          return;
        }
        this.updateState(session, "error", "error", errorMessage);
      },
      onServerRequest: (request) => {
        if (
          this.sessions.get(session.threadId)?.instanceId !== session.instanceId ||
          session.ignoreExit
        ) {
          return;
        }

        this.emit({
          type: "thread-server-request",
          threadId: session.threadId,
          requestId: request.requestId,
          method: request.method,
          params: request.params,
        });
      },
      onUpdate: (update) => {
        if (
          this.sessions.get(session.threadId)?.instanceId !== session.instanceId ||
          session.ignoreExit
        ) {
          return;
        }

        if (update.sessionRef) {
          session.sessionRef = update.sessionRef;
          session.canResumeWithConfig = true;
        }

        const configChanged =
          update.config !== undefined &&
          JSON.stringify(session.config) !== JSON.stringify(update.config);
        const stateChanged =
          session.status !== update.status ||
          session.attention !== update.attention ||
          update.errorMessage !== undefined;
        if (update.config) {
          session.config = update.config;
        }

        this.updateState(session, update.status, update.attention, update.errorMessage);
        if (configChanged && !stateChanged && update.errorMessage === undefined) {
          this.emitState(session);
        }
      },
    });

    pty.onData((data) => {
      if (this.sessions.get(session.threadId)?.instanceId !== session.instanceId) {
        return;
      }

      appendFileSync(logPath, data);
      session.outputLength += data.length;
      this.emit({
        type: "thread-output",
        threadId: session.threadId,
        data,
        outputLength: session.outputLength,
      });

      if (session.status === "launching") {
        this.updateState(session, "idle", "none");
      }

      const strippedData = stripAnsiPreservingLayout(data);
      const usesTerminalPresentation = session.adapter.capabilities.presentationMode === "terminal";

      // Let the adapter auto-dismiss TUI prompts it owns (e.g. update
      // nags, rate-limit model-switch menus) so the runtime stays generic.
      if (
        usesTerminalPresentation &&
        session.adapter.detectAutoResponse &&
        !session.autoResponseEmitted
      ) {
        const key = session.adapter.detectAutoResponse(strippedData);
        if (key) {
          session.autoResponseEmitted = true;
          session.pty.write(key);
        }
      }

      if (
        usesTerminalPresentation &&
        (session.adapter.isReadyForInitialPrompt || session.adapter.detectTerminalStatus)
      ) {
        // Detect full-screen redraws: if the incoming chunk contains a
        // cursor-home sequence (CUP → row 1, col 1), discard stale
        // prevChunk content so artifacts from previous screen frames
        // (e.g. braille spinners from "Resuming session…") don't linger
        // in the buffer and mislead hint detection.
        const lastHome = Math.max(data.lastIndexOf("\x1b[H"), data.lastIndexOf("\x1b[1;1H"));
        const combined = lastHome >= 0 ? data.slice(lastHome) : session.prevChunk + data;
        session.prevChunk = combined.length > 8192 ? combined.slice(-8192) : combined;
        const stripped = stripAnsiPreservingLayout(combined);
        if (
          session.status === "launching" &&
          session.sessionRef &&
          session.adapter.detectInvalidSessionRef?.(stripped)
        ) {
          this.recoverInvalidSessionRef(session);
          return;
        }

        const hint = session.adapter.detectTerminalStatus?.(stripped) ?? null;
        if (hint) {
          const nextConfig = session.adapter.syncConfigFromTerminalState?.({
            config: session.config,
            previousStatus: session.status,
            previousAttention: session.attention,
            hint,
          });
          const configChanged =
            nextConfig !== undefined &&
            JSON.stringify(nextConfig) !== JSON.stringify(session.config);

          if (configChanged) {
            session.config = nextConfig!;
          }

          // While waiting to send the initial prompt, suppress non-idle transitions
          // so the UI stays in "launching" instead of flickering to "working" from
          // startup animations.
          const suppressHint =
            session.pendingTerminalPrompt && hint.status !== "idle";

          if (!suppressHint && (session.status !== hint.status || session.attention !== hint.attention)) {
            const delay = STATUS_STABILIZATION_DELAY[hint.status] ?? 0;

            if (delay === 0) {
              // High-priority transition — emit immediately, cancel any pending stabilization.
              if (session.pendingStatusHint) {
                clearTimeout(session.pendingStatusHint.timer);
                session.pendingStatusHint = undefined;
              }
              this.updateState(session, hint.status, hint.attention);
            } else if (
              session.pendingStatusHint &&
              session.pendingStatusHint.status === hint.status &&
              session.pendingStatusHint.attention === hint.attention
            ) {
              // Same status already pending — keep the existing timer (don't slide the window).
            } else {
              // Low-priority transition — require temporal stability before emitting.
              if (session.pendingStatusHint) {
                clearTimeout(session.pendingStatusHint.timer);
              }
              session.pendingStatusHint = {
                status: hint.status,
                attention: hint.attention,
                timer: setTimeout(() => {
                  session.pendingStatusHint = undefined;
                  if (session.status !== hint.status || session.attention !== hint.attention) {
                    this.updateState(session, hint.status, hint.attention);
                  }
                }, delay),
              };
            }

            // Trigger session ID discovery on the first real status detection —
            // the provider's terminal presentation is live, so the session file is guaranteed to exist.
            // Skip if we're still waiting to send the initial prompt — the agent
            // won't have created a session until it processes input.
            if (
              session.adapter.discoverSessionRef &&
              !session.sessionRef &&
              !session.sessionRefDiscoveryStarted &&
              !session.pendingTerminalPrompt
            ) {
              session.sessionRefDiscoveryStarted = true;
              this.pollSessionRefDiscovery(session);
            }
          } else if (configChanged) {
            // Config changed but status didn't — force emit so renderer picks up the mode switch.
            this.emitState(session);
          }
          if (this.isDev) {
            this.writeHintLog(session, stripped, hint);
          }
        }

        if (
          session.pendingLaunchPrompt &&
          session.adapter.isReadyForInitialPrompt?.(strippedData)
        ) {
          this.startQueuedLaunchPrompt(session);
        }

        // For terminal-controlled agents: send the formatted prompt once
        // the TUI reaches idle (ready for input) after launch.
        if (session.pendingTerminalPrompt && hint?.status === "idle") {
          const prompt = session.pendingTerminalPrompt;
          const segments = session.pendingTerminalSegments;
          session.pendingTerminalPrompt = undefined;
          session.pendingTerminalSegments = undefined;
          // Give the TUI time to fully render its input field after
          // the first idle indicator appears (title bar may update first).
          void sleep(500).then(() =>
            writeSubmittedPrompt(
              session.pty,
              session.adapter.buildDirectInput?.(prompt, segments) ?? [prompt, "\r"],
            ),
          );
        }
      }
    });

    pty.onExit((event) => {
      session.ptyExited = true;
      if (session.ignoreExit) {
        return;
      }
      if (this.sessions.get(session.threadId)?.instanceId !== session.instanceId) {
        return;
      }

      void session.structuredSession?.dispose();
      this.updateState(session, "inactive", "none");
      this.emit({
        type: "thread-exited",
        threadId: session.threadId,
        exitCode: event.exitCode,
      });
    });

    return session;
  }

  private pollSessionRefDiscovery(session: SessionRuntime): void {
    let attempt = 0;
    // Collect session IDs already assigned to other threads to avoid duplicates.
    const existingIds = new Set<string>();
    for (const s of this.sessions.values()) {
      if (s.sessionRef && s.threadId !== session.threadId) {
        existingIds.add(s.sessionRef.providerSessionId);
      }
    }

    const poll = async () => {
      if (session.sessionRef || session.status === "inactive" || attempt >= 5) return;
      attempt++;
      try {
        const ref = await session.adapter.discoverSessionRef?.(session.projectLocation);
        if (ref && !session.sessionRef && !existingIds.has(ref.providerSessionId)) {
          session.sessionRef = ref;
          session.canResumeWithConfig = true;
          this.emitState(session);
          return;
        }
      } catch {
        // Ignore — will retry
      }
      setTimeout(() => void poll(), 3000);
    };
    // No initial delay — triggered after the first status detection,
    // so the terminal presentation is already live and the session file should exist.
    void poll();
  }

  private async restartThread(
    session: SessionRuntime,
    prompt: string,
    config: ThreadConfig,
  ): Promise<void> {
    if (!session.sessionRef) {
      throw new Error("Session cannot be restarted without a known session reference.");
    }

    const isServerControlled = session.adapter.capabilities.liveInputMode === "server";

    session.ignoreExit = true;
    await session.structuredSession?.dispose();
    if (session.structuredSession) {
      await sleep(150);
    }
    this.safePtyKill(session);

    const effectiveConfig = config;
    const effectiveSessionRef = session.sessionRef;
    const structuredSession = await this.createStructuredSession(
      session.adapter,
      session.threadId,
      session.projectLocation,
      effectiveConfig,
      effectiveSessionRef,
    );

    // Initialize + resume thread on the server.
    if (structuredSession?.activate) {
      try {
        await structuredSession.activate();
      } catch (error) {
        await structuredSession.dispose();
        throw error;
      }
    }

    if (structuredSession?.openThread) {
      try {
        await structuredSession.openThread(effectiveConfig, effectiveSessionRef);
      } catch (error) {
        await structuredSession.dispose();
        throw error;
      }
    }

    // Spawn the PTY-backed presentation process with resume — rollout file already exists for saved threads.
    const launchPrompt = isServerControlled ? "" : prompt;
    const command = session.adapter.buildResumeCommand(
      session.projectLocation,
      effectiveConfig,
      launchPrompt,
      session.sessionRef,
      structuredSession?.launchOptions,
    );

    this.spawnThread({
      threadId: session.threadId,
      agentKind: session.agentKind,
      adapter: session.adapter,
      projectLocation: session.projectLocation,
      config: effectiveConfig,
      initialSize: session.terminalSize,
      launchPrompt,
      command,
      ...(structuredSession ? { structuredSession } : {}),
      sessionRef: effectiveSessionRef,
    });
  }

  private recoverInvalidSessionRef(session: SessionRuntime): void {
    if (session.invalidSessionRecoveryStarted || !session.sessionRef) {
      return;
    }

    session.invalidSessionRecoveryStarted = true;
    const staleSessionId = session.sessionRef.providerSessionId;
    console.log(
      `[supervisor] invalid session ref for ${session.agentKind}; relaunching without resume: ${staleSessionId}`,
    );

    void (async () => {
      if (this.sessions.get(session.threadId)?.instanceId !== session.instanceId) {
        return;
      }

      session.ignoreExit = true;
      await session.structuredSession?.dispose();
      if (session.structuredSession) {
        await sleep(150);
      }
      this.safePtyKill(session);

      if (this.sessions.get(session.threadId)?.instanceId !== session.instanceId) {
        return;
      }

      const command = session.adapter.buildLaunchCommand(
        session.projectLocation,
        session.config,
        session.launchPrompt,
      );

      this.spawnThread({
        threadId: session.threadId,
        agentKind: session.agentKind,
        adapter: session.adapter,
        projectLocation: session.projectLocation,
        config: session.config,
        initialSize: session.terminalSize,
        launchPrompt: session.launchPrompt,
        command,
      });
    })();
  }

  private handleStructuredSessionClosed(session: SessionRuntime): void {
    if (session.status === "inactive") {
      return;
    }

    this.updateState(session, "inactive", "none");
    this.emit({
      type: "thread-exited",
      threadId: session.threadId,
      exitCode: null,
    });

    session.ignoreExit = true;
    // Defer the kill so the PTY has time to exit naturally after the
    // structured session closes.  safePtyKill checks process liveness
    // before invoking node-pty's kill.
    setTimeout(() => this.safePtyKill(session), 150);
  }

  private startQueuedLaunchPrompt(session: SessionRuntime): void {
    if (!session.pendingLaunchPrompt || !session.structuredSession?.startTurn) {
      return;
    }

    const prompt = session.pendingLaunchPrompt;
    session.pendingLaunchPrompt = undefined;
    this.updateState(session, "working", "working");
    void session.structuredSession.startTurn(prompt, session.config).catch((error) => {
      if (this.sessions.get(session.threadId)?.instanceId !== session.instanceId) {
        return;
      }

      this.updateState(
        session,
        "error",
        "error",
        error instanceof Error ? error.message : String(error),
      );
    });
  }

  private updateState(
    session: SessionRuntime,
    status: ThreadStatus,
    attention: ThreadAttention,
    errorMessage?: string,
  ): void {
    if (
      session.status === status &&
      session.attention === attention &&
      errorMessage === undefined
    ) {
      return;
    }

    // Any concrete state transition cancels a pending stabilization.
    if (session.pendingStatusHint) {
      clearTimeout(session.pendingStatusHint.timer);
      session.pendingStatusHint = undefined;
    }

    session.status = status;
    session.attention = attention;
    this.emitState(session, errorMessage);
  }

  private emitState(session: SessionRuntime, errorMessage?: string): void {
    this.emit({
      type: "thread-state",
      threadId: session.threadId,
      status: session.status,
      attention: session.attention,
      config: session.config,
      ...(session.sessionRef ? { sessionRef: session.sessionRef } : {}),
      canResumeWithConfig: session.canResumeWithConfig,
      ...(errorMessage ? { errorMessage } : {}),
    });
  }
}
