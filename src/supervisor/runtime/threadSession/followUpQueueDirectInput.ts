import type { SessionRuntime } from "../sessionTypes";
import { type ThreadLifecycle, isSettledStatus } from "./followUpQueueState";

export interface DirectInputReservation {
  markStarted(session: SessionRuntime): void;
  release(): void;
}

/** Keeps normal submits and native / interrupt-drain steers ahead of FIFO delivery. */
export class FollowUpQueueDirectInput {
  private readonly directReservations = new Map<string, number>();
  constructor(
    private readonly ctx: {
      lifecycleFor(session: SessionRuntime): ThreadLifecycle;
      onChange(threadId: string): void;
      onStarted(session: SessionRuntime): void;
    },
  ) {}
  hasReservation(threadId: string): boolean {
    return this.directReservations.has(threadId);
  }
  dispose(): void {
    this.directReservations.clear();
  }
  /** Keep a direct submit/steer from racing the queue's readiness check. */
  beginDirectInput(threadId: string): DirectInputReservation {
    this.directReservations.set(threadId, (this.directReservations.get(threadId) ?? 0) + 1);
    let marked = false;
    let released = false;
    return {
      markStarted: (session) => {
        if (released || marked) return;
        marked = true;
        this.decrementReservation(threadId);
        const lifecycle = this.ctx.lifecycleFor(session);
        this.ctx.onStarted(session);
        lifecycle.direct = true;
        lifecycle.directAwaitingReplacement =
          session.status === "working" && session.structuredSession?.steerTurn === undefined;
        lifecycle.directCompletion = false;
        lifecycle.turnCompleted = false;
        this.ctx.onChange(threadId);
      },
      release: () => {
        if (released) return;
        released = true;
        if (!marked) this.decrementReservation(threadId);
        this.ctx.onChange(threadId);
      },
    };
  }

  /** Called by ordinary direct starts, including an interrupt-drain start. */
  noteDirectTurnSubmitted(session: SessionRuntime): void {
    const lifecycle = this.ctx.lifecycleFor(session);
    if (!lifecycle.direct) return;
    if (lifecycle.directAwaitingReplacement) {
      lifecycle.directAwaitingReplacement = false;
      lifecycle.directCompletion = false;
      lifecycle.turnCompleted = false;
      delete lifecycle.turnId;
    }
  }

  /** Native steer keeps the existing turn as its completion boundary. */
  noteDirectSteerSubmitted(session: SessionRuntime): void {
    const lifecycle = this.ctx.lifecycleFor(session);
    if (!lifecycle.direct) return;
    lifecycle.directAwaitingReplacement = false;
    lifecycle.directCompletion = false;
  }

  /** Clear a direct steer that the user explicitly removed. */
  cancelDirectInput(session: SessionRuntime): void {
    const lifecycle = this.ctx.lifecycleFor(session);
    if (!lifecycle.direct) return;
    lifecycle.directAwaitingReplacement = false;
    if (lifecycle.turnCompleted) lifecycle.directCompletion = true;
    this.maybeFinishDirect(session, lifecycle);
  }

  maybeFinishDirect(session: SessionRuntime, lifecycle: ThreadLifecycle): void {
    if (
      !lifecycle.direct ||
      lifecycle.directAwaitingReplacement ||
      !lifecycle.directCompletion ||
      !isSettledStatus(session.status) ||
      lifecycle.pendingRequestIds.size > 0 ||
      this.directReservations.get(session.threadId)
    ) {
      return;
    }
    lifecycle.direct = false;
    lifecycle.directCompletion = false;
    delete lifecycle.turnId;
    lifecycle.turnCompleted = false;
    this.ctx.onChange(session.threadId);
  }

  private decrementReservation(threadId: string): void {
    const current = this.directReservations.get(threadId) ?? 0;
    if (current <= 1) this.directReservations.delete(threadId);
    else this.directReservations.set(threadId, current - 1);
  }
}
