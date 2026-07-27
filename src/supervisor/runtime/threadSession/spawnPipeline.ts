import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { spawn } from "node-pty";
import {
  type AgentKind,
  type CloseThreadPayload,
  type ProjectLocation,
  type PromptSegment,
  type SessionRef,
  type StartThreadPayload,
  type StartThreadResult,
  type TerminalSize,
  type ThreadAttention,
  type ThreadConfig,
  type ThreadPresentationMode,
  type ThreadStatus,
  type BuiltInMcpServerId,
  type McpLaunchSnapshot,
  type ResolvedMcpServer,
  BUILT_IN_MCP_SERVER_NAMES,
  DEFAULT_MCP_SERVER_TIMEOUT_MS,
  resolveEnabledMcpServers,
} from "@/shared/contracts";
import type { McpThreadIdentity } from "@/shared/browserMcpThread";
import {
  resolveBrowserMcpHttpConfigForLaunch,
  type BrowserMcpHttpConfig,
} from "@/supervisor/agents/browserMcp";
import {
  resolveCrossagentMcpHttpConfigForLaunch,
  type CrossagentMcpHttpConfig,
} from "@/supervisor/agents/crossagentMcp";
import {
  resolveComputerUseMcpHttpConfigForLaunch,
  type ComputerUseMcpHttpConfig,
} from "@/supervisor/agents/computerUseMcp";
import {
  resolveChromeMcpHttpConfigForLaunch,
  type ChromeMcpHttpConfig,
} from "@/supervisor/agents/chromeMcp";
import {
  resolveAppControlsMcpHttpConfigForLaunch,
  type AppControlsMcpHttpConfig,
} from "@/supervisor/agents/appControlsMcp";
import {
  type AgentAdapter,
  type AgentLaunchOptions,
  type CommandSpec,
  type StructuredSessionHandle,
  createKnownSessionRef,
  defaultFormatPromptSegments,
  injectWslEnv,
  primeProjectShellEnv,
  resolveLaunchSpec,
} from "../../agents/base";
import { captureSupervisorException } from "../../diagnostics/sentry";
import { ensureNodePtySpawnHelperExecutable } from "../../nodePty";
import type { QueuedStructuredTurn, SessionRuntime } from "../sessionTypes";
import type { ThreadOutputPipeline } from "../threadOutputPipeline";
import { rewriteSegmentsForWsl } from "../threadAttachments";
import { applyLaunchArgsConfigRewrite, mergeCliHookExtraArgs } from "./cliHookArgs";
import type { CliHookSessionCoordinator } from "./cliHookPlugin";
import { shouldPrimeNativeProjectShellEnv } from "./helpers";
import type { ThreadSessionManagerOptions } from "./managerOptions";
import type { PtyLifecycle } from "./ptyLifecycle";
import type { RuntimeEventRouter } from "./runtimeEventRouter";
import {
  StructuredRuntimeDiagnosticError,
  structuredRuntimeFeatureArea,
} from "./structuredRuntimeDiagnosticError";
import { describeSpawnFailure, sanitizeEnv, sanitizedProcessEnv } from "./spawnDiagnostics";
import type { SessionRuntimeLifecycle } from "./sessionRuntimeLifecycle";
import { getIterm2StatusL2TerminalEnv, resolveTerminalColorEnv } from "./terminalEnv";

export interface SpawnThreadInput {
  threadId: string;
  agentKind: AgentKind;
  adapter: AgentAdapter;
  projectLocation: ProjectLocation;
  config: ThreadConfig;
  initialSize: TerminalSize;
  launchPrompt: string;
  command?: CommandSpec;
  /**
   * Extra env injected into the agent PTY (merged on top of agentEnv +
   * provider spawnEnv). Currently used by the CLI hook ingress to ferry
   * `PORACODE_HOOK_URL` / `PORACODE_HOOK_SECRET` / `PORACODE_THREAD_ID` etc.
   */
  extraEnv?: Record<string, string>;
  structuredSession?: StructuredSessionHandle;
  sessionRef?: SessionRef;
  pendingLaunchPrompt?: string;
  pendingTerminalPreInputs?: string[][];
  pendingTerminalPrompt?: string;
  pendingTerminalSegments?: PromptSegment[];
  presentationMode?: ThreadPresentationMode;
  initialStatus?: ThreadStatus;
  initialAttention?: ThreadAttention;
  suppressInitialStructuredIdle?: boolean;
  mcpLaunchSnapshot: McpLaunchSnapshot;
}

/**
 * Per-launch config with the built-in MCP opt-in flags cleared for globally
 * hard-disabled servers. Together with the `resolve*ForLaunch` gates (which
 * withhold the http configs), this makes the spawn pipeline the single place
 * that enforces built-in MCP disables — providers receive this config and
 * never consult the disabled list themselves. The original config, with the
 * user's per-thread flags intact, stays on the `SessionRuntime` and in
 * thread-state events so re-enabling a server globally restores the thread's
 * choices.
 */
export function effectiveLaunchConfig(
  config: ThreadConfig,
  disabledBuiltInMcpServerIds: readonly BuiltInMcpServerId[],
): ThreadConfig {
  if (disabledBuiltInMcpServerIds.length === 0) return config;
  const next = { ...config };
  if (disabledBuiltInMcpServerIds.includes("browser")) next.browserMcp = false;
  if (disabledBuiltInMcpServerIds.includes("crossagents")) next.crossagentMcp = false;
  if (disabledBuiltInMcpServerIds.includes("computer-use")) next.computerUse = false;
  if (disabledBuiltInMcpServerIds.includes("chrome")) next.chromeMcp = false;
  return next;
}

