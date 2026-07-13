import {
  areAgentSlashCommandsEqual,
  isThreadConfigEqual,
  type RuntimeEvent,
} from "@/shared/contracts";
import type { StructuredSessionUpdate } from "../../agents/base";
import { captureSupervisorException } from "../../diagnostics/sentry";
import type { SessionRuntime } from "../sessionTypes";
import type { ThreadOutputPipeline } from "../threadOutputPipeline";
import { shouldReleaseInitialStructuredIdleSuppression } from "./helpers";
import type { ThreadSessionManagerOptions } from "./managerOptions";
import type { PtyLifecycle } from "./ptyLifecycle";
import type { RuntimeEventRouter } from "./runtimeEventRouter";
import { type SteerCoordinator, isSteerDrainableStatus } from "./steerCoordinator";
import type { StructuredInterruptWatchdog } from "./structuredInterruptWatchdog";

export interface SessionRuntimeLifecycleContext {
  sessions: Map<string, SessionRuntime>;
  sessionsBySessionId: Map<string, SessionRuntime>;
  ptyLifecycle: Pick<PtyLifecycle, "track" | "resolveExit" | "kill">;
  outputPipeline: Pick<
    ThreadOutputPipeline,
    "emitState" | "updateState" | "handlePtyData" | "clearSessionTimers"
  >;
  runtimeEventRouter: Pick<RuntimeEventRouter, "flush" | "append">;
  steerCoordinator: Pick<SteerCoordinator, "maybeDrainPendingSteer">;
  structuredInterruptWatchdog: Pick<
    StructuredInterruptWatchdog,
    "clearStructuredInterruptWatchdog" | "touchStructuredInterruptWatchdog"
  >;
  emit: ThreadSessionManagerOptions["emit"];
  isCurrentSession(session: SessionRuntime): boolean;
  failStructuredSession(session: SessionRuntime, error: unknown): void;
  indexSessionRef(session: SessionRuntime, prevId: string | undefined): void;
  pollSessionRefDiscovery(session: SessionRuntime): void;
}

/** Registers a newly-created runtime and owns its structured-session / PTY event bindings. */
export class SessionRuntimeLifecycle {
  constructor(private readonly context: SessionRuntimeLifecycleContext) {}

  attach(session: SessionRuntime): void {
    const context = this.context;
    context.sessions.set(session.threadId, session);
    if (session.pty) {
      context.ptyLifecycle.track(session);
    }
    if (session.sessionRef?.providerSessionId) {
      context.sessionsBySessionId.set(session.sessionRef.providerSessionId, session);
    }
    context.outputPipeline.emitState(session);
    if (
      session.pty &&
      !session.sessionRef &&
      !session.sessionRefDiscoveryStarted &&
      session.adapter.discoverSessionRef
    ) {
      session.sessionRefDiscoveryStarted = true;
      context.pollSessionRefDiscovery(session);
    }

    this.bindStructuredSession(session);
    this.bindPty(session);
  }

  private canHandleStructuredEvent(session: SessionRuntime): boolean {
    return this.context.isCurrentSession(session) && !session.ignoreExit;
  }

  private bindStructuredSession(session: SessionRuntime): void {
    session.structuredSession?.setListener({
      onClose: () => {
        if (!this.canHandleStructuredEvent(session)) return;
        this.handleStructuredSessionClosed(session);
      },
      onError: (errorMessage) => {
        if (!this.canHandleStructuredEvent(session)) return;
        this.context.failStructuredSession(session, errorMessage);
      },
      onUpdate: (update) => {
        if (!this.canHandleStructuredEvent(session)) return;
        this.handleStructuredUpdate(session, update);
      },
      onRuntimeEvent: (event) => {
        if (!this.canHandleStructuredEvent(session)) return;
        this.handleStructuredRuntimeEvent(session, event);
      },
    });
  }

