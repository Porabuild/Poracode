import { randomUUID } from "node:crypto";
import type {
  PendingSteerState,
  PromptSegment,
  SetPendingSteerPayload,
  ThreadStatus,
} from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { defaultFormatPromptSegments } from "../../agents/base";
import { captureSupervisorException } from "../../diagnostics/sentry";
import { rewriteSegmentsForWsl } from "../threadAttachments";
import type { PendingSteerSlot, QueuedStructuredTurn, SessionRuntime } from "../sessionTypes";

/**
 * Stopped states a staged steer can drain from. A failed turn ("error") still
 * leaves the structured session alive and ready for a new turn, so the steer
 * must flush there too — a turn that errors never reaches "idle"/"needs_reply",
 * so without this the strip sticks on "waiting for agent to stop" forever.
 */
export function isSteerDrainableStatus(status: ThreadStatus): boolean {
  return status === "idle" || status === "needs_reply" || status === "error";
}

/** Emit the current pending-steer slot (or `null` when cleared) so the renderer
 * can paint/clear the steer strip. */
function emitPendingSteer(session: SessionRuntime, emit: (event: SupervisorEvent) => void): void {
  const slot = session.pendingSteer;
  const pending: PendingSteerState | null = slot
    ? {
        id: slot.id,
        prompt: slot.prompt,
        stagedAt: slot.stagedAt,
        ...(slot.segments ? { segments: slot.segments } : {}),
      }
    : null;
  emit({
    type: "thread-pending-steer",
    threadId: session.threadId,
    pending,
  });
}

/** Clear the pending steer slot and notify the renderer. Free function so the
 * interrupt watchdog can drain the slot without a back-reference to
 * {@link SteerCoordinator}. */
export function clearPendingSteerSlot(
  session: SessionRuntime,
  emit: (event: SupervisorEvent) => void,
): void {
  if (session.pendingSteer === undefined) return;
  session.pendingSteer = undefined;
  emitPendingSteer(session, emit);
}

export interface SteerCoordinatorContext {
  emit(event: SupervisorEvent): void;
  sessions: Map<string, SessionRuntime>;
  interruptStructuredTurn(session: SessionRuntime): Promise<void>;
  startStructuredTurn(session: SessionRuntime, turn: QueuedStructuredTurn): void;
  failStructuredSession(session: SessionRuntime, error: unknown): void;
  /** Portable-skills fallback for a steer turn (see managerOptions). */
  resolveSkillTurnInjection(
    session: SessionRuntime,
    segments: readonly PromptSegment[] | undefined,
  ): Promise<string | undefined>;
}

/**
 * Pending-steer lifecycle for GUI threads: stage/replace the single steer slot,
 * fire the interrupt that drains it, and either enqueue onto a running turn
 * (`steerTurn` capability) or interrupt-and-drain. Extracted from
 * `ThreadSessionManager`; the manager keeps thin async delegates.
 */
export class SteerCoordinator {
  constructor(private readonly ctx: SteerCoordinatorContext) {}

  /**
   * Stage (or replace) the pending steer slot. Allocates a stable id on the
   * first stage and emits a `thread-pending-steer` event so the renderer can
   * paint the strip. Replace-latest semantics — a second submit-while-working
   * overwrites the existing slot rather than queueing.
   */
  stagePendingSteer(session: SessionRuntime, turn: QueuedStructuredTurn): void {
    const id = session.pendingSteer?.id ?? `steer-${randomUUID()}`;
    const slot: PendingSteerSlot = {
      id,
      stagedAt: Date.now(),
      ...turn,
    };
    session.pendingSteer = slot;
    emitPendingSteer(session, this.ctx.emit);
  }

  clearPendingSteerSlot(session: SessionRuntime): void {
    clearPendingSteerSlot(session, this.ctx.emit);
  }

  fireSteerInterrupt(session: SessionRuntime): void {
    void this.ctx.interruptStructuredTurn(session).catch((error) => {
      if (this.ctx.sessions.get(session.threadId)?.instanceId !== session.instanceId) {
        return;
      }
      console.error("[supervisor] failed to interrupt structured turn:", error);
      captureSupervisorException(error, {
        "lightcode.feature_area": "supervisor-runtime",
        "lightcode.provider": session.agentKind,
      });
    });
  }