/**
 * Launch config for providers that declare `mcpConfigSource: "agentSettings"`:
 * the built-in MCP flags come from the provider's saved settings
 * (`sharedSettings.agentSettings[kind]`) instead of the per-thread composer
 * flags. Crossagents remains off unless the provider explicitly supports
 * trusted provider-session routing, which lets a pooled runtime share one MCP
 * credential without losing the calling parent thread.
 */
export function applyAgentSettingsMcpFlags(
  config: ThreadConfig,
  agentSettings: Record<string, boolean | string>,
  disabledBuiltInMcpServerIds: readonly BuiltInMcpServerId[],
  providerSessionCrossagents: boolean,
): ThreadConfig {
  return effectiveLaunchConfig(
    {
      ...config,
      browserMcp: agentSettings.browserMcp === true,
      chromeMcp: agentSettings.chromeMcp === true,
      computerUse: agentSettings.computerUse === true,
      crossagentMcp: providerSessionCrossagents && agentSettings.crossagentMcp === true,
    },
    disabledBuiltInMcpServerIds,
  );
}

export function composeResolvedMcpServers(
  snapshot: McpLaunchSnapshot,
  browserMcp: BrowserMcpHttpConfig | undefined,
  crossagentMcp: CrossagentMcpHttpConfig | undefined,
  computerUseMcp: ComputerUseMcpHttpConfig | undefined,
  chromeMcp: ChromeMcpHttpConfig | undefined,
  appControlsMcp: AppControlsMcpHttpConfig | undefined,
): ResolvedMcpServer[] {
  const http = (
    id: BuiltInMcpServerId,
    config:
      | {
          url: string;
          headers: Record<string, string>;
          disabledTools?: readonly string[];
        }
      | undefined,
    timeoutMs = DEFAULT_MCP_SERVER_TIMEOUT_MS,
    approvalMode?: "approve",
  ): ResolvedMcpServer | undefined =>
    config
      ? {
          id,
          name: BUILT_IN_MCP_SERVER_NAMES[id],
          timeoutMs,
          transport: { type: "http", url: config.url, headers: config.headers },
          ...(config.disabledTools && config.disabledTools.length > 0
            ? { disabledTools: [...config.disabledTools] }
            : {}),
          ...(approvalMode ? { approvalMode } : {}),
        }
      : undefined;
  return [
    ...snapshot.mcpServers,
    http("browser", browserMcp),
    http("crossagents", crossagentMcp, 300_000, "approve"),
    http("computer-use", computerUseMcp),
    http("chrome", chromeMcp),
    http("app-controls", appControlsMcp),
  ].filter((server): server is ResolvedMcpServer => server !== undefined);
}

/**
 * Everything the spawn pipeline borrows from the manager. The pipeline owns
 * process creation (structured-session bring-up, argv assembly, PTY spawn,
 * runtime construction); the injected lifecycle owns registration and event
 * bindings, while the manager keeps terminal I/O, teardown, and ref recovery.
 */
export interface SpawnPipelineContext {
  options: ThreadSessionManagerOptions;
  sessions: Map<string, SessionRuntime>;
  pendingStartInterrupts: Set<string>;
  pendingStartAborts: Set<string>;
  ptyLifecycle: PtyLifecycle;
  outputPipeline: ThreadOutputPipeline;
  runtimeEventRouter: RuntimeEventRouter;
  sessionRuntimeLifecycle: Pick<SessionRuntimeLifecycle, "attach">;
  cliHookPlugin: CliHookSessionCoordinator;
  closeThread(payload: CloseThreadPayload): Promise<void>;
  failStructuredSession(session: SessionRuntime, error: unknown): void;
  isCurrentSession(session: SessionRuntime): boolean;
  resolveAgentSettings(adapter: AgentAdapter): Record<string, boolean | string>;
  emitOptimisticUserMessage(threadId: string, prompt: string, segments?: PromptSegment[]): string;
}

/**
 * Spawn orchestration for agent threads: initial launches, restarts of
 * inactive-but-resumable threads, and the shared `spawnThread` runtime-session
 * assembly they (and invalid-session-ref recovery) all funnel through.
 * Extracted from `ThreadSessionManager`.
 */
export class SpawnPipeline {
  constructor(private readonly ctx: SpawnPipelineContext) {}

