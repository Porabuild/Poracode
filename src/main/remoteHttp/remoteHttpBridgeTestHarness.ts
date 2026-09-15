import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { RemoteHttpBridgeClientPort } from "@/renderer/state/remoteServers/remoteHttpBridgeClient";
import type { RemoteHttpBridgeWorkerPort } from "./remoteHttpBridgeService";

/**
 * Test-only helpers shared by the bridge service, client, and e2e suites.
 * Never imported by a production entry.
 */

/** In-memory, microtask-ordered stand-in for one `MessageChannelMain` pair. */
export interface InMemoryBridgePort {
  postMessage(message: unknown): void;
  close(): void;
  start(): void;
  onMessage(listener: (message: unknown) => void): void;
  onClose(listener: () => void): void;
  readonly closed: boolean;
  readonly received: readonly unknown[];
}

interface PortState {
  closed: boolean;
  readonly messageListeners: Set<(message: unknown) => void>;
  readonly closeListeners: Set<() => void>;
  readonly received: unknown[];
  peer: PortState | null;
}

function deliver(state: PortState, message: unknown): void {
  if (state.closed) return;
  state.received.push(message);
  for (const listener of [...state.messageListeners]) listener(message);
}

function createEnd(state: PortState): InMemoryBridgePort {
  return {
    postMessage(message) {
      const peer = state.peer;
      if (!peer || state.closed || peer.closed) return;
      // A real MessagePort delivers each message as its own task (microtasks
      // drain in between), so use a macrotask here rather than queueMicrotask.
      setTimeout(() => deliver(peer, message), 0);
    },
    close() {
      if (state.closed) return;
      state.closed = true;
      const peer = state.peer;
      setTimeout(() => {
        if (!peer) return;
        for (const listener of [...peer.closeListeners]) listener();
      }, 0);
    },
    start() {
      // Messages are delivered without an explicit start; matches the
      // queue-until-start behavior for frames sent after wiring.
    },
    onMessage(listener) {
      state.messageListeners.add(listener);
    },
    onClose(listener) {
      state.closeListeners.add(listener);
    },
    get closed() {
      return state.closed;
    },
    get received() {
      return state.received;
    },
  };
}

export function createInMemoryBridgePortPair(): {
  client: InMemoryBridgePort;
  worker: InMemoryBridgePort;
} {
  const clientState: PortState = {
    closed: false,
    messageListeners: new Set(),
    closeListeners: new Set(),
    received: [],
    peer: null,
  };
  const workerState: PortState = {
    closed: false,
    messageListeners: new Set(),
    closeListeners: new Set(),
    received: [],
    peer: null,
  };
  clientState.peer = workerState;
  workerState.peer = clientState;
  return { client: createEnd(clientState), worker: createEnd(workerState) };
}

export interface QueuedCloningBridgePortPair {
  readonly client: InMemoryBridgePort;
  readonly worker: InMemoryBridgePort;
  /** Pause delivery to one end; frames queue (cloned) until released. */
  hold(target: "client" | "worker"): void;
  release(target: "client" | "worker"): void;
  /** Frames cloned and queued but not yet delivered to that end. */
  queuedDepth(target: "client" | "worker"): number;
}

/**
 * Port pair with structured-clone semantics and a controllable delivery queue.
 * Unlike `createInMemoryBridgePortPair`, every frame is cloned exactly as the
 * real `MessagePort` transport clones it (so assertions cannot accidentally
 * depend on the sender's object identity), and either end can be paused to
 * model a slow utility/renderer without rewriting the test.
 */
