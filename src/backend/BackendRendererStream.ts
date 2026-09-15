import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { SupervisorEvent } from "@/shared/ipc";
import type { LiveEventInterests } from "@/shared/liveEventInterests";
import {
  BACKEND_RENDERER_STREAM_VERSION,
  BACKEND_RENDERER_REQUEST_OPERATIONS,
  isRendererStreamOwnershipGrant,
  type BackendRendererRequest,
  type BackendRendererReply,
  type BackendRendererStreamInfo,
  type RendererStreamOwnershipClaim,
  type RendererStreamOwnershipGrant,
  type RendererWindowDeliveryState,
} from "@/shared/backendHostProtocol";
import {
  LARGE_REPLY_MAX_BYTES_PER_CLIENT,
  LARGE_REPLY_MAX_ENCODED_FRAME_BYTES,
  LARGE_REPLY_MAX_LOGICAL_BYTES,
  LARGE_REPLY_MAX_PER_CLIENT,
  isReplyAckFrame,
  isRequestCancelFrame,
  utf8ByteLength,
} from "@/shared/rendererStreamChunks";
import { BackendEventRouter } from "./BackendHostCore";
import { RendererStreamOwnership } from "./RendererStreamOwnership";
import { RendererStreamRequestAdmission } from "./rendererStreamRequestAdmission";
import { RendererStreamChunkSender } from "./rendererStreamChunkSender";
import { capBroadcastEvent, maxBroadcastEventBytes } from "@/main/remote/server/eventSizeGuard";
import { AsyncWorkTracker } from "@/shared/asyncWorkTracker";
import { HttpServerConnections } from "@/shared/httpServerConnections";
import { joinRuntimeShutdown } from "./joinRuntimeShutdown";

// WS5 P1-9: matched with the remote transport's window widening — the byte
// budget bounds memory, so the entry cap only bounds worst-case counts of
// small streaming events (the old 500-entry cap forced full resyncs under
// streaming load long before the bytes mattered).
const MAX_REPLAY_EVENTS = 4_000;
const MAX_REPLAY_BYTES = 8 * 1024 * 1024;
/** Bound for the resync-hint accumulation. Dropping the oldest hints only
 * degrades a very stale window to the safe absent/empty fallback: a full
 * subscribed rebuild. */
const MAX_LOST_THREAD_IDS = 512;
const MIN_CLIENT_BUFFERED_BYTES = 128 * 1024;
const MAX_CLIENT_BUFFERED_BYTES = 1024 * 1024;
// WS5: supervisor flow-control watermarks. When any ready renderer holds more
// than the high watermark of unacknowledged stream bytes, the backend host
// tells the supervisor to shed rebuildable terminal output at the source; the
// low watermark (hysteresis) clears it again.
const BACKPRESSURE_HIGH_WATERMARK_BYTES = MAX_CLIENT_BUFFERED_BYTES / 2;
const BACKPRESSURE_LOW_WATERMARK_BYTES = MAX_CLIENT_BUFFERED_BYTES / 8;
const HEALTHY_SENDS_BEFORE_BUDGET_REDUCTION = 256;
const MAX_REQUEST_BYTES = 64 * 1024 * 1024;
/** A renderer can issue many independent reads, but admission is finite so a
 * disconnected or stalled window cannot retain an unbounded set of promises. */
const MAX_CLIENT_IN_FLIGHT_REQUESTS = 64;
const SHUTDOWN_SOCKET_GRACE_MS = 500;

interface ReplayEntry {
  seq: number;
  event: SupervisorEvent;
  bytes: number;
  /** Ingest-time serialization; reused by replay unless filtering rewrites. */
  json: string;
}

interface ClientState {
  router: BackendEventRouter;
  ready: boolean;
  bufferedBudgetBytes: number;
  healthySends: number;
  inFlightRequestIds: Set<string>;
  /** Delivery-cancelled ids whose handler slot stays held until real settlement. */
  cancelledRequestIds: Set<string>;
  /** Active large-reply deliveries: id -> sender (retained serialized counted). */
  largeTransfers: Map<string, RendererStreamChunkSender>;
  /** Stable per-connection number so orphaned handlers stay globally counted. */
  connectionId: number;
  /** Window grants this connection owns; revoked synchronously on close. */
  readonly ownedWindowIds: Set<number>;
  /**
   * Stream sequence echoed in the queued interests-ack: this socket's
   * acknowledged handoff cursor. Everything at or below it was proven
   * received (replay frames are queued before the ack on the same ordered
   * socket); everything above it is the loss window a recovery barrier must
   * cover when the connection fails. Null until the first ack.
   */
  ackedSequence: number | null;
}

