import {
  CLIENT_ENGINE_LANE_MAX_BYTES,
  CLIENT_ENGINE_LANE_MAX_PENDING,
} from "@/renderer/state/remote/engine/protocol";
import {
  decodeAndCoalesceRawLoopbackBatch,
  DESKTOP_LOOPBACK_WORKER_PROTOCOL_VERSION,
  type DesktopLoopbackWorkerClientMessage,
  type DesktopLoopbackWorkerServerMessage,
} from "./desktopLoopbackWorkerProtocol";

const BATCH_FLUSH_MS = 8;

interface ManagedSocketSlot {
  readonly socketId: number;
  readonly socket: WebSocket;
  rawQueue: string[];
  queuedBytes: number;
  flushTimer: ReturnType<typeof setTimeout> | null;
  closed: boolean;
}

let activeSlot: ManagedSocketSlot | null = null;

function post(message: DesktopLoopbackWorkerServerMessage): void {
  self.postMessage(message);
}

function clearFlushTimer(slot: ManagedSocketSlot): void {
  if (slot.flushTimer !== null) {
    clearTimeout(slot.flushTimer);
    slot.flushTimer = null;
  }
}

function flushSlot(slot: ManagedSocketSlot): void {
  clearFlushTimer(slot);
  if (slot.closed || slot.rawQueue.length === 0) return;
  const rawBatch = slot.rawQueue;
  slot.rawQueue = [];
  slot.queuedBytes = 0;
  const frames = decodeAndCoalesceRawLoopbackBatch(rawBatch);
  if (frames.length === 0) return;
  post({
    v: DESKTOP_LOOPBACK_WORKER_PROTOCOL_VERSION,
    type: "frames",
    socketId: slot.socketId,
    frames,
  });
}

function teardownSlot(slot: ManagedSocketSlot): void {
  slot.closed = true;
  clearFlushTimer(slot);
  slot.rawQueue = [];
  slot.queuedBytes = 0;
  if (activeSlot === slot) activeSlot = null;
  try {
    slot.socket.close();
  } catch {
    // already closed
  }
}

self.onmessage = (event: MessageEvent<DesktopLoopbackWorkerClientMessage>) => {
  const message = event.data;
  if (!message || message.v !== DESKTOP_LOOPBACK_WORKER_PROTOCOL_VERSION) return;

  if (message.type === "connect") {
    if (activeSlot) teardownSlot(activeSlot);
    const socket = new WebSocket(message.url);
    const slot: ManagedSocketSlot = {
      socketId: message.socketId,
      socket,
      rawQueue: [],
      queuedBytes: 0,
      flushTimer: null,
      closed: false,
    };
    activeSlot = slot;

    socket.addEventListener("open", () => {
      if (slot.closed || activeSlot !== slot) return;
      post({
        v: DESKTOP_LOOPBACK_WORKER_PROTOCOL_VERSION,
        type: "open",
        socketId: slot.socketId,
      });
    });

    socket.addEventListener("message", (wsEvent) => {
      if (slot.closed || activeSlot !== slot) return;
      const raw = String((wsEvent as MessageEvent).data);
      const bytes = raw.length * 2;
      if (
        slot.rawQueue.length >= CLIENT_ENGINE_LANE_MAX_PENDING ||
        slot.queuedBytes + bytes > CLIENT_ENGINE_LANE_MAX_BYTES
      ) {
        teardownSlot(slot);
        post({
          v: DESKTOP_LOOPBACK_WORKER_PROTOCOL_VERSION,
          type: "overflow",
          socketId: slot.socketId,
        });
        return;
      }

      // Immediate flush for correlated health pongs and resync/ready control
      // frames so liveness probes and activation handshakes never wait 8ms.
      const isUrgentControl =
        raw.length < 160 &&
        (raw.includes('"pong"') || raw.includes('"ready"') || raw.includes('"resync-required"'));

      slot.rawQueue.push(raw);
      slot.queuedBytes += bytes;
      if (isUrgentControl) {
        flushSlot(slot);
        return;
      }
      if (slot.flushTimer === null) {
        slot.flushTimer = setTimeout(() => flushSlot(slot), BATCH_FLUSH_MS);
      }
    });

    socket.addEventListener("close", (closeEvent) => {
      if (slot.closed) return;
      flushSlot(slot);
      slot.closed = true;
      if (activeSlot === slot) activeSlot = null;
      post({
        v: DESKTOP_LOOPBACK_WORKER_PROTOCOL_VERSION,
        type: "close",
        socketId: slot.socketId,
        code: closeEvent.code,
        reason: closeEvent.reason,
      });
    });
    return;
  }

  if (!activeSlot || activeSlot.socketId !== message.socketId) return;

  if (message.type === "send") {
    try {
      activeSlot.socket.send(message.data);
    } catch {
      // Socket error/close path handles recovery.
    }
    return;
  }

  if (message.type === "close") {
    teardownSlot(activeSlot);
  }
};