  private handleStructuredUpdate(session: SessionRuntime, update: StructuredSessionUpdate): void {
    const context = this.context;
    const wasWorking = session.status === "working";
    const hadInterruptRequest = session.structuredTurnInterruptRequested === true;
    if (update.sessionRef) {
      const prevId = session.sessionRef?.providerSessionId;
      session.sessionRef = update.sessionRef;
      session.canResumeWithConfig = true;
      context.indexSessionRef(session, prevId);
    }

    const configChanged =
      update.config !== undefined && !isThreadConfigEqual(session.config, update.config);
    const slashCommandsChanged =
      update.slashCommands !== undefined &&
      !areAgentSlashCommandsEqual(session.slashCommands, update.slashCommands);
    const stateChanged =
      session.status !== update.status ||
      session.attention !== update.attention ||
      update.errorMessage !== undefined;
    if (update.config) {
      session.config = update.config;
    }
    if (update.slashCommands !== undefined) {
      session.slashCommands = update.slashCommands;
    }

    if (
      session.suppressInitialStructuredIdle === true &&
      update.status === "idle" &&
      session.status === "working" &&
      session.structuredTurnInterruptRequested !== true
    ) {
      if (update.sessionRef || configChanged || slashCommandsChanged) {
        context.outputPipeline.emitState(session);
      }
      return;
    }
    if (session.suppressInitialStructuredIdle === true && update.status !== "idle") {
      session.suppressInitialStructuredIdle = undefined;
    }

    // Runtime events are batched, while thread-state is emitted immediately.
    // Flush first so a final event cannot arrive after idle and reopen the turn.
    context.runtimeEventRouter.flush();
    context.outputPipeline.updateState(
      session,
      update.status,
      update.attention,
      update.errorMessage,
      {
        forceCloseActiveTurn:
          hadInterruptRequest && (update.status === "idle" || update.status === "needs_reply"),
      },
    );
    if (update.status !== "working") {
      session.structuredTurnInterruptRequested = false;
      context.structuredInterruptWatchdog.clearStructuredInterruptWatchdog(session);
    } else {
      context.structuredInterruptWatchdog.touchStructuredInterruptWatchdog(session);
    }
    if (
      session.presentationMode === "gui" &&
      (wasWorking || hadInterruptRequest) &&
      isSteerDrainableStatus(update.status)
    ) {
      context.steerCoordinator.maybeDrainPendingSteer(session);
    }
    if (
      (configChanged || slashCommandsChanged) &&
      !stateChanged &&
      update.errorMessage === undefined
    ) {
      context.outputPipeline.emitState(session);
    }
  }

  private handleStructuredRuntimeEvent(session: SessionRuntime, event: RuntimeEvent): void {
    if (
      session.suppressInitialStructuredIdle === true &&
      shouldReleaseInitialStructuredIdleSuppression(event)
    ) {
      session.suppressInitialStructuredIdle = undefined;
    }
    this.context.structuredInterruptWatchdog.touchStructuredInterruptWatchdog(session);
    this.context.runtimeEventRouter.append(session.threadId, event);
  }

  private bindPty(session: SessionRuntime): void {
    const pty = session.pty;
    if (!pty) return;

    pty.onData((data) => {
      if (!this.context.isCurrentSession(session)) return;
      try {
        this.context.outputPipeline.handlePtyData(session, data);
      } catch (error) {
        console.error(
          `[supervisor] uncaught error in onData for thread ${session.threadId}:`,
          error,
        );
        captureSupervisorException(error, {
          "poracode.feature_area": "supervisor-runtime",
          "poracode.provider": session.agentKind,
        });
      }
    });

    pty.onExit((event) => {
      const context = this.context;
      context.ptyLifecycle.resolveExit(session);
      try {
        session.launchCleanup?.();
      } catch {
        // Temporary launch-resource cleanup is best effort.
      }
      session.launchCleanup = undefined;
      if (session.ignoreExit) return;
      if (!this.context.isCurrentSession(session)) return;

      void session.structuredSession?.dispose();
      context.outputPipeline.clearSessionTimers(session);
      context.outputPipeline.updateState(session, "inactive", "none");
      session.hasCliHookPluginActivity = false;
      session.cliHookEnvInjected = false;
      if (session.sessionRef?.providerSessionId) {
        context.sessionsBySessionId.delete(session.sessionRef.providerSessionId);
      }
      context.emit({
        type: "thread-exited",
        threadId: session.threadId,
        exitCode: event.exitCode,
      });
    });
  }

  private handleStructuredSessionClosed(session: SessionRuntime): void {
    if (session.status === "inactive") return;
    this.context.outputPipeline.updateState(session, "inactive", "none");
    this.context.emit({
      type: "thread-exited",
      threadId: session.threadId,
      exitCode: null,
    });
    session.ignoreExit = true;
    session.stopSessionRefWatcher?.();
    session.stopSessionRefWatcher = undefined;
    setTimeout(() => this.context.ptyLifecycle.kill(session), 150);
  }
}
