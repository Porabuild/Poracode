import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import type { RemoteBroadcastEvent } from "./context";
import { capBroadcastEvent } from "./eventSizeGuard";
import { filterEventForItemInterests } from "./itemInterestFilter";
import {
  createRuntimeEventFrameCache,
  RUNTIME_EVENT_FRAME_CACHE_MAX_BYTES,
  RUNTIME_EVENT_FRAME_CACHE_MAX_VARIANTS,
} from "./runtimeEventFrameCache";

afterEach(() => vi.restoreAllMocks());

function delta(itemId = "item", text = "hidden 界🙂"): RuntimeEvent {
  return {
    type: "content.delta",
    threadId: "thread",
    itemId,
    stream: "assistant_text",
    delta: text,
  };
}

function cacheFor(event: RemoteBroadcastEvent) {
  const capped = capBroadcastEvent(event, 16 * 1024 * 1024);
  if (capped.kind !== "sendable") throw new Error("Expected sendable fixture");
  const cache = createRuntimeEventFrameCache(capped, 7);
  if (!cache) throw new Error("Expected runtime fixture");
  return { cache, capped };
}

const families = ["single", "plural", "multi"] as const;

function envelope(family: (typeof families)[number], events: RuntimeEvent[]): RemoteBroadcastEvent {
  switch (family) {
    case "single":
      return { type: "thread-runtime-event", threadId: "thread", event: events[0]! };
    case "plural":
      return { type: "thread-runtime-events", threadId: "thread", events };
    case "multi":
      return { type: "thread-runtime-events-multi", batches: [{ threadId: "thread", events }] };
  }
}

