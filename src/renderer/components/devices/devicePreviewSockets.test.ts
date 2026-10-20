import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEVICE_PREVIEW_MAX_BUFFER_BYTES,
  DEVICE_PREVIEW_MAX_PACKET_BYTES,
  DEVICE_PREVIEW_MAX_QUEUED_PACKETS,
} from "@/shared/devicePreview";
import { openDeviceInputSocket, openDeviceVideoResponse } from "./devicePreviewSockets";

vi.mock("@/renderer/state/remoteServers/transportFactories", () => ({
  defaultSocketFactory: vi.fn<() => Promise<WebSocket>>(),
}));

class FakeSocket extends EventTarget {
  static readonly OPEN = 1;
  readyState = 1;
  binaryType = "blob";
  readonly sent: string[] = [];
  send = vi.fn<(data: string) => void>((data) => {
    this.sent.push(data);
  });
  close = vi.fn<() => void>(() => {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  });
  message(data: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function fixture() {
  vi.stubGlobal("WebSocket", FakeSocket);
  const socket = new FakeSocket();
  const controller = new AbortController();
  const factory = async () => socket as unknown as WebSocket;
  return { socket, controller, factory, url: "ws://fixture.invalid/preview" };
}
function envelope(bytes = 5): ArrayBuffer {
  const packet = new Uint8Array(bytes);
  new DataView(packet.buffer).setUint32(0, bytes - 4);
  packet[4] = 1;
  return packet.buffer;
}

describe("bounded public-client device transport", () => {
  it("returns video credit only after a reader consumes an unchanged packet", async () => {
    const f = fixture();
    const response = await openDeviceVideoResponse(f.url, f.controller.signal, f.factory);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.parse(f.socket.sent[0]!)).toMatchObject({
      bytes: DEVICE_PREVIEW_MAX_BUFFER_BYTES,
      packets: DEVICE_PREVIEW_MAX_QUEUED_PACKETS,
    });
    const packet = envelope();
    f.socket.message(packet);
    await Promise.resolve();
    expect(f.socket.sent).toHaveLength(1);
    const reader = response.body!.getReader();
    expect((await reader.read()).value).toEqual(new Uint8Array(packet));
    expect(JSON.parse(f.socket.sent[1]!)).toMatchObject({ bytes: packet.byteLength, packets: 1 });
    await reader.cancel();
    expect(f.socket.close).toHaveBeenCalledTimes(1);
    expect(await reader.read()).toEqual({ done: true, value: undefined });
  });

  it("bounds both stalled byte and packet retention and refuses input/text on video channels", async () => {
    for (const kind of ["bytes", "packets", "text", "oversized"] as const) {
      const f = fixture();
      const response = await openDeviceVideoResponse(f.url, f.controller.signal, f.factory);
      const reader = response.body!.getReader();
      if (kind === "bytes")
        for (let index = 0; index < 3; index++)
          f.socket.message(envelope(DEVICE_PREVIEW_MAX_PACKET_BYTES));
      if (kind === "packets")
        for (let index = 0; index <= DEVICE_PREVIEW_MAX_QUEUED_PACKETS; index++)
          f.socket.message(envelope());
      if (kind === "text") f.socket.message('{"type":"key","key":"home"}');
      if (kind === "oversized")
        f.socket.message(new ArrayBuffer(DEVICE_PREVIEW_MAX_PACKET_BYTES + 1));
      expect(f.socket.close).toHaveBeenCalledTimes(1);
      await expect(reader.read()).rejects.toMatchObject({ code: "device_preview_unavailable" });
      expect(f.socket.sent).toHaveLength(1);
    }
  });

  it("handles arbitrary chunk boundaries, malformed envelopes, socket failure and cancellation", async () => {
    const f = fixture();
    const response = await openDeviceVideoResponse(f.url, f.controller.signal, f.factory);
    const packet = envelope(12);
    f.socket.message(packet.slice(0, 2));
    f.socket.message(packet.slice(2, 5));
    f.socket.message(packet.slice(5));
    const reader = response.body!.getReader();
    expect((await reader.read()).value).toEqual(new Uint8Array(packet.slice(0, 2)));
    expect((await reader.read()).value).toEqual(new Uint8Array(packet.slice(2, 5)));
    expect((await reader.read()).value).toEqual(new Uint8Array(packet.slice(5)));
    const held = reader.read();
    const rejected = held.catch((error: unknown) => error);
    f.controller.abort();
    expect(await rejected).toMatchObject({ name: "AbortError" });
    expect(f.socket.close).toHaveBeenCalledTimes(1);
    for (const error of ["envelope", "socket"] as const) {
      const other = fixture();
      const stream = await openDeviceVideoResponse(
        other.url,
        other.controller.signal,
        other.factory,
      );
      const pending = stream.body!.getReader().read();
      const failed = pending.catch((failure: unknown) => failure);
      if (error === "envelope") other.socket.message(Uint8Array.of(255, 255, 255, 255).buffer);
      else other.socket.dispatchEvent(new Event("error"));
      expect(await failed).toMatchObject({ code: "device_preview_unavailable" });
    }
  });

  it("drops view input, requires the current geometry epoch and returns bounded media credit", async () => {
    const f = fixture();
    const socket = await openDeviceInputSocket(f.url, f.controller.signal, false, f.factory);
    socket.send('{"type":"key","key":"home"}');
    socket.send('{"type":"reset-video","ack":false}');
    expect(f.socket.sent).toHaveLength(1);
    const epoch = randomUUID();
    const downstream = vi.fn<(event: Event) => void>();
    socket.addEventListener("message", downstream);
    f.socket.message(JSON.stringify({ type: "device-preview-geometry", version: 1, epoch }));
    expect(downstream).not.toHaveBeenCalled();
    expect(JSON.parse(f.socket.sent[1]!)).toEqual({
      version: 1,
      epoch,
      binary: false,
      data: '{"type":"reset-video","ack":false}',
    });
    socket.send('{"type":"text","text":"blocked"}');
    expect(f.socket.sent).toHaveLength(2);
    f.socket.message(new ArrayBuffer(8));
    expect(downstream).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(JSON.parse(f.socket.sent[2]!)).toMatchObject({ bytes: 8, packets: 1 });
    f.controller.abort();
    expect(f.socket.close).toHaveBeenCalledTimes(1);
  });

  it("never replays a prior connection's input and refuses oversized socket packets", async () => {
    const f = fixture();
    const socket = await openDeviceInputSocket(f.url, f.controller.signal, true, f.factory);
    socket.send('{"type":"key","key":"home"}');
    const epoch = randomUUID();
    f.socket.message(JSON.stringify({ type: "device-preview-geometry", version: 1, epoch }));
    expect(f.socket.sent).toHaveLength(1);
    socket.send('{"type":"key","key":"home"}');
    expect(JSON.parse(f.socket.sent[1]!)).toMatchObject({ epoch, binary: false });
    f.socket.message(new ArrayBuffer(DEVICE_PREVIEW_MAX_PACKET_BYTES + 1));
    expect(f.socket.close).toHaveBeenCalledTimes(1);
  });

  it("closes late factory results after cancellation and bounds a stalled handshake", async () => {
    const f = fixture();
    const late = Promise.withResolvers<WebSocket>();
    const pending = openDeviceVideoResponse(f.url, f.controller.signal, () => late.promise);
    const rejected = pending.catch((error: unknown) => error);
    f.controller.abort();
    expect(await rejected).toMatchObject({ name: "AbortError" });
    late.resolve(f.socket as unknown as WebSocket);
    await Promise.resolve();
    expect(f.socket.close).toHaveBeenCalledTimes(1);
    vi.useFakeTimers();
    const next = fixture();
    next.socket.readyState = 0;
    const opening = openDeviceVideoResponse(next.url, next.controller.signal, next.factory);
    const failed = opening.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(30_001);
    expect(await failed).toMatchObject({ code: "device_preview_unavailable" });
    expect(next.socket.close).toHaveBeenCalledTimes(1);
  });
});
