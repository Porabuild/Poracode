import type { DesktopLoopbackFrame } from "./desktopLoopbackFrames";
import type { DesktopLoopbackSocket } from "./desktopLoopbackSocket";
import {
  DESKTOP_LOOPBACK_WORKER_PROTOCOL_VERSION,
  type DesktopLoopbackWorkerClientMessage,
  type DesktopLoopbackWorkerServerMessage,
} from "./desktopLoopbackWorkerProtocol";

export interface WorkerDesktopLoopbackCallbacks {
  readonly onDecodedBatch: (
    frames: readonly DesktopLoopbackFrame[],
    acknowledge: () => void,
  ) => void;
  readonly onOverflow: () => void;
}

/**
 * Opens the managed loopback WebSocket inside a dedicated Web Worker when the
 * runtime provides native `Worker` + `WebSocket`. Inbound socket messages are
 * parsed, validated, and coalesced inside the worker before crossing
 * `postMessage` as compact batches, so background agent chatter never wakes the
 * UI thread per frame.
 *
 * Returns `null` when `Worker` is unavailable or stubbed in unit tests without
 * module-worker support, allowing callers to fall back seamlessly to
 * `createDomDesktopLoopbackSocket` + `HostEventDrain`.
 */
export class WorkerDesktopLoopbackTransport {
  private worker: Worker | null = null;
  private nextSocketId = 1;
  private activeSocketId = 0;
  private activeCallbacks: {
    onopen: (() => void) | null;
    onclose: ((event?: { readonly code?: number; readonly reason?: string }) => void) | null;
    onDecodedBatch: WorkerDesktopLoopbackCallbacks["onDecodedBatch"];
    onOverflow: () => void;
  } | null = null;
  private retired = false;

  canUseWorkerSocket(): boolean {
    if (this.retired) return false;
    if (typeof Worker === "undefined" || typeof WebSocket === "undefined") return false;
    // Vitest/jsdom tests sometimes stub `Worker` with a FakeWorker for
    // `ClientEngineHost` protocol tests; only spawn the dedicated socket worker
    // when running against a real native browser Worker constructor.
    if (!Function.prototype.toString.call(Worker).includes("[native code]")) {
      return false;
    }
    return true;
  }

  open(url: string, callbacks: WorkerDesktopLoopbackCallbacks): DesktopLoopbackSocket | null {
    if (!this.canUseWorkerSocket()) return null;
    const worker = this.ensureWorker();
    if (!worker) return null;

    const socketId = this.nextSocketId++;
    this.activeSocketId = socketId;
    const slot = {
      onopen: null as (() => void) | null,
      onclose: null as
        | ((event?: { readonly code?: number; readonly reason?: string }) => void)
        | null,
      onDecodedBatch: callbacks.onDecodedBatch,
      onOverflow: callbacks.onOverflow,
    };
    this.activeCallbacks = slot;

    this.post({
      v: DESKTOP_LOOPBACK_WORKER_PROTOCOL_VERSION,
      type: "connect",
      socketId,
      url,
    });

    let onmessage: ((event: { readonly data: unknown }) => void) | null = null;
    return {
      close: () => {
        if (this.activeSocketId === socketId) {
          this.activeSocketId = 0;
          this.activeCallbacks = null;
        }
        this.post({
          v: DESKTOP_LOOPBACK_WORKER_PROTOCOL_VERSION,
          type: "close",
          socketId,
        });
      },
      send: (data: string) => {
        if (this.activeSocketId !== socketId) return;
        this.post({
          v: DESKTOP_LOOPBACK_WORKER_PROTOCOL_VERSION,
          type: "send",
          socketId,
          data,
        });
      },
      get onopen() {
        return slot.onopen;
      },
      set onopen(handler) {
        slot.onopen = handler;
      },
      get onmessage() {
        return onmessage;
      },
      set onmessage(handler) {
        onmessage = handler;
      },
      get onclose() {
        return slot.onclose;
      },
      set onclose(handler) {
        slot.onclose = handler;
      },
    };
  }

  dispose(): void {
    this.activeSocketId = 0;
    this.activeCallbacks = null;
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
    }
    this.worker = null;
  }

  private ensureWorker(): Worker | null {
    if (this.worker) return this.worker;
    try {
      const worker = new Worker(new URL("./desktopLoopbackSocketWorker.ts", import.meta.url), {
        type: "module",
      });
      worker.onmessage = (event: MessageEvent<DesktopLoopbackWorkerServerMessage>) => {
        if (this.worker !== worker) return;
        const msg = event.data;
        if (!msg || msg.v !== DESKTOP_LOOPBACK_WORKER_PROTOCOL_VERSION) return;
        if (msg.type === "frames") {
          let acknowledged = false;
          const acknowledge = () => {
            if (acknowledged || this.worker !== worker) return;
            acknowledged = true;
            this.post({
              v: DESKTOP_LOOPBACK_WORKER_PROTOCOL_VERSION,
              type: "ack",
              socketId: msg.socketId,
              batchId: msg.batchId,
            });
          };
          if (msg.socketId !== this.activeSocketId || !this.activeCallbacks) acknowledge();
          else this.activeCallbacks.onDecodedBatch(msg.frames, acknowledge);
          return;
        }
        if (msg.socketId !== this.activeSocketId || !this.activeCallbacks) return;
        const cb = this.activeCallbacks;
        if (msg.type === "open") {
          cb.onopen?.();
          return;
        }
        if (msg.type === "overflow") {
          this.activeSocketId = 0;
          this.activeCallbacks = null;
          cb.onOverflow();
          return;
        }
        if (msg.type === "close") {
          this.activeSocketId = 0;
          this.activeCallbacks = null;
          cb.onclose?.({
            ...(msg.code !== undefined ? { code: msg.code } : {}),
            ...(msg.reason !== undefined ? { reason: msg.reason } : {}),
          });
        }
      };
      worker.onerror = () => {
        if (this.worker !== worker) return;
        const cb = this.activeCallbacks;
        this.retired = true;
        this.dispose();
        cb?.onclose?.({ code: 1006, reason: "Loopback socket worker failed" });
      };
      this.worker = worker;
      return worker;
    } catch {
      this.retired = true;
      return null;
    }
  }

  private post(message: DesktopLoopbackWorkerClientMessage): void {
    try {
      this.worker?.postMessage(message);
    } catch {
      // Worker termination path handles cleanup.
    }
  }
}
