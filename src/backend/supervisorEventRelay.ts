import {
  BACKEND_HOST_PROTOCOL_VERSION,
  type BackendHostOutboundMessage,
} from "@/shared/backendHostProtocol";
import { isBulkRuntimeContentEvent } from "@/shared/liveEventInterests";
import type { SupervisorEvent } from "@/shared/ipc";
import type { SupervisorIpcShedPolicy } from "@/supervisor/supervisorIpcSender";

export interface SupervisorEventRelayDeps {
  /** Host-lifetime monotonic relay sequence source; one sequence per event. */
  nextSequence(): number;
  observeEvent(event: SupervisorEvent): boolean | void;
  /** Narrows an event to the union live-event interests before it crosses. */
  filterEventForRelay(event: SupervisorEvent): SupervisorEvent | null;
  sendToMain(message: BackendHostOutboundMessage): void;
}

/**
 * Single delivery path for supervisor events leaving the backend host (V5
 * plan 2.5 / H4): the legacy full relay across the desktop-IPC channel. Every
 * event crosses ONCE, carrying its relay sequence, so desktop windows dedupe
 * and gate rebuilds by sequence exactly as they always have in legacy mode.
 * There is no second (renderer-direct stream) delivery surface anymore; the
 * former targeted-copy/shell-remainder planner and its per-window ownership
 * table were deleted with it.
 */
export function createSupervisorEventRelay(
  deps: SupervisorEventRelayDeps,
): (event: SupervisorEvent) => void {
  return (event) => {
    if (deps.observeEvent(event) === true) return;
    const filtered = deps.filterEventForRelay(event);
    if (!filtered) return;
    deps.sendToMain({
      version: BACKEND_HOST_PROTOCOL_VERSION,
      kind: "supervisor-event",
      event: filtered,
      rendererSequence: deps.nextSequence(),
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
 * native requests/events, supervisor-reset, error notices, and events emitted
 * before the relay existed (no sequence to anchor a gap to) — has no replay
 * path or is itself a recovery signal, and keeps the fail-closed semantics.
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

/** The relay sequence of a `supervisor-event` envelope, or null for anything else. */
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