  async startThreadInner(
    payload: StartThreadPayload & { threadId: string },
  ): Promise<StartThreadResult> {
    const ctx = this.ctx;
    await ctx.closeThread({ threadId: payload.threadId });
    if (ctx.pendingStartAborts.delete(payload.threadId)) {
      ctx.pendingStartInterrupts.delete(payload.threadId);
      return { threadId: payload.threadId };
    }

    const adapter = this.requireAdapter(payload.agentKind);
    const isServerControlled = adapter.capabilities.liveInputMode === "server";
    // Per-thread mode wins over the adapter default. Chat-mode threads route
    // input/output through the structured session even for adapters whose
    // `liveInputMode` is "terminal".
    const requestedPresentation = payload.presentationMode ?? adapter.capabilities.presentationMode;
    const usesTerminalPresentation = requestedPresentation === "terminal";
    const useStructuredFlow = isServerControlled || !usesTerminalPresentation;
    const wslSegments = payload.segments
      ? await rewriteSegmentsForWsl(payload.segments, payload.projectLocation, {
          preserveImageAttachments: useStructuredFlow,
          preservePdfAttachments:
            useStructuredFlow && adapter.capabilities.readsPdfAttachmentsFromHost === true,
        })
      : undefined;
    // Terminal skills fallback: skill segments the CLI can't resolve natively
    // become short path-hint text before the prompt is typed into the PTY.
    // Structured turns keep the raw segments (they use inline injection).
    const effectiveSegments =
      !useStructuredFlow && wslSegments?.some((segment) => segment.kind === "skill")
        ? ((await ctx.options.rewriteTerminalSkillSegments?.({
            agentKind: payload.agentKind,
            projectLocation: payload.projectLocation,
            segments: wslSegments,
          })) ?? wslSegments)
        : wslSegments;
    const initialPrompt =
      effectiveSegments && effectiveSegments.length > 0
        ? (adapter.formatPromptSegments?.(effectiveSegments) ??
          defaultFormatPromptSegments(effectiveSegments))
        : payload.prompt.trim();
    // Portable-skills fallback for the initial structured turn: inline SKILL.md
    // instructions for invoked skills this provider can't load natively.
    const inlineSkillInstructions =
      useStructuredFlow && effectiveSegments?.some((segment) => segment.kind === "skill")
        ? await ctx.options.buildSkillTurnInjection?.({
            agentKind: payload.agentKind,
            projectLocation: payload.projectLocation,
            segments: effectiveSegments,
          })
        : undefined;
    const shouldQueueInitialPrompt =
      !payload.sessionRef &&
      isServerControlled &&
      usesTerminalPresentation &&
      initialPrompt.length > 0 &&
      adapter.isReadyForInitialPrompt !== undefined;

    // Optimistic user_message: for GUI threads with a fresh prompt, surface
    // the user's typed text in the chat pane immediately — before the slow
    // structured-session work (process spawn + ACP handshake +
    // newSession/loadSession) runs. When the renderer has already painted an
    // optimistic message and shipped its id with the payload, we reuse that
    // id end-to-end so the chat pane never sees a duplicate.
    const optimisticUserMessageItemId =
      !usesTerminalPresentation && initialPrompt.length > 0 && !payload.sessionRef
        ? (payload.userMessageItemId ??
          ctx.emitOptimisticUserMessage(payload.threadId, initialPrompt, effectiveSegments))
        : undefined;
    if (optimisticUserMessageItemId) {
      this.emitOptimisticWorkingState(payload.threadId, payload.config);
    }

    // Prime the user's interactive-shell env (fnm / nvm / asdf / mise cd-hooks
    // applied at the project root) before any agent process — structured or
    // PTY — is spawned. Electron-from-Finder inherits launchd's skeleton PATH,
    // so without this the spawned CLI picks up homebrew node instead of the
    // project-pinned version. Memoized per cwd; the later prime before the PTY
    // launch is a no-op after this.
    if (shouldPrimeNativeProjectShellEnv(payload.projectLocation)) {
      await primeProjectShellEnv(payload.projectLocation.path);
    }
    await this.ctx.options.prepareSkillsForLaunch?.(payload.projectLocation, payload.agentKind);

    const mcpIdentity = {
      threadId: payload.threadId,
      title: initialPrompt.split("\n", 1)[0]?.trim() ?? "",
    };
    let mcpServers = resolveEnabledMcpServers(payload.mcpServers ?? []);
    if (this.ctx.options.applyMcpServerAuthorization) {
      mcpServers = await this.ctx.options.applyMcpServerAuthorization(mcpServers);
    }
    if (this.ctx.options.prepareMcpToolFilters) {
      mcpServers = await this.ctx.options.prepareMcpToolFilters(
        mcpServers,
        payload.projectLocation,
      );
    }
    const mcpLaunchSnapshot: McpLaunchSnapshot = {
      mcpServers,
      disabledBuiltInMcpServerIds: payload.disabledBuiltInMcpServerIds ?? [],
      disabledBuiltInMcpTools: payload.disabledBuiltInMcpTools ?? {},
    };
    const launchConfig = effectiveLaunchConfig(
      payload.config,
      mcpLaunchSnapshot.disabledBuiltInMcpServerIds,
    );
    const resolvedMcpServers = await this.resolveMcpServersForLaunch({
      location: payload.projectLocation,
      config: launchConfig,
      mcpLaunchSnapshot,
      identity: mcpIdentity,
      crossagentThreadId: payload.threadId,
      adapter,
    });
    const structuredSession = await this.createStructuredSession(
      adapter,
      payload.threadId,
      payload.agentKind,
      payload.projectLocation,
      launchConfig,
      resolvedMcpServers,
      mcpIdentity,
      payload.sessionRef,
      requestedPresentation,
    );
    if (await this.abortPendingStart(payload.threadId, structuredSession)) {
      return { threadId: payload.threadId };
    }

    if (structuredSession?.activate) {
      try {
        await structuredSession.activate();
      } catch (error) {
        await structuredSession.dispose();
        if (ctx.pendingStartInterrupts.delete(payload.threadId)) {
          return { threadId: payload.threadId };
        }
        throw error;
      }
    }
    if (await this.abortPendingStart(payload.threadId, structuredSession)) {
      return { threadId: payload.threadId };
    }

    let openedStructuredThreadId: string | undefined;
    if (structuredSession?.openThread) {
      try {
        openedStructuredThreadId = await structuredSession.openThread(
          launchConfig,
          payload.sessionRef,
        );
      } catch (error) {
        await structuredSession.dispose();
        if (ctx.pendingStartInterrupts.delete(payload.threadId)) {
          return { threadId: payload.threadId };
        }
        throw error;
      }
    }
    if (await this.abortPendingStart(payload.threadId, structuredSession)) {
      return { threadId: payload.threadId };
    }

    if (!usesTerminalPresentation) {
      if (!structuredSession) {
        throw new Error(
          `Agent ${payload.agentKind} does not support ${requestedPresentation} presentation.`,
        );
      }
      const resolvedSessionRef =
        payload.sessionRef ??
        (openedStructuredThreadId ? createKnownSessionRef(openedStructuredThreadId) : undefined);
      const startInterrupted = ctx.pendingStartInterrupts.delete(payload.threadId);
      const session = this.spawnThread({
        threadId: payload.threadId,
        adapter,
        agentKind: payload.agentKind,
        projectLocation: payload.projectLocation,
        config: payload.config,
        initialSize: payload.initialSize,
        launchPrompt: "",
        structuredSession,
        ...(resolvedSessionRef ? { sessionRef: resolvedSessionRef } : {}),
        presentationMode: requestedPresentation,
        initialStatus: optimisticUserMessageItemId && !startInterrupted ? "working" : "idle",
        initialAttention: optimisticUserMessageItemId && !startInterrupted ? "working" : "none",
        suppressInitialStructuredIdle:
          optimisticUserMessageItemId !== undefined && !startInterrupted,
        mcpLaunchSnapshot,
      });
      if (
        !startInterrupted &&
        !payload.sessionRef &&
        initialPrompt.length > 0 &&
        structuredSession.startTurn
      ) {
        const startOptions = {
          ...(optimisticUserMessageItemId
            ? { userMessageItemId: optimisticUserMessageItemId }
            : {}),
          ...(inlineSkillInstructions ? { inlineInstructions: inlineSkillInstructions } : {}),
        };
        void structuredSession
          .startTurn(
            initialPrompt,
            launchConfig,
            effectiveSegments,
            Object.keys(startOptions).length > 0 ? startOptions : undefined,
          )
          .catch((error) => {
            if (ctx.sessions.get(session.threadId)?.instanceId !== session.instanceId) {
              return;
            }
            ctx.failStructuredSession(session, error);
          });
      }
      return { threadId: payload.threadId };
    }

    if (
      !payload.sessionRef &&
      useStructuredFlow &&
      initialPrompt.length > 0 &&
      !shouldQueueInitialPrompt &&
      structuredSession?.startTurn
    ) {
      void structuredSession
        .startTurn(
          initialPrompt,
          launchConfig,
          effectiveSegments,
          inlineSkillInstructions ? { inlineInstructions: inlineSkillInstructions } : undefined,
        )
        .catch((error) => {
          console.error("[supervisor] initial turn failed:", error);
          const activeSession = ctx.sessions.get(payload.threadId);
          if (!activeSession) {
            return;
          }
          ctx.failStructuredSession(activeSession, error);
        });
    }

    if (shouldQueueInitialPrompt) {
      await structuredSession?.ensureResumeArtifacts?.();
    }

    const deferToTerminal = adapter.shouldDeferPromptToTerminal?.(payload.config) ?? false;
    // Use `initialPrompt` (the adapter-formatted version with `~/` shortening
    // and WSL path rewriting) so attachments hand off cleanly as the launch
    // arg instead of being staged for a deferred PTY-write.
    const launchPrompt = useStructuredFlow || deferToTerminal ? "" : initialPrompt;
    const launchOptionsWithMcp = this.composeLaunchOptions(
      adapter,
      structuredSession?.launchOptions,
      resolvedMcpServers,
    );
    const argv = payload.sessionRef
      ? adapter.buildResumeArgv(
          payload.projectLocation,
          launchConfig,
          launchPrompt,
          payload.sessionRef,
          launchOptionsWithMcp,
        )
      : adapter.buildLaunchArgv(
          payload.projectLocation,
          launchConfig,
          launchPrompt,
          payload.sessionRef,
          launchOptionsWithMcp,
        );

    // Append CLI hook plugin args (e.g. Claude `--settings <path>`); env vars
    // (`PORACODE_HOOK_URL`, `PORACODE_HOOK_SECRET`, `PORACODE_THREAD_ID`,
    // `PORACODE_AGENT_KIND`, `PORACODE_HOOK_PROTOCOL_VERSION`) flow through
    // `spawnThread` → `agentEnv` so they end up in the PTY env on every
    // platform (WSL, win32, posix). Failure to resolve plugin extras silently
    // degrades to L2 — the supervisor must never block thread creation on
    // the hook-plugin plumbing.
    const cliHookExtras = await ctx.cliHookPlugin.resolveCliHookPluginExtras(
      payload.threadId,
      payload.agentKind,
      payload.projectLocation,
      resolvedMcpServers,
    );
    if (cliHookExtras.extraArgs.length > 0) {
      argv.args = mergeCliHookExtraArgs(
        adapter,
        argv.args,
        cliHookExtras.extraArgs,
        launchPrompt,
        payload.sessionRef,
      );
    }
    argv.args = await applyLaunchArgsConfigRewrite(
      adapter,
      argv.args,
      payload.config,
      payload.projectLocation,
    );
    if (shouldPrimeNativeProjectShellEnv(payload.projectLocation)) {
      await primeProjectShellEnv(payload.projectLocation.path);
    }
    const command = resolveLaunchSpec(payload.projectLocation, argv);

    const keepStructuredSession = structuredSession && useStructuredFlow;
    if (structuredSession && !keepStructuredSession) {
      await structuredSession.dispose();
    }
    if (ctx.pendingStartAborts.delete(payload.threadId)) {
      ctx.pendingStartInterrupts.delete(payload.threadId);
      if (structuredSession && keepStructuredSession) {
        await structuredSession.dispose();
      }
      command.cleanup?.();
      return { threadId: payload.threadId };
    }

    const resolvedSessionRef = payload.sessionRef ?? command.sessionRef;
    this.spawnThread({
      threadId: payload.threadId,
      adapter,
      agentKind: payload.agentKind,
      projectLocation: payload.projectLocation,
      config: payload.config,
      initialSize: payload.initialSize,
      launchPrompt,
      command,
      ...(Object.keys(cliHookExtras.env).length > 0 ? { extraEnv: cliHookExtras.env } : {}),
      ...(keepStructuredSession ? { structuredSession } : {}),
      ...(resolvedSessionRef ? { sessionRef: resolvedSessionRef } : {}),
      mcpLaunchSnapshot,
      ...(shouldQueueInitialPrompt ? { pendingLaunchPrompt: initialPrompt } : {}),
      presentationMode: requestedPresentation,
      ...(deferToTerminal && !useStructuredFlow
        ? (() => {
            const preInputs = adapter.buildTerminalPreInputs?.(payload.config);
            return {
              ...(preInputs ? { pendingTerminalPreInputs: preInputs } : {}),
              pendingTerminalPrompt: initialPrompt,
              ...(effectiveSegments ? { pendingTerminalSegments: effectiveSegments } : {}),
            };
          })()
        : {}),
    });

    return { threadId: payload.threadId };
  }

