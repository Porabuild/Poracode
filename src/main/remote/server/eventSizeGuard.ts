import { remoteOmittedField } from "@/shared/remote";
import { projectPayloadImageRefs } from "./imageRefProjection";
import type { RuntimeEvent } from "@/shared/contracts";
import type { BufferedSupervisorEvent, RemoteBroadcastEvent } from "./context";

/**
 * Keeps a single broadcast event small enough that `sendRaw` will actually send
 * it.
 *
 * `RemoteAccessServer.sendRaw` terminates any socket whose
 * `bufferedAmount + messageBytes` would exceed the outbound budget, so one
 * oversized event disconnects every connected client — and, because the event
 * also lands in the replay buffer, disconnects them again on reconnect until
 * the replay window rolls over. Runtime payloads carrying inline base64 images
 * routinely reach 5-12 MB against a 4 MB default budget, so this is a live
 * failure and not a theoretical one.
 *
 * The cap is deliberately minimal: fields are withheld largest-first and only
 * until the event fits, so an event that is already deliverable is passed
 * through untouched and a merely large one keeps everything it can. Withheld
 * bytes are never lost — the full payload is persisted to SQLite before the cap
 * is applied and reaches the client over HTTP on the next history fetch.
 */

/**
 * Fraction of the outbound socket budget a single event may occupy, leaving room
 * for one other in-flight message. Deliberately generous: the goal is to
 * withhold only what cannot be delivered, not to shrink everything large. On the
 * 4 MB default this caps events at 2 MB — measured against a real 6.5k-item
 * database that withholds fields from 18 items (all ≥2 MB, i.e. one queued
 * message away from killing the socket anyway) while the 39 items between 1 and
 * 2 MB keep streaming exactly as they do today.
 */
const EVENT_BUDGET_FRACTION = 0.5;

/** Total bytes of capped events retained for replay, independent of the entry
 * count limit. Bounds desktop memory when many large-but-deliverable events
 * arrive in a burst. */
export const DEFAULT_EVENT_BUFFER_MAX_BYTES = 8 * 1024 * 1024;

/** Never exceeds the socket budget itself, so a "sendable" verdict always means
 * the event can actually leave the server. */
export function maxBroadcastEventBytes(outboundBudgetBytes: number): number {
  return Math.max(1, Math.floor(outboundBudgetBytes * EVENT_BUDGET_FRACTION));
}

export type CappedBroadcastEvent =
  | {
      /** Fits as-is; `json` is the serialized event, reusable by the caller. */
      readonly kind: "sendable";
      readonly event: RemoteBroadcastEvent;
      readonly json: string;
      readonly bytes: number;
      readonly omittedBytes: number;
    }
  | {
      /** Cannot be shrunk to fit. Callers must fall back to a resync rather
       * than pushing it onto the wire. */
      readonly kind: "undeliverable";
      readonly bytes: number;
    };

/**
 * Applies `fn` to every runtime-item payload reachable from a broadcast event,
 * rebuilding only the objects along the path so untouched subtrees stay shared
 * (important: the payloads being withheld are multi-megabyte).
 *
 * `slot` is a stable per-payload identifier so a measuring pass and a
 * rewriting pass agree on which payload is which.
 */
function mapRuntimePayloads(
  event: RemoteBroadcastEvent,
  fn: (payload: unknown, slot: string, threadId: string, itemId: string | undefined) => unknown,
): RemoteBroadcastEvent {
  const mapRuntimeEvent = (
    runtimeEvent: RuntimeEvent,
    slot: string,
    threadId: string,
  ): RuntimeEvent => {
    switch (runtimeEvent.type) {
      case "item.started":
      case "item.updated":
      case "item.completed":
      case "request.opened": {
        if (runtimeEvent.payload === undefined) return runtimeEvent;
        // `request.opened` is keyed by requestId, not itemId: it has no
        // addressable persisted item, so image projection skips it (an omission
        // marker from the size cap is still available).
        const itemId = "itemId" in runtimeEvent ? runtimeEvent.itemId : undefined;
        const next = fn(runtimeEvent.payload, slot, threadId, itemId);
        return next === runtimeEvent.payload
          ? runtimeEvent
          : ({ ...runtimeEvent, payload: next } as RuntimeEvent);
      }
      default:
        return runtimeEvent;
    }
  };

  const mapList = (
    events: readonly RuntimeEvent[],
    prefix: string,
    threadId: string,
  ): readonly RuntimeEvent[] => {
    let changed = false;
    const next = events.map((runtimeEvent, index) => {
      const mapped = mapRuntimeEvent(runtimeEvent, `${prefix}:${index}`, threadId);
      if (mapped !== runtimeEvent) changed = true;
      return mapped;
    });
    return changed ? next : events;
  };

  switch (event.type) {
    case "thread-runtime-event": {
      const mapped = mapRuntimeEvent(event.event, "e", event.threadId);
      return mapped === event.event ? event : { ...event, event: mapped };
    }
    case "thread-runtime-events": {
      const mapped = mapList(event.events, "l", event.threadId);
      return mapped === event.events ? event : { ...event, events: [...mapped] };
    }
    case "thread-runtime-events-multi": {
      let changed = false;
      const batches = event.batches.map((batch, index) => {
        const mapped = mapList(batch.events, `b${index}`, batch.threadId);
        if (mapped === batch.events) return batch;
        changed = true;
        return { ...batch, events: [...mapped] };
      });
      return changed ? { ...event, batches } : event;
    }
    default:
      return event;
  }
}

