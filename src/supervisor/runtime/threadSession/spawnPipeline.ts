import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { spawn } from "node-pty";
import {
  BUILT_IN_MCP_SERVER_IDS,
  type AgentKind,
  type BuiltInMcpDisabledTools,
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
  resolveEnabledMcpServers,
} from "@/shared/contracts";
import type { McpThreadIdentity } from "@/shared/browserMcpThread";
import {
  isBuiltInMcpServerSupportedForLaunch,
  PLUGIN_MCP_CONFIG_ENTRIES,
} from "@/shared/plugins/catalog";
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
import type { PluginManagedConfigKey, SessionRuntime } from "../sessionTypes";
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
  runtimeLaunchConfig?: ThreadConfig;
  invariantDisabledBuiltInMcpServerIds?: BuiltInMcpServerId[];
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

export interface ResolvedLaunchConfig {
  pluginConfig: ThreadConfig;
  pluginDisabledConfigKeys: PluginManagedConfigKey[];
  launchConfig: ThreadConfig;
  disabledBuiltInMcpServerIds: BuiltInMcpServerId[];
  disabledBuiltInMcpTools: BuiltInMcpDisabledTools;
}

interface RestartThreadOptions {
  segments?: PromptSegment[];
  policySegments?: PromptSegment[];
  userMessageItemId?: string;
  inlineInstructions?: string;
  resolvedLaunchConfig?: ResolvedLaunchConfig;
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
  for (const [serverId, key] of PLUGIN_MCP_CONFIG_ENTRIES) {
    if (disabledBuiltInMcpServerIds.includes(serverId)) next[key] = false;
  }
  return next;
}

export function mergeBuiltInMcpDisabledTools(
  ...policies: Array<BuiltInMcpDisabledTools | undefined>
): BuiltInMcpDisabledTools {
  const merged: BuiltInMcpDisabledTools = {};
  for (const id of BUILT_IN_MCP_SERVER_IDS) {
    const tools = new Set(policies.flatMap((policy) => policy?.[id] ?? []));
    if (tools.size > 0) merged[id] = [...tools];
  }
  return merged;
}

export function resolveAttachedAppLaunchConfig(
  launchConfig: ThreadConfig,
  attached: {
    browserMcp: boolean;
    subagentMcp: boolean;
    computerUse: boolean;
    chromeMcp: boolean;
  },
): ThreadConfig {
  const next = { ...launchConfig };
  for (const [key, isAttached] of Object.entries(attached) as Array<
    [PluginManagedConfigKey, boolean]
  >) {
    if (isAttached) {
      next[key] = true;
    } else if (launchConfig[key] !== false) {
      delete next[key];
    }
  }
  return next;
}

/**
 * Reapply launch-only plugin flags when a structured provider receives a later
 * turn config. Providers retain that config for operations such as rollback,
 * while the session itself continues to store only the user's base choices.
 */