  async restartThread(session: SessionRuntime, turn: QueuedStructuredTurn): Promise<void> {
    const ctx = this.ctx;
    const { prompt, config } = turn;
    if (!session.sessionRef) {
      throw new Error("Session cannot be restarted without a known session reference.");
    }
    const mcpLaunchSnapshot = session.mcpLaunchSnapshot;

    const isServerControlled = session.adapter.capabilities.liveInputMode === "server";
    const usesTerminalPresentation =
      (session.presentationMode ?? session.adapter.capabilities.presentationMode) === "terminal";
    const useStructuredFlow = isServerControlled || !usesTerminalPresentation;
    session.ignoreExit = true;
    ctx.outputPipeline.clearSessionTimers(session);
    // Subagent maps from the prior session would otherwise leak across resume:
    // any unsubscribed buffers, lingering child→parent entries, and overlay
    // subscriptions from the dead session are stale once the structured
    // session is replaced. `closeThread` already does this on full teardown.
    ctx.runtimeEventRouter.clearAllForThread(session.threadId);
    await session.structuredSession?.dispose();
    if (session.structuredSession) {
      await sleep(150);
    }
    ctx.ptyLifecycle.kill(session);
    if (!ctx.isCurrentSession(session)) {
      return;
    }

    // Prime the user's interactive-shell env before respawning. See the same
    // call in `startThreadInner` — must run before the structured-session
    // spawn so the child inherits the project-pinned PATH, not launchd's.
    if (shouldPrimeNativeProjectShellEnv(session.projectLocation)) {
      await primeProjectShellEnv(session.projectLocation.path);
    }
    await this.ctx.options.prepareSkillsForLaunch?.(session.projectLocation, session.agentKind);
    if (!ctx.isCurrentSession(session)) {
      return;
    }

    const mcpIdentity = { threadId: session.threadId };
    const launchConfig = effectiveLaunchConfig(
      config,
      mcpLaunchSnapshot.disabledBuiltInMcpServerIds,
    );
    const resolvedMcpServers = await this.resolveMcpServersForLaunch({
      location: session.projectLocation,
      config: launchConfig,
      mcpLaunchSnapshot,
      identity: mcpIdentity,
      crossagentThreadId: session.threadId,
      adapter: session.adapter,
    });
    const structuredSession = await this.createStructuredSession(
      session.adapter,
      session.threadId,
      session.agentKind,
      session.projectLocation,
      launchConfig,
      resolvedMcpServers,
      mcpIdentity,
      session.sessionRef,
      session.presentationMode,
    );
    if (!ctx.isCurrentSession(session)) {
      await structuredSession?.dispose();
      return;
    }

    if (structuredSession?.activate) {
      try {
        await structuredSession.activate();
      } catch (error) {
        await structuredSession.dispose();
        throw error;
      }
    }
    if (!ctx.isCurrentSession(session)) {
      await structuredSession?.dispose();
      return;
    }

    if (structuredSession?.openThread) {
      try {
        await structuredSession.openThread(launchConfig, session.sessionRef);
      } catch (error) {
        await structuredSession.dispose();
        throw error;
      }
    }
    if (!ctx.isCurrentSession(session)) {
      await structuredSession?.dispose();
      return;
    }

    if (!usesTerminalPresentation) {
      if (!structuredSession) {
        throw new Error(`Thread ${session.threadId} cannot restart without a structured session.`);
      }
      const restarted = this.spawnThread({
        threadId: session.threadId,
        agentKind: session.agentKind,
        adapter: session.adapter,
        projectLocation: session.projectLocation,
        config,
        initialSize: session.terminalSize,
        launchPrompt: "",
        structuredSession,
        sessionRef: session.sessionRef,
        mcpLaunchSnapshot,
        ...(session.presentationMode ? { presentationMode: session.presentationMode } : {}),
      });
      if (prompt.trim().length > 0 && structuredSession.startTurn) {
        const optimisticItemId =
          turn.userMessageItemId ??
          ctx.emitOptimisticUserMessage(session.threadId, prompt, turn.segments);
        const startOptions = {
          userMessageItemId: optimisticItemId,
          ...(turn.inlineInstructions ? { inlineInstructions: turn.inlineInstructions } : {}),
        };
        void structuredSession
          .startTurn(prompt, launchConfig, turn.segments, startOptions)
          .catch((error) => {
            if (ctx.sessions.get(restarted.threadId)?.instanceId !== restarted.instanceId) {
              return;
            }
            ctx.failStructuredSession(restarted, error);
          });
      }
      return;
    }

    const launchPrompt = useStructuredFlow ? "" : prompt;
    const cliHookExtras = await ctx.cliHookPlugin.resolveCliHookPluginExtras(
      session.threadId,
      session.agentKind,
      session.projectLocation,
      resolvedMcpServers,
    );
    if (!ctx.isCurrentSession(session)) {
      await structuredSession?.dispose();
      return;
    }
    const argv = session.adapter.buildResumeArgv(
      session.projectLocation,
      launchConfig,
      launchPrompt,
      session.sessionRef,
      this.composeLaunchOptions(
        session.adapter,
        structuredSession?.launchOptions,
        resolvedMcpServers,
      ),
    );
    if (cliHookExtras.extraArgs.length > 0) {
      argv.args = mergeCliHookExtraArgs(
        session.adapter,
        argv.args,
        cliHookExtras.extraArgs,
        launchPrompt,
        session.sessionRef,
      );
    }
    argv.args = await applyLaunchArgsConfigRewrite(
      session.adapter,
      argv.args,
      config,
      session.projectLocation,
    );
    if (shouldPrimeNativeProjectShellEnv(session.projectLocation)) {
      await primeProjectShellEnv(session.projectLocation.path);
    }
    if (!ctx.isCurrentSession(session)) {
      await structuredSession?.dispose();
      argv.cleanup?.();
      return;
    }
    const command = resolveLaunchSpec(session.projectLocation, argv);

    const keepStructuredSession = structuredSession && useStructuredFlow;
    if (structuredSession && !keepStructuredSession) {
      await structuredSession.dispose();
    }
    if (!ctx.isCurrentSession(session)) {
      if (structuredSession && keepStructuredSession) {
        await structuredSession.dispose();
      }
      command.cleanup?.();
      return;
    }

    this.spawnThread({
      threadId: session.threadId,
      agentKind: session.agentKind,
      adapter: session.adapter,
      projectLocation: session.projectLocation,
      config,
      initialSize: session.terminalSize,
      launchPrompt,
      command,
      ...(Object.keys(cliHookExtras.env).length > 0 ? { extraEnv: cliHookExtras.env } : {}),
      ...(keepStructuredSession ? { structuredSession } : {}),
      sessionRef: session.sessionRef,
      mcpLaunchSnapshot,
      ...(session.presentationMode ? { presentationMode: session.presentationMode } : {}),
    });
  }

