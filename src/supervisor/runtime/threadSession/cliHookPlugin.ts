import type {
  AgentEventEnvelope,
  AgentKind,
  ProjectLocation,
  ThreadAttention,
  ThreadConfig,
  ThreadStatus,
  McpLaunchSnapshot,
} from "@/shared/contracts";
import type { BrowserMcpHttpConfig } from "@/supervisor/agents/browserMcp";
import type { ComputerUseMcpHttpConfig } from "@/supervisor/agents/computerUseMcp";
import type { ChromeMcpHttpConfig } from "@/supervisor/agents/chromeMcp";
import { type AgentAdapter, createKnownSessionRef } from "../../agents/base";
import { hookDebugSpawn } from "../hookDebug";
import type { ThreadOutputPipeline } from "../threadOutputPipeline";
import type { SessionRuntime } from "../sessionTypes";
import { hookDebugProjectLabel } from "./helpers";
import type { ThreadSessionManagerOptions } from "./managerOptions";

export interface CliHookPluginContext {
  sessions: Map<string, SessionRuntime>;
  sessionsBySessionId: Map<string, SessionRuntime>;
  options: Pick<ThreadSessionManagerOptions, "adapters" | "resolvePluginEnvForSpawn">;
  outputPipeline: ThreadOutputPipeline;
  indexSessionRef(session: SessionRuntime, prevId: string | undefined): void;
  isBrowserMcpEnabledForLaunch(adapter: AgentAdapter | undefined, config: ThreadConfig): boolean;
}

/**
 * CLI hook plugin routing + spawn-time env/arg resolution. Owns the lookup of
 * live sessions for inbound hook envelopes, the application of hook-driven state
 * changes, and the resolution of the ingress env + extra CLI args injected at
 * spawn. Extracted from `ThreadSessionManager`; the manager keeps thin public
 * delegates so the routing surface stays reachable.
 */
export class CliHookSessionCoordinator {
  constructor(private readonly ctx: CliHookPluginContext) {}

  /**
   * Look up the live `SessionRuntime` for a CLI hook plugin envelope. Routing
   * precedence is `threadId` (PTY env, primary) → `sessionId`
   * (`providerSessionId` discovered after spawn, fallback for nested shells).
   */
  findSessionForCliHookPlugin(input: {
    threadId?: string;
    sessionId?: string;
  }): SessionRuntime | undefined {
    if (input.threadId) {
      const direct = this.ctx.sessions.get(input.threadId);
      if (direct) return direct;
    }
    if (input.sessionId) {
      const indexed = this.ctx.sessionsBySessionId.get(input.sessionId);
      if (indexed) return indexed;
      // Fallback: scan for late-arriving `sessionRef`s that haven't been
      // indexed yet (race between hook SessionStart and provider sessionRef
      // discovery). Sessions count is small; linear scan is fine.
      for (const session of this.ctx.sessions.values()) {
        if (session.sessionRef?.providerSessionId === input.sessionId) {
          this.ctx.sessionsBySessionId.set(input.sessionId, session);
          return session;
        }
      }
    }
    return undefined;
  }

  /** Apply a CLI hook plugin state change resolved by the dispatcher. */
  applyCliHookPluginState(
    session: SessionRuntime,
    change: {
      status: ThreadStatus;
      attention: ThreadAttention;
    },
  ): void {
    this.ctx.outputPipeline.applyCliHookPluginState(session, change);
  }

  /** Mark hook ownership for routed bookkeeping events that do not carry state. */
  noteCliHookPluginActivity(session: SessionRuntime, envelope?: AgentEventEnvelope): void {
    const nextId = envelope?.sessionId;
    if (nextId && !session.sessionRef) {
      session.sessionRef = createKnownSessionRef(nextId);
      session.canResumeWithConfig = true;
      this.ctx.indexSessionRef(session, undefined);
      session.stopSessionRefWatcher?.();
      session.stopSessionRefWatcher = undefined;
      this.ctx.outputPipeline.emitState(session);
    }
    this.ctx.outputPipeline.noteCliHookPluginActivity(session);
  }