/** Owner-revocation recovery announcement for one window. */
export interface RendererStreamRevocation {
  windowId: number;
  generation: number;
  fromSequence: number;
  toSequence: number;
  threadIds?: string[];
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
  /**
   * `origin` names the window this connection is bound to (the backend
   * validated its grant) — it is the authenticated request origin used to
   * scope terminal-bootstrap retention. Undefined while the connection is
   * unbound or bound to more than one window: such a request must widen no
   * desktop window.
   */
  onRequest?(request: BackendRendererRequest, origin?: { windowId: number }): Promise<unknown>;
  /**
   * Shared per-window delivery-ownership registry, pushed by main over the
   * backend-host IPC. Defaults to a fresh registry that main has never armed,
   * which keeps the legacy always-relay-to-main behavior.
   */
  ownership?: RendererStreamOwnership;
  /**
   * Announces a generation-fenced recovery barrier when a window's owner is
   * revoked by a failed/non-open/backpressured send or a socket loss. The
   * host enqueues it through the ordered desktop-IPC fallback, where it
   * necessarily precedes every later fallback copy for that window.
   */
  onStreamRecovery?(revocations: readonly RendererStreamRevocation[]): void;
}

/** Authenticated loopback transport for renderer requests and bounded live events. */
export class BackendRendererStream {
  private readonly token = randomBytes(24).toString("base64url");
  private readonly clients = new Map<WebSocket, ClientState>();
  /** Retained bootstrap threads with the authenticated request origin window. */
  private readonly terminalBootstrapTimers = new Map<
    string,
    { timer: ReturnType<typeof setTimeout>; originWindowId?: number }
  >();
  private readonly replay: ReplayEntry[] = [];
  /**
   * Loss scope for the next `resync-required` broadcast to ready windows:
   * threads of events that fit no client budget (plus supervisor-shed ids).
   * Evicted events are not here — ready clients processed them live before
   * eviction. Cleared once broadcast; ready windows' loss is exactly this
   * batch (WS6 P1-10).
   */
  private readonly pendingBroadcastLosses = new Set<string>();
  /**
   * threadId -> highest seq whose event is unrecoverable by replay (evicted
   * from the window, or never fit any budget). Drives the per-client loss
   * scope when a reconnecting client detects a gap, so the hint reflects
   * exactly what THAT client missed: entries above its cursor plus the
   * surviving replay window. Never cleared by broadcasts — a reconnector
   * must see losses a broadcast already healed for other windows.
   *
   * Wire contract: an absent or empty `threadIds` on `resync-required` keeps
   * the legacy "rebuild every subscribed thread" meaning — a client whose
   * gap predates the recorded losses cannot be narrowed safely, and losing a
   * hint must never skip recovery. A present list is a narrowing hint only:
   * receivers intersect it with their own subscriptions and MUST treat
   * unknown ids as "rebuild anyway" (fail open, not closed).
   */
  private readonly unrecoverableBySeq = new Map<string, number>();
  /** Lowest seq in [unrecoverableBySeq], or null when empty. Lets the gap
   * path detect that the recorded losses do not reach back to a client's
   * cursor and refuse to narrow. */
  private minUnrecoverableSeq: number | null = null;
  private pressured = false;
  private replayBytes = 0;
  private sequence = 0;
  /** Per-window delivery ownership; declared in the constructor from options. */
  private readonly ownership: RendererStreamOwnership;
  private readonly httpServer;
  private readonly connections: HttpServerConnections;
  private readonly server: WebSocketServer;
  private readonly requests = new AsyncWorkTracker();
  private readonly admission = new RendererStreamRequestAdmission();
  private nextConnectionId = 1;
  private starting: Promise<BackendRendererStreamInfo> | undefined;
  private disposal: Promise<void> | undefined;
  private stopping = false;
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

  constructor(private readonly options: BackendRendererStreamOptions = {}) {
    this.ownership = options.ownership ?? new RendererStreamOwnership();
    this.httpServer = createServer((_request, response) => {
      response.writeHead(this.stopping ? 503 : 426, { "content-type": "text/plain" });
      response.end(this.stopping ? "Backend host shutting down" : "Upgrade Required");
    });
    this.connections = new HttpServerConnections(this.httpServer);
    this.server = new WebSocketServer({
      server: this.httpServer,
      perMessageDeflate: false,
      maxPayload: MAX_REQUEST_BYTES,
      verifyClient: ({ req }: { req: IncomingMessage }) => {
        try {
          return (
            !this.stopping &&
            new URL(req.url ?? "/", "ws://127.0.0.1").searchParams.get("token") === this.token
          );
        } catch {
          return false;
        }
      },
    });
    this.server.on("connection", (socket) => this.accept(socket));
  }

  start(): Promise<BackendRendererStreamInfo> {
    if (this.stopping)
      return Promise.reject(new Error("Backend renderer stream is shutting down."));
    this.starting ??= this.listen().catch((error) => {
      this.starting = undefined;
      throw error;
    });
    return this.starting;
  }

