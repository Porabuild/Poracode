import { randomBytes } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { SupervisorEvent } from "@/shared/ipc";
import type { LiveEventInterests } from "@/shared/liveEventInterests";
import {
  BACKEND_RENDERER_STREAM_VERSION,
  type BackendRendererRequest,
  type BackendRendererReply,
  type BackendRendererStreamInfo,
} from "@/shared/backendHostProtocol";
import { BackendEventRouter } from "./BackendHostCore";

const MAX_REPLAY_EVENTS = 500;
const MAX_REPLAY_BYTES = 8 * 1024 * 1024;
const MIN_CLIENT_BUFFERED_BYTES = 128 * 1024;
const MAX_CLIENT_BUFFERED_BYTES = 1024 * 1024;
const HEALTHY_SENDS_BEFORE_BUDGET_REDUCTION = 256;
const MAX_REQUEST_BYTES = 64 * 1024 * 1024;

interface ReplayEntry {
  seq: number;
  event: SupervisorEvent;
  bytes: number;
}

interface ClientState {
  router: BackendEventRouter;
  ready: boolean;
  bufferedBudgetBytes: number;
  healthySends: number;
}

export interface BackendRendererStreamDiagnostics {
  connectedClients: number;
  deliveredEvents: number;
  replayedEvents: number;
  replayEvictions: number;
  resyncRequests: number;
  slowClientDisconnects: number;
  budgetIncreases: number;
  budgetDecreases: number;
  peakBufferedBytes: number;
}

export interface BackendRendererStreamOptions {
  onSlowClient?(details: { bufferedBytes: number; budgetBytes: number }): void;
  onRequest?(request: BackendRendererRequest): Promise<unknown>;
}

/** Authenticated loopback transport for renderer requests and bounded live events. */
export class BackendRendererStream {
  private readonly token = randomBytes(24).toString("base64url");
  private readonly clients = new Map<WebSocket, ClientState>();
  private readonly terminalBootstrapTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly replay: ReplayEntry[] = [];
  private replayBytes = 0;
  private sequence = 0;
  private server: WebSocketServer | null = null;
  private readonly diagnostics: Omit<BackendRendererStreamDiagnostics, "connectedClients"> = {
    deliveredEvents: 0,
    replayedEvents: 0,
    replayEvictions: 0,
    resyncRequests: 0,
    slowClientDisconnects: 0,
    budgetIncreases: 0,
    budgetDecreases: 0,
    peakBufferedBytes: 0,
  };

  constructor(private readonly options: BackendRendererStreamOptions = {}) {}

  async start(): Promise<BackendRendererStreamInfo> {
    if (this.server) throw new Error("Backend renderer stream is already started.");
    const server = new WebSocketServer({
      host: "127.0.0.1",
      port: 0,
      perMessageDeflate: false,
      maxPayload: MAX_REQUEST_BYTES,
      verifyClient: ({ req }: { req: IncomingMessage }) => {
        try {
          return new URL(req.url ?? "/", "ws://127.0.0.1").searchParams.get("token") === this.token;
        } catch {
          return false;
        }
      },
    });
    this.server = server;
    server.on("connection", (socket) => this.accept(socket));
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Renderer stream did not bind TCP.");
    return {
      version: BACKEND_RENDERER_STREAM_VERSION,
      url: `ws://127.0.0.1:${address.port}/events`,
      token: this.token,
    };
  }

  publish(event: SupervisorEvent): { delivered: boolean; sequence: number } {
    const seq = ++this.sequence;
    const encoded = JSON.stringify({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "event",
      seq,
      event,
    });
    const bytes = Buffer.byteLength(encoded);
    this.replay.push({ seq, event, bytes });
    this.replayBytes += bytes;
    this.trimReplay();

    let delivered = false;
    for (const [socket, client] of this.clients) {
      if (!client.ready) continue;
      const filtered = client.router.filter(event);
      if (!filtered) continue;
      const payload =
        filtered === event
          ? encoded
          : JSON.stringify({
              version: BACKEND_RENDERER_STREAM_VERSION,
              type: "event",
              seq,
              event: filtered,
            });
      if (!this.send(socket, client, payload)) continue;
      this.diagnostics.deliveredEvents += 1;
      delivered = true;
    }
    return { delivered, sequence: seq };
  }