export function effectiveStructuredTurnConfig(
  session: Pick<SessionRuntime, "runtimeLaunchConfig">,
  config: ThreadConfig,
): ThreadConfig {
  const next = { ...config };
  for (const [, key] of PLUGIN_MCP_CONFIG_ENTRIES) {
    const value = session.runtimeLaunchConfig[key];
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return next;
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

  applyPluginAppsForLaunch(
    config: ThreadConfig,
    adapter: AgentAdapter,
    projectLocation: ProjectLocation,
    presentationMode: ThreadPresentationMode,
  ): {
    pluginConfig: ThreadConfig;
    pluginDisabledConfigKeys: PluginManagedConfigKey[];
  } {
    const applied = this.ctx.options.applyPluginAppsToConfig?.(config, {
      capabilities: adapter.capabilities,
      presentationMode,
      projectLocation,
    });
    const pluginConfig = applied?.config ?? config;
    return {
      pluginConfig,
      pluginDisabledConfigKeys: applied?.disabledConfigKeys ?? [],
    };
  }

  resolveConfigForLaunch(
    config: ThreadConfig,
    adapter: AgentAdapter,
    projectLocation: ProjectLocation,
    presentationMode: ThreadPresentationMode,
    disabledBuiltInMcpServerIds: readonly BuiltInMcpServerId[],
    disabledBuiltInMcpTools: BuiltInMcpDisabledTools = {},
  ): ResolvedLaunchConfig {
    const applied = this.applyPluginAppsForLaunch(
      config,
      adapter,
      projectLocation,
      presentationMode,
    );
    let launchConfig = effectiveLaunchConfig(applied.pluginConfig, disabledBuiltInMcpServerIds);
    const launchContext = {
      capabilities: adapter.capabilities,
      presentationMode,
      projectLocation,
      hostPlatform: process.platform,
    };
    for (const [serverId, key] of PLUGIN_MCP_CONFIG_ENTRIES) {
      if (
        launchConfig[key] === true &&
        !isBuiltInMcpServerSupportedForLaunch(serverId, launchContext)
      ) {
        launchConfig = { ...launchConfig, [key]: false };
      }
    }
    if (
      !disabledBuiltInMcpServerIds.includes("browser") &&
      !applied.pluginDisabledConfigKeys.includes("browserMcp") &&
      isBuiltInMcpServerSupportedForLaunch("browser", launchContext) &&
      this.ctx.isBrowserMcpEnabledForLaunch(adapter, launchConfig) &&
      launchConfig.browserMcp !== true
    ) {
      launchConfig = { ...launchConfig, browserMcp: true };
    }
    return {
      ...applied,
      launchConfig,
      disabledBuiltInMcpServerIds: [...disabledBuiltInMcpServerIds],
      disabledBuiltInMcpTools,
    };
  }

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
    const disabledBuiltInMcpServerIds = [
      ...new Set([
        ...(payload.disabledBuiltInMcpServerIds ?? []),
        ...(payload.invariantDisabledBuiltInMcpServerIds ?? []),
        ...(ctx.options.readDisabledBuiltInMcpServerIds?.() ?? []),
      ]),
    ];
    const disabledBuiltInMcpTools = mergeBuiltInMcpDisabledTools(
      payload.disabledBuiltInMcpTools,
      ctx.options.readDisabledBuiltInMcpTools?.(),
    );
    const { pluginDisabledConfigKeys: disabledConfigKeys, launchConfig } =
      this.resolveConfigForLaunch(
        payload.config,
        adapter,
        payload.projectLocation,
        requestedPresentation,
        disabledBuiltInMcpServerIds,
        disabledBuiltInMcpTools,
      );
    const trustedSegments = payload.segments
      ? ((await ctx.options.filterPluginSkillSegments?.(payload.segments, {
          projectLocation: payload.projectLocation,
          agentKind: payload.agentKind,
          presentationMode: requestedPresentation,
          launchConfig,
        })) ?? payload.segments)
      : undefined;
    const pluginSegmentsFiltered = trustedSegments !== payload.segments;
    const wslSegments = trustedSegments
      ? await rewriteSegmentsForWsl(trustedSegments, payload.projectLocation, {
          preserveImageAttachments: useStructuredFlow,
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
        : pluginSegmentsFiltered
          ? ""
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
      disabledBuiltInMcpServerIds,
      disabledBuiltInMcpTools,
    };
    const browserMcp = await this.resolveBrowserMcpForLaunch(
      adapter,
      payload.projectLocation,
      launchConfig,
      mcpLaunchSnapshot,
      mcpIdentity,
      disabledConfigKeys,
    );
    const subagentMcp = await this.resolveSubagentMcpForLaunch(
      payload.threadId,
      payload.projectLocation,
      launchConfig,
      mcpLaunchSnapshot,
    );
    const computerUse = this.resolveComputerUseMcpForLaunch(
      payload.projectLocation,
      launchConfig,
      mcpLaunchSnapshot,
      mcpIdentity,
    );
    const chromeMcp = this.resolveChromeMcpForLaunch(
      payload.projectLocation,
      launchConfig,
      mcpLaunchSnapshot,
      mcpIdentity,
    );
    const appControlsMcp = await this.resolveAppControlsMcpForLaunch(
      payload.projectLocation,
      mcpLaunchSnapshot,
      mcpIdentity,
    );
    const runtimeLaunchConfig = resolveAttachedAppLaunchConfig(launchConfig, {
      browserMcp: browserMcp !== undefined,
      subagentMcp: subagentMcp !== undefined,
      computerUse: computerUse !== undefined,
      chromeMcp: chromeMcp !== undefined,
    });
    await this.assertPluginSkillAppsAttached(
      trustedSegments,
      payload.projectLocation,
      payload.agentKind,
      requestedPresentation,
      runtimeLaunchConfig,
    );
    const structuredSession = await this.createStructuredSession(
      adapter,
      payload.threadId,
      payload.agentKind,
      payload.projectLocation,
      runtimeLaunchConfig,
      browserMcp,
      subagentMcp,
      computerUse,
      chromeMcp,
      appControlsMcp,
      mcpLaunchSnapshot,
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
          runtimeLaunchConfig,
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
        runtimeLaunchConfig,
        ...(payload.invariantDisabledBuiltInMcpServerIds?.length
          ? {
              invariantDisabledBuiltInMcpServerIds: payload.invariantDisabledBuiltInMcpServerIds,
            }
          : {}),
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
            runtimeLaunchConfig,
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
          runtimeLaunchConfig,
          effectiveSegments,
          inlineSkillInstructions ? { inlineInstructions: inlineSkillInstructions } : undefined,
        )
        .catch((error) => {
          console.error("[supervisor] initial turn failed:", error);
          captureSupervisorException(error, {
            "poracode.feature_area": "supervisor-runtime",
            "poracode.provider": payload.agentKind,
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

    const deferToTerminal = adapter.shouldDeferPromptToTerminal?.(runtimeLaunchConfig) ?? false;
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
      mcpLaunchSnapshot,
    );
    const argv = payload.sessionRef
      ? adapter.buildResumeArgv(
          payload.projectLocation,
          runtimeLaunchConfig,
          launchPrompt,
          payload.sessionRef,
          launchOptionsWithMcp,
        )
      : adapter.buildLaunchArgv(
          payload.projectLocation,
          runtimeLaunchConfig,
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
      runtimeLaunchConfig,
      browserMcp,
      computerUse,
      chromeMcp,
      mcpLaunchSnapshot,
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
      runtimeLaunchConfig,
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
      runtimeLaunchConfig,
      ...(payload.invariantDisabledBuiltInMcpServerIds?.length
        ? {
            invariantDisabledBuiltInMcpServerIds: payload.invariantDisabledBuiltInMcpServerIds,
          }
        : {}),
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
            const preInputs = adapter.buildTerminalPreInputs?.(runtimeLaunchConfig);
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
    options: RestartThreadOptions = {},
  ): Promise<void> {
    const ctx = this.ctx;
    if (!session.sessionRef) {
      throw new Error("Session cannot be restarted without a known session reference.");
    }
    const isServerControlled = session.adapter.capabilities.liveInputMode === "server";
    const presentationMode =
      session.presentationMode ?? session.adapter.capabilities.presentationMode;
    const usesTerminalPresentation = presentationMode === "terminal";
    const useStructuredFlow = isServerControlled || !usesTerminalPresentation;
    const disabledBuiltInMcpServerIds = options.resolvedLaunchConfig
      ?.disabledBuiltInMcpServerIds ?? [
      ...new Set([
        ...(session.invariantDisabledBuiltInMcpServerIds ?? []),
        ...(ctx.options.readDisabledBuiltInMcpServerIds?.() ??
          session.mcpLaunchSnapshot.disabledBuiltInMcpServerIds),
      ]),
    ];
    const disabledBuiltInMcpTools =
      options.resolvedLaunchConfig?.disabledBuiltInMcpTools ??
      ctx.options.readDisabledBuiltInMcpTools?.() ??
      session.mcpLaunchSnapshot.disabledBuiltInMcpTools ??
      {};
    const resolvedLaunchConfig =
      options.resolvedLaunchConfig ??
      this.resolveConfigForLaunch(
        config,
        session.adapter,
        session.projectLocation,
        presentationMode,
        disabledBuiltInMcpServerIds,
        disabledBuiltInMcpTools,
      );
    const mcpLaunchSnapshot: McpLaunchSnapshot = {
      ...session.mcpLaunchSnapshot,
      disabledBuiltInMcpServerIds: resolvedLaunchConfig.disabledBuiltInMcpServerIds,
      disabledBuiltInMcpTools: resolvedLaunchConfig.disabledBuiltInMcpTools,
    };
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
    const { pluginDisabledConfigKeys: disabledConfigKeys, launchConfig } = resolvedLaunchConfig;
    const browserMcp = await this.resolveBrowserMcpForLaunch(
      session.adapter,
      session.projectLocation,
      launchConfig,
      mcpLaunchSnapshot,
      mcpIdentity,
      disabledConfigKeys,
    );
    const subagentMcp = await this.resolveSubagentMcpForLaunch(
      session.threadId,
      session.projectLocation,
      launchConfig,
      mcpLaunchSnapshot,
    );
    const computerUse = this.resolveComputerUseMcpForLaunch(
      session.projectLocation,
      launchConfig,
      mcpLaunchSnapshot,
      mcpIdentity,
    );
    const chromeMcp = this.resolveChromeMcpForLaunch(
      session.projectLocation,
      launchConfig,
      mcpLaunchSnapshot,
      mcpIdentity,
    );
    const appControlsMcp = await this.resolveAppControlsMcpForLaunch(
      session.projectLocation,
      mcpLaunchSnapshot,
      mcpIdentity,
    );
    const runtimeLaunchConfig = resolveAttachedAppLaunchConfig(launchConfig, {
      browserMcp: browserMcp !== undefined,
      subagentMcp: subagentMcp !== undefined,
      computerUse: computerUse !== undefined,
      chromeMcp: chromeMcp !== undefined,
    });
    await this.assertPluginSkillAppsAttached(
      options.policySegments ?? options.segments,
      session.projectLocation,
      session.agentKind,
      presentationMode,
      runtimeLaunchConfig,
    );
    const structuredSession = await this.createStructuredSession(
      session.adapter,
      session.threadId,
      session.agentKind,
      session.projectLocation,
      runtimeLaunchConfig,
      browserMcp,
      subagentMcp,
      computerUse,
      chromeMcp,
      appControlsMcp,
      mcpLaunchSnapshot,
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
        await structuredSession.openThread(runtimeLaunchConfig, session.sessionRef);
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
        runtimeLaunchConfig,
        ...(session.invariantDisabledBuiltInMcpServerIds?.length
          ? {
              invariantDisabledBuiltInMcpServerIds: session.invariantDisabledBuiltInMcpServerIds,
            }
          : {}),
        initialSize: session.terminalSize,
        launchPrompt: "",
        structuredSession,
        sessionRef: session.sessionRef,
        mcpLaunchSnapshot,
        ...(session.presentationMode ? { presentationMode: session.presentationMode } : {}),
      });
      if (prompt.trim().length > 0 && structuredSession.startTurn) {
        const optimisticItemId =
          options.userMessageItemId ??
          ctx.emitOptimisticUserMessage(session.threadId, prompt, options.segments);
        void structuredSession
          .startTurn(prompt, runtimeLaunchConfig, options.segments, {
            userMessageItemId: optimisticItemId,
            ...(options.inlineInstructions
              ? { inlineInstructions: options.inlineInstructions }
              : {}),
          })
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
      runtimeLaunchConfig,
      browserMcp,
      computerUse,
      chromeMcp,
      mcpLaunchSnapshot,
    );
    if (!ctx.isCurrentSession(session)) {
      await structuredSession?.dispose();
      return;
    }
    const argv = session.adapter.buildResumeArgv(
      session.projectLocation,
      runtimeLaunchConfig,
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
        mcpLaunchSnapshot,
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
      runtimeLaunchConfig,
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

    const restarted = this.spawnThread({
      threadId: session.threadId,
      agentKind: session.agentKind,
      adapter: session.adapter,
      projectLocation: session.projectLocation,
      config,
      runtimeLaunchConfig,
      ...(session.invariantDisabledBuiltInMcpServerIds?.length
        ? {
            invariantDisabledBuiltInMcpServerIds: session.invariantDisabledBuiltInMcpServerIds,
          }
        : {}),
      initialSize: session.terminalSize,
      launchPrompt,
      command,
      ...(Object.keys(cliHookExtras.env).length > 0 ? { extraEnv: cliHookExtras.env } : {}),
      ...(keepStructuredSession ? { structuredSession } : {}),
      sessionRef: session.sessionRef,
      mcpLaunchSnapshot,
      ...(session.presentationMode ? { presentationMode: session.presentationMode } : {}),
    });
    if (useStructuredFlow && prompt.trim().length > 0 && structuredSession?.startTurn) {
      const turnOptions = {
        ...(options.userMessageItemId ? { userMessageItemId: options.userMessageItemId } : {}),
        ...(options.inlineInstructions ? { inlineInstructions: options.inlineInstructions } : {}),
      };
      void structuredSession
        .startTurn(
          prompt,
          runtimeLaunchConfig,
          options.segments,
          Object.keys(turnOptions).length > 0 ? turnOptions : undefined,
        )
        .catch((error) => {
          if (ctx.sessions.get(restarted.threadId)?.instanceId !== restarted.instanceId) {
            return;
          }
          ctx.failStructuredSession(restarted, error);
        });
    }
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
      runtimeLaunchConfig: input.runtimeLaunchConfig ?? input.config,
      ...(input.invariantDisabledBuiltInMcpServerIds
        ? {
            invariantDisabledBuiltInMcpServerIds: input.invariantDisabledBuiltInMcpServerIds,
          }
        : {}),
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

  private async assertPluginSkillAppsAttached(
    segments: PromptSegment[] | undefined,
    projectLocation: ProjectLocation,
    agentKind: AgentKind,
    presentationMode: ThreadPresentationMode,
    runtimeLaunchConfig: ThreadConfig,
  ): Promise<void> {
    if (!segments?.some((segment) => segment.kind === "skill")) return;
    const filtered = await this.ctx.options.filterPluginSkillSegments?.(segments, {
      projectLocation,
      agentKind,
      presentationMode,
      launchConfig: runtimeLaunchConfig,
    });
    if (filtered && filtered !== segments) {
      throw new Error("A required plugin App could not be attached for this thread.");
    }
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
    mcpLaunchSnapshot: McpLaunchSnapshot,
  ): AgentLaunchOptions {
    const { mcpServers } = mcpLaunchSnapshot;
    return {
      ...(launchOptions ?? {}),
      agentSettings: this.ctx.resolveAgentSettings(adapter),
      ...(browserMcp !== undefined ? { browserMcp } : {}),
      ...(subagentMcp !== undefined ? { subagentMcp } : {}),
      ...(computerUse !== undefined ? { computerUseMcp: computerUse } : {}),
      ...(chromeMcp !== undefined ? { chromeMcp } : {}),
      ...(appControlsMcp !== undefined ? { appControlsMcp } : {}),
      ...(mcpServers.length > 0 ? { mcpServers } : {}),
    };
  }

  async resolveBrowserMcpForLaunch(
    adapter: AgentAdapter,
    location: ProjectLocation,
    config: ThreadConfig,
    mcpLaunchSnapshot: McpLaunchSnapshot,
    identity?: McpThreadIdentity,
    pluginDisabledConfigKeys: readonly PluginManagedConfigKey[] = [],
  ): Promise<BrowserMcpHttpConfig | undefined> {
    if (
      mcpLaunchSnapshot.disabledBuiltInMcpServerIds.includes("browser") ||
      pluginDisabledConfigKeys.includes("browserMcp")
    ) {
      return undefined;
    }
    const enabled = this.ctx.isBrowserMcpEnabledForLaunch(adapter, config);
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
    return resolveAppControlsMcpHttpConfigForLaunch(
      location,
      this.ctx.options.subagentMcpHostAccess,
      {
        ...identity,
        disabledTools: mcpLaunchSnapshot.disabledBuiltInMcpTools?.["app-controls"] ?? [],
      },
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
    mcpLaunchSnapshot: McpLaunchSnapshot,
  ): Promise<SubagentMcpHttpConfig | undefined> {
    if (config.subagentMcp !== true) return undefined;
    const native = this.ctx.options.subagentMcp?.register(
      threadId,
      mcpLaunchSnapshot.disabledBuiltInMcpTools?.subagents ?? [],
    );
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
    mcpLaunchSnapshot: McpLaunchSnapshot,
    mcpIdentity: McpThreadIdentity | undefined,
    sessionRef?: SessionRef,
    presentationMode?: ThreadPresentationMode,
  ): Promise<StructuredSessionHandle | undefined> {
    const { mcpServers } = mcpLaunchSnapshot;
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
        ...(mcpServers.length > 0 ? { mcpServers } : {}),
        ...(sessionRef ? { sessionRef } : {}),
        ...(presentationMode ? { presentationMode } : {}),
      });
    } catch (error) {
      console.error("[supervisor] structured session creation failed:", error);
      captureSupervisorException(error, {
        "poracode.feature_area": "supervisor-runtime",
        "poracode.provider": agentKind,
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
