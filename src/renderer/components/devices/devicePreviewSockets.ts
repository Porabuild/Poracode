import {
  DEVICE_PREVIEW_MAX_BUFFER_BYTES,
  DEVICE_PREVIEW_MAX_INPUT_BYTES,
  DEVICE_PREVIEW_MAX_PACKET_BYTES,
  DEVICE_PREVIEW_MAX_QUEUED_PACKETS,
  DEVICE_PREVIEW_VERSION,
  devicePreviewGeometrySchema,
} from "@/shared/devicePreview";
import { DevicePreviewAvccGuard } from "@/shared/devicePreviewAvcc";
import { RemoteClientError } from "@/shared/remote/client";
import { defaultSocketFactory } from "@/renderer/state/remoteServers/transportFactories";

export type DevicePreviewSocketFactory = (url: string) => WebSocket | Promise<WebSocket>;

// Go through the installed surface policy. A restricted surface whose socket
// contract does not admit preview tickets stays unavailable; no raw fallback.
export async function createPreviewBrowserSocket(url: string): Promise<WebSocket> {
  const socket = await defaultSocketFactory(url);
  if (
    !("binaryType" in socket) ||
    !("addEventListener" in socket) ||
    typeof socket.addEventListener !== "function" ||
    !socket.send
  ) {
    socket.close();
    throw new RemoteClientError(
      "This client cannot open a device-preview stream.",
      501,
      "device_preview_unavailable",
    );
  }
  return socket as unknown as WebSocket;
}

function failed(): RemoteClientError {
  return new RemoteClientError(
    "Device-preview stream closed. Reopen the preview.",
    503,
    "device_preview_unavailable",
  );
}
function credit(bytes: number, packets: number): string {
  return JSON.stringify({
    type: "device-preview-credit",
    version: DEVICE_PREVIEW_VERSION,
    bytes,
    packets,
  });
}
function byteSize(data: unknown): number {
  return typeof data === "string"
    ? new TextEncoder().encode(data).byteLength
    : data instanceof ArrayBuffer
      ? data.byteLength
      : -1;
}
function base64(bytes: Uint8Array): string {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw);
}

