import {
  BACKEND_HOST_PROTOCOL_VERSION,
  type BackendHostOutboundMessage,
} from "@/shared/backendHostProtocol";
import { isBulkRuntimeContentEvent } from "@/shared/liveEventInterests";
import type { SupervisorEvent } from "@/shared/ipc";
import type { SupervisorIpcShedPolicy } from "@/supervisor/supervisorIpcSender";

export interface RendererStreamDelivery {
  delivered: boolean;
  sequence: number;
}

export interface SupervisorEventRelayDeps {
  publishToRendererStream(event: SupervisorEvent): RendererStreamDelivery | undefined;
  observeEvent(event: SupervisorEvent): void;
  filterForIpcConsumers(event: SupervisorEvent): SupervisorEvent | null;
  sendToMain(message: BackendHostOutboundMessage): void;
}

/**
 * Single delivery path for supervisor events leaving the backend host.
 *
 * The direct renderer stream and the Electron-IPC relay to main are
 * independent delivery surfaces. Stream clients are anonymous — a window
 * whose socket is down is absent from the client map — so "some ready client
 * received the event" can never prove "the desktop IPC consumer received
 * it". The relay therefore never suppresses the IPC copy based on
 * direct-stream delivery: over-delivery is safe because the renderer
 * transport dedupes by `rendererSequence` while its socket is connected, and
 * events that only arrived over IPC still carry the sequence the stream's
 * replay/resync recovery needs.
 */
export function createSupervisorEventRelay(
  deps: SupervisorEventRelayDeps,
): (event: SupervisorEvent) => void {
  return (event) => {
    const rendererDelivery = deps.publishToRendererStream(event);
    deps.observeEvent(event);
    const filtered = deps.filterForIpcConsumers(event);
    if (!filtered) return;
    deps.sendToMain({
      version: BACKEND_HOST_PROTOCOL_VERSION,
      kind: "supervisor-event",
      event: filtered,
      ...(rendererDelivery ? { rendererSequence: rendererDelivery.sequence } : {}),
    });
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
 * native requests/events, supervisor-reset, error notices — has no replay
 * path and keeps the fail-closed semantics, as do main-only supervisor
 * events (`thread-state` drives main's sleep state; crossagent events
 * persist routing) and events emitted before the renderer stream existed,
 * which carry no sequence to anchor the gap signal to.
 */
export function createBackendHostShedPolicy(): SupervisorIpcShedPolicy<BackendHostOutboundMessage> {
  return {
    isSheddable: (message) =>
      "kind" in message &&
      message.kind === "supervisor-event" &&
      message.rendererSequence !== undefined &&
      isRendererRebuildableSupervisorEvent(message.event),
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
 * stay non-sheddable — the loss would mix with irreplaceable events.
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
