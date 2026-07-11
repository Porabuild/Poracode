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
} from "@/shared/contracts";
import type { McpThreadIdentity } from "@/shared/browserMcpThread";
import {
  resolveBrowserMcpHttpConfigForLaunch,
  type BrowserMcpHttpConfig,
} from "@/supervisor/agents/browserMcp";
import {
  resolveSubagentMcpHttpConfigForLaunch,
  type SubagentMcpHttpConfig,
} from "@/supervisor/agents/subagentMcp";
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
import type { SessionRuntime } from "../sessionTypes";
import type { ThreadOutputPipeline } from "../threadOutputPipeline";
import { rewriteSegmentsForWsl } from "../threadAttachments";
import { applyLaunchArgsConfigRewrite, mergeCliHookExtraArgs } from "./cliHookArgs";
import type { CliHookSessionCoordinator } from "./cliHookPlugin";
import { shouldPrimeNativeProjectShellEnv } from "./helpers";
import type { ThreadSessionManagerOptions } from "./managerOptions";
import type { PtyLifecycle } from "./ptyLifecycle";
import type { RuntimeEventRouter } from "./runtimeEventRouter";
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
   * `LIGHTCODE_HOOK_URL` / `LIGHTCODE_HOOK_SECRET` / `LIGHTCODE_THREAD_ID` etc.
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
  isBrowserMcpEnabledForLaunch(adapter: AgentAdapter | undefined, config: ThreadConfig): boolean;
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
    const effectiveSegments = payload.segments
      ? await rewriteSegmentsForWsl(payload.segments, payload.projectLocation, {
          preserveImageAttachments: useStructuredFlow,
        })
      : undefined;
    const initialPrompt =
      effectiveSegments && effectiveSegments.length > 0
        ? (adapter.formatPromptSegments?.(effectiveSegments) ??
          defaultFormatPromptSegments(effectiveSegments))
        : payload.prompt.trim();
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

    const mcpIdentity = {
      threadId: payload.threadId,
      title: initialPrompt.split("\n", 1)[0]?.trim() ?? "",
    };
    const browserMcp = await this.resolveBrowserMcpForLaunch(
      adapter,
      payload.projectLocation,
      payload.config,
      mcpIdentity,
    );
    const subagentMcp = await this.resolveSubagentMcpForLaunch(
      payload.threadId,
      payload.projectLocation,
      payload.config,
    );
    const computerUse = this.resolveComputerUseMcpForLaunch(
      payload.projectLocation,
      payload.config,
      mcpIdentity,
    );
    const chromeMcp = this.resolveChromeMcpForLaunch(
      payload.projectLocation,
      payload.config,
      mcpIdentity,
    );
    const appControlsMcp = await this.resolveAppControlsMcpForLaunch(
      payload.projectLocation,
      mcpIdentity,
    );
    const structuredSession = await this.createStructuredSession(
      adapter,
      payload.threadId,
      payload.agentKind,
      payload.projectLocation,
      payload.config,
      browserMcp,
      subagentMcp,
      computerUse,
      chromeMcp,
      appControlsMcp,
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
          payload.config,
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
      });
      if (
        !startInterrupted &&
        !payload.sessionRef &&
        initialPrompt.length > 0 &&
        structuredSession.startTurn
      ) {
        void structuredSession
          .startTurn(
            initialPrompt,
            payload.config,
            effectiveSegments,
            optimisticUserMessageItemId
              ? { userMessageItemId: optimisticUserMessageItemId }
              : undefined,
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
        .startTurn(initialPrompt, payload.config, effectiveSegments)
        .catch((error) => {
          console.error("[supervisor] initial turn failed:", error);
          captureSupervisorException(error, {
            "lightcode.feature_area": "supervisor-runtime",
            "lightcode.provider": payload.agentKind,
          });
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
      browserMcp,
      subagentMcp,
      computerUse,
      chromeMcp,
      appControlsMcp,
    );
    const argv = payload.sessionRef
      ? adapter.buildResumeArgv(
          payload.projectLocation,
          payload.config,
          launchPrompt,
          payload.sessionRef,
          launchOptionsWithMcp,
        )
      : adapter.buildLaunchArgv(
          payload.projectLocation,
          payload.config,
          launchPrompt,
          payload.sessionRef,
          launchOptionsWithMcp,
        );

    // Append CLI hook plugin args (e.g. Claude `--settings <path>`); env vars
    // (`LIGHTCODE_HOOK_URL`, `LIGHTCODE_HOOK_SECRET`, `LIGHTCODE_THREAD_ID`,
    // `LIGHTCODE_AGENT_KIND`, `LIGHTCODE_HOOK_PROTOCOL_VERSION`) flow through
    // `spawnThread` → `agentEnv` so they end up in the PTY env on every
    // platform (WSL, win32, posix). Failure to resolve plugin extras silently
    // degrades to L2 — the supervisor must never block thread creation on
    // the hook-plugin plumbing.
    const cliHookExtras = await ctx.cliHookPlugin.resolveCliHookPluginExtras(
      payload.threadId,
      payload.agentKind,
      payload.projectLocation,
      payload.config,
      browserMcp,
      computerUse,
      chromeMcp,
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

  async restartThread(
    session: SessionRuntime,
    prompt: string,
    config: ThreadConfig,
  ): Promise<void> {
    const ctx = this.ctx;
    if (!session.sessionRef) {
      throw new Error("Session cannot be restarted without a known session reference.");
    }

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
    if (!ctx.isCurrentSession(session)) {
      return;
    }

    const mcpIdentity = { threadId: session.threadId };
    const browserMcp = await this.resolveBrowserMcpForLaunch(
      session.adapter,
      session.projectLocation,
      config,
      mcpIdentity,
    );
    const subagentMcp = await this.resolveSubagentMcpForLaunch(
      session.threadId,
      session.projectLocation,
      config,
    );
    const computerUse = this.resolveComputerUseMcpForLaunch(
      session.projectLocation,
      config,
      mcpIdentity,
    );
    const chromeMcp = this.resolveChromeMcpForLaunch(session.projectLocation, config, mcpIdentity);
    const appControlsMcp = await this.resolveAppControlsMcpForLaunch(
      session.projectLocation,
      mcpIdentity,
    );
    const structuredSession = await this.createStructuredSession(
      session.adapter,
      session.threadId,
      session.agentKind,
      session.projectLocation,
      config,
      browserMcp,
      subagentMcp,
      computerUse,
      chromeMcp,
      appControlsMcp,
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
        await structuredSession.openThread(config, session.sessionRef);
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
        ...(session.presentationMode ? { presentationMode: session.presentationMode } : {}),
      });
      if (prompt.trim().length > 0 && structuredSession.startTurn) {
        const optimisticItemId = ctx.emitOptimisticUserMessage(session.threadId, prompt);
        void structuredSession
          .startTurn(prompt, config, undefined, { userMessageItemId: optimisticItemId })
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
      config,
      browserMcp,
      computerUse,
      chromeMcp,
    );
    if (!ctx.isCurrentSession(session)) {
      await structuredSession?.dispose();
      return;
    }
    const argv = session.adapter.buildResumeArgv(
      session.projectLocation,
      config,
      launchPrompt,
      session.sessionRef,
      this.composeLaunchOptions(
        session.adapter,
        structuredSession?.launchOptions,
        browserMcp,
        subagentMcp,
        computerUse,
        chromeMcp,
        appControlsMcp,
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
    const cliHookEnvInjected = Boolean(input.extraEnv?.LIGHTCODE_HOOK_URL);
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
      projectLocation: input.projectLocation,
      config: input.config,
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

  /**
   * Fold the agent-settings, browser-MCP, and subagents-MCP launch options
   * into a structured session's base launch options. Every argv build site
   * (launch, resume, restart, invalid-ref recovery) uses this composition.
   */
  composeLaunchOptions(
    adapter: AgentAdapter,
    launchOptions: AgentLaunchOptions | undefined,
    browserMcp: BrowserMcpHttpConfig | undefined,
    subagentMcp: SubagentMcpHttpConfig | undefined,
    computerUse: ComputerUseMcpHttpConfig | undefined,
    chromeMcp: ChromeMcpHttpConfig | undefined,
    appControlsMcp: AppControlsMcpHttpConfig | undefined,
  ): AgentLaunchOptions {
    return {
      ...(launchOptions ?? {}),
      agentSettings: this.ctx.resolveAgentSettings(adapter),
      ...(browserMcp !== undefined ? { browserMcp } : {}),
      ...(subagentMcp !== undefined ? { subagentMcp } : {}),
      ...(computerUse !== undefined ? { computerUseMcp: computerUse } : {}),
      ...(chromeMcp !== undefined ? { chromeMcp } : {}),
      ...(appControlsMcp !== undefined ? { appControlsMcp } : {}),
    };
  }

  async resolveBrowserMcpForLaunch(
    adapter: AgentAdapter,
    location: ProjectLocation,
    config: ThreadConfig,
    identity?: McpThreadIdentity,
  ): Promise<BrowserMcpHttpConfig | undefined> {
    const enabled = this.ctx.isBrowserMcpEnabledForLaunch(adapter, config);
    if (!enabled) return undefined;
    const cfg = await resolveBrowserMcpHttpConfigForLaunch(
      location,
      enabled,
      this.ctx.options.wslBridge,
      identity,
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
    identity?: McpThreadIdentity,
  ): ComputerUseMcpHttpConfig | undefined {
    const enabled = config.computerUse === true;
    return resolveComputerUseMcpHttpConfigForLaunch(location, enabled, identity);
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
    identity?: McpThreadIdentity,
  ): ChromeMcpHttpConfig | undefined {
    const enabled = config.chromeMcp === true;
    return resolveChromeMcpHttpConfigForLaunch(location, enabled, identity);
  }

  resolveAppControlsMcpForLaunch(
    location: ProjectLocation,
    identity?: McpThreadIdentity,
  ): Promise<AppControlsMcpHttpConfig | undefined> {
    return resolveAppControlsMcpHttpConfigForLaunch(
      location,
      this.ctx.options.subagentMcpHostAccess,
      identity,
    );
  }

  /**
   * Resolve the subagents MCP http config for a launch when the thread opted
   * in (`config.subagentMcp === true`). Registers the thread with the ingress
   * (idempotent — reuses an existing token), then rewrites the loopback URL to
   * the WSL → host gateway IP for NAT-mode WSL projects (mirrored-mode WSL and
   * native projects pass through unchanged). Parallel to
   * `resolveBrowserMcpForLaunch`.
   */
  async resolveSubagentMcpForLaunch(
    threadId: string,
    location: ProjectLocation,
    config: ThreadConfig,
  ): Promise<SubagentMcpHttpConfig | undefined> {
    if (config.subagentMcp !== true) return undefined;
    const native = this.ctx.options.subagentMcp?.register(threadId);
    return resolveSubagentMcpHttpConfigForLaunch(
      native,
      location,
      this.ctx.options.subagentMcpHostAccess,
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
    browserMcp: BrowserMcpHttpConfig | undefined,
    subagentMcp: SubagentMcpHttpConfig | undefined,
    computerUse: ComputerUseMcpHttpConfig | undefined,
    chromeMcp: ChromeMcpHttpConfig | undefined,
    appControlsMcp: AppControlsMcpHttpConfig | undefined,
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
        ...(browserMcp ? { browserMcp } : {}),
        ...(subagentMcp ? { subagentMcp } : {}),
        ...(computerUse ? { computerUseMcp: computerUse } : {}),
        ...(chromeMcp ? { chromeMcp } : {}),
        ...(appControlsMcp ? { appControlsMcp } : {}),
        ...(sessionRef ? { sessionRef } : {}),
        ...(presentationMode ? { presentationMode } : {}),
      });
    } catch (error) {
      console.error("[supervisor] structured session creation failed:", error);
      captureSupervisorException(error, {
        "lightcode.feature_area": "supervisor-runtime",
        "lightcode.provider": agentKind,
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
