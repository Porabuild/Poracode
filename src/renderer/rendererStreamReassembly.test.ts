import { describe, expect, it } from "vitest";
import { BACKEND_RENDERER_STREAM_VERSION } from "@/shared/backendHostProtocol";
import { LARGE_REPLY_MAX_ENCODED_FRAME_BYTES, utf8ByteLength } from "@/shared/rendererStreamChunks";
import { RendererStreamReassembly, type ReassemblyEvents } from "./rendererStreamReassembly";

function eventsFor(pending: Set<string>) {
  const sentAck: Array<{ id: string; seq: number }> = [];
  const sentCancel: string[] = [];
  const resolved = new Map<string, unknown>();
  const rejected = new Map<string, Error>();
  const events: ReassemblyEvents = {
    sendAck: (id, seq) => sentAck.push({ id, seq }),
    sendCancel: (id) => sentCancel.push(id),
    resolveReply: (id, data) => {
      pending.delete(id);
      resolved.set(id, data);
    },
    rejectReply: (id, error) => {
      pending.delete(id);
      rejected.set(id, error);
    },
  };
  return {
    events,
    sentAck,
    sentCancel,
    resolved,
    rejected,
    hasPending: (id: string) => pending.has(id),
  };
}

function start(id: string, totalBytes: number) {
  return { version: BACKEND_RENDERER_STREAM_VERSION, type: "reply-start", id, totalBytes };
}

function chunk(id: string, seq: number, data: string) {
  return { version: BACKEND_RENDERER_STREAM_VERSION, type: "reply-chunk", id, seq, data };
}

function end(id: string, totalBytes: number) {
  return { version: BACKEND_RENDERER_STREAM_VERSION, type: "reply-end", id, totalBytes };
}