  spawnThread(input: SpawnThreadInput): SessionRuntime {
    const ctx = this.ctx;
    // `thread-reset` is only consumed by the terminal panel (renderer scrollback
    // reset) and the renderer-side runtime-event/server-request slice clear.
    // GUI threads have no terminal scrollback, and clearing the slice would
    // wipe the optimistic user_message we may have already painted ahead of
    // structured-session setup. Skip the reset for any GUI-presentation
    // thread (initial launch, resume, restart all run through here).
    const isGuiPresentation =
      input.presentationMode !== undefined && input.presentationMode !== "terminal";
    if (!isGuiPresentation) {
      ctx.options.emit({ type: "thread-reset", threadId: input.threadId });
    }

    const agentEnv = this.resolveAgentProcessEnv(input.adapter);
    const cliHookEnvInjected = Boolean(input.extraEnv?.PORACODE_HOOK_URL);
    const providerEnv =
      input.projectLocation.kind === "wsl"
        ? input.adapter.spawnEnv?.wsl
        : input.adapter.spawnEnv?.native;
    if (providerEnv) {
      Object.assign(agentEnv, providerEnv);
    }
    if (input.extraEnv) {
      Object.assign(agentEnv, input.extraEnv);
    }
    Object.assign(
      agentEnv,
      getIterm2StatusL2TerminalEnv({
        adapter: input.adapter,
        disableCliHookPlugin: ctx.options.readDisableCliHookPlugin(),
        cliHookEnvInjected,
      }),
    );
    const terminalEnv = resolveTerminalColorEnv(input.projectLocation);
    const terminalAgentEnv = { ...agentEnv, ...terminalEnv };
    const command = input.command
      ? injectWslEnv(input.command, input.projectLocation, terminalAgentEnv)
      : undefined;
    let pty;
    if (command) {
      ensureNodePtySpawnHelperExecutable();
      const ptyEnv = {
        ...sanitizedProcessEnv,
        ...(command.env ?? {}),
        ...agentEnv,
        ...terminalEnv,
      };
      try {
        pty = spawn(command.command, command.args, {
          name: process.platform === "win32" ? "xterm-color" : terminalEnv.TERM,
          cols: input.initialSize.cols,
          rows: input.initialSize.rows,
          cwd: command.cwd ?? process.cwd(),
          env: ptyEnv,
        });
      } catch (error) {
        try {
          command.cleanup?.();
        } catch {
          // Best-effort cleanup must not hide the spawn failure.
        }
        throw new Error(
          describeSpawnFailure(
            "agent",
            {
              command: command.command,
              args: command.args,
              ...(command.cwd ? { cwd: command.cwd } : {}),
            },
            sanitizeEnv(ptyEnv),
            error,
          ),
          { cause: error },
        );
      }
    }
    const session: SessionRuntime = {
      instanceId: randomUUID(),
      threadId: input.threadId,
      agentKind: input.agentKind,
      adapter: input.adapter,
      ...(pty ? { pty } : {}),
      ...(pty && command?.cleanup ? { launchCleanup: command.cleanup } : {}),
      projectLocation: input.projectLocation,
      config: input.config,
      mcpLaunchSnapshot: input.mcpLaunchSnapshot,
      terminalSize: input.initialSize,
      launchPrompt: input.launchPrompt,
      ...(input.sessionRef ? { sessionRef: input.sessionRef } : {}),
      status: input.initialStatus ?? "launching",
      attention: input.initialAttention ?? "none",
      canResumeWithConfig: input.sessionRef !== undefined,
      outputLength: 0,
      pendingLaunchPrompt: input.pendingLaunchPrompt,
      pendingTerminalPreInputs: input.pendingTerminalPreInputs,
      pendingTerminalPrompt: input.pendingTerminalPrompt,
      pendingTerminalSegments: input.pendingTerminalSegments,
      ...(input.presentationMode ? { presentationMode: input.presentationMode } : {}),
      ...(input.suppressInitialStructuredIdle ? { suppressInitialStructuredIdle: true } : {}),
      prevChunk: "",
      lastStrippedPtyChunk: "",
      ptyOscCarry: "",
      ...(cliHookEnvInjected ? { cliHookEnvInjected: true } : {}),
      ...(input.structuredSession ? { structuredSession: input.structuredSession } : {}),
    };

    ctx.sessionRuntimeLifecycle.attach(session);

    return session;
  }

