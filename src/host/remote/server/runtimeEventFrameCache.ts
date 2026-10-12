import type { RuntimeEvent } from "@/shared/contracts";
import type { RemoteBroadcastEvent } from "./context";
import type { CappedBroadcastEvent } from "./eventSizeGuard";

type RuntimeBroadcastEvent = Extract<
  RemoteBroadcastEvent,
  { type: "thread-runtime-event" | "thread-runtime-events" | "thread-runtime-events-multi" }
>;

export const RUNTIME_EVENT_FRAME_CACHE_MAX_BYTES = 1024 * 1024;
export const RUNTIME_EVENT_FRAME_CACHE_MAX_VARIANTS = 32;

interface SerializedFrame {
  readonly data: string;
  readonly byteLength: number;
}

/** Compare only envelope fields, including their JSON property order. Foreign
 * metadata/accessors/custom serialization fall back to per-client stringify;
 * runtime payloads are never inspected or serialized to build a cache key. */
function sameEnvelope(original: object, scoped: object, contentKey: string): boolean {
  if (
    Object.getPrototypeOf(original) !== Object.prototype ||
    Object.getPrototypeOf(scoped) !== Object.prototype
  ) {
    return false;
  }
  const keys = Object.keys(original);
  const scopedKeys = Object.keys(scoped);
  if (keys.length !== scopedKeys.length || "toJSON" in original || "toJSON" in scoped) return false;
  return keys.every((key, index) => {
    if (key !== scopedKeys[index]) return false;
    const before = Object.getOwnPropertyDescriptor(original, key)!;
    const after = Object.getOwnPropertyDescriptor(scoped, key)!;
    return (
      "value" in before &&
      "value" in after &&
      (key === contentKey || Object.is(before.value, after.value))
    );
  });
}

/** Index the ACTUAL retained references, not their count or the client's
 * interests. Both gates only remove events in order; cloned/foreign/reordered
 * content is deliberately not cacheable. Duplicate references are safe: they
 * serialize identically, and their multiplicity remains in the signature. */
function subsetKey(
  original: readonly RuntimeEvent[],
  kept: readonly RuntimeEvent[],
): string | null {
  if (Object.getPrototypeOf(kept) !== Array.prototype || "toJSON" in kept) return null;
  if (original === kept) return "*";
  const indices: number[] = [];
  let cursor = 0;
  for (let index = 0; index < kept.length; index += 1) {
    // JSON reads indexed data, not an array's possibly foreign iterator.
    const slot = Object.getOwnPropertyDescriptor(kept, index);
    if (!slot || !("value" in slot)) return null;
    const event = slot.value as RuntimeEvent;
    while (cursor < original.length && original[cursor] !== event) cursor += 1;
    if (cursor === original.length) return null;
    indices.push(cursor++);
  }
  return kept.length === original.length ? "*" : indices.join(",");
}

function projectionKey(
  original: RuntimeBroadcastEvent,
  scoped: RemoteBroadcastEvent,
): string | null {
  if (original === scoped) return "full";
  switch (original.type) {
    case "thread-runtime-event": {
      if (scoped.type === original.type) {
        return sameEnvelope(original, scoped, "event") && scoped.event === original.event
          ? "full"
          : null;
      }
      // A withheld single event becomes this exact plural empty envelope. In
      // particular, the existing filters drop single-event flow metadata here.
      const empty = { type: "thread-runtime-events", threadId: original.threadId, events: [] };
      return scoped.type === "thread-runtime-events" &&
        scoped.events.length === 0 &&
        subsetKey([], scoped.events) !== null &&
        sameEnvelope(empty, scoped, "events")
        ? "empty"
        : null;
    }
    case "thread-runtime-events": {
      if (scoped.type !== original.type || !sameEnvelope(original, scoped, "events")) return null;
      const key = subsetKey(original.events, scoped.events);
      return key === null ? null : key === "*" ? "full" : `events:${key}`;
    }
    case "thread-runtime-events-multi": {
      if (
        scoped.type !== original.type ||
        !sameEnvelope(original, scoped, "batches") ||
        Object.getPrototypeOf(scoped.batches) !== Array.prototype ||
        "toJSON" in scoped.batches ||
        original.batches.length !== scoped.batches.length
      ) {
        return null;
      }
      const keys: string[] = [];
      for (let index = 0; index < original.batches.length; index += 1) {
        const before = original.batches[index]!;
        const slot = Object.getOwnPropertyDescriptor(scoped.batches, index);
        if (!slot || !("value" in slot)) return null;
        const after = slot.value as (typeof scoped.batches)[number];
        if (!sameEnvelope(before, after, "events")) return null;
        const key = subsetKey(before.events, after.events);
        if (key === null) return null;
        keys.push(key);
      }
      return keys.every((key) => key === "*") ? "full" : `batches:${keys.join(";")}`;
    }
  }
}

/** Publication-local reuse AFTER all per-client scoping. No policy decisions
 * or scoped frames enter replay history. Canonical objects stay immutable for
 * this synchronous publication; their references identify retained content.
 * Only runtime families participate, leaving git-state projection unchanged.
 *
 * All retained wrappers (including the full frame) plus ASCII keys share the
 * byte/count caps. A miss beyond either cap still serializes and sends normally.
 * Full frames always reuse capBroadcastEvent's JSON and UTF-8 measurement,
 * even when too large to cache. Nothing survives the publication, and wire
 * bytes/semantics are unchanged, so no cache/schema/protocol version is needed.
 */
export function createRuntimeEventFrameCache(
  capped: Extract<CappedBroadcastEvent, { kind: "sendable" }>,
  seq: number,
): { frameFor(scoped: RemoteBroadcastEvent): SerializedFrame } | null {
  const original = capped.event;
  if (
    original.type !== "thread-runtime-event" &&
    original.type !== "thread-runtime-events" &&
    original.type !== "thread-runtime-events-multi"
  ) {
    return null;
  }
  const prefix = `{"type":"event","seq":${seq},"space":"loopback","event":`;
  const fullByteLength = Buffer.byteLength(prefix, "utf8") + capped.bytes + 1;
  const frames = new Map<string, SerializedFrame>();
  let cachedBytes = 0;
  return {
    frameFor(scoped) {
      const key = projectionKey(original, scoped);
      const cached = key === null ? undefined : frames.get(key);
      if (cached) return cached;
      const data =
        key === "full"
          ? `${prefix}${capped.json}}`
          : JSON.stringify({ type: "event", seq, space: "loopback", event: scoped });
      const frame = {
        data,
        byteLength: key === "full" ? fullByteLength : Buffer.byteLength(data, "utf8"),
      };
      if (
        key !== null &&
        frames.size < RUNTIME_EVENT_FRAME_CACHE_MAX_VARIANTS &&
        cachedBytes + frame.byteLength + key.length <= RUNTIME_EVENT_FRAME_CACHE_MAX_BYTES
      ) {
        frames.set(key, frame);
        cachedBytes += frame.byteLength + key.length;
      }
      return frame;
    },
  };
}
