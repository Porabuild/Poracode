import { randomUUID } from "node:crypto";
import type {
  PendingSteerState,
  PromptSegment,
  SetPendingSteerPayload,
  ThreadStatus,
} from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { msg } from "@/shared/messages";
import {
  defaultFormatPromptSegments,
  isCompletedWithoutTurn,
  type StructuredTurnResult,
} from "../../agents/base";
import { captureSupervisorException } from "../../diagnostics/sentry";
import { rewriteSegmentsForWsl } from "../threadAttachments";
import type { PendingSteerSlot, QueuedStructuredTurn, SessionRuntime } from "../sessionTypes";

const STEER_PREPARATION_TIMEOUT_MS = 750;

/** Internal options used when a queue row is promoted to a direct steer. */
export interface SteerSubmissionOptions {
  /** Keep the queue row owned until replacement admission settles. */
  awaitReplacement?: boolean;
  /** For interrupt-drain queue promotion, wait for canonical turn.started. */
  awaitCanonicalStart?: boolean;
  /** Stable transcript identity allocated when the row entered the FIFO. */
  userMessageItemId?: string;
}

export interface PendingSteerAdmission {
  readonly promise: Promise<void>;
  /** Whether a successful provider promise is itself the admission boundary. */
  readonly resolveOnProviderCompletion?: boolean;
  resolve(): void;
  reject(error: unknown): void;
}

type PendingSteerSlotWithAdmission = PendingSteerSlot & {
  admission?: PendingSteerAdmission;
};

function createPendingSteerAdmission(resolveOnProviderCompletion = true): PendingSteerAdmission {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject, resolveOnProviderCompletion };
}

function pendingSteerAdmission(session: SessionRuntime): PendingSteerAdmission | undefined {
  return (session.pendingSteer as PendingSteerSlotWithAdmission | undefined)?.admission;
}

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
  const segments = slot?.displaySegments ?? slot?.segments;
  const pending: PendingSteerState | null = slot
    ? {
        id: slot.id,
        prompt: slot.prompt,
        stagedAt: slot.stagedAt,
        ...(segments ? { segments } : {}),
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
  const admission = pendingSteerAdmission(session);
  session.pendingSteer = undefined;
  emitPendingSteer(session, emit);
  admission?.reject(msg("supervisor.steer.cleared"));
}

export interface SteerCoordinatorContext {
  emit(event: SupervisorEvent): void;
  sessions: Map<string, SessionRuntime>;
  interruptStructuredTurn(session: SessionRuntime): Promise<void>;
  startStructuredTurn(
    session: SessionRuntime,
    turn: QueuedStructuredTurn,
  ): Promise<void | StructuredTurnResult> | void;
  emitOptimisticUserMessage(
    threadId: string,
    prompt: string,
    segments?: PromptSegment[],
    requestedItemId?: string,
    options?: { includeTurn?: boolean },
  ): string;
  failStructuredSession(session: SessionRuntime, error: unknown): void;
  /** Optional queue barrier hook; native steer keeps the same turn boundary. */
  noteDirectSteerSubmitted?(session: SessionRuntime): void;
  /** Release direct-input admission when a provider command opens no turn. */
  noteDirectSteerCompletedWithoutTurn?(session: SessionRuntime): void;
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
  private readonly pendingReplacementAdmissions = new Map<
    string,
    { session: SessionRuntime; admission: PendingSteerAdmission }
  >();

  constructor(private readonly ctx: SteerCoordinatorContext) {}

  /** Resolve a fallback steer once its provider emits the canonical start edge. */
  noteSteerTurnStarted(session: SessionRuntime): void {
    const pending = this.pendingReplacementAdmissions.get(session.instanceId);
    if (!pending) return;
    this.pendingReplacementAdmissions.delete(session.instanceId);
    if (pending.session.instanceId === session.instanceId) pending.admission.resolve();
  }

  /**
   * Direct composer input waits only after fallback startTurn has actually
   * been invoked. The old-turn interrupt window has no entry here and remains
   * replaceable by the normal direct-steer admission rules.
   */
  async waitForPendingSteerAdmission(threadId: string): Promise<void> {
    const pending = [...this.pendingReplacementAdmissions.values()].find(
      ({ session }) => session.threadId === threadId,
    );
    await pending?.admission.promise.catch(() => undefined);
  }