  private async listen(): Promise<BackendRendererStreamInfo> {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        this.server.off("listening", onListening);
        this.server.off("error", onError);
      };
      const onListening = () => {
        cleanup();
        resolve();
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      // WebSocketServer forwards its HTTP listener events, including bind errors.
      this.server.once("listening", onListening);
      this.server.once("error", onError);
      try {
        this.httpServer.listen(0, "127.0.0.1");
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
    if (this.stopping) throw new Error("Backend renderer stream is shutting down.");
    const address = this.httpServer.address();
    if (!address || typeof address === "string")
      throw new Error("Renderer stream did not bind TCP.");
    return {
      version: BACKEND_RENDERER_STREAM_VERSION,
      url: `ws://127.0.0.1:${address.port}/events`,
      token: this.token,
    };
  }

  /**
   * WS5: true while any ready renderer holds more than the high watermark of
   * unacknowledged stream bytes. Latched with hysteresis: it clears only once
   * every client drains below the low watermark, so the supervisor does not
   * oscillate between shedding and queueing.
   */
  isBackpressured(): boolean {
    let pressured = this.pressured;
    let highest = 0;
    for (const [socket, client] of this.clients) {
      if (!client.ready) continue;
      highest = Math.max(highest, socket.bufferedAmount);
    }
    if (!pressured && highest > BACKPRESSURE_HIGH_WATERMARK_BYTES) pressured = true;
    if (pressured && highest <= BACKPRESSURE_LOW_WATERMARK_BYTES) pressured = false;
    this.pressured = pressured;
    return pressured;
  }

  publish(event: SupervisorEvent): { delivered: boolean; sequence: number } {
    const seq = ++this.sequence;
    // One oversized event would trip `send`'s budget on every connected
    // renderer and then again on replay after they reconnect, so cap it at the
    // publish boundary exactly like the remote transport. Image refs stay
    // inline here (the desktop IPC contract keeps full bytes); withheld fields
    // self-heal from the local DB on the next hydration.
    const capped = capBroadcastEvent(event, maxBroadcastEventBytes(MAX_CLIENT_BUFFERED_BYTES), {
      projectImageRefs: false,
    });
    if (capped.kind === "undeliverable") {
      // Nothing about this event fits any client budget. `seq` has still
      // advanced, so leaving it out of the replay makes connected and
      // reconnecting clients converge the same way: refetch authoritative
      // state from the backend host.
      recordSupervisorEventThreadIds(this.pendingBroadcastLosses, event);
      this.recordUnrecoverableEvent(event, seq);
      this.diagnostics.resyncRequests += 1;
      this.broadcastResyncRequired();
      return { delivered: false, sequence: seq };
    }
    this.replay.push({
      seq,
      event: capped.event,
      bytes: capped.bytes,
      json: capped.json,
    });
    this.replayBytes += capped.bytes;
    this.trimReplay();

    let delivered = false;
    for (const [socket, client] of this.clients) {
      if (!client.ready) continue;
      const filtered = client.router.filter(capped.event);
      if (!filtered) continue;
      // Reuse the cap's serialization when filtering left the event untouched
      // so a multi-megabyte body is never stringified twice.
      const payload =
        filtered === capped.event
          ? `{"version":${BACKEND_RENDERER_STREAM_VERSION},"type":"event","seq":${seq},"event":${capped.json}}`
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

  /**
   * Asks every ready renderer window to rebuild from authoritative state.
   * Used when the supervisor shed bulk traffic in transit: the events never
   * reached persistence or this stream, so no replay can repair them.
   */
  broadcastResyncRequired(additionalThreadIds?: readonly string[]): void {
    this.diagnostics.resyncRequests += 1;
    // Ready windows are current, so their loss is exactly this pending batch;
    // clearing it never starves reconnectors, who read unrecoverableBySeq.
    if (additionalThreadIds) {
      for (const threadId of additionalThreadIds) this.pendingBroadcastLosses.add(threadId);
    }
    const threadIds = [...this.pendingBroadcastLosses];
    this.pendingBroadcastLosses.clear();
    const payload = JSON.stringify({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "resync-required",
      latestSeq: this.sequence,
      ...(threadIds.length > 0 ? { threadIds } : {}),
    });
    for (const [socket, client] of this.clients) {
      if (!client.ready) continue;
      this.send(socket, client, payload);
    }
  }

  /**
   * Retains a starting thread's first terminal output for the requesting
   * window's bound connection only: retention is attributed to the
   * authenticated request origin, so an unrelated or unbound direct client
   * never receives another window's bootstrap output. A connection that binds
   * DURING the retention window is covered by the attach-time application in
   * {@link handleClientMessage}. An originless start widens no client.
   */
  retainTerminalBootstrap(threadId: string, originWindowId?: number): void {
    this.clearTerminalBootstrap(threadId);
    const entry = {
      timer: setTimeout(() => this.terminalBootstrapTimers.delete(threadId), 10_000),
      ...(originWindowId !== undefined ? { originWindowId } : {}),
    };
    entry.timer.unref?.();
    this.terminalBootstrapTimers.set(threadId, entry);
    this.retainBootstrapForBoundClients(threadId);
  }

  clearTerminalBootstrap(threadId: string): void {
    const entry = this.terminalBootstrapTimers.get(threadId);
    if (entry) clearTimeout(entry.timer);
    this.terminalBootstrapTimers.delete(threadId);
    for (const client of this.clients.values()) client.router.clearTerminalBootstrap(threadId);
  }

  /** Applies one retained thread to every client currently bound to its origin window. */
  private retainBootstrapForBoundClients(threadId: string): void {
    const entry = this.terminalBootstrapTimers.get(threadId);
    if (!entry || entry.originWindowId === undefined) return;
    for (const client of this.clients.values()) {
      if (client.ownedWindowIds.has(entry.originWindowId)) {
        client.router.retainTerminalBootstrap(threadId);
      }
    }
  }

  hasReadyClient(): boolean {
    for (const client of this.clients.values()) if (client.ready) return true;
    return false;
  }

  /** Replaces the desktop-window per-window delivery table pushed by main. */
  setOwnershipWindows(windows: readonly RendererWindowDeliveryState[]): void {
    this.ownership.setWindows(windows);
  }

  /**
   * Revokes a failing connection's ownership and announces one
   * generation-fenced recovery barrier per lost window through the ordered
   * IPC fallback. The loss window starts at the socket's acknowledged handoff
   * cursor + 1 (a queued ack that the renderer never processed is NOT
   * receiver acknowledgement — a renderer whose cursor is below the barrier's
   * premise falls back to a full rebuild on its side) and ends at the current
   * sequence. Detaching first guarantees the failing window is part of the
   * next fallback selection, so any targeted copy for it is enqueued after
   * this barrier.
   */
  private failOverClient(state: ClientState): void {
    if (state.ownedWindowIds.size === 0) return;
    const revocations: RendererStreamRevocation[] = [];
    const fromSequence = (state.ackedSequence ?? -1) + 1;
    const toSequence = this.sequence;
    const windowIds = [...state.ownedWindowIds];
    this.ownership.detachClient(state);
    if (fromSequence > toSequence) return;
    const threadIds = this.recoveryScope(fromSequence, toSequence);
    for (const windowId of windowIds) {
      revocations.push({
        windowId,
        generation: this.ownership.generationFor(windowId),
        fromSequence,
        toSequence,
        ...(threadIds && threadIds.length > 0 ? { threadIds } : {}),
      });
    }
    this.options.onStreamRecovery?.(revocations);
  }

  /**
   * Threads carried by possibly-missed events in [from, to]: the replay
   * window plus every unrecoverable-recorded thread. Undefined — the
   * renderer then rebuilds everything it subscribes to (fail open), never
   * silently less — when the scope exceeds the hint bound, or when the
   * recorded losses do not reach back to `from`: the loss map drops its
   * lowest entries once it overflows, and every evicted record sat at or
   * below the surviving minimum, so a minimum inside the window proves that
   * dropped losses may lie in range and the surviving hints cannot prove
   * coverage (same guard as {@link gapLossScope}).
   */
  private recoveryScope(from: number, to: number): string[] | undefined {
    if (this.minUnrecoverableSeq !== null && this.minUnrecoverableSeq > from) return undefined;
    const scope = new Set<string>();
    for (const entry of this.replay) {
      if (entry.seq < from || entry.seq > to) continue;
      recordSupervisorEventThreadIds(scope, entry.event);
    }
    for (const [threadId, seq] of this.unrecoverableBySeq) {
      if (seq >= from && seq <= to) scope.add(threadId);
    }
    if (scope.size > MAX_LOST_THREAD_IDS) return undefined;
    return [...scope];
  }

  getDiagnostics(): BackendRendererStreamDiagnostics {
    return { connectedClients: this.clients.size, ...this.diagnostics };
  }

  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.stopping = true;
    const barrier = Promise.withResolvers<void>();
    this.disposal = barrier.promise;
    for (const entry of this.terminalBootstrapTimers.values()) clearTimeout(entry.timer);
    this.terminalBootstrapTimers.clear();
    void (async () => {
      await this.starting?.catch(() => {});
      for (const [socket, client] of this.clients) {
        for (const [id, sender] of client.largeTransfers) {
          sender.cancel();
          this.releaseLargeTransfer(client, socket, id);
        }
        client.largeTransfers.clear();
        client.cancelledRequestIds.clear();
        client.router.dispose();
        socket.close(1001, "Backend host shutting down");
      }
      await joinRuntimeShutdown(
        [
          () =>
            new Promise<void>((resolve, reject) =>
              this.server.close((error) => (error ? reject(error) : resolve())),
            ),
          () => this.connections.close(SHUTDOWN_SOCKET_GRACE_MS),
          () => this.requests.drain(),
        ],
        "Backend renderer stream did not shut down cleanly.",
      );
      this.clients.clear();
    })().then(barrier.resolve, barrier.reject);
    return this.disposal;
  }

  private accept(socket: WebSocket): void {
    if (this.stopping) {
      socket.terminate();
      return;
    }
    const state: ClientState = {
      router: new BackendEventRouter(),
      ready: false,
      bufferedBudgetBytes: MIN_CLIENT_BUFFERED_BYTES,
      healthySends: 0,
      inFlightRequestIds: new Set(),
      cancelledRequestIds: new Set(),
      largeTransfers: new Map(),
      connectionId: this.nextConnectionId++,
      ownedWindowIds: new Set(),
      ackedSequence: null,
    };
    // Retained bootstrap threads are NOT applied here: a connection is
    // unbound (and therefore unattributed) until its interests frame presents
    // a grant. The bind applies this window's own retained threads.
    this.clients.set(socket, state);
    socket.on("message", (data) => this.handleClientMessage(socket, state, data.toString()));
    socket.once("close", () => {
      // Synchronous revocation with a recovery barrier: the window may have
      // missed everything queued since its ack (a message being queued is not
      // receiver acknowledgement), so the very next publish sees it as a
      // targeted fallback consumer again and the barrier — enqueued ahead of
      // those copies — tells it what to rebuild.
      // Large deliveries release promptly; handler slots stay globally counted
      // until their real settlement (orphan work cannot bypass the bound).
      for (const [, sender] of state.largeTransfers) {
        sender.socketLost();
        sender.cancel();
      }
      for (const id of [...state.largeTransfers.keys()]) {
        this.releaseLargeTransfer(state, socket, id);
      }
      state.largeTransfers.clear();
      this.failOverClient(state);
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
    if (this.stopping) return;
    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch {
      socket.close(1008, "Invalid renderer stream message");
      return;
    }
    if (isBackendRendererRequest(message)) {
      if (state.inFlightRequestIds.has(message.id)) {
        socket.close(1008, "Duplicate renderer request id");
        return;
      }
      if (state.inFlightRequestIds.size >= MAX_CLIENT_IN_FLIGHT_REQUESTS) {
        void this.sendReply(socket, state, {
          version: BACKEND_RENDERER_STREAM_VERSION,
          type: "reply",
          id: message.id,
          ok: false,
          error: "Renderer request concurrency limit reached.",
        });
        return;
      }
      const executionKey = `h:${state.connectionId}:${message.id}`;
      if (!this.admission.tryReserveExecution(executionKey)) {
        void this.sendReply(socket, state, {
          version: BACKEND_RENDERER_STREAM_VERSION,
          type: "reply",
          id: message.id,
          ok: false,
          error: "Renderer request overload: too many outstanding handlers.",
        });
        return;
      }
      state.inFlightRequestIds.add(message.id);
      void this.requests
        .run(() => this.handleRequest(socket, state, message))
        .catch(() => socket.terminate())
        .finally(() => {
          state.inFlightRequestIds.delete(message.id);
          state.cancelledRequestIds.delete(message.id);
          this.admission.releaseExecution(executionKey);
        });
      return;
    }
    if (this.handleLargeReplyControl(socket, state, message)) return;
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
    // The ownership claim is validated before replay so a rejected bind can
    // never let the ack read as a confirmed handoff.
    const granted = message.ownership
      ? this.ownership.match(
          message.ownership.windowId,
          message.ownership.generation,
          message.ownership.binding,
        )
      : null;
    if (typeof message.lastSeq === "number") this.replayFrom(socket, state, message.lastSeq);
    // Replay and ack are one synchronous block, so no publish can interleave:
    // everything above the client's cursor that the replay retained arrived
    // before the ack, and everything published after it is delivered on this
    // socket only. The echoed claim is the acknowledged handoff boundary, and
    // the ack's latestSeq is the socket's acknowledged cursor: on ordered
    // WebSocket delivery, processing the ack proves the client received every
    // frame queued before it.
    const echo: RendererStreamOwnershipClaim | null = granted
      ? { windowId: granted.windowId, generation: granted.generation }
      : null;
    const acked = this.send(
      socket,
      state,
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "interests-ack",
        latestSeq: this.sequence,
        ...(echo ? { ownership: echo } : {}),
      }),
    );
    if (acked) state.ackedSequence = this.sequence;
    // Ownership activates only once the confirming ack is queued on a live
    // socket: a failed ack send leaves the window fallback-owned, so main
    // keeps delivering until a reconnect completes the handoff again.
    if (acked && granted) {
      this.ownership.attach(granted.windowId, state);
      // The freshly bound connection inherits its own window's surviving
      // bootstrap retention, covering a bind that happens mid-window.
      for (const [threadId, entry] of this.terminalBootstrapTimers) {
        if (entry.originWindowId === granted.windowId) {
          state.router.retainTerminalBootstrap(threadId);
        }
      }
    }
  }

  /**
   * v6 large-reply control frames. Version/type violations close 1008 like any
   * other malformed frame; valid-shape but stale/duplicate/overcredit frames
   * are safely ignored (socket alive, no credit, no revive).
   */
  private handleLargeReplyControl(
    socket: WebSocket,
    state: ClientState,
    message: unknown,
  ): boolean {
    if (typeof message !== "object" || message === null) return false;
    const input = message as Record<string, unknown>;
    if (input.type !== "reply-ack" && input.type !== "request-cancel") return false;
    if (input.version !== BACKEND_RENDERER_STREAM_VERSION) {
      socket.close(1008, "Invalid renderer transport message");
      return true;
    }
    if (input.type === "reply-ack") {
      if (!isReplyAckFrame(message)) {
        socket.close(1008, "Invalid renderer transport message");
        return true;
      }
      // Stale/duplicate/future acks grant nothing and keep the socket alive.
      state.largeTransfers.get(message.id)?.onAck(message);
      return true;
    }
    if (!isRequestCancelFrame(message)) {
      socket.close(1008, "Invalid renderer transport message");
      return true;
    }
    // Delivery-cancel only: hold the execution slot until real settlement;
    // late handler completion cannot publish. Unknown ids are safely ignored.
    if (state.inFlightRequestIds.has(message.id)) {
      state.cancelledRequestIds.add(message.id);
    }
    state.largeTransfers.get(message.id)?.cancel();
    return true;
  }

  private largeDeliveryKey(state: ClientState, id: string): string {
    return `large:${state.connectionId}:${id}`;
  }

  private largeRetainedBytes(state: ClientState): number {
    let total = 0;
    for (const sender of state.largeTransfers.values()) total += sender.logicalBytes;
    return total;
  }

  private releaseLargeTransfer(state: ClientState, _socket: WebSocket, id: string): void {
    if (!state.largeTransfers.has(id)) return;
    state.largeTransfers.delete(id);
    this.admission.releaseDelivery(this.largeDeliveryKey(state, id));
  }

  private async handleRequest(
    socket: WebSocket,
    state: ClientState,
    request: BackendRendererRequest,
  ): Promise<void> {
    const handler = this.options.onRequest;
    if (!handler) {
      await this.sendReply(socket, state, {
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "reply",
        id: request.id,
        ok: false,
        error: "Renderer requests are not enabled.",
      });
      return;
    }
    // The authenticated origin is the bind the backend validated for THIS
    // connection — never a request-supplied id. Ambiguous multi-window binds
    // stay originless.
    const origin =
      state.ownedWindowIds.size === 1 ? { windowId: [...state.ownedWindowIds][0]! } : undefined;
    try {
      const data = await handler(request, origin);
      if (state.cancelledRequestIds.has(request.id)) return;
      if (!this.clients.has(socket)) return;
      await this.sendReply(socket, state, {
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "reply",
        id: request.id,
        ok: true,
        data,
      });
    } catch (error) {
      if (state.cancelledRequestIds.has(request.id)) return;
      if (!this.clients.has(socket)) return;
      await this.sendReply(socket, state, {
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "reply",
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async sendReply(
    socket: WebSocket,
    state: ClientState,
    reply: BackendRendererReply,
  ): Promise<void> {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (!this.clients.has(socket)) return;
    const payload = JSON.stringify(reply);
    if (Buffer.byteLength(payload) > MAX_REQUEST_BYTES) {
      this.send(
        socket,
        state,
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
    // Ordinary path: the complete encoded reply fits the 64KiB data-frame
    // bound, preserving existing small-reply behavior byte-for-byte.
    if (Buffer.byteLength(payload) <= LARGE_REPLY_MAX_ENCODED_FRAME_BYTES) {
      this.send(socket, state, payload);
      return;
    }
    // Only ok:true data replies fragment; bounded errors stay ordinary.
    // No procedure whitelist: any valid admitted reply may chunk, including
    // mutation results — fragmentation never re-executes the handler, and no
    // post-admission failure replays over main IPC.
    if (!reply.ok) {
      this.send(socket, state, payload);
      return;
    }
    let serialized: string;
    try {
      const text = JSON.stringify(reply.data);
      if (typeof text !== "string") {
        this.send(socket, state, payload);
        return;
      }
      serialized = text;
    } catch {
      this.send(
        socket,
        state,
        JSON.stringify({
          version: BACKEND_RENDERER_STREAM_VERSION,
          type: "reply",
          id: reply.id,
          ok: false,
          error: "Backend response could not be serialized.",
        } satisfies BackendRendererReply),
      );
      return;
    }
    const logicalBytes = utf8ByteLength(serialized);
    if (logicalBytes > LARGE_REPLY_MAX_LOGICAL_BYTES) {
      this.send(
        socket,
        state,
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
    if (state.cancelledRequestIds.has(reply.id)) return;
    if (state.largeTransfers.has(reply.id)) return;
    if (state.largeTransfers.size >= LARGE_REPLY_MAX_PER_CLIENT) {
      this.send(
        socket,
        state,
        JSON.stringify({
          version: BACKEND_RENDERER_STREAM_VERSION,
          type: "reply",
          id: reply.id,
          ok: false,
          error: "Renderer large-reply concurrency limit reached.",
        } satisfies BackendRendererReply),
      );
      return;
    }
    if (this.largeRetainedBytes(state) + logicalBytes > LARGE_REPLY_MAX_BYTES_PER_CLIENT) {
      this.send(
        socket,
        state,
        JSON.stringify({
          version: BACKEND_RENDERER_STREAM_VERSION,
          type: "reply",
          id: reply.id,
          ok: false,
          error: "Renderer large-reply byte limit reached.",
        } satisfies BackendRendererReply),
      );
      return;
    }
    const deliveryKey = this.largeDeliveryKey(state, reply.id);
    if (!this.admission.tryReserveDelivery(deliveryKey, logicalBytes)) {
      this.send(
        socket,
        state,
        JSON.stringify({
          version: BACKEND_RENDERER_STREAM_VERSION,
          type: "reply",
          id: reply.id,
          ok: false,
          error: "Renderer large-reply overload: too many concurrent transfers.",
        } satisfies BackendRendererReply),
      );
      return;
    }
    let sender: RendererStreamChunkSender;
    try {
      sender = new RendererStreamChunkSender(reply.id, reply.data, {
        sendFrame: (frame) => this.send(socket, state, frame),
        isOpen: () => socket.readyState === WebSocket.OPEN && this.clients.has(socket),
      });
    } catch {
      this.admission.releaseDelivery(deliveryKey);
      this.send(
        socket,
        state,
        JSON.stringify({
          version: BACKEND_RENDERER_STREAM_VERSION,
          type: "reply",
          id: reply.id,
          ok: false,
          error: "Backend response could not be serialized.",
        } satisfies BackendRendererReply),
      );
      return;
    }
    state.largeTransfers.set(reply.id, sender);
    try {
      const outcome = await sender.run();
      if (outcome === "cancelled") return;
      if (outcome === "transport-lost") return;
      // completed/aborted both end here: completed delivered end, aborted sent
      // a bounded reply-abort with the socket alive. Neither revokes window
      // ownership for a mere missing ACK and neither replays over main IPC.
    } finally {
      this.releaseLargeTransfer(state, socket, reply.id);
    }
  }

  private replayFrom(socket: WebSocket, state: ClientState, lastSeq: number): void {
    // An empty buffer must read as "nothing is replayable", not "the client is
    // current": `?? this.sequence` would let a stale client skip replay and be
    // acknowledged as up to date while events were silently dropped.
    const oldest = this.replay[0]?.seq ?? this.sequence + 1;
    if (lastSeq < oldest - 1) {
      this.diagnostics.resyncRequests += 1;
      const threadIds = this.gapLossScope(lastSeq);
      this.send(
        socket,
        state,
        JSON.stringify({
          version: BACKEND_RENDERER_STREAM_VERSION,
          type: "resync-required",
          latestSeq: this.sequence,
          ...(threadIds.length > 0 ? { threadIds } : {}),
        }),
      );
      return;
    }
    for (const entry of this.replay) {
      if (entry.seq <= lastSeq) continue;
      const event = state.router.filter(entry.event);
      if (!event) continue;
      // Reuse the ingest-time serialization when filtering left the event
      // untouched: a multi-megabyte entry is never stringified again here.
      const payload =
        event === entry.event
          ? `{"version":${BACKEND_RENDERER_STREAM_VERSION},"type":"event","seq":${entry.seq},"event":${entry.json}}`
          : JSON.stringify({
              version: BACKEND_RENDERER_STREAM_VERSION,
              type: "event",
              seq: entry.seq,
              event,
            });
      if (!this.send(socket, state, payload)) return;
      this.diagnostics.replayedEvents += 1;
    }
    // An event nothing could deliver is a hole INSIDE the replay window: it
    // never entered the buffer, so a cursor above `oldest - 1` replays
    // straight over it. Its thread is recorded in unrecoverableBySeq, and a
    // client that was disconnected when the resync broadcast fired must still
    // rebuild that thread — before the handoff ack lets desktop-IPC copies
    // stop covering the hole for it.
    const lostThreadIds: string[] = [];
    for (const [threadId, seq] of this.unrecoverableBySeq) {
      if (seq > lastSeq) lostThreadIds.push(threadId);
    }
    if (lostThreadIds.length > 0) {
      this.diagnostics.resyncRequests += 1;
      this.send(
        socket,
        state,
        JSON.stringify({
          version: BACKEND_RENDERER_STREAM_VERSION,
          type: "resync-required",
          latestSeq: this.sequence,
          threadIds: lostThreadIds,
        }),
      );
    }
  }

  private send(socket: WebSocket, state: ClientState, payload: string): boolean {
    if (socket.readyState !== WebSocket.OPEN) {
      // The connection is gone or closing while it may still own windows:
      // revoke now (not on the close event) so the fallback selection and the
      // recovery barrier see the loss immediately — a renderer whose onclose
      // has not fired yet must still learn about it this tick.
      this.failOverClient(state);
      return false;
    }
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
      // Same contract as a dead socket: the window loses this event and every
      // queued-but-unreceived one, so revoke and announce the loss window now.
      this.failOverClient(state);
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

  /** Records every thread of an event as unrecoverable from seq onward. */
  private recordUnrecoverableEvent(event: SupervisorEvent, seq: number): void {
    const ids = new Set<string>();
    recordSupervisorEventThreadIds(ids, event);
    for (const threadId of ids) this.recordUnrecoverableThread(threadId, seq);
  }

  private recordUnrecoverableThread(threadId: string, seq: number): void {
    const existing = this.unrecoverableBySeq.get(threadId);
    if (existing !== undefined) {
      if (existing >= seq) return;
      this.unrecoverableBySeq.set(threadId, seq);
      // Raising an entry can retire the recorded minimum; a stale-low min
      // would claim coverage the map no longer has and narrow unsoundly.
      if (existing === this.minUnrecoverableSeq) {
        this.minUnrecoverableSeq = null;
        for (const value of this.unrecoverableBySeq.values()) {
          this.minUnrecoverableSeq =
            this.minUnrecoverableSeq === null ? value : Math.min(this.minUnrecoverableSeq, value);
        }
      }
      return;
    }
    if (this.unrecoverableBySeq.size >= MAX_LOST_THREAD_IDS) {
      // Drop the oldest loss. The gap path notices the resulting coverage
      // hole via minUnrecoverableSeq and falls back to a full rebuild —
      // dropping a hint degrades to safe, never to silent staleness.
      let oldestKey: string | undefined;
      let oldestSeq = Number.POSITIVE_INFINITY;
      for (const [key, value] of this.unrecoverableBySeq) {
        if (value < oldestSeq) {
          oldestSeq = value;
          oldestKey = key;
        }
      }
      if (oldestKey !== undefined) this.unrecoverableBySeq.delete(oldestKey);
      this.minUnrecoverableSeq = null;
      for (const value of this.unrecoverableBySeq.values()) {
        this.minUnrecoverableSeq =
          this.minUnrecoverableSeq === null ? value : Math.min(this.minUnrecoverableSeq, value);
      }
    }
    this.unrecoverableBySeq.set(threadId, seq);
    this.minUnrecoverableSeq =
      this.minUnrecoverableSeq === null ? seq : Math.min(this.minUnrecoverableSeq, seq);
  }

  /**
   * The loss scope for ONE reconnecting client: threads with unrecoverable
   * events above its cursor, plus every thread carried by the surviving
   * replay window it is about to skip. Empty when the recorded losses do not
   * reach back to the client's cursor — the gap may then hold unrecorded
   * threads, and only the legacy full rebuild is sound.
   */
  private gapLossScope(lastSeq: number): string[] {
    if (this.minUnrecoverableSeq === null || this.minUnrecoverableSeq > lastSeq + 1) {
      return [];
    }
    const scope = new Set<string>();
    for (const entry of this.replay) {
      if (entry.seq <= lastSeq) continue;
      recordSupervisorEventThreadIds(scope, entry.event);
    }
    for (const [threadId, seq] of this.unrecoverableBySeq) {
      if (seq > lastSeq) scope.add(threadId);
    }
    return [...scope];
  }

  private trimReplay(): void {
    while (this.replay.length > MAX_REPLAY_EVENTS || this.replayBytes > MAX_REPLAY_BYTES) {
      // Never evict the newest entry: an empty buffer would leave reconnecting
      // clients with nothing to replay and no oldest-seq boundary to detect it.
      if (this.replay.length <= 1) break;
      const removed = this.replay.shift();
      if (!removed) break;
      this.recordUnrecoverableEvent(removed.event, removed.seq);
      this.replayBytes -= removed.bytes;
      this.diagnostics.replayEvictions += 1;
    }
  }
}

/**
 * Collects every thread a supervisor event touches. Events without a thread
 * (agent statuses, usage snapshots) cannot lose transcript content, so they
 * contribute nothing to the lost-thread scope.
 */
function recordSupervisorEventThreadIds(into: Set<string>, event: SupervisorEvent): void {
  if (event.type === "thread-runtime-events-multi") {
    for (const batch of event.batches) into.add(batch.threadId);
    return;
  }
  if ("threadId" in event && typeof event.threadId === "string") {
    into.add(event.threadId);
  }
}

function isInterestMessage(value: unknown): value is {
  version: typeof BACKEND_RENDERER_STREAM_VERSION;
  type: "interests";
  terminalThreadIds: string[];
  runtimeThreadIds: string[];
  lastSeq?: number;
  /** Ownership binding presented by the preload-bridge grant for this window. */
  ownership?: RendererStreamOwnershipGrant;
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
        input.lastSeq >= 0)) &&
    (input.ownership === undefined || isRendererStreamOwnershipGrant(input.ownership))
  );
}

function isBackendRendererRequest(value: unknown): value is BackendRendererRequest {
  if (typeof value !== "object" || value === null) return false;
  const input = value as Record<string, unknown>;
  return (
    input.version === BACKEND_RENDERER_STREAM_VERSION &&
    input.type === "request" &&
    typeof input.id === "string" &&
    BACKEND_RENDERER_REQUEST_OPERATIONS.some((operation) => operation === input.operation) &&
    typeof input.name === "string" &&
    "payload" in input
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
