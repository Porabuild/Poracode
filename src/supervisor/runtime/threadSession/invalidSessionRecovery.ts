import { toError } from "@/shared/errorMessage";
import type { ProjectLocation } from "@/shared/contracts";
import type { AgentArgvSpec, Awaitable, CommandSpec } from "../../agents/base";
import { acquireOrHandoff, type HostResourceAdmission } from "../hostResourceAdmission";
import type { SessionRuntime } from "../sessionTypes";
import { applyLaunchArgsConfigRewrite, mergeCliHookExtraArgs } from "./cliHookArgs";
import type { CliHookSessionCoordinator } from "./cliHookPlugin";
import { shouldPrimeNativeProjectShellEnv } from "./helpers";
import type { PtyLifecycle } from "./ptyLifecycle";
import type { SessionRetirement } from "./sessionRetirement";
import { workspaceLaunchConfig, resolveThreadExecution, type SpawnPipeline } from "./spawnPipeline";
import { effectiveProjectLocation, withLogicalProjectLocation } from "../sessionTypes";
import type { ThreadOutputPipeline } from "../threadOutputPipeline";

type RecoverySpawnPipeline = Pick<
  SpawnPipeline,
  "resolveMcpLaunchConfig" | "resolveMcpServersForLaunch" | "composeLaunchOptions" | "spawnThread"
>;

export interface InvalidSessionRecoveryContext {
  spawnPipeline: RecoverySpawnPipeline;
  cliHookPlugin: Pick<CliHookSessionCoordinator, "resolveCliHookPluginExtras">;
  outputPipeline: Pick<ThreadOutputPipeline, "clearSessionTimers">;
  ptyLifecycle: Pick<PtyLifecycle, "kill">;
  /** Host execution-slot owner (absent only in focused harnesses). */
  admission?: HostResourceAdmission;
  /**
   * Shared join/retry retirement. A rejecting structured dispose never skips
   * PTY termination, and an unconfirmed exit cannot start a successor.
   */
  retirement: Pick<SessionRetirement, "retireAgentSession">;
  isCurrentSession(session: SessionRuntime): boolean;
  failStructuredSession(session: SessionRuntime, error: unknown): void;
  settleAfterStructuredDispose(): Promise<void>;
  primeProjectShellEnv(cwd: string): Promise<unknown>;
  resolveLaunchSpec(location: ProjectLocation, argv: AgentArgvSpec): Awaitable<CommandSpec>;
}

/**
 * Replaces a terminal session whose provider-native resume id is no longer
 * valid. Each session gets at most one recovery, and callers can await that
 * exact in-flight attempt instead of polling for its side effects.
 */
export class InvalidSessionRecoveryCoordinator {
  private readonly recoveries = new WeakMap<SessionRuntime, Promise<void>>();

  constructor(private readonly context: InvalidSessionRecoveryContext) {}

  recover(session: SessionRuntime): Promise<void> {
    const existing = this.recoveries.get(session);
    if (existing) return existing;
    if (!session.sessionRef) {
      return Promise.resolve();
    }

    const recovery = this.recoverOnce(session);
    this.recoveries.set(session, recovery);
    void recovery.catch((error: unknown) => {
      if (this.context.isCurrentSession(session)) {
        this.context.failStructuredSession(session, error);
      }
    });
    return recovery;
  }

