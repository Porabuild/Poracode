import {
  BACKEND_HOST_PROTOCOL_VERSION,
  type BackendHostOutboundMessage,
} from "@/shared/backendHostProtocol";
import { isBulkRuntimeContentEvent } from "@/shared/liveEventInterests";
import type { SupervisorEvent } from "@/shared/ipc";
import type { SupervisorIpcShedPolicy } from "@/supervisor/supervisorIpcSender";
import type { DesktopRelayPlan } from "./supervisorEventFallback";

export interface RendererStreamDelivery {
  delivered: boolean;
  sequence: number;
}

export interface SupervisorEventRelayDeps {
  publishToRendererStream(event: SupervisorEvent): RendererStreamDelivery | undefined;
  observeEvent(event: SupervisorEvent): boolean | void;
  sendToMain(message: BackendHostOutboundMessage): void;
  /**
   * Backend-authoritative desktop fallback decision for one event. The
   * backend owns the direct/fallback selection: legacy mode replays the old
   * full-relay behavior (before main's first per-window push), targeted mode
   * carries bulk only as per-window copies for windows that need the IPC
   * fallback plus a sequence-less control remainder for main's shell
   * consumers.
   */
  planDesktopRelay(event: SupervisorEvent): DesktopRelayPlan;
}

/**
 * Single delivery path for supervisor events leaving the backend host.
 *
 * The direct renderer stream and the Electron-IPC relay to main are
 * independent delivery surfaces. Suppression of bulk content keys on the
 * backend-side per-window ownership table — never on per-event stream
 * delivery: stream clients are anonymous, so "some ready client received the
 * event" can never prove "the desktop IPC consumer received it" (MC-1). In
 * targeted mode the planner produces one sequenced copy per fallback window
 * that subscribes to the event, sent before the sequence-less shell remainder
 * so per-window cursor gates never skip targeted content. Recovery barriers
 * (`renderer-stream-recovery`) are enqueued by the renderer stream itself on
 * owner revocation, ahead of any later fallback copy on the same ordered
 * channel.
 */
export function createSupervisorEventRelay(
  deps: SupervisorEventRelayDeps,
): (event: SupervisorEvent) => void {
  return (event) => {
    const rendererDelivery = deps.publishToRendererStream(event);
    if (deps.observeEvent(event) === true) return;
    const plan = deps.planDesktopRelay(event);
    if (plan.mode === "legacy") {
      if (!plan.shellEvent) return;
      deps.sendToMain({
        version: BACKEND_HOST_PROTOCOL_VERSION,
        kind: "supervisor-event",
        event: plan.shellEvent,
        ...(rendererDelivery ? { rendererSequence: rendererDelivery.sequence } : {}),
      });
      return;
    }
    // Targeted copies go first: a fallback window applies them by sequence,
    // and the sequence-less shell remainder behind them can never advance the
    // window's cursor past bulk it has not received.
    for (const copy of plan.copies) {
      deps.sendToMain({
        version: BACKEND_HOST_PROTOCOL_VERSION,
        kind: "supervisor-event",
        event: copy.event,
        ...(rendererDelivery ? { rendererSequence: rendererDelivery.sequence } : {}),
        target: copy.target,
      });
    }
    if (plan.shellEvent) {
      // No rendererSequence: shell controls are consumed by main itself and
      // ignored by connected windows; a disconnected window applies them
      // ungated. Controls are idempotent, and the missing sequence is what
      // keeps an IPC control from advancing a cursor past missing bulk.
      deps.sendToMain({
        version: BACKEND_HOST_PROTOCOL_VERSION,
        kind: "supervisor-event",
        event: plan.shellEvent,
      });
    }
  };
}

/**
 * Shed policy for the host's desktop-IPC sender.
 *
 * Supervisor events reach this relay only after the host persisted them
 * (database and terminal scrollback), so shed bulk renderer content can be
 * rebuilt authoritatively: the gap signal tells windows to rebuild through
 * their existing `thread-scrollback-resync` / `thread-reset` recovery before
 * trusting any post-gap sequence. Everything else on the channel — replies,
 * native requests/events, supervisor-reset, error notices, shell controls,
 * targeted copies of mixed batches, and recovery barriers — has no replay
 * path or is itself a recovery signal, and keeps the fail-closed semantics,
 * as do events emitted before the renderer stream existed, which carry no
 * sequence to anchor the gap signal to.
 */
export function createBackendHostShedPolicy(): SupervisorIpcShedPolicy<BackendHostOutboundMessage> {
  return {
    isSheddable: (message) =>
      "kind" in message &&
      message.kind === "supervisor-event" &&
      message.rendererSequence !== undefined &&
      isRendererRebuildableSupervisorEvent(message.event),
    // Only this policy's OWN gap markers merge. A `renderer-stream-recovery`
    // barrier is someone else's recovery signal: it is non-sheddable above,
    // and recognizing it here would let overflow shedding REPLACE a targeted
    // barrier with a gap marker, silently unmaintaining that window's loss.
    isRecoverySignal: (message) => "kind" in message && message.kind === "supervisor-event-gap",
    createRecoverySignal: (shed, previous) => {
      let fromSequence = Number.POSITIVE_INFINITY;
      let toSequence = 0;
      for (const message of shed) {
        const sequence = sequencedRendererSequence(message);
        if (sequence === null) continue;
        fromSequence = Math.min(fromSequence, sequence);
        toSequence = Math.max(toSequence, sequence);
      }
      if (previous !== null && isGapEnvelope(previous)) {
        fromSequence = Math.min(fromSequence, previous.fromSequence);
        toSequence = Math.max(toSequence, previous.toSequence);
      }
      return {
        version: BACKEND_HOST_PROTOCOL_VERSION,
        kind: "supervisor-event-gap",
        fromSequence,
        toSequence,
      };
    },
  };
}

/** The stream sequence of a `supervisor-event` envelope, or null for anything else. */
function sequencedRendererSequence(
  message: SupervisorEvent | import("@/shared/ipc").SupervisorReply | BackendHostOutboundMessage,
): number | null {
  if (!("kind" in message) || message.kind !== "supervisor-event") return null;
  return message.rendererSequence ?? null;
}

function isGapEnvelope(
  message: SupervisorEvent | import("@/shared/ipc").SupervisorReply | BackendHostOutboundMessage,
): message is Extract<BackendHostOutboundMessage, { kind: "supervisor-event-gap" }> {
  return "kind" in message && message.kind === "supervisor-event-gap";
}

/**
 * True for bulk renderer content the desktop consumer rebuilds from persisted
 * state: terminal bytes via scrollback resync, bulk runtime items (tool
 * output, streaming deltas) via thread reset. Partially-bulk runtime batches
 * stay non-sheddable — the loss would mix with irreplaceable events. This is
 * the same shared classifier the fallback planner splits with, so a message
 * classed sheddable here is exactly one the planner would have carried as
 * sequenced bulk content.
 */
function isRendererRebuildableSupervisorEvent(event: SupervisorEvent): boolean {
  if (event.type === "thread-output") return true;
  if (event.type === "thread-runtime-event") return isBulkRuntimeContentEvent(event.event);
  if (event.type === "thread-runtime-events") {
    return event.events.length > 0 && event.events.every(isBulkRuntimeContentEvent);
  }
  if (event.type === "thread-runtime-events-multi") {
    return (
      event.batches.length > 0 &&
      event.batches.every((batch) => batch.events.every(isBulkRuntimeContentEvent))
    );
  }
  return false;
}
