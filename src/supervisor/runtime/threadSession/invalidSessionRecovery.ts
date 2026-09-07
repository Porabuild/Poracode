import type { ProjectLocation } from "@/shared/contracts";
import type { AgentArgvSpec, CommandSpec } from "../../agents/base";
import type { SessionRuntime } from "../sessionTypes";
import { applyLaunchArgsConfigRewrite, mergeCliHookExtraArgs } from "./cliHookArgs";
import type { CliHookSessionCoordinator } from "./cliHookPlugin";
import { shouldPrimeNativeProjectShellEnv } from "./helpers";
import type { PtyLifecycle } from "./ptyLifecycle";
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
  isCurrentSession(session: SessionRuntime): boolean;
  failStructuredSession(session: SessionRuntime, error: unknown): void;
  settleAfterStructuredDispose(): Promise<void>;
  primeProjectShellEnv(cwd: string): Promise<unknown>;
  resolveLaunchSpec(location: ProjectLocation, argv: AgentArgvSpec): CommandSpec;
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
    const mcpLaunchSnapshot = session.mcpLaunchSnapshot;

    session.ignoreExit = true;
    context.outputPipeline.clearSessionTimers(session);
    session.stopSessionRefWatcher?.();
    session.stopSessionRefWatcher = undefined;
    await session.structuredSession?.dispose();
    if (session.structuredSession) {
      await context.settleAfterStructuredDispose();
    }
    context.ptyLifecycle.kill(session);

    if (!context.isCurrentSession(session)) {
      return;
    }

    // Re-resolve the execution location (WSL fallback pin / distro moves)
    // instead of reusing a potentially stale cached project location.
    if (session.logicalProjectLocation) {
      const resolved = await resolveThreadExecution(
        session.adapter,
        session.logicalProjectLocation,
        session.config,
      );
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
      return;
    }

    const argv = session.adapter.buildLaunchArgv(
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
      return;
    }
    const command = context.resolveLaunchSpec(session.projectLocation, argv);

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
      ...(session.nativePlugins ? { nativePlugins: session.nativePlugins } : {}),
      ...(Object.keys(cliHookExtras.env).length > 0 ? { extraEnv: cliHookExtras.env } : {}),
    });
  }
}
