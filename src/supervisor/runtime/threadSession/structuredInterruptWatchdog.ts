import type { SessionRuntime } from "../sessionTypes";
import { STRUCTURED_INTERRUPT_STALE_KILL_MS } from "./userInterrupt";

export interface StructuredInterruptWatchdogContext {
  sessions: Map<string, SessionRuntime>;
  isDisposed(): boolean;
  clearPendingSteerSlot(session: SessionRuntime): void;
  failStructuredSession(session: SessionRuntime, error: unknown): void;
}

/**
 * Force-stop watchdog for structured (GUI) turns. Owns the interrupt request +
 * stale-session detection: arm on stop request, reset on any inbound sign of
 * life, and — if the agent goes silent with the stop still pending — dispose the
 * stale session and force the thread into a stopped `error` state. Extracted from
 * `ThreadSessionManager`; the manager delegates to it.
 */
export class StructuredInterruptWatchdog {
  constructor(private readonly ctx: StructuredInterruptWatchdogContext) {}

  async interruptStructuredTurn(session: SessionRuntime): Promise<void> {
    if (session.presentationMode !== "gui") {
      return;
    }
    if (!session.structuredSession?.interruptTurn || session.structuredTurnInterruptRequested) {
      return;
    }
    session.structuredTurnInterruptRequested = true;
    this.armStructuredInterruptWatchdog(session);
    try {
      await session.structuredSession.interruptTurn();
    } catch (error) {
      session.structuredTurnInterruptRequested = false;
      this.clearStructuredInterruptWatchdog(session);
      throw error;
    }
  }

  clearStructuredInterruptWatchdog(session: SessionRuntime): void {
    if (session.structuredInterruptWatchdog) {
      clearTimeout(session.structuredInterruptWatchdog);
      session.structuredInterruptWatchdog = undefined;
    }
  }

  /**
   * Arm (or reset) the force-stop watchdog for a structured turn. Reset on any
   * inbound sign of life so a healthy-but-slow cancel is never force-killed; it
   * only fires after the agent has gone fully silent for the grace window with
   * the interrupt still pending — i.e. the session is stale/disconnected.
   */
  armStructuredInterruptWatchdog(session: SessionRuntime): void {
    this.clearStructuredInterruptWatchdog(session);
    const instanceId = session.instanceId;
    session.structuredInterruptWatchdog = setTimeout(() => {
      session.structuredInterruptWatchdog = undefined;
      this.forceStopStaleStructuredTurn(session.threadId, instanceId);
    }, STRUCTURED_INTERRUPT_STALE_KILL_MS);
  }

  /**
   * Re-arm the watchdog if a stop is still pending — called on inbound activity
   * (status updates / runtime events) so the silence clock restarts whenever
   * the session proves it is still alive.
   */
  touchStructuredInterruptWatchdog(session: SessionRuntime): void {
    if (!session.structuredTurnInterruptRequested) return;
    if (session.status !== "working") return;
    this.armStructuredInterruptWatchdog(session);
  }

  /**
   * The agent never acknowledged a stop request and has gone silent: the
   * structured session is stale/disconnected. Dispose it best-effort and force
   * the thread into a stopped `error` state so the UI stops waiting forever.
   */
  private forceStopStaleStructuredTurn(threadId: string, instanceId: string): void {
    const session = this.ctx.sessions.get(threadId);
    if (!session || session.instanceId !== instanceId) {
      return;
    }
    if (this.ctx.isDisposed() || session.ignoreExit) {
      return;
    }
    if (session.status !== "working" || !session.structuredTurnInterruptRequested) {
      return;
    }
    this.clearStructuredInterruptWatchdog(session);
    session.structuredTurnInterruptRequested = false;
    this.ctx.clearPendingSteerSlot(session);
    const staleSession = session.structuredSession;
    session.structuredSession = undefined;
    void Promise.resolve(staleSession?.dispose()).catch((error) => {
      console.error("[supervisor] failed to dispose stale structured session:", error);
    });
    this.ctx.failStructuredSession(
      session,
      new Error("Agent stopped responding to the stop request and was force-stopped."),
    );
  }
}
