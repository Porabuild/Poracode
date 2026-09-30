import type { SupervisorEvent, SupervisorReply } from "@/shared/ipc";

/**
 * Pure routing/sizing policy for supervisor→host IPC messages: the outbound
 * message union, lane classification, canonical-runtime recognition, canonical
 * thread addressing, and byte estimation. The sender owns the mutable
 * transport (queue, credits, drain, overflow, lifecycle); this module decides
 * only what a message is and where it belongs.
 */

/** Messages the supervisor IPC sender can route. */
export type OutboundMessage<AdditionalMessage> =
  | SupervisorEvent
  | SupervisorReply
  | AdditionalMessage;

/** Capacity lane a message is routed to. */
export type SupervisorIpcLane = "bulk" | "control";

export function isSupervisorReply<AdditionalMessage>(
  message: OutboundMessage<AdditionalMessage>,
): message is SupervisorReply {
  return typeof message === "object" && message !== null && "replyTo" in message;
}

export function messageType<AdditionalMessage>(
  message: OutboundMessage<AdditionalMessage>,
): string {
  if (typeof message !== "object" || message === null) return typeof message;
  const type = (message as { type?: unknown }).type;
  if (typeof type === "string") return type;
  const kind = (message as { kind?: unknown }).kind;
  return typeof kind === "string" ? kind : "unknown";
}

/**
 * Control lane: replies, thread lifecycle, capabilities, and stop-path error
 * events. Everything else is bulk, including canonical runtime envelopes.
 * Error runtime events are control-lane because they are emitted exactly when
 * canonical output for a thread is being stopped and must survive a saturated
 * bulk queue.
 */
export function laneForMessage<AdditionalMessage>(
  message: OutboundMessage<AdditionalMessage>,
): SupervisorIpcLane {
  if (isSupervisorReply(message)) return "control";
  const type = messageType(message);
  if (
    type === "thread-state" ||
    type === "thread-exited" ||
    type === "supervisor-flow-control-capabilities"
  ) {
    return "control";
  }
  if (type === "thread-runtime-event") {
    const event = (message as { event?: { type?: unknown } }).event;
    return event?.type === "error" ? "control" : "bulk";
  }
  if (type === "thread-runtime-events" || type === "thread-runtime-events-multi") {
    const events =
      type === "thread-runtime-events"
        ? (message as { events?: Array<{ type?: unknown }> }).events
        : (message as { batches?: Array<{ events: Array<{ type?: unknown }> }> }).batches?.flatMap(
            (batch) => batch.events,
          );
    return events?.some((event) => event?.type === "error") ? "control" : "bulk";
  }
  return "bulk";
}

export function isCanonicalRuntimeMessage<AdditionalMessage>(
  message: OutboundMessage<AdditionalMessage>,
): message is SupervisorEvent & {
  type: "thread-runtime-event" | "thread-runtime-events" | "thread-runtime-events-multi";
} {
  const type = messageType(message);
  return (
    type === "thread-runtime-event" ||
    type === "thread-runtime-events" ||
    type === "thread-runtime-events-multi"
  );
}

/** Threads addressed by one canonical envelope (multi envelopes are per batch). */
export function canonicalThreadIdsOf(message: SupervisorEvent): string[] {
  if (typeof message !== "object" || message === null || !("type" in message)) return [];
  if (message.type === "thread-runtime-events-multi") {
    return [...new Set(message.batches.map((batch) => batch.threadId))];
  }
  if (message.type === "thread-runtime-event" || message.type === "thread-runtime-events") {
    return [message.threadId];
  }
  return [];
}

/**
 * Estimated IPC bytes for one message. The caller supplies the value returned
 * for an unmeasurable message (must exceed its own capacity) so the estimator
 * stays independent of the sender's configured queue bounds.
 */
export function estimateMessageBytes<AdditionalMessage>(
  message: OutboundMessage<AdditionalMessage>,
  unmeasurableBytes: number,
): number {
  if (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "thread-output" &&
    "data" in message &&
    typeof message.data === "string"
  ) {
    return Buffer.byteLength(message.data, "utf8") + 128;
  }
  try {
    return Buffer.byteLength(JSON.stringify(message), "utf8");
  } catch {
    return unmeasurableBytes;
  }
}
