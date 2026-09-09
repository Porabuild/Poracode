import { type Socket } from "node:net";
import { WebSocket } from "ws";
import { type RealHostHandle } from "../harness/realHost.ts";
import { issueTicket } from "./testClient.ts";
import { TerminalWatchRecorder, type TerminalWatchState } from "./terminalWatchRecorder.ts";

/**
 * Instrumented client for the shared-host concurrency experiment. Rides the
 * real WS surface (one-time ticket → event stream) and adds latency/byte
 * accounting. Credential acquisition lives in `profileClientFactory.ts`.
 *
 * Instrumentation rules:
 *  - Every observer (raw-socket byte counter, message parser, event waiters)
 *    is attached BEFORE the socket opens, so frames delivered in the same
 *    chunk as the handshake completion are measured.
 *  - No shadow buffering: this class is the only message consumer.
 *  - Event waiters are retained until a matching event arrives (or the
 *    client closes); a non-matching event never drops a waiter. Waiters may
 *    match already-received events, so predicates must uniquely identify the
 *    awaited event within a run (the suite uses unique names).
 */

export interface ReceivedEvent {
  readonly seq: number;
  readonly type: string;
  readonly event: Record<string, unknown>;
  /** Application bytes of the full `{"type":"event",...}` frame (decompressed). */
  readonly appBytes: number;
  /** Monotonic `performance.now()` stamp — NOT epoch time. Only meaningful in
   * differences against other `performance.now()` stamps (propagation and
   * end-to-end latency); never mix with `Date.now()` values. */
  readonly arrivedAtMs: number;
}

export interface ProfileClientMetrics {
  readonly label: string;
  readySeq: number | null;
  /** seq of the first event frame delivered on this connection (null = none). */
  firstEventSeq: number | null;
  lastEventSeq: number | null;
  eventsReceived: number;
  eventSeqGaps: number;
  resyncRequiredCount: number;
  replayedEventCount: number;
  appBytesReceived: number;
  appBytesSent: number;
  httpRequests: number;
  httpRequestBodyBytes: number;
  httpResponseBodyBytes: number;
  /** Raw socket-level inbound bytes after the WS upgrade: compressed transport
   * frames, excluding HTTP upgrade / TCP / handshake overhead. */
  transportSocketBytesReceived: number;
  framesReceived: number;
  readonly controlLatenciesMs: Record<string, number[]>;
  readonly eventPropagationMs: number[];
  readonly mutationToEndToEndMs: number[];
  readonly wsPingRttMs: number[];
  /** 429 retries while acquiring this client's credential (only the
   * credential-owning connection of a profile records them). */
  pairingThrottleRetries: number;
  pairingThrottleWaitMs: number;
}

export interface FetchResult {
  readonly status: number;
  readonly body: unknown;
  /** Full JSON round-trip: request dispatch through complete body read. */
  readonly elapsedMs: number;
}