  private rejectPendingReplacement(session: SessionRuntime, error: unknown): void {
    const admission = this.pendingReplacementAdmissions.get(session.instanceId);
    if (!admission) return;
    this.pendingReplacementAdmissions.delete(session.instanceId);
    admission.admission.reject(error);
  }

  private resolvePendingReplacement(
    session: SessionRuntime,
    admission: PendingSteerAdmission,
  ): void {
    const pending = this.pendingReplacementAdmissions.get(session.instanceId);
    if (pending?.admission === admission) {
      this.pendingReplacementAdmissions.delete(session.instanceId);
    }
    admission.resolve();
  }

  private rejectPendingReplacementIfCurrent(
    session: SessionRuntime,
    admission: PendingSteerAdmission,
    error: unknown,
  ): void {
    const pending = this.pendingReplacementAdmissions.get(session.instanceId);
    if (pending?.admission !== admission) return;
    this.pendingReplacementAdmissions.delete(session.instanceId);
    admission.reject(error);
  }

  /**
   * Stage (or replace) the pending steer slot. Allocates a stable id on the
   * first stage and emits a `thread-pending-steer` event so the renderer can
   * paint the strip. Replace-latest semantics — a second submit-while-working
   * overwrites the existing slot rather than queueing.
   */
  stagePendingSteer(
    session: SessionRuntime,
    turn: QueuedStructuredTurn,
    admission?: PendingSteerAdmission,
  ): void {
    this.rejectPendingReplacement(session, msg("supervisor.steer.replaced"));
    pendingSteerAdmission(session)?.reject(msg("supervisor.steer.replaced"));
    const id = session.pendingSteer?.id ?? `steer-${randomUUID()}`;
    const slot: PendingSteerSlotWithAdmission = {
      id,
      stagedAt: Date.now(),
      ...turn,
      ...(admission ? { admission } : {}),
    };
    session.pendingSteer = slot;
    emitPendingSteer(session, this.ctx.emit);
  }

  clearPendingSteerSlot(session: SessionRuntime): void {
    clearPendingSteerSlot(session, this.ctx.emit);
  }

  /**
   * Detach a staged steer for the forced-restart path without rejecting a
   * queue promotion that is waiting for replacement admission. The caller
   * must settle the returned admission from the restart promise.
   */
  takePendingSteerAdmission(session: SessionRuntime): PendingSteerAdmission | undefined {
    const admission = pendingSteerAdmission(session);
    if (session.pendingSteer === undefined) return undefined;
    session.pendingSteer = undefined;
    emitPendingSteer(session, this.ctx.emit);
    return admission;
  }

  fireSteerInterrupt(session: SessionRuntime): void {
    const pendingSteerId = session.pendingSteer?.id;
    if (!pendingSteerId) return;
    void this.prepareAndInterrupt(session, pendingSteerId).catch((error) => {
      if (this.ctx.sessions.get(session.threadId)?.instanceId !== session.instanceId) {
        return;
      }
      console.error("[supervisor] failed to interrupt structured turn:", error);
      captureSupervisorException(error, {
        "poracode.feature_area": "supervisor-runtime",
        "poracode.provider": session.agentKind,
      });
    });
  }