describe("runtime event frame reuse", () => {
  it.each(families)(
    "serializes equivalent %s empties once and reuses the full capped bytes",
    (family) => {
      const event = envelope(family, [delta()]);
      const { cache, capped } = cacheFor(event);
      const stringify = vi.spyOn(JSON, "stringify");
      const full = cache.frameFor(event);
      expect(cache.frameFor(event)).toBe(full);
      expect(stringify).not.toHaveBeenCalled();

      const empty = cache.frameFor(filterEventForItemInterests(event, new Set()));
      for (let index = 0; index < 16; index += 1) {
        expect(cache.frameFor(filterEventForItemInterests(event, new Set()))).toBe(empty);
      }
      expect(stringify).toHaveBeenCalledOnce();
      expect(full.data).toBe(`{"type":"event","seq":7,"space":"loopback","event":${capped.json}}`);
      expect(full.byteLength).toBe(Buffer.byteLength(full.data, "utf8"));
      expect(empty.byteLength).toBe(Buffer.byteLength(empty.data, "utf8"));
      expect(JSON.parse(empty.data)).toEqual({
        type: "event",
        seq: 7,
        space: "loopback",
        event: filterEventForItemInterests(event, new Set()),
      });
      expect(empty.data).not.toContain("hidden");
    },
  );

  it("distinguishes equal-length retained subsets by reference, including duplicate references", () => {
    const first = delta("first");
    const second = delta("second");
    const event = {
      type: "thread-runtime-events",
      threadId: "thread",
      events: [first, first, second],
    } as const;
    const { cache } = cacheFor({ ...event, events: [...event.events] });
    const stringify = vi.spyOn(JSON, "stringify");
    const a = cache.frameFor({ ...event, events: [first, first] });
    const b = cache.frameFor({ ...event, events: [first, second] });
    expect(cache.frameFor({ ...event, events: [first, first] })).toBe(a);
    expect(cache.frameFor({ ...event, events: [first, second] })).toBe(b);
    expect(stringify).toHaveBeenCalledTimes(2);
    expect(JSON.parse(a.data).event.events).toEqual([first, first]);
    expect(JSON.parse(b.data).event.events).toEqual([first, second]);
  });

  it("keeps each multi batch's subset separate even with equal total lengths and repeated thread IDs", () => {
    const first = delta("first");
    const second = delta("second");
    const event = {
      type: "thread-runtime-events-multi",
      batches: [
        { threadId: "thread", events: [first] },
        { threadId: "thread", events: [second] },
      ],
      flowSeq: 19,
      flowBytes: 202,
    } satisfies RemoteBroadcastEvent;
    const { cache } = cacheFor(event);
    const left = {
      ...event,
      batches: [
        { ...event.batches[0]!, events: [first] },
        { ...event.batches[1]!, events: [] },
      ],
    };
    const right = {
      ...event,
      batches: [
        { ...event.batches[0]!, events: [] },
        { ...event.batches[1]!, events: [second] },
      ],
    };
    const stringify = vi.spyOn(JSON, "stringify");
    const a = cache.frameFor(left);
    const b = cache.frameFor(right);
    expect(cache.frameFor(left)).toBe(a);
    expect(cache.frameFor(right)).toBe(b);
    expect(stringify).toHaveBeenCalledTimes(2);
    expect(JSON.parse(a.data).event).toEqual(left);
    expect(JSON.parse(b.data).event).toEqual(right);
  });

  it("preserves plural flow metadata and the existing single-to-empty metadata removal", () => {
    for (const family of ["single", "plural"] as const) {
      const event = { ...envelope(family, [delta()]), flowSeq: 9, flowBytes: 500 };
      const { cache } = cacheFor(event);
      const scoped = filterEventForItemInterests(event, new Set());
      expect(JSON.parse(cache.frameFor(scoped).data).event).toEqual(scoped);
      expect("flowSeq" in scoped).toBe(family === "plural");
    }
  });

  it("falls back for cloned/foreign content, changed metadata, reordered keys and custom array serialization", () => {
    const first = delta("first");
    const second = delta("second");
    const event = {
      type: "thread-runtime-events",
      threadId: "thread",
      events: [first, second],
      flowSeq: 9,
    } as const;
    const { cache } = cacheFor({ ...event, events: [...event.events] });
    const custom = Object.assign([first], { toJSON: () => [second] });
    const accessor = [first];
    Object.defineProperty(accessor, 0, { get: () => first });
    const foreign = [
      { ...event, events: [{ ...first }] },
      { ...event, events: [delta("foreign")] },
      { ...event, events: [second, first] },
      { ...event, events: [first], flowSeq: 10 },
      { ...event, events: [first], threadId: "foreign" },
      { ...event, events: [first], extra: "unknown" },
      { threadId: event.threadId, type: event.type, events: [first], flowSeq: 9 },
      { ...event, events: custom },
      { ...event, events: accessor },
    ];
    const stringify = vi.spyOn(JSON, "stringify");
    for (const scoped of foreign) {
      const a = cache.frameFor(scoped);
      const b = cache.frameFor(scoped);
      expect(b).not.toBe(a);
      expect(b.data).toBe(a.data);
    }
    expect(stringify).toHaveBeenCalledTimes(foreign.length * 2);
    expect(JSON.parse(cache.frameFor(foreign[0]!).data).event.events).toEqual([first]);
    expect(JSON.parse(cache.frameFor({ ...event, events: custom }).data).event.events).toEqual([
      second,
    ]);
  });

  it("bounds retained variants while still delivering later projections and reusing earlier ones", () => {
    const events = Array.from({ length: RUNTIME_EVENT_FRAME_CACHE_MAX_VARIANTS + 1 }, (_, index) =>
      delta(String(index)),
    );
    const event = { type: "thread-runtime-events", threadId: "thread", events } as const;
    const { cache } = cacheFor(event);
    const stringify = vi.spyOn(JSON, "stringify");
    const frames = events.map((kept) => cache.frameFor({ ...event, events: [kept] }));
    expect(stringify).toHaveBeenCalledTimes(33);
    expect(cache.frameFor({ ...event, events: [events[0]!] })).toBe(frames[0]);
    const overflow = cache.frameFor({ ...event, events: [events.at(-1)!] });
    expect(overflow).not.toBe(frames.at(-1));
    expect(overflow).toEqual(frames.at(-1));
    expect(stringify).toHaveBeenCalledTimes(34);
  });

  it("bounds cached UTF-8 string bytes including full frames, without losing oversized projections", () => {
    // Each partial fits, their sum and the full frame exceed 1 MiB; counting
    // JS code units instead of UTF-8 bytes would incorrectly retain both.
    const events = [delta("first", "界".repeat(200_000)), delta("second", "界".repeat(200_000))];
    const event = { type: "thread-runtime-events", threadId: "thread", events } as const;
    const { cache } = cacheFor(event);
    const stringify = vi.spyOn(JSON, "stringify");
    const full = cache.frameFor(event);
    expect(full.byteLength).toBeGreaterThan(RUNTIME_EVENT_FRAME_CACHE_MAX_BYTES);
    expect(cache.frameFor(event)).toEqual(full);
    expect(cache.frameFor(event)).not.toBe(full);
    expect(stringify).not.toHaveBeenCalled();
    const first = cache.frameFor({ ...event, events: [events[0]!] });
    const second = cache.frameFor({ ...event, events: [events[1]!] });
    expect(first.byteLength + second.byteLength).toBeGreaterThan(
      RUNTIME_EVENT_FRAME_CACHE_MAX_BYTES,
    );
    expect(cache.frameFor({ ...event, events: [events[0]!] })).toBe(first);
    expect(cache.frameFor({ ...event, events: [events[1]!] })).not.toBe(second);
    expect(stringify).toHaveBeenCalledTimes(3);
    expect(second.byteLength).toBe(Buffer.byteLength(second.data, "utf8"));
    expect(JSON.parse(second.data).event.events).toEqual([events[1]]);
  });

  it("does not cache unrelated git-state projections", () => {
    const capped = capBroadcastEvent({ type: "remote-git-state", patch: { revision: 1 } }, 1024);
    if (capped.kind !== "sendable") throw new Error("Expected sendable fixture");
    expect(createRuntimeEventFrameCache(capped, 7)).toBeNull();
  });
});