  /** Fold provider-neutral MCP descriptors into every launch path. */
  composeLaunchOptions(
    adapter: AgentAdapter,
    launchOptions: AgentLaunchOptions | undefined,
    mcpServers: readonly ResolvedMcpServer[],
  ): AgentLaunchOptions {
    return {
      ...(launchOptions ?? {}),
      agentSettings: this.ctx.resolveAgentSettings(adapter),
      ...(mcpServers.length > 0 ? { mcpServers } : {}),
    };
  }

  async resolveMcpServersForLaunch({
    location,
    config,
    mcpLaunchSnapshot,
    identity,
    crossagentThreadId,
    adapter,
  }: {
    location: ProjectLocation;
    config: ThreadConfig;
    mcpLaunchSnapshot: McpLaunchSnapshot;
    identity?: McpThreadIdentity;
    crossagentThreadId?: string;
    adapter?: AgentAdapter;
  }): Promise<ResolvedMcpServer[]> {
    const providerSessionCrossagents =
      adapter?.capabilities.crossagentMcpRouting === "provider-session" &&
      crossagentThreadId !== undefined;
    if (adapter?.capabilities.mcpConfigSource === "agentSettings") {
      // Provider-level MCP: flags come from the provider's settings page. Drop
      // the thread identity so a shared provider runtime never retains
      // per-thread bearer credentials; project-specific config is routed by
      // the provider's directory-scoped client.
      config = applyAgentSettingsMcpFlags(
        config,
        this.ctx.resolveAgentSettings(adapter),
        mcpLaunchSnapshot.disabledBuiltInMcpServerIds,
        providerSessionCrossagents,
      );
      identity = undefined;
      if (!providerSessionCrossagents) crossagentThreadId = undefined;
    }
    const browserMcp = await this.resolveBrowserMcpForLaunch(
      location,
      config,
      mcpLaunchSnapshot,
      identity,
    );
    const crossagentMcp = crossagentThreadId
      ? await this.resolveCrossagentMcpForLaunch(
          crossagentThreadId,
          location,
          config,
          mcpLaunchSnapshot,
          providerSessionCrossagents,
        )
      : undefined;
    const computerUseMcp = this.resolveComputerUseMcpForLaunch(
      location,
      config,
      mcpLaunchSnapshot,
      identity,
    );
    const chromeMcp = this.resolveChromeMcpForLaunch(location, config, mcpLaunchSnapshot, identity);
    const appControlsMcp = await this.resolveAppControlsMcpForLaunch(
      location,
      mcpLaunchSnapshot,
      identity,
    );
    return composeResolvedMcpServers(
      mcpLaunchSnapshot,
      browserMcp,
      crossagentMcp,
      computerUseMcp,
      chromeMcp,
      appControlsMcp,
    );
  }