interface EventWaiter {
  accept: (event: ReceivedEvent) => boolean;
  resolve: (event: ReceivedEvent) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface PongWaiter {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const OPEN_TIMEOUT_MS = 15_000;
const CLOSE_TIMEOUT_MS = 3_000;

export class ProfileClient {
  readonly metrics: ProfileClientMetrics;
  readonly accessToken: string;
  readonly ws: WebSocket;

  private readonly events: ReceivedEvent[] = [];
  private readonly eventWaiters: EventWaiter[] = [];
  private readonly pongWaiters = new Map<string, PongWaiter>();
  /** Per-ping monotonic send stamps for RTT math. The wire `sentAt` field is a
   * separate epoch value kept for wire compatibility (the server echoes it
   * opaquely); the two clocks must never mix. */
  private readonly pingSentPerfMs = new Map<string, number>();
  private readonly terminal = new TerminalWatchRecorder();
  private readonly openSettled: Promise<void>;
  private readonly readySettled: Promise<void>;
  private settleOpen: ((error?: Error) => void) | undefined;
  private settleReady: ((error?: Error) => void) | undefined;
  private closed = false;
  private pingCounter = 0;

  /** Wires ALL observers synchronously, before the socket can open. */
  private constructor(
    private readonly handle: RealHostHandle,
    label: string,
    accessToken: string,
    ws: WebSocket,
  ) {
    this.accessToken = accessToken;
    this.ws = ws;
    this.metrics = {
      label,
      readySeq: null,
      firstEventSeq: null,
      lastEventSeq: null,
      eventsReceived: 0,
      eventSeqGaps: 0,
      resyncRequiredCount: 0,
      replayedEventCount: 0,
      appBytesReceived: 0,
      appBytesSent: 0,
      httpRequests: 0,
      httpRequestBodyBytes: 0,
      httpResponseBodyBytes: 0,
      transportSocketBytesReceived: 0,
      framesReceived: 0,
      controlLatenciesMs: {},
      eventPropagationMs: [],
      mutationToEndToEndMs: [],
      wsPingRttMs: [],
      pairingThrottleRetries: 0,
      pairingThrottleWaitMs: 0,
    };

    this.openSettled = new Promise<void>((resolve, reject) => {
      this.settleOpen = (error?: Error) => (error ? reject(error) : resolve());
    });
    this.readySettled = new Promise<void>((resolve, reject) => {
      this.settleReady = (error?: Error) => (error ? reject(error) : resolve());
    });

    // Transport bytes need the raw socket: the `ws` "message" event carries
    // already-decompressed application payload, never wire bytes. Registered
    // pre-open so a socket that opens and receives data in one chunk counts.
    ws.on("open", () => {
      const raw = this.rawSocket();
      raw?.on("data", (chunk: Buffer) => {
        this.metrics.transportSocketBytesReceived += chunk.length;
      });
      this.settleOpen?.();
    });

    ws.on("message", (data: WebSocket.RawData) => {
      this.consumeFrame(data);
    });

    ws.on("error", (error: Error) => {
      this.settleOpen?.(error);
      this.settleReady?.(error);
    });

    ws.on("close", () => {
      const closeError = new Error(`${label}: websocket closed while observers were pending`);
      this.settleOpen?.(closeError);
      this.settleReady?.(closeError);
      this.settleWaitersAndPongs(closeError);
    });
  }

  /** Opens one instrumented connection for an existing device credential. */
  static async create(input: {
    readonly handle: RealHostHandle;
    readonly label: string;
    readonly accessToken: string;
    readonly lastSeenSeq?: number | undefined;
  }): Promise<ProfileClient> {
    const { handle, label } = input;
    const ticket = await issueTicket(handle.httpBaseUrl, input.accessToken);
    if (ticket.status !== 200 || !ticket.ticket) {
      throw new Error(`${label}: websocket ticket failed with status ${String(ticket.status)}.`);
    }
    const url = new URL("ws", handle.wsBaseUrl);
    url.searchParams.set("ticket", ticket.ticket);
    if (input.lastSeenSeq !== undefined) {
      url.searchParams.set("lastSeenSeq", String(input.lastSeenSeq));
    }
    // Observers attach in the constructor, strictly before any open/message.
    const client = new ProfileClient(handle, label, input.accessToken, new WebSocket(url));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.all([client.openSettled, client.readySettled]),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`${label}: websocket did not become ready`)),
            OPEN_TIMEOUT_MS,
          );
          timer.unref();
        }),
      ]);
      if (client.metrics.readySeq === null) {
        throw new Error(`${label}: websocket became ready without a cursor.`);
      }
      return client;
    } catch (error) {
      await client.close();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  get label(): string {
    return this.metrics.label;
  }

  /** Events received so far (arrival order). */
  receivedEvents(): readonly ReceivedEvent[] {
    return this.events;
  }

  /** Resolves with the first event matching `accept` — scanning already
   * received events first, then waiting for arrival. Predicates must uniquely
   * identify the awaited event within a run. */
  awaitNextEvent(
    accept: (event: ReceivedEvent) => boolean,
    timeoutMs = 15_000,
  ): Promise<ReceivedEvent> {
    const retained = this.events.find((event) => accept(event));
    if (retained) return Promise.resolve(retained);
    return new Promise<ReceivedEvent>((resolve, reject) => {
      const waiter: EventWaiter = {
        accept,
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = this.eventWaiters.indexOf(waiter);
          if (index >= 0) this.eventWaiters.splice(index, 1);
          reject(new Error(`${this.label}: timed out waiting for a matching event.`));
        }, timeoutMs),
      };
      this.eventWaiters.push(waiter);
    });
  }

  async fetchJson(
    operation: string,
    path: string,
    init?: {
      readonly method?: string;
      readonly body?: unknown;
    },
  ): Promise<FetchResult> {
    const startedAt = performance.now();
    const requestBody = init?.body === undefined ? undefined : JSON.stringify(init.body);
    this.metrics.httpRequests += 1;
    this.metrics.httpRequestBodyBytes +=
      requestBody === undefined ? 0 : Buffer.byteLength(requestBody);
    const response = await fetch(new URL(path, this.handle.httpBaseUrl), {
      ...(init?.method ? { method: init.method } : {}),
      ...(requestBody === undefined ? {} : { body: requestBody }),
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        ...(init?.body === undefined ? {} : { "content-type": "application/json" }),
      },
    });
    let body: unknown = {};
    const responseBytes = Buffer.from(await response.arrayBuffer());
    this.metrics.httpResponseBodyBytes += responseBytes.length;
    const text = responseBytes.toString("utf8");
    const elapsedMs = performance.now() - startedAt;
    if (text.trim()) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = { raw: text };
      }
    }
    const samples = this.metrics.controlLatenciesMs[operation] ?? [];
    samples.push(elapsedMs);
    this.metrics.controlLatenciesMs[operation] = samples;
    return { status: response.status, body, elapsedMs };
  }

  /** POST /api/git/call with the `{result}` envelope unwrapped so callers see
   * the procedure's own result shape (error bodies pass through untouched). */
  async gitProcedure(operation: string, procedure: string, payload: unknown): Promise<FetchResult> {
    const response = await this.fetchJson(operation, "/api/git/call", {
      method: "POST",
      body: { procedure, payload },
    });
    const body = response.body as { result?: unknown } | null;
    if (response.status === 200 && body !== null && typeof body === "object" && "result" in body) {
      return { ...response, body: body.result };
    }
    return response;
  }

  async ping(): Promise<void> {
    const id = `${this.label}-ping-${String(this.pingCounter)}`;
    this.pingCounter += 1;
    await new Promise<void>((resolve, reject) => {
      const waiter: PongWaiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          this.pongWaiters.delete(id);
          this.pingSentPerfMs.delete(id);
          reject(new Error(`${this.label}: ping was never answered.`));
        }, 10_000),
      };
      // Arm the waiter, stamp the monotonic clock, then send — in that order.
      // The wire `sentAt` stays epoch ms: the server echoes it opaquely and
      // other clients may assume wall-clock values there.
      this.pongWaiters.set(id, waiter);
      this.pingSentPerfMs.set(id, performance.now());
      this.sendJson({ type: "ping", id, sentAt: Date.now() });
    });
  }

  sendJson(message: Record<string, unknown>): void {
    const payload = JSON.stringify(message);
    this.metrics.appBytesSent += Buffer.byteLength(payload, "utf8");
    this.ws.send(payload);
  }

  /** Installs a reliable (cursor-sync) terminal watch and resolves with the
   * `terminal-watch-result` payload for that watchId. */
  async watchTerminalReliable(
    terminalId: string,
    watchId: string,
  ): Promise<Record<string, unknown>> {
    return this.terminal.install({
      label: this.label,
      terminalId,
      watchId,
      send: (message) => this.sendJson(message),
    });
  }

  terminalState(watchId: string): TerminalWatchState | null {
    return this.terminal.state(watchId);
  }

  pauseSocket(): void {
    const raw = this.rawSocket();
    if (!raw) throw new Error(`${this.label}: raw socket unavailable for pausing.`);
    raw.pause();
  }

  resumeSocket(): void {
    const raw = this.rawSocket();
    if (!raw) throw new Error(`${this.label}: raw socket unavailable for resuming.`);
    raw.resume();
  }

  /** Bounded teardown: a paused/backpressured socket can never finish the
   * close handshake, so waiters settle first, the raw socket resumes, and a
   * hung close escalates to terminate after CLOSE_TIMEOUT_MS. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.settleWaitersAndPongs(new Error(`${this.label}: client closed`));
    this.rawSocket()?.resume();
    const ws = this.ws;
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          ws.terminate();
          resolve();
        }, CLOSE_TIMEOUT_MS);
        ws.once("close", () => {
          clearTimeout(timer);
          resolve();
        });
        ws.close();
      });
    }
  }

  private rawSocket(): Socket | null {
    return (this.ws as unknown as { _socket?: Socket | null })._socket ?? null;
  }

  private settleWaitersAndPongs(error: Error): void {
    for (const waiter of this.eventWaiters.splice(0, this.eventWaiters.length)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    for (const [id, waiter] of this.pongWaiters) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
      this.pongWaiters.delete(id);
    }
    this.pingSentPerfMs.clear();
  }

  private consumeFrame(data: WebSocket.RawData): void {
    const buffer = Buffer.isBuffer(data)
      ? data
      : Array.isArray(data)
        ? Buffer.concat(data)
        : Buffer.from(data);
    this.metrics.framesReceived += 1;
    this.metrics.appBytesReceived += buffer.length;
    let parsed: unknown;
    try {
      parsed = JSON.parse(buffer.toString("utf8")) as unknown;
    } catch {
      return;
    }
    if (typeof parsed !== "object" || parsed === null) return;
    const message = parsed as Record<string, unknown>;
    const type = message.type;
    if (type === "ready" && typeof message.seq === "number") {
      this.metrics.readySeq = message.seq;
      this.settleReady?.();
      return;
    }
    if (type === "event" && typeof message.seq === "number") {
      this.consumeEvent(message.seq, message, buffer.length);
      return;
    }
    if (type === "resync-required") {
      this.metrics.resyncRequiredCount += 1;
      return;
    }
    if (type === "pong" && typeof message.id === "string") {
      const sentPerfMs = this.pingSentPerfMs.get(message.id);
      const waiter = this.pongWaiters.get(message.id);
      if (sentPerfMs !== undefined) {
        this.pingSentPerfMs.delete(message.id);
        this.metrics.wsPingRttMs.push(performance.now() - sentPerfMs);
      }
      if (waiter) {
        this.pongWaiters.delete(message.id);
        clearTimeout(waiter.timer);
        waiter.resolve();
      }
      return;
    }
    if (type === "terminal-output") {
      this.terminal.observeTerminalOutput(message);
      return;
    }
    if (type === "terminal-watch-result") {
      this.terminal.observeTerminalWatchResult(message);
    }
  }

  private consumeEvent(seq: number, message: Record<string, unknown>, frameBytes: number): void {
    const expected = this.metrics.lastEventSeq === null ? null : this.metrics.lastEventSeq + 1;
    if (expected !== null && seq !== expected) this.metrics.eventSeqGaps += 1;
    if (this.metrics.firstEventSeq === null) this.metrics.firstEventSeq = seq;
    this.metrics.lastEventSeq = seq;
    this.metrics.eventsReceived += 1;
    // `ready.seq` is the host cursor at connect; a reconnecting client's
    // replayed window arrives after `ready` but never beyond its cursor.
    if (this.metrics.readySeq !== null && seq <= this.metrics.readySeq) {
      this.metrics.replayedEventCount += 1;
    }
    const eventBody = (message.event ?? {}) as Record<string, unknown>;
    const received: ReceivedEvent = {
      seq,
      type: typeof eventBody.type === "string" ? eventBody.type : "unknown",
      event: eventBody,
      appBytes: frameBytes,
      arrivedAtMs: performance.now(),
    };
    this.events.push(received);
    for (const waiter of [...this.eventWaiters]) {
      if (!waiter.accept(received)) continue;
      const index = this.eventWaiters.indexOf(waiter);
      if (index >= 0) this.eventWaiters.splice(index, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(received);
    }
  }
}