  private async recoverOnce(session: SessionRuntime): Promise<void> {
    const context = this.context;
    if (!context.isCurrentSession(session)) {
      return;
    }
    // Admit before teardown: at capacity the refusal leaves the invalid
    // session untouched instead of tearing it down with no successor slot.
    const lease = context.admission
      ? acquireOrHandoff(context.admission, session.resourceLease, {
          resourceClass: "agent-session",
          key: session.threadId,
        })
      : undefined;
    const mcpLaunchSnapshot = session.mcpLaunchSnapshot;

    session.ignoreExit = true;
    context.outputPipeline.clearSessionTimers(session);
    session.stopSessionRefWatcher?.();
    session.stopSessionRefWatcher = undefined;
    const retirement = await context.retirement.retireAgentSession(session);
    if (retirement.error) {
      lease?.cancel();
      throw toError(retirement.error);
    }
    if (!retirement.confirmed) {
      // Unconfirmed exit: no successor may start; the retiring predecessor
      // keeps the slot counted until its exit is observed.
      lease?.cancel();
      throw new Error(
        `Thread ${session.threadId} retirement was not confirmed; invalid-session recovery did not start a successor.`,
      );
    }

    if (!context.isCurrentSession(session)) {
      lease?.cancel();
      return;
    }

    // Re-resolve the execution location (persisted WSL pin / distro moves)
    // instead of reusing a potentially stale cached project location.
    if (session.logicalProjectLocation) {
      const resolved = await resolveThreadExecution(session.logicalProjectLocation, session.config);
      session.projectLocation = resolved.location;
      session.config = resolved.config;
    }
    const launchConfig = context.spawnPipeline.resolveMcpLaunchConfig(
      workspaceLaunchConfig(
        session.projectLocation,
        session.config,
        session.adapter,
        mcpLaunchSnapshot.disabledBuiltInMcpServerIds,
        mcpLaunchSnapshot.pluginBuiltInMcpServerIds,
        effectiveProjectLocation(session),
      ),
      mcpLaunchSnapshot,
      session.adapter,
      session.threadId,
      session.projectLocation,
    );
    const resolvedMcpServers = await context.spawnPipeline.resolveMcpServersForLaunch({
      location: session.projectLocation,
      config: launchConfig,
      mcpLaunchSnapshot,
      identity: { threadId: session.threadId },
      crossagentThreadId: session.threadId,
      adapter: session.adapter,
    });
    const cliHookExtras = await context.cliHookPlugin.resolveCliHookPluginExtras(
      session.threadId,
      session.agentKind,
      session.projectLocation,
      resolvedMcpServers,
    );
    if (!context.isCurrentSession(session)) {
      lease?.cancel();
      return;
    }

    const argv = await session.adapter.buildLaunchArgv(
      session.projectLocation,
      launchConfig,
      session.launchPrompt,
      undefined,
      context.spawnPipeline.composeLaunchOptions(
        session.adapter,
        undefined,
        resolvedMcpServers,
        session.projectLocation,
      ),
    );
    let command: CommandSpec;
    try {
      if (cliHookExtras.extraArgs.length > 0) {
        argv.args = mergeCliHookExtraArgs(
          session.adapter,
          argv.args,
          cliHookExtras.extraArgs,
          session.launchPrompt,
        );
      }
      argv.args = await applyLaunchArgsConfigRewrite(
        session.adapter,
        argv.args,
        session.config,
        session.projectLocation,
      );
      if (shouldPrimeNativeProjectShellEnv(session.projectLocation)) {
        await context.primeProjectShellEnv(session.projectLocation.path);
      }
      if (!context.isCurrentSession(session)) {
        await argv.cleanup?.();
        lease?.cancel();
        return;
      }
      command = await context.resolveLaunchSpec(session.projectLocation, argv);
    } catch (error) {
      await argv.cleanup?.();
      lease?.cancel();
      throw error;
    }
    if (!context.isCurrentSession(session)) {
      await command.cleanup?.();
      lease?.cancel();
      return;
    }

    try {
      context.spawnPipeline.spawnThread({
        threadId: session.threadId,
        agentKind: session.agentKind,
        adapter: session.adapter,
        ...withLogicalProjectLocation(session),
        projectLocation: session.projectLocation,
        config: session.config,
        initialSize: session.terminalSize,
        launchPrompt: session.launchPrompt,
        command,
        mcpLaunchSnapshot,
        launchConfig,
        ...(lease ? { resourceLease: lease } : {}),
        ...(session.nativePlugins ? { nativePlugins: session.nativePlugins } : {}),
        ...(Object.keys(cliHookExtras.env).length > 0 ? { extraEnv: cliHookExtras.env } : {}),
      });
    } catch (error) {
      await command.cleanup?.();
      lease?.cancel();
      throw error;
    }
  }
}