  async resolveBrowserMcpForLaunch(
    location: ProjectLocation,
    config: ThreadConfig,
    mcpLaunchSnapshot: McpLaunchSnapshot,
    identity?: McpThreadIdentity,
  ): Promise<BrowserMcpHttpConfig | undefined> {
    if (mcpLaunchSnapshot.disabledBuiltInMcpServerIds.includes("browser")) return undefined;
    const enabled = config.browserMcp === true;
    if (!enabled) return undefined;
    const cfg = await resolveBrowserMcpHttpConfigForLaunch(
      location,
      enabled,
      this.ctx.options.wslBridge,
      {
        ...identity,
        disabledTools: mcpLaunchSnapshot.disabledBuiltInMcpTools?.browser ?? [],
      },
    );
    return cfg;
  }

  /**
   * Resolve the computer-use MCP http config for a launch when the thread opted
   * in (`config.computerUse === true`). Unlike browser MCP there is no
   * force-disable ctx gate — computer-use scope gating happens in the renderer,
   * so the per-thread config flag is authoritative. The resolver declines for
   * WSL projects by design (computer-use is disabled for WSL). Parallel to
   * `resolveBrowserMcpForLaunch`.
   */
  resolveComputerUseMcpForLaunch(
    location: ProjectLocation,
    config: ThreadConfig,
    mcpLaunchSnapshot: McpLaunchSnapshot,
    identity?: McpThreadIdentity,
  ): ComputerUseMcpHttpConfig | undefined {
    const enabled = config.computerUse === true;
    return resolveComputerUseMcpHttpConfigForLaunch(location, enabled, {
      ...identity,
      disabledTools: mcpLaunchSnapshot.disabledBuiltInMcpTools?.["computer-use"] ?? [],
    });
  }

  /**
   * Resolve the external-Chrome MCP http config for a launch when the thread
   * opted in (`config.chromeMcp === true`). Mirrors
   * {@link resolveComputerUseMcpForLaunch}: the per-thread config flag is
   * authoritative (scope gating lives in the renderer) and the resolver declines
   * for WSL projects by design.
   */
  resolveChromeMcpForLaunch(
    location: ProjectLocation,
    config: ThreadConfig,
    mcpLaunchSnapshot: McpLaunchSnapshot,
    identity?: McpThreadIdentity,
  ): ChromeMcpHttpConfig | undefined {
    const enabled = config.chromeMcp === true;
    return resolveChromeMcpHttpConfigForLaunch(location, enabled, {
      ...identity,
      disabledTools: mcpLaunchSnapshot.disabledBuiltInMcpTools?.chrome ?? [],
    });
  }