  retainTerminalBootstrap(threadId: string): void {
    this.clearTerminalBootstrap(threadId);
    for (const client of this.clients.values()) client.router.retainTerminalBootstrap(threadId);
    const timer = setTimeout(() => this.terminalBootstrapTimers.delete(threadId), 10_000);
    timer.unref?.();
    this.terminalBootstrapTimers.set(threadId, timer);
  }

  clearTerminalBootstrap(threadId: string): void {
    const timer = this.terminalBootstrapTimers.get(threadId);
    if (timer) clearTimeout(timer);
    this.terminalBootstrapTimers.delete(threadId);
    for (const client of this.clients.values()) client.router.clearTerminalBootstrap(threadId);
  }

  hasReadyClient(): boolean {
    for (const client of this.clients.values()) if (client.ready) return true;
    return false;
  }

  getDiagnostics(): BackendRendererStreamDiagnostics {
    return { connectedClients: this.clients.size, ...this.diagnostics };
  }

  async dispose(): Promise<void> {
    const server = this.server;
    this.server = null;
    for (const [socket, client] of this.clients) {
      client.router.dispose();
      socket.close(1001, "Backend host shutting down");
    }
    this.clients.clear();
    for (const timer of this.terminalBootstrapTimers.values()) clearTimeout(timer);
    this.terminalBootstrapTimers.clear();
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private accept(socket: WebSocket): void {
    const state: ClientState = {
      router: new BackendEventRouter(),
      ready: false,
      bufferedBudgetBytes: MIN_CLIENT_BUFFERED_BYTES,
      healthySends: 0,
    };
    for (const threadId of this.terminalBootstrapTimers.keys()) {
      state.router.retainTerminalBootstrap(threadId);
    }
    this.clients.set(socket, state);
    socket.on("message", (data) => this.handleClientMessage(socket, state, data.toString()));
    socket.once("close", () => {
      state.router.dispose();
      this.clients.delete(socket);
    });
    socket.once("error", () => socket.close());
    this.send(
      socket,
      state,
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "hello",
        latestSeq: this.sequence,
      }),
    );
  }

  private handleClientMessage(socket: WebSocket, state: ClientState, raw: string): void {
    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch {
      socket.close(1008, "Invalid renderer stream message");
      return;
    }
    if (isBackendRendererRequest(message)) {
      void this.handleRequest(socket, message);
      return;
    }
    if (!isInterestMessage(message)) {
      socket.close(1008, "Invalid renderer transport message");
      return;
    }
    const interests: LiveEventInterests = {
      terminalThreadIds: [...new Set(message.terminalThreadIds)].slice(0, 256),
      runtimeThreadIds: [...new Set(message.runtimeThreadIds)].slice(0, 256),
      allRuntimeEvents: false,
    };
    state.router.setInterests(interests);
    state.ready = true;
    if (typeof message.lastSeq === "number") this.replayFrom(socket, state, message.lastSeq);
    this.send(
      socket,
      state,
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "interests-ack",
        latestSeq: this.sequence,
      }),
    );
  }

  private async handleRequest(socket: WebSocket, request: BackendRendererRequest): Promise<void> {
    const handler = this.options.onRequest;
    if (!handler) {
      this.sendReply(socket, {
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "reply",
        id: request.id,
        ok: false,
        error: "Renderer requests are not enabled.",
      });
      return;
    }
    try {
      const data = await handler(request);
      this.sendReply(socket, {
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "reply",
        id: request.id,
        ok: true,
        data,
      });
    } catch (error) {
      this.sendReply(socket, {
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "reply",
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private sendReply(socket: WebSocket, reply: BackendRendererReply): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    const payload = JSON.stringify(reply);
    if (Buffer.byteLength(payload) > MAX_REQUEST_BYTES) {
      socket.send(
        JSON.stringify({
          version: BACKEND_RENDERER_STREAM_VERSION,
          type: "reply",
          id: reply.id,
          ok: false,
          error: "Backend response exceeded the renderer transport limit.",
        } satisfies BackendRendererReply),
      );
      return;
    }
    socket.send(payload);
  }

  private replayFrom(socket: WebSocket, state: ClientState, lastSeq: number): void {
    const oldest = this.replay[0]?.seq ?? this.sequence;
    if (lastSeq < oldest - 1) {
      this.diagnostics.resyncRequests += 1;
      this.send(
        socket,
        state,
        JSON.stringify({
          version: BACKEND_RENDERER_STREAM_VERSION,
          type: "resync-required",
          latestSeq: this.sequence,
        }),
      );
      return;
    }
    for (const entry of this.replay) {
      if (entry.seq <= lastSeq) continue;
      const event = state.router.filter(entry.event);
      if (!event) continue;
      if (
        !this.send(
          socket,
          state,
          JSON.stringify({
            version: BACKEND_RENDERER_STREAM_VERSION,
            type: "event",
            seq: entry.seq,
            event,
          }),
        )
      )
        return;
      this.diagnostics.replayedEvents += 1;
    }
  }

  private send(socket: WebSocket, state: ClientState, payload: string): boolean {
    if (socket.readyState !== WebSocket.OPEN) return false;
    const nextBufferedBytes = socket.bufferedAmount + Buffer.byteLength(payload);
    this.diagnostics.peakBufferedBytes = Math.max(
      this.diagnostics.peakBufferedBytes,
      nextBufferedBytes,
    );
    while (
      nextBufferedBytes > state.bufferedBudgetBytes &&
      state.bufferedBudgetBytes < MAX_CLIENT_BUFFERED_BYTES
    ) {
      state.bufferedBudgetBytes = Math.min(
        state.bufferedBudgetBytes * 2,
        MAX_CLIENT_BUFFERED_BYTES,
      );
      state.healthySends = 0;
      this.diagnostics.budgetIncreases += 1;
    }
    if (nextBufferedBytes > state.bufferedBudgetBytes) {
      this.diagnostics.slowClientDisconnects += 1;
      this.options.onSlowClient?.({
        bufferedBytes: nextBufferedBytes,
        budgetBytes: state.bufferedBudgetBytes,
      });
      socket.close(1013, "Renderer stream backpressure");
      return false;
    }
    socket.send(payload);
    if (
      state.bufferedBudgetBytes > MIN_CLIENT_BUFFERED_BYTES &&
      socket.bufferedAmount <= MIN_CLIENT_BUFFERED_BYTES / 4
    ) {
      state.healthySends += 1;
      if (state.healthySends >= HEALTHY_SENDS_BEFORE_BUDGET_REDUCTION) {
        state.bufferedBudgetBytes = Math.max(
          MIN_CLIENT_BUFFERED_BYTES,
          state.bufferedBudgetBytes / 2,
        );
        state.healthySends = 0;
        this.diagnostics.budgetDecreases += 1;
      }
    } else {
      state.healthySends = 0;
    }
    return true;
  }

  private trimReplay(): void {
    while (this.replay.length > MAX_REPLAY_EVENTS || this.replayBytes > MAX_REPLAY_BYTES) {
      const removed = this.replay.shift();
      if (!removed) break;
      this.replayBytes -= removed.bytes;
      this.diagnostics.replayEvictions += 1;
    }
  }
}

function isInterestMessage(value: unknown): value is {
  version: typeof BACKEND_RENDERER_STREAM_VERSION;
  type: "interests";
  terminalThreadIds: string[];
  runtimeThreadIds: string[];
  lastSeq?: number;
} {
  if (typeof value !== "object" || value === null) return false;
  const input = value as Record<string, unknown>;
  return (
    input.version === BACKEND_RENDERER_STREAM_VERSION &&
    input.type === "interests" &&
    isStringArray(input.terminalThreadIds) &&
    isStringArray(input.runtimeThreadIds) &&
    (input.lastSeq === undefined ||
      (typeof input.lastSeq === "number" &&
        Number.isSafeInteger(input.lastSeq) &&
        input.lastSeq >= 0))
  );
}

function isBackendRendererRequest(value: unknown): value is BackendRendererRequest {
  if (typeof value !== "object" || value === null) return false;
  const input = value as Record<string, unknown>;
  return (
    input.version === BACKEND_RENDERER_STREAM_VERSION &&
    input.type === "request" &&
    typeof input.id === "string" &&
    (input.operation === "supervisor" ||
      input.operation === "database" ||
      input.operation === "service") &&
    typeof input.name === "string" &&
    "payload" in input
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