  maybeDrainPendingSteer(session: SessionRuntime): void {
    if (session.presentationMode !== "gui") {
      return;
    }
    if (!isSteerDrainableStatus(session.status)) {
      return;
    }
    const slot = session.pendingSteer;
    if (!slot) return;
    session.pendingSteer = undefined;
    emitPendingSteer(session, this.ctx.emit);
    const turn: QueuedStructuredTurn = {
      prompt: slot.prompt,
      config: slot.config,
      ...(slot.segments ? { segments: slot.segments } : {}),
      ...(slot.userMessageItemId ? { userMessageItemId: slot.userMessageItemId } : {}),
      ...(slot.inlineInstructions ? { inlineInstructions: slot.inlineInstructions } : {}),
    };
    this.ctx.startStructuredTurn(session, turn);
  }

  /**
   * Stage the user's steer message and fire the cancel notification. The
   * renderer calls this when submit-while-working happens on a GUI thread.
   * Drain is automatic on cancelled-stopReason via {@link maybeDrainPendingSteer}.
   */
  async setPendingSteer(session: SessionRuntime, payload: SetPendingSteerPayload): Promise<void> {
    if (session.presentationMode !== "gui") {
      throw new Error("Pending steer is only supported for GUI-presentation threads.");
    }
    const usesStructuredFlow =
      session.adapter.capabilities.liveInputMode === "server" || session.presentationMode === "gui";
    if (!usesStructuredFlow || !session.structuredSession?.startTurn) {
      throw new Error("Thread does not support structured turns.");
    }
    const effectiveSegments = payload.segments
      ? await rewriteSegmentsForWsl(payload.segments, session.projectLocation, {
          preserveImageAttachments: true,
        })
      : undefined;
    const prompt =
      effectiveSegments && effectiveSegments.length > 0
        ? (session.adapter.formatPromptSegments?.(effectiveSegments) ??
          defaultFormatPromptSegments(effectiveSegments))
        : payload.prompt;
    const inlineInstructions = await this.ctx.resolveSkillTurnInjection(session, effectiveSegments);
    const turn: QueuedStructuredTurn = {
      prompt,
      config: payload.config,
      ...(effectiveSegments ? { segments: effectiveSegments } : {}),
      ...(inlineInstructions ? { inlineInstructions } : {}),
    };
    // Capability-based: non-interrupting steer enqueues onto the running turn
    // (subagents survive, no watchdog); others use the interrupt-drain path.
    if (session.structuredSession.steerTurn) {
      this.steerStructuredTurn(session, turn);
      return;
    }
    this.stagePendingSteer(session, turn);
    if (session.status === "working") {
      this.fireSteerInterrupt(session);
    } else {
      // Status was already idle/needs_reply by the time we staged. Drain now
      // so the message doesn't sit unflushed.
      this.maybeDrainPendingSteer(session);
    }
  }

  /**
   * Steer an in-flight turn via the session's `steerTurn` capability: enqueue
   * the user message onto the running turn without interrupting it (no
   * subagents killed, no error result, no pending-steer/watchdog dance). The
   * session emits its own optimistic user_message item, so pass the renderer's
   * id through when present to keep it deduped. Providers without `steerTurn`
   * never reach here — callers keep the interrupt-drain path for them.
   */
  steerStructuredTurn(session: SessionRuntime, turn: QueuedStructuredTurn): void {
    const steerTurn = session.structuredSession?.steerTurn;
    if (!steerTurn) return;
    const optimisticItemId =
      session.presentationMode === "gui" && turn.prompt.length > 0
        ? turn.userMessageItemId
        : undefined;
    const steerOptions = {
      ...(optimisticItemId ? { userMessageItemId: optimisticItemId } : {}),
      ...(turn.inlineInstructions ? { inlineInstructions: turn.inlineInstructions } : {}),
    };
    const steer = steerTurn.call(
      session.structuredSession,
      turn.prompt,
      turn.config,
      turn.segments,
      Object.keys(steerOptions).length > 0 ? steerOptions : undefined,
    );
    void steer.catch((error) => {
      if (this.ctx.sessions.get(session.threadId)?.instanceId !== session.instanceId) {
        return;
      }
      this.ctx.failStructuredSession(session, error);
    });
  }
}