  resolveAppControlsMcpForLaunch(
    location: ProjectLocation,
    mcpLaunchSnapshot: McpLaunchSnapshot,
    identity?: McpThreadIdentity,
  ): Promise<AppControlsMcpHttpConfig | undefined> {
    if (mcpLaunchSnapshot.disabledBuiltInMcpServerIds.includes("app-controls")) {
      return Promise.resolve(undefined);
    }
    return resolveAppControlsMcpHttpConfigForLaunch(location, this.ctx.options.wslHostAccess, {
      ...identity,
      disabledTools: mcpLaunchSnapshot.disabledBuiltInMcpTools?.["app-controls"] ?? [],
    });
  }

  /**
   * Resolve the Crossagents MCP http config for a launch when the thread opted
   * in (`config.crossagentMcp === true`). Registers the thread with the ingress
   * (idempotent — reuses an existing token), then rewrites the loopback URL to
   * the WSL → host gateway IP for NAT-mode WSL projects (mirrored-mode WSL and
   * native projects pass through unchanged). Parallel to
   * `resolveBrowserMcpForLaunch`.
   */
  async resolveCrossagentMcpForLaunch(
    threadId: string,
    location: ProjectLocation,
    config: ThreadConfig,
    mcpLaunchSnapshot: McpLaunchSnapshot,
    providerSessionRouting = false,
  ): Promise<CrossagentMcpHttpConfig | undefined> {
    if (config.crossagentMcp !== true) {
      this.ctx.options.crossagentMcp?.unregister(threadId);
      return undefined;
    }
    const disabledTools = mcpLaunchSnapshot.disabledBuiltInMcpTools?.crossagents ?? [];
    const native = providerSessionRouting
      ? this.ctx.options.crossagentMcp?.registerProviderSession(threadId, disabledTools)
      : this.ctx.options.crossagentMcp?.register(threadId, disabledTools);
    return resolveCrossagentMcpHttpConfigForLaunch(
      native,
      location,
      this.ctx.options.wslHostAccess,
    );
  }

  private resolveAgentProcessEnv(adapter: AgentAdapter): Record<string, string> {
    const settingDefs = adapter.capabilities.settingDefs ?? [];
    if (settingDefs.length === 0) {
      return {};
    }

    const agentValues = this.ctx.resolveAgentSettings(adapter);
    const env: Record<string, string> = {};
    for (const definition of settingDefs) {
      if (definition.platforms && !definition.platforms.includes(process.platform)) {
        continue;
      }
      const value = agentValues[definition.key] ?? definition.default;
      if (definition.type === "toggle") {
        if (value) {
          Object.assign(env, definition.env);
        }
      } else if (definition.type === "select") {
        env[definition.envVar] = String(value);
      }
    }
    return env;
  }

  private requireAdapter(kind: AgentKind): AgentAdapter {
    const adapter = this.ctx.options.adapters.get(kind);
    if (!adapter) {
      throw new Error(`Unsupported agent adapter: ${kind}`);
    }
    return adapter;
  }

  private async createStructuredSession(
    adapter: AgentAdapter,
    threadId: string,
    agentKind: AgentKind,
    projectLocation: ProjectLocation,
    config: ThreadConfig,
    mcpServers: readonly ResolvedMcpServer[],
    mcpIdentity: McpThreadIdentity | undefined,
    sessionRef?: SessionRef,
    presentationMode?: ThreadPresentationMode,
  ): Promise<StructuredSessionHandle | undefined> {
    if (!adapter.createStructuredSession) {
      return undefined;
    }
    try {
      return await adapter.createStructuredSession({
        threadId,
        projectLocation,
        config,
        agentSettings: this.ctx.resolveAgentSettings(adapter),
        ...(mcpIdentity ? { mcpIdentity } : {}),
        ...(mcpServers.length > 0 || adapter.capabilities.mcpConfigSource === "agentSettings"
          ? { mcpServers }
          : {}),
        ...(sessionRef ? { sessionRef } : {}),
        ...(presentationMode ? { presentationMode } : {}),
      });
    } catch (error) {
      console.error("[supervisor] structured session creation failed:", error);
      const diagnosticError = new StructuredRuntimeDiagnosticError("session-creation", agentKind);
      if (presentationMode === "gui") {
        // The startThread IPC boundary owns GUI startup failures. Throw one
        // privacy-safe classified error instead of capturing here and then
        // manufacturing a second "does not support GUI" failure below.
        throw diagnosticError;
      }
      // Terminal presentation can safely fall back to its PTY path when the
      // optional structured helper cannot be created, so report once here.
      captureSupervisorException(diagnosticError, {
        "poracode.feature_area": structuredRuntimeFeatureArea("session-creation"),
        ...(presentationMode ? { "poracode.presentation": presentationMode } : {}),
        "poracode.provider": agentKind,
        "poracode.runtime_kind": "structured",
      });
      return undefined;
    }
  }

  private async abortPendingStart(
    threadId: string,
    structuredSession: StructuredSessionHandle | undefined,
  ): Promise<boolean> {
    if (!this.ctx.pendingStartAborts.delete(threadId)) {
      return false;
    }
    this.ctx.pendingStartInterrupts.delete(threadId);
    await structuredSession?.dispose();
    return true;
  }

  private emitOptimisticWorkingState(threadId: string, config: ThreadConfig): void {
    this.ctx.options.emit({
      type: "thread-state",
      threadId,
      status: "working",
      attention: "working",
      config,
      canResumeWithConfig: false,
      threadStatusSource: "server",
    });
  }
}