  /**
   * Resolve the CLI hook plugin env + extra agent args that should be injected for
   * the given thread. Always returns a value so callers can splat
   * unconditionally; missing config produces an empty record/array.
   */
  async resolveCliHookPluginExtras(
    threadId: string,
    agentKind: AgentKind,
    projectLocation: ProjectLocation,
    config: ThreadConfig,
    browserMcp: BrowserMcpHttpConfig | undefined,
    computerUseMcp: ComputerUseMcpHttpConfig | undefined,
    chromeMcp: ChromeMcpHttpConfig | undefined,
    mcpLaunchSnapshot: McpLaunchSnapshot,
  ): Promise<{ env: Record<string, string>; extraArgs: string[] }> {
    const { mcpServers, disabledBuiltInMcpServerIds } = mcpLaunchSnapshot;
    const adapter = this.ctx.options.adapters.get(agentKind);
    const liveInputMode = adapter?.capabilities.liveInputMode ?? "terminal";

    if (!this.ctx.options.resolvePluginEnvForSpawn) {
      hookDebugSpawn({
        threadId,
        agentKind,
        project: hookDebugProjectLabel(projectLocation),
        mode: "L2",
        label: "terminal TUI parse only (no hook coordinator wired)",
        liveInputMode,
      });
      return { env: {}, extraArgs: [] };
    }
    try {
      const resolved = await this.ctx.options.resolvePluginEnvForSpawn({
        threadId,
        agentKind,
        projectLocation,
        // Browser enablement can come from agent settings, not just the
        // (already effective) thread config — gate the disable here too.
        browserMcpEnabled:
          !disabledBuiltInMcpServerIds.includes("browser") &&
          this.ctx.isBrowserMcpEnabledForLaunch(adapter, config),
        ...(browserMcp !== undefined ? { browserMcp } : {}),
        computerUseMcpEnabled: config.computerUse === true,
        ...(computerUseMcp !== undefined ? { computerUseMcp } : {}),
        chromeMcpEnabled: config.chromeMcp === true,
        ...(chromeMcp !== undefined ? { chromeMcp } : {}),
        ...(mcpServers.length > 0 ? { mcpServers } : {}),
      });
      const merged = resolved ?? { env: {}, extraArgs: [] };
      const hookUrl = merged.env.PORACODE_HOOK_URL;
      const hasHookEnv = Boolean(hookUrl);

      if (liveInputMode === "server") {
        hookDebugSpawn({
          threadId,
          agentKind,
          project: hookDebugProjectLabel(projectLocation),
          mode: "L2",
          label: "structured / ACP–style agent (status from control channel, not CLI hook plugin)",
          liveInputMode,
          hookEnvInjected: hasHookEnv,
        });
      } else if (hasHookEnv) {
        const viaWslBridge = projectLocation.kind === "wsl";
        hookDebugSpawn({
          threadId,
          agentKind,
          project: hookDebugProjectLabel(projectLocation),
          mode: "L1",
          label: viaWslBridge
            ? "CLI hook plugin → in-distro HTTP bridge (WSL) → supervisor"
            : "CLI hook plugin → host HookIngress → supervisor",
          liveInputMode,
          hookUrl,
          extraCliArgs: merged.extraArgs.length,
        });
      } else {
        hookDebugSpawn({
          threadId,
          agentKind,
          project: hookDebugProjectLabel(projectLocation),
          mode: "L2",
          label:
            "CLI hook plugin inactive for this spawn (install/cache/transport/node in WSL, or not a hook-capable agent)",
          liveInputMode,
          extraCliArgs: merged.extraArgs.length,
        });
      }

      return merged;
    } catch (error) {
      console.warn("[supervisor] CLI hook plugin env resolution failed:", error);
      hookDebugSpawn({
        threadId,
        agentKind,
        project: hookDebugProjectLabel(projectLocation),
        mode: "L2",
        label: "resolvePluginEnvForSpawn threw; falling back to terminal parse only",
        liveInputMode,
        error: error instanceof Error ? error.message : String(error),
      });
      return { env: {}, extraArgs: [] };
    }
  }
}
