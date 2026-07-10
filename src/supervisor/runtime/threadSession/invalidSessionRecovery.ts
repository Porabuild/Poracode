import type { ProjectLocation } from "@/shared/contracts";
import type { AgentArgvSpec, CommandSpec } from "../../agents/base";
import type { SessionRuntime } from "../sessionTypes";
import { applyLaunchArgsConfigRewrite, mergeCliHookExtraArgs } from "./cliHookArgs";
import type { CliHookSessionCoordinator } from "./cliHookPlugin";
import { shouldPrimeNativeProjectShellEnv } from "./helpers";
import type { PtyLifecycle } from "./ptyLifecycle";
import type { SpawnPipeline } from "./spawnPipeline";
import type { ThreadOutputPipeline } from "../threadOutputPipeline";

type RecoverySpawnPipeline = Pick<
  SpawnPipeline,
  | "resolveBrowserMcpForLaunch"
  | "resolveSubagentMcpForLaunch"
  | "resolveComputerUseMcpForLaunch"
  | "resolveChromeMcpForLaunch"
  | "composeLaunchOptions"
  | "spawnThread"
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

    const browserMcp = await context.spawnPipeline.resolveBrowserMcpForLaunch(
      session.adapter,
      session.projectLocation,
      session.config,
    );
    const subagentMcp = await context.spawnPipeline.resolveSubagentMcpForLaunch(
      session.threadId,
      session.projectLocation,
      session.config,
    );
    const computerUse = context.spawnPipeline.resolveComputerUseMcpForLaunch(
      session.projectLocation,
      session.config,
      { threadId: session.threadId },
    );
    const chromeMcp = context.spawnPipeline.resolveChromeMcpForLaunch(
      session.projectLocation,
      session.config,
      { threadId: session.threadId },
    );
    const cliHookExtras = await context.cliHookPlugin.resolveCliHookPluginExtras(
      session.threadId,
      session.agentKind,
      session.projectLocation,
      session.config,
      browserMcp,
      computerUse,
      chromeMcp,
    );
    if (!context.isCurrentSession(session)) {
      return;
    }

    const argv = session.adapter.buildLaunchArgv(
      session.projectLocation,
      session.config,
      session.launchPrompt,
      undefined,
      context.spawnPipeline.composeLaunchOptions(
        session.adapter,
        undefined,
        browserMcp,
        subagentMcp,
        computerUse,
        chromeMcp,
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
      projectLocation: session.projectLocation,
      config: session.config,
      initialSize: session.terminalSize,
      launchPrompt: session.launchPrompt,
      command,
      ...(Object.keys(cliHookExtras.env).length > 0 ? { extraEnv: cliHookExtras.env } : {}),
    });
  }
}