async function acquireSocket(
  url: string,
  signal: AbortSignal,
  factory: DevicePreviewSocketFactory,
): Promise<WebSocket> {
  signal.throwIfAborted();
  const pending = Promise.resolve(factory(url));
  const cancelled = Promise.withResolvers<never>();
  const abort = () => cancelled.reject(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  // A surface may mint/connect asynchronously. Cancellation must also close
  // its late result, even after this caller has stopped waiting.
  void pending.then(
    (socket) => {
      if (signal.aborted) socket.close();
    },
    () => undefined,
  );
  if (signal.aborted) abort();
  try {
    return await Promise.race([pending, cancelled.promise]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

/** Adapts only transport frames. Upstream DeviceScreen owns gestures and its
 * hook owns decoding. Viewing grants locally drop device input as well. */
export async function openDeviceInputSocket(
  url: string,
  signal: AbortSignal,
  control: boolean,
  factory: DevicePreviewSocketFactory = createPreviewBrowserSocket,
): Promise<WebSocket> {
  signal.throwIfAborted();
  const socket = await acquireSocket(url, signal, factory);
  socket.binaryType = "arraybuffer";
  const rawSend = socket.send.bind(socket);
  let epoch: string | null = null;
  let pendingReset = false;
  let retainedBytes = 0;
  let retainedPackets = 0;
  let granted = false;
  const close = () => {
    socket.close();
  };
  const connectTimer = setTimeout(close, 30_000);
  const release = () => {
    clearTimeout(connectTimer);
    signal.removeEventListener("abort", close);
  };
  const send = (value: string) => {
    try {
      rawSend(value);
    } catch {
      close();
    }
  };
  const grant = () => {
    if (granted || socket.readyState !== WebSocket.OPEN) return;
    clearTimeout(connectTimer);
    granted = true;
    send(credit(DEVICE_PREVIEW_MAX_BUFFER_BYTES, DEVICE_PREVIEW_MAX_QUEUED_PACKETS));
  };
  socket.addEventListener("open", grant, { once: true });
  socket.addEventListener("close", release, { once: true });
  signal.addEventListener("abort", close, { once: true });
  if (signal.aborted) {
    release();
    close();
    signal.throwIfAborted();
  }
  grant();
  socket.send = (data) => {
    if (signal.aborted || socket.readyState !== WebSocket.OPEN) return;
    const binary = typeof data !== "string";
    let reset = false;
    if (!binary) {
      try {
        reset = (JSON.parse(data) as { type?: unknown }).type === "reset-video";
      } catch {
        close();
        return;
      }
    }
    if (!control && !reset) return;
    if (!epoch) {
      if (reset) pendingReset = true;
      return;
    }
    const bytes =
      typeof data === "string"
        ? new TextEncoder().encode(data)
        : data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : ArrayBuffer.isView(data)
            ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
            : null;
    if (!bytes || bytes.byteLength > 32 * 1024) {
      close();
      return;
    }
    const packet = JSON.stringify({
      version: DEVICE_PREVIEW_VERSION,
      epoch,
      binary,
      data: binary ? base64(bytes) : data,
    });
    if (new TextEncoder().encode(packet).byteLength > DEVICE_PREVIEW_MAX_INPUT_BYTES) {
      close();
      return;
    }
    send(packet);
  };
  socket.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (signal.aborted) {
      event.stopImmediatePropagation();
      close();
      return;
    }
    if (typeof event.data === "string" && event.data.length < 512) {
      try {
        const value: unknown = JSON.parse(event.data);
        if (
          value &&
          typeof value === "object" &&
          "type" in value &&
          value.type === "device-preview-geometry"
        ) {
          epoch = devicePreviewGeometrySchema.parse(value).epoch;
          event.stopImmediatePropagation();
          if (pendingReset) {
            pendingReset = false;
            socket.send('{"type":"reset-video","ack":false}');
          }
          return;
        }
      } catch {
        event.stopImmediatePropagation();
        close();
        return;
      }
    }
    const bytes = byteSize(event.data);
    if (
      bytes < 1 ||
      bytes > DEVICE_PREVIEW_MAX_PACKET_BYTES ||
      retainedBytes + bytes > DEVICE_PREVIEW_MAX_BUFFER_BYTES ||
      retainedPackets >= DEVICE_PREVIEW_MAX_QUEUED_PACKETS
    ) {
      event.stopImmediatePropagation();
      close();
      return;
    }
    retainedBytes += bytes;
    retainedPackets++;
    // Return credit after the SDK's synchronous message/decoder admission.
    // Android retains upstream's existing four-frame decoder queue policy.
    queueMicrotask(() => {
      retainedBytes -= bytes;
      retainedPackets--;
      if (!signal.aborted && socket.readyState === WebSocket.OPEN) send(credit(bytes, 1));
    });
  });
  return socket;
}

/** Zero-prefetch body: credit is returned only when a reader consumes a
 * packet. Fixed byte+packet limits also reject a nonconforming peer. */
export async function openDeviceVideoResponse(
  url: string,
  signal: AbortSignal,
  factory: DevicePreviewSocketFactory = createPreviewBrowserSocket,
): Promise<Response> {
  signal.throwIfAborted();
  const socket = await acquireSocket(url, signal, factory);
  socket.binaryType = "arraybuffer";
  const ready = Promise.withResolvers<void>();
  const queue: Uint8Array[] = [];
  const envelopes = new DevicePreviewAvccGuard();
  let retainedBytes = 0;
  let ended = false;
  let opened = false;
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let pulling: (() => void) | undefined;
  let connectTimer: ReturnType<typeof setTimeout> | undefined;
  const finish = (error?: unknown, cancelled = false) => {
    if (ended) return;
    ended = true;
    queue.length = 0;
    retainedBytes = 0;
    clearTimeout(connectTimer);
    signal.removeEventListener("abort", abort);
    ready.reject(error ?? failed());
    if (!cancelled) {
      if (error) controller.error(error);
      else controller.close();
    }
    pulling?.();
    pulling = undefined;
    socket.close();
  };
  const abort = () => finish(signal.reason ?? failed());
  const deliver = () => {
    if (!pulling || ended || !queue.length) return;
    const packet = queue.shift()!;
    retainedBytes -= packet.byteLength;
    controller.enqueue(packet);
    const resolve = pulling;
    pulling = undefined;
    resolve();
    if (socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(credit(packet.byteLength, 1));
      } catch {
        finish(failed());
      }
    }
  };
  const body = new ReadableStream<Uint8Array>(
    {
      start(value) {
        controller = value;
      },
      pull() {
        return new Promise<void>((resolve) => {
          pulling = resolve;
          deliver();
        });
      },
      cancel() {
        finish(undefined, true);
      },
    },
    { highWaterMark: 0 },
  );
  const onOpen = () => {
    if (ended || opened || socket.readyState !== WebSocket.OPEN) return;
    clearTimeout(connectTimer);
    opened = true;
    try {
      socket.send(credit(DEVICE_PREVIEW_MAX_BUFFER_BYTES, DEVICE_PREVIEW_MAX_QUEUED_PACKETS));
    } catch {
      finish(failed());
      return;
    }
    ready.resolve();
  };
  socket.addEventListener("open", onOpen, { once: true });
  socket.addEventListener("error", () => finish(failed()), { once: true });
  socket.addEventListener("close", () => finish(failed()), { once: true });
  socket.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (ended) return;
    if (
      !(event.data instanceof ArrayBuffer) ||
      event.data.byteLength < 1 ||
      event.data.byteLength > DEVICE_PREVIEW_MAX_PACKET_BYTES ||
      retainedBytes + event.data.byteLength > DEVICE_PREVIEW_MAX_BUFFER_BYTES ||
      queue.length >= DEVICE_PREVIEW_MAX_QUEUED_PACKETS
    ) {
      finish(failed());
      return;
    }
    const bytes = new Uint8Array(event.data);
    try {
      envelopes.push(bytes);
    } catch {
      finish(failed());
      return;
    }
    retainedBytes += bytes.byteLength;
    queue.push(bytes);
    deliver();
  });
  signal.addEventListener("abort", abort, { once: true });
  connectTimer = setTimeout(() => finish(failed()), 30_000);
  if (signal.aborted) abort();
  else onOpen();
  await ready.promise;
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/octet-stream", "cache-control": "no-store" },
  });
}