  private async prepareAndInterrupt(
    session: SessionRuntime,
    pendingSteerId: string,
  ): Promise<void> {
    const prepareSteerInterrupt = session.structuredSession?.prepareSteerInterrupt;
    if (prepareSteerInterrupt) {
      try {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            prepareSteerInterrupt.call(session.structuredSession),
            new Promise<never>((_resolve, reject) => {
              timeout = setTimeout(
                () => reject(new Error("Structured steer preparation timed out.")),
                STEER_PREPARATION_TIMEOUT_MS,
              );
            }),
          ]);
        } finally {
          if (timeout) clearTimeout(timeout);
        }
      } catch (error) {
        // Preparation preserves optional provider work; it must never strand
        // the user's replacement prompt if the provider rejects the control.
        console.error("[supervisor] failed to prepare structured steer interrupt:", error);
        captureSupervisorException(error, {
          "poracode.feature_area": "supervisor-runtime",
          "poracode.provider": session.agentKind,
        });
      }
    }
    if (this.ctx.sessions.get(session.threadId)?.instanceId !== session.instanceId) {
      return;
    }
    // Preparation can let the old provider turn settle. Its idle update drains
    // the slot and may already start the replacement before the control request
    // resolves; never let this delayed continuation interrupt that new turn.
    if (session.pendingSteer?.id !== pendingSteerId) {
      return;
    }
    if (session.status !== "working") {
      void this.maybeDrainPendingSteer(session);
      return;
    }
    await this.ctx.interruptStructuredTurn(session);
  }

  maybeDrainPendingSteer(session: SessionRuntime): Promise<void> | undefined {
    if (session.presentationMode !== "gui") {
      return undefined;
    }
    const slot = session.pendingSteer;
    if (!slot) return undefined;
    const admission = pendingSteerAdmission(session);
    if (!isSteerDrainableStatus(session.status)) {
      // A queue promotion must never turn into a hidden pending slot. The
      // caller retains the FIFO row when this admission rejects; ordinary
      // direct steering keeps its existing staged-slot behavior.
      if (admission) {
        clearPendingSteerSlot(session, this.ctx.emit);
        return admission.promise;
      }
      return undefined;
    }
    session.pendingSteer = undefined;
    emitPendingSteer(session, this.ctx.emit);
    const turn: QueuedStructuredTurn = {
      prompt: slot.prompt,
      config: slot.config,
      ...(slot.segments ? { segments: slot.segments } : {}),
      ...(slot.displaySegments ? { displaySegments: slot.displaySegments } : {}),
      ...(slot.userMessageItemId ? { userMessageItemId: slot.userMessageItemId } : {}),
      ...(slot.inlineInstructions ? { inlineInstructions: slot.inlineInstructions } : {}),
    };
    try {
      // Install the canonical-start waiter before invoking the provider. A
      // structured adapter may report turn.started synchronously from its
      // startTurn call, and that edge must not be missed.
      if (admission?.resolveOnProviderCompletion === false) {
        this.pendingReplacementAdmissions.set(session.instanceId, { session, admission });
      }
      const start = this.ctx.startStructuredTurn(session, turn);
      if (!admission) {
        // The direct path intentionally remains fire-and-forget. Its start
        // delegate owns provider failure reporting; this catch only prevents a
        // test/runtime adapter that returns a bare rejected promise from
        // becoming an unhandled rejection.
        void start?.catch(() => undefined);
        return undefined;
      }
      if (!start) {
        const error = msg("supervisor.steer.notAdmitted");
        this.rejectPendingReplacementIfCurrent(session, admission, error);
        admission.reject(error);
        return admission.promise;
      }
      void start.then(
        (result) => {
          if (isCompletedWithoutTurn(result) || admission.resolveOnProviderCompletion !== false) {
            this.resolvePendingReplacement(session, admission);
          }
        },
        (error) => {
          this.rejectPendingReplacementIfCurrent(session, admission, error);
          admission.reject(error);
        },
      );
      return admission.promise;
    } catch (error) {
      if (admission) {
        this.rejectPendingReplacementIfCurrent(session, admission, error);
        admission.reject(error);
      }
      if (admission) return admission.promise;
      throw error;
    }
  }

  /**
   * Stage the user's steer message and fire the cancel notification. The
   * renderer calls this when submit-while-working happens on a GUI thread.
   * Drain is automatic on cancelled-stopReason via {@link maybeDrainPendingSteer}.
   */
  async setPendingSteer(
    session: SessionRuntime,
    payload: SetPendingSteerPayload & { displaySegments?: PromptSegment[] },
    options?: SteerSubmissionOptions,
  ): Promise<void> {
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
          preserveImageAttachments:
            session.adapter.capabilities.readsImageAttachmentsFromHost !== false,
          preservePdfAttachments: session.adapter.capabilities.readsPdfAttachmentsFromHost === true,
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
      ...(payload.displaySegments ? { displaySegments: payload.displaySegments } : {}),
      ...(options?.userMessageItemId ? { userMessageItemId: options.userMessageItemId } : {}),
      ...(inlineInstructions ? { inlineInstructions } : {}),
    };
    // Capability-based: non-interrupting steer enqueues onto the running turn
    // (subagents survive, no watchdog); others use the interrupt-drain path.
    // A renderer can request this path from optimistic `working` state while
    // the supervisor is still reconnecting. Native steering is valid only for
    // an authoritatively live turn; idle/needs-reply/error must drain as a
    // normal turn instead.
    if (session.status === "working" && session.structuredSession.steerTurn) {
      const admission = options?.awaitReplacement ? createPendingSteerAdmission() : undefined;
      if (!admission) {
        // Preserve ordinary direct-steer fire-and-forget behavior. The
        // coordinator's observed promise already owns failure reporting.
        void this.steerStructuredTurn(session, turn);
        return;
      }
      const steer = this.steerStructuredTurn(session, turn);
      if (!steer) {
        admission.reject(msg("supervisor.steer.notAdmitted"));
      } else {
        void steer.then(
          () => admission.resolve(),
          (error) => admission.reject(error),
        );
      }
      await admission.promise;
      return;
    }
    if (!isSteerDrainableStatus(session.status) && session.status !== "working") {
      throw new Error(msg("supervisor.steer.notReady"));
    }
    const admission = options?.awaitReplacement
      ? createPendingSteerAdmission(options.awaitCanonicalStart !== true)
      : undefined;
    this.stagePendingSteer(session, turn, admission);
    if (session.status === "working") {
      this.fireSteerInterrupt(session);
    } else {
      // Status was already idle/needs_reply by the time we staged. Drain now
      // so the message doesn't sit unflushed.
      void this.maybeDrainPendingSteer(session);
    }
    if (admission) await admission.promise;
  }

  /**
   * Steer an in-flight turn via the session's `steerTurn` capability: enqueue
   * the user message onto the running turn without interrupting it (no
   * subagents killed, no error result, no pending-steer/watchdog dance). The
   * coordinator emits the user_message item before the provider round-trip so
   * the original display segments are durable; pass the renderer's id through
   * when present to keep it deduped. Providers without `steerTurn` never reach
   * here — callers keep the interrupt-drain path for them.
   */
  steerStructuredTurn(
    session: SessionRuntime,
    turn: QueuedStructuredTurn,
  ): Promise<void | StructuredTurnResult> | undefined {
    const steerTurn = session.structuredSession?.steerTurn;
    if (!steerTurn) return;
    const hasThreadMention = turn.displaySegments?.some((segment) => segment.kind === "thread");
    // Queue promotions carry an id even when they have no mention. Paint those
    // rows here as well: providers may accept native steer without echoing a
    // user_message. Providers that do echo reuse this id, and the canonical
    // transcript keyed by item id coalesces the echo instead of duplicating it.
    const shouldPaintOptimistic = hasThreadMention || turn.userMessageItemId !== undefined;
    const optimisticItemId =
      session.presentationMode === "gui" && turn.prompt.length > 0
        ? shouldPaintOptimistic
          ? this.ctx.emitOptimisticUserMessage(
              session.threadId,
              turn.prompt,
              turn.displaySegments ?? turn.segments,
              turn.userMessageItemId,
              { includeTurn: false },
            )
          : turn.userMessageItemId
        : undefined;
    const steerOptions = {
      ...(optimisticItemId ? { userMessageItemId: optimisticItemId } : {}),
      ...(turn.inlineInstructions ? { inlineInstructions: turn.inlineInstructions } : {}),
    };
    this.ctx.noteDirectSteerSubmitted?.(session);
    const steer = steerTurn.call(
      session.structuredSession,
      turn.prompt,
      turn.config,
      turn.segments,
      Object.keys(steerOptions).length > 0 ? steerOptions : undefined,
    );
    const observedSteer = steer.then((result) => {
      if (isCompletedWithoutTurn(result)) {
        this.ctx.noteDirectSteerCompletedWithoutTurn?.(session);
      }
      return result;
    });
    void observedSteer.catch((error) => {
      if (this.ctx.sessions.get(session.threadId)?.instanceId !== session.instanceId) {
        return;
      }
      this.ctx.failStructuredSession(session, error);
    });
    // Queue callers retain the selected item until the provider accepts it.
    return observedSteer;
  }
}