describe("rendererStreamReassembly", () => {
  it("reassembles one transfer and ACKs only after acceptance", () => {
    const reassembly = new RendererStreamReassembly();
    const pending = new Set(["r1"]);
    const { events, sentAck, resolved } = eventsFor(pending);
    const serialized = JSON.stringify({ hello: "world" });
    const total = utf8ByteLength(serialized);
    const mid = Math.floor(serialized.length / 2);
    expect(
      reassembly.handleBackendFrame(start("r1", total), 100, events, (id) => pending.has(id)),
    ).toBe(true);
    expect(
      reassembly.handleBackendFrame(chunk("r1", 0, serialized.slice(0, mid)), 100, events, (id) =>
        pending.has(id),
      ),
    ).toBe(true);
    expect(sentAck).toEqual([{ id: "r1", seq: 0 }]);
    expect(
      reassembly.handleBackendFrame(chunk("r1", 1, serialized.slice(mid)), 100, events, (id) =>
        pending.has(id),
      ),
    ).toBe(true);
    expect(
      reassembly.handleBackendFrame(end("r1", total), 100, events, (id) => pending.has(id)),
    ).toBe(true);
    expect(resolved.get("r1")).toEqual({ hello: "world" });
    expect(reassembly.activeCount()).toBe(0);
  });

  it("ignores stale and duplicate chunks without credit or revive", () => {
    const reassembly = new RendererStreamReassembly();
    const pending = new Set(["r1"]);
    const { events, sentAck, resolved } = eventsFor(pending);
    const serialized = JSON.stringify({ n: 1 });
    const total = utf8ByteLength(serialized);
    reassembly.handleBackendFrame(start("r1", total), 50, events, (id) => pending.has(id));
    // Stale id: never revives, but prompts sender release.
    reassembly.handleBackendFrame(chunk("unknown", 0, "x"), 50, events, (id) => pending.has(id));
    expect(resolved.size).toBe(0);
    reassembly.handleBackendFrame(chunk("r1", 0, serialized), 50, events, (id) => pending.has(id));
    expect(sentAck).toHaveLength(1);
    // Duplicate: safely dropped, no second ACK.
    reassembly.handleBackendFrame(chunk("r1", 0, serialized), 50, events, (id) => pending.has(id));
    expect(sentAck).toHaveLength(1);
    reassembly.handleBackendFrame(end("r1", total), 50, events, (id) => pending.has(id));
    expect(resolved.get("r1")).toEqual({ n: 1 });
  });

  it("fails out-of-order with a bounded error and keeps the socket alive", () => {
    const reassembly = new RendererStreamReassembly();
    const pending = new Set(["r1"]);
    const { events, rejected, sentCancel } = eventsFor(pending);
    const serialized = JSON.stringify({ n: 1 });
    reassembly.handleBackendFrame(start("r1", utf8ByteLength(serialized)), 50, events, (id) =>
      pending.has(id),
    );
    reassembly.handleBackendFrame(chunk("r1", 5, "future"), 50, events, (id) => pending.has(id));
    expect(rejected.get("r1")).toBeInstanceOf(Error);
    expect(sentCancel).toContain("r1");
    expect(reassembly.activeCount()).toBe(0);
    expect(pending.has("r1")).toBe(false);
  });

  it("rejects oversized encoded frames and total mismatches", () => {
    const reassembly = new RendererStreamReassembly();
    const pending = new Set(["r1", "r2"]);
    const { events, rejected } = eventsFor(pending);
    const serialized = JSON.stringify({ n: 1 });
    const total = utf8ByteLength(serialized);
    reassembly.handleBackendFrame(start("r1", total), 50, events, (id) => pending.has(id));
    reassembly.handleBackendFrame(
      chunk("r1", 0, serialized),
      LARGE_REPLY_MAX_ENCODED_FRAME_BYTES + 1,
      events,
      (id) => pending.has(id),
    );
    expect(rejected.get("r1")).toBeInstanceOf(Error);
    reassembly.handleBackendFrame(start("r2", total), 50, events, (id) => pending.has(id));
    reassembly.handleBackendFrame(chunk("r2", 0, serialized), 50, events, (id) => pending.has(id));
    reassembly.handleBackendFrame(end("r2", total + 1), 50, events, (id) => pending.has(id));
    expect(rejected.get("r2")).toBeInstanceOf(Error);
  });

  it("bounds concurrent reassemblies and retained bytes", () => {
    const reassembly = new RendererStreamReassembly();
    const pending = new Set(["a", "b", "c"]);
    const { events, rejected, sentCancel } = eventsFor(pending);
    const has = (id: string) => pending.has(id);
    reassembly.handleBackendFrame(start("a", 10), 50, events, has);
    reassembly.handleBackendFrame(start("b", 10), 50, events, has);
    expect(reassembly.activeCount()).toBe(2);
    reassembly.handleBackendFrame(start("c", 10), 50, events, has);
    expect(rejected.get("c")).toBeInstanceOf(Error);
    expect(sentCancel).toContain("c");
    expect(pending.has("c")).toBe(false);
  });

  it("ignores v5 frames so the ordinary gate closes loudly", () => {
    const reassembly = new RendererStreamReassembly();
    const pending = new Set(["r1"]);
    const { events } = eventsFor(pending);
    const handled = reassembly.handleBackendFrame(
      { version: 5, type: "reply-start", id: "r1", totalBytes: 10 },
      50,
      events,
      (id) => pending.has(id),
    );
    expect(handled).toBe(false);
    expect(reassembly.activeCount()).toBe(0);
  });

  it("drops partials only via explicit drop (generation invalidation)", () => {
    const reassembly = new RendererStreamReassembly();
    const pending = new Set(["r1"]);
    const { events } = eventsFor(pending);
    reassembly.handleBackendFrame(start("r1", 100), 50, events, (id) => pending.has(id));
    expect(reassembly.activeCount()).toBe(1);
    // Event-only signals never touch reassembly; only close/disconnect/cancel do.
    reassembly.drop("r1");
    expect(reassembly.activeCount()).toBe(0);
    reassembly.handleBackendFrame(start("r1", 100), 50, events, (id) => pending.has(id));
    reassembly.dropAll();
    expect(reassembly.activeCount()).toBe(0);
  });

  it("owns no timers or listeners itself", () => {
    const reassembly = new RendererStreamReassembly();
    expect(reassembly.activeCount()).toBe(0);
    expect(reassembly.retainedBytes()).toBe(0);
  });
});