export function createQueuedCloningBridgePortPair(): QueuedCloningBridgePortPair {
  interface QueueEnd {
    closed: boolean;
    held: boolean;
    flushing: boolean;
    readonly queue: unknown[];
    readonly messageListeners: Set<(message: unknown) => void>;
    readonly closeListeners: Set<() => void>;
    readonly received: unknown[];
  }
  const ends: Record<"client" | "worker", QueueEnd> = {
    client: {
      closed: false,
      held: false,
      flushing: false,
      queue: [],
      messageListeners: new Set(),
      closeListeners: new Set(),
      received: [],
    },
    worker: {
      closed: false,
      held: false,
      flushing: false,
      queue: [],
      messageListeners: new Set(),
      closeListeners: new Set(),
      received: [],
    },
  };
  const peerOf = (side: "client" | "worker"): "client" | "worker" =>
    side === "client" ? "worker" : "client";

  const schedule = (side: "client" | "worker"): void => {
    const end = ends[side];
    if (end.held || end.flushing || end.queue.length === 0) return;
    end.flushing = true;
    setTimeout(() => {
      end.flushing = false;
      if (end.held || end.closed) return;
      for (const message of end.queue.splice(0)) {
        if (end.closed) return;
        end.received.push(message);
        for (const listener of [...end.messageListeners]) listener(message);
      }
      schedule(side);
    }, 0);
  };

  const createPort = (side: "client" | "worker"): InMemoryBridgePort => {
    const end = ends[side];
    const peer = ends[peerOf(side)];
    return {
      postMessage(message) {
        if (end.closed || peer.closed) return;
        peer.queue.push(structuredClone(message));
        schedule(peerOf(side));
      },
      close() {
        if (end.closed) return;
        end.closed = true;
        const target = ends[peerOf(side)];
        setTimeout(() => {
          for (const listener of [...target.closeListeners]) listener();
        }, 0);
      },
      start() {
        // No queue-until-start here; a test that needs delivery control uses
        // hold/release instead.
      },
      onMessage(listener) {
        end.messageListeners.add(listener);
        schedule(side);
      },
      onClose(listener) {
        end.closeListeners.add(listener);
      },
      get closed() {
        return end.closed;
      },
      get received() {
        return end.received;
      },
    };
  };

  return {
    client: createPort("client"),
    worker: createPort("worker"),
    hold(target) {
      ends[target].held = true;
    },
    release(target) {
      ends[target].held = false;
      schedule(target);
    },
    queuedDepth(target) {
      return ends[target].queue.length;
    },
  };
}

export function toClientPort(end: InMemoryBridgePort): RemoteHttpBridgeClientPort {
  return {
    postMessage: (message) => end.postMessage(message),
    close: () => end.close(),
    start: () => end.start(),
    setMessageListener: (listener) => end.onMessage(listener),
    setCloseListener: (listener) => end.onClose(listener),
  };
}

export function toWorkerPort(end: InMemoryBridgePort): RemoteHttpBridgeWorkerPort {
  return {
    postMessage: (message) => end.postMessage(message),
    close: () => end.close(),
    start: () => end.start(),
    onMessage: (listener) => end.onMessage(listener),
    onClose: (listener) => end.onClose(listener),
  };
}

/** Deterministic test payload (`index % 251`). */
export function payloadOf(bytes: number): Uint8Array {
  const payload = new Uint8Array(bytes);
  for (let index = 0; index < bytes; index += 1) payload[index] = index % 251;
  return payload;
}

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export interface LoopbackRequestRecord {
  readonly method: string;
  readonly path: string;
  readonly headers: IncomingMessage["headers"];
  body: Buffer;
  aborted: boolean;
}

export interface LoopbackHttpServer {
  readonly origin: string;
  readonly requests: LoopbackRequestRecord[];
  close(): Promise<void>;
}

/** Disposable loopback server for byte-level bridge regressions. */
export async function startLoopbackHttpServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<LoopbackHttpServer> {
  const requests: LoopbackRequestRecord[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    const record: LoopbackRequestRecord = {
      method: req.method ?? "GET",
      path: req.url ?? "/",
      headers: req.headers,
      body: Buffer.alloc(0),
      aborted: false,
    };
    requests.push(record);
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("close", () => {
      record.aborted = !res.writableEnded;
      record.body = Buffer.concat(chunks);
    });
    handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    async close() {
      await new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      });
    },
  };
}
