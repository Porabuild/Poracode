import type { EventSequenceSpace } from "@/shared/eventSequenceSpace";
import type { SupervisorEvent } from "@/shared/ipc";

/**
 * Private frame vocabulary of the desktop-internal loopback socket
 * (`desktopInternal=1`). These envelopes are NOT part of the public remote
 * wire schema: the loopback-only authorization on the server side is what
 * admits them, so they are validated by the loopback-only validator here
 * instead of by the paired-session protocol parser — the public schema is
 * never widened to fit them.
 *
 * A3 splits the contract into two halves:
 * - `validateDesktopLoopbackFrame(value)` validates an ALREADY parsed JSON
 *   value. The engine worker parses and validates off the UI thread; nothing
 *   half-validated may reach a handler.
 * - `parseDesktopLoopbackFrame(raw)` is the same validator plus the JSON parse,
 *   for the panel-less platform path and for tests.
 *
 * The union is intentionally closed: neither function throws, and malformed
 * input becomes an `invalid` frame.
 */
export type DesktopLoopbackFrame =
  | {
      readonly kind: "event";
      readonly event: SupervisorEvent;
      readonly seq?: number;
      readonly space: EventSequenceSpace;
    }
  | { readonly kind: "terminal"; readonly frame: Record<string, unknown> }
  | { readonly kind: "pong"; readonly id: string | undefined }
  | { readonly kind: "ready" }
  | { readonly kind: "resync-required" }
  | { readonly kind: "invalid" };

const TERMINAL_FRAME_TYPES = new Set([
  "terminal-output",
  "terminal-watch-result",
  "terminal-watch-baseline-chunk",
]);

const EVENT_SEQUENCE_SPACES: ReadonlySet<string> = new Set(["ipc", "loopback"]);

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * Strict private validation of one loopback envelope. Beyond the envelope
 * literals this checks the fields routing depends on: a positive integer `seq`
 * when present (so a malformed cursor can never advance the transport's
 * per-space arbitration) and a known `space` literal when present. The event
 * payload remains the desktop `SupervisorEvent` union, which only the desktop
 * consumes — paired clients never validate against this vocabulary.
 */
export function validateDesktopLoopbackFrame(value: unknown): DesktopLoopbackFrame {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { kind: "invalid" };
  const frame = value as Record<string, unknown>;
  const type = frame.type;
  if (type === "event" || type === "desktop-event") {
    const event = frame.event;
    if (!event || typeof event !== "object" || Array.isArray(event)) return { kind: "invalid" };
    if (typeof (event as { type?: unknown }).type !== "string") return { kind: "invalid" };
    if (frame.seq !== undefined && !isPositiveInteger(frame.seq)) return { kind: "invalid" };
    if (frame.space !== undefined && !EVENT_SEQUENCE_SPACES.has(String(frame.space))) {
      return { kind: "invalid" };
    }
    const space: EventSequenceSpace =
      frame.space === "ipc" || frame.space === "loopback"
        ? frame.space
        : type === "desktop-event"
          ? "ipc"
          : "loopback";
    const seq = frame.seq as number | undefined;
    return {
      kind: "event",
      event: event as SupervisorEvent,
      space,
      ...(seq !== undefined ? { seq } : {}),
    };
  }
  if (typeof type === "string" && TERMINAL_FRAME_TYPES.has(type)) {
    return { kind: "terminal", frame };
  }
  if (type === "pong") {
    return { kind: "pong", id: typeof frame.id === "string" ? frame.id : undefined };
  }
  if (type === "ready") return { kind: "ready" };
  if (type === "resync-required") return { kind: "resync-required" };
  return { kind: "invalid" };
}

export function parseDesktopLoopbackFrame(raw: unknown): DesktopLoopbackFrame {
  try {
    return validateDesktopLoopbackFrame(JSON.parse(String(raw)));
  } catch {
    return { kind: "invalid" };
  }
}

export interface DesktopLoopbackFramePorts {
  readonly dispatch: (event: SupervisorEvent, seq?: number, space?: EventSequenceSpace) => void;
  readonly requestRebuild: () => void;
  /** Routes a non-event server frame (terminal machinery); true when consumed. */
  readonly onServerFrame?: (message: unknown) => boolean;
  /** Correlated health-pong acceptance. */
  readonly onPong?: (id: string | undefined) => void;
  /**
   * A private `resync-required` frame: the server's shared stream restarted, or
   * a catalog change was not deliverable on this socket's upgrade (undeclared
   * or oversized). Runs after the subscribed-thread rebuild request, so the
   * wiring can restart its bounded catalog recovery as well — a resync may
   * hide membership AND order changes, and rows-only recovery must not wait
   * out the reconcile interval.
   */
  readonly onResyncRequired?: () => void;
}

export function routeDesktopLoopbackFrame(
  frame: DesktopLoopbackFrame,
  ports: DesktopLoopbackFramePorts,
): void {
  switch (frame.kind) {
    case "event":
      ports.dispatch(frame.event, frame.seq, frame.space);
      return;
    case "terminal":
      ports.onServerFrame?.(frame.frame);
      return;
    case "pong":
      ports.onPong?.(frame.id);
      return;
    case "resync-required":
      // The server's shared stream reset (or an undeliverable catalog change):
      // rebuild once, and let the wiring restart its bounded catalog passes.
      ports.requestRebuild();
      ports.onResyncRequired?.();
      return;
    case "ready":
    case "invalid":
      return;
  }
}
