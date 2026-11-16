import {
  parseDesktopLoopbackFrame,
  type DesktopLoopbackFrame,
} from "@/renderer/state/remoteServers/desktopLoopbackFrames";
import type { SupervisorEvent } from "@/shared/ipc";

/**
 * Worker-hosted loopback WebSocket protocol.
 *
 * When a real browser `Worker` and `WebSocket` exist inside that worker, the
 * managed desktop loopback leg opens its WebSocket directly inside a dedicated
 * worker thread instead of on the renderer UI thread:
 * - Inbound socket frames never wake the UI thread individually.
 * - `JSON.parse` + envelope validation run inside the worker.
 * - Consecutive redundant frames within a 12ms batch window (`thread-state` per
 *   thread, `provider-usage` per provider, `provider-usage-all`) coalesce in
 *   place before crossing `postMessage` to the UI thread, and empty runtime
 *   event envelopes are dropped inside the worker.
 * - The UI thread receives compact pre-decoded frame batches and drains them
 *   with an 8ms cooperative frame budget so input and 60/120fps animations
 *   never starve under heavy multi-agent streaming.
 */
// Private, build-coupled v1 includes batch ids and drain acknowledgements on
// both endpoints. Nothing is persisted or exchanged with remote/older hosts.
export const DESKTOP_LOOPBACK_WORKER_PROTOCOL_VERSION = 1 as const;

export type DesktopLoopbackWorkerClientMessage =
  | {
      readonly v: typeof DESKTOP_LOOPBACK_WORKER_PROTOCOL_VERSION;
      readonly type: "connect";
      readonly socketId: number;
      readonly url: string;
    }
  | {
      readonly v: typeof DESKTOP_LOOPBACK_WORKER_PROTOCOL_VERSION;
      readonly type: "send";
      readonly socketId: number;
      readonly data: string;
    }
  | {
      readonly v: typeof DESKTOP_LOOPBACK_WORKER_PROTOCOL_VERSION;
      readonly type: "close";
      readonly socketId: number;
    }
  | {
      readonly v: typeof DESKTOP_LOOPBACK_WORKER_PROTOCOL_VERSION;
      readonly type: "ack";
      readonly socketId: number;
      readonly batchId: number;
    };

export type DesktopLoopbackWorkerServerMessage =
  | {
      readonly v: typeof DESKTOP_LOOPBACK_WORKER_PROTOCOL_VERSION;
      readonly type: "open";
      readonly socketId: number;
    }
  | {
      readonly v: typeof DESKTOP_LOOPBACK_WORKER_PROTOCOL_VERSION;
      readonly type: "frames";
      readonly socketId: number;
      readonly batchId: number;
      readonly frames: readonly DesktopLoopbackFrame[];
    }
  | {
      readonly v: typeof DESKTOP_LOOPBACK_WORKER_PROTOCOL_VERSION;
      readonly type: "close";
      readonly socketId: number;
      readonly code?: number;
      readonly reason?: string;
    }
  | {
      readonly v: typeof DESKTOP_LOOPBACK_WORKER_PROTOCOL_VERSION;
      readonly type: "overflow";
      readonly socketId: number;
    };

/** Returns true when a decoded frame is a pure no-op runtime envelope with no omissions. */
export function isNoOpLoopbackFrame(frame: DesktopLoopbackFrame): boolean {
  if (frame.kind === "invalid") return true;
  if (frame.kind !== "event") return false;
  if (frame.omittedRuntimeThreadIds && frame.omittedRuntimeThreadIds.length > 0) return false;
  const event = frame.event;
  if (event.type === "thread-runtime-events") {
    return event.events.length === 0;
  }
  if (event.type === "thread-runtime-events-multi") {
    return event.batches.every((batch) => batch.events.length === 0);
  }
  return false;
}

/**
 * Key for coalescing idempotent state-replacement frames within a single flush
 * batch (modeled after OpenCode's `global-sdk` event coalescer). Only frames
 * whose payload is a full state replacement with no side-effect delta may
 * coalesce in place; `thread-state` only coalesces when `status` matches the
 * prior queued entry so transient `working -> idle` edges are never lost.
 */
export function coalesceKeyForSupervisorEvent(event: SupervisorEvent): string | null {
  switch (event.type) {
    case "provider-usage":
      return `provider-usage:${event.snapshot.providerId}`;
    case "provider-usage-all":
      return "provider-usage-all";
    case "agent-status-updated":
      return `agent-status:${event.status.kind}:${event.status.envDistro ?? ""}`;
    case "windows-agent-statuses":
      return "windows-agent-statuses";
    case "wsl-agent-statuses":
      return "wsl-agent-statuses";
    default:
      return null;
  }
}

/**
 * Coalesces a batch of raw loopback WebSocket strings into validated, compact
 * `DesktopLoopbackFrame`s ready for UI routing while strictly preserving
 * monotonic sequence ordering (`PreloadIpcTransport` drops `seq <= lastSeq`).
 */
export function coalesceDecodedLoopbackFrames(
  decoded: readonly DesktopLoopbackFrame[],
): DesktopLoopbackFrame[] {
  const slots: Array<DesktopLoopbackFrame | null> = [];
  const coalescedIndexByKey = new Map<string, number>();

  for (const frame of decoded) {
    if (isNoOpLoopbackFrame(frame)) continue;
    if (frame.kind === "event") {
      const key = coalesceKeyForSupervisorEvent(frame.event);
      if (key !== null) {
        const existingIndex = coalescedIndexByKey.get(key);
        if (existingIndex !== undefined) {
          // Tombstone the older slot and append at the tail so `seq` stays
          // strictly increasing across interleaved frames in the same space!
          slots[existingIndex] = null;
        }
        coalescedIndexByKey.set(key, slots.length);
        slots.push(frame);
        continue;
      }
      if (frame.event.type === "thread-state") {
        // Walk back past tombstones to inspect the last surviving frame.
        let prevIdx = slots.length - 1;
        while (prevIdx >= 0 && slots[prevIdx] === null) prevIdx -= 1;
        const prev = prevIdx >= 0 ? slots[prevIdx] : null;
        if (
          prev?.kind === "event" &&
          prev.event.type === "thread-state" &&
          prev.event.threadId === frame.event.threadId &&
          prev.event.status === frame.event.status &&
          prev.event.attention === frame.event.attention &&
          !frame.event.forceCloseActiveTurn &&
          !prev.event.forceCloseActiveTurn &&
          prev.event.interruptedTurn === undefined &&
          prev.event.errorMessage === undefined &&
          !prev.event.turnStopRequested
        ) {
          // Merge `prev.event` beneath `frame.event` so optional patch fields
          // emitted only on the earlier frame (e.g. `sessionRef`, `slashCommands`)
          // are never dropped when coalescing adjacent updates!
          slots[prevIdx] = {
            ...frame,
            event: {
              ...prev.event,
              ...frame.event,
            },
          };
          continue;
        }
      }
    }
    slots.push(frame);
  }
  return slots.filter((slot): slot is DesktopLoopbackFrame => slot !== null);
}

export function decodeAndCoalesceRawLoopbackBatch(
  rawFrames: readonly string[],
): DesktopLoopbackFrame[] {
  const decoded: DesktopLoopbackFrame[] = [];
  for (const raw of rawFrames) {
    decoded.push(parseDesktopLoopbackFrame(raw));
  }
  return coalesceDecodedLoopbackFrames(decoded);
}