interface OmissionCandidate {
  readonly slot: string;
  readonly field: string;
  readonly bytes: number;
}

function byteLength(value: unknown): number {
  try {
    const json = JSON.stringify(value);
    return json === undefined ? 0 : Buffer.byteLength(json, "utf8");
  } catch {
    // Circular / non-serializable payloads cannot be sized; treat them as
    // enormous so they are withheld rather than crashing the publish path.
    return Number.MAX_SAFE_INTEGER;
  }
}

function collectCandidates(event: RemoteBroadcastEvent): OmissionCandidate[] {
  const candidates: OmissionCandidate[] = [];
  mapRuntimePayloads(event, (payload, slot) => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
    for (const [field, value] of Object.entries(payload as Record<string, unknown>)) {
      candidates.push({ slot, field, bytes: byteLength(value) });
    }
    return payload;
  });
  return candidates.sort((a, b) => b.bytes - a.bytes);
}

/**
 * Replaces inline image bytes with host-minted references before the event is
 * measured. This runs first because it is the *lossless* reduction — the client
 * can fetch every referenced image on demand — whereas the size cap below
 * withholds a field until the next history fetch. In practice this keeps image
 * events far under budget, so the cap rarely has to act at all.
 */
function projectEventImageRefs(event: RemoteBroadcastEvent): RemoteBroadcastEvent {
  return mapRuntimePayloads(event, (payload, _slot, threadId, itemId) => {
    if (itemId === undefined) return payload;
    return projectPayloadImageRefs(threadId, itemId, payload).payload;
  });
}

/**
 * Serializes `event`, and when it exceeds `maxBytes` withholds its largest
 * runtime payload fields until it fits.
 */
export function capBroadcastEvent(
  original: RemoteBroadcastEvent,
  maxBytes: number,
): CappedBroadcastEvent {
  const event = projectEventImageRefs(original);
  const json = JSON.stringify(event);
  const bytes = json === undefined ? 0 : Buffer.byteLength(json, "utf8");
  if (bytes <= maxBytes) {
    return { kind: "sendable", event, json: json ?? "null", bytes, omittedBytes: 0 };
  }

  const candidates = collectCandidates(event);
  if (candidates.length === 0) return { kind: "undeliverable", bytes };

  // Withhold largest-first, estimating the saving as (field bytes - marker
  // bytes) so only as many fields as necessary are dropped. The estimate is
  // verified by a real re-serialize below.
  const omit = new Map<string, Set<string>>();
  let omittedBytes = 0;
  let projected = bytes;
  for (const candidate of candidates) {
    if (projected <= maxBytes) break;
    const markerBytes =
      byteLength(remoteOmittedField(candidate.bytes)) + candidate.field.length + 4;
    if (candidate.bytes <= markerBytes) continue;
    const fields = omit.get(candidate.slot) ?? new Set<string>();
    fields.add(candidate.field);
    omit.set(candidate.slot, fields);
    omittedBytes += candidate.bytes;
    projected -= candidate.bytes - markerBytes;
  }
  if (omit.size === 0) return { kind: "undeliverable", bytes };

  const capped = mapRuntimePayloads(event, (payload, slot) => {
    const fields = omit.get(slot);
    if (!fields || !payload || typeof payload !== "object" || Array.isArray(payload))
      return payload;
    const next: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
    for (const field of fields) {
      next[field] = remoteOmittedField(byteLength((payload as Record<string, unknown>)[field]));
    }
    return next;
  });

  const cappedJson = JSON.stringify(capped);
  const cappedBytes = cappedJson === undefined ? 0 : Buffer.byteLength(cappedJson, "utf8");
  if (cappedBytes > maxBytes) return { kind: "undeliverable", bytes: cappedBytes };
  return {
    kind: "sendable",
    event: capped,
    json: cappedJson ?? "null",
    bytes: cappedBytes,
    omittedBytes,
  };
}

/** Drops the oldest replay entries until both the count and byte limits hold. */
export function trimEventBuffer(
  buffer: BufferedSupervisorEvent[],
  maxEntries: number,
  maxBytes: number,
): void {
  if (buffer.length > maxEntries) {
    buffer.splice(0, buffer.length - maxEntries);
  }
  let total = 0;
  for (const entry of buffer) total += entry.bytes;
  let dropped = 0;
  while (dropped < buffer.length && total > maxBytes) {
    total -= buffer[dropped]!.bytes;
    dropped += 1;
  }
  // Never empty the buffer entirely on a single oversized entry: keeping the
  // newest one preserves the "client is current" fast path on reconnect.
  if (dropped >= buffer.length) dropped = buffer.length - 1;
  if (dropped > 0) buffer.splice(0, dropped);
}
