import {
  BACKEND_RENDERER_STREAM_VERSION,
  RENDERER_STREAM_UNGRANTED_GENERATION,
  isDirectRendererDatabaseProcedure,
  isDirectRendererServiceProcedure,
  type BackendRendererReply,
  type BackendRendererRequestOperation,
  type BackendRendererStreamInfo,
  type RendererStreamOwnershipClaim,
  type RendererStreamOwnershipGrant,
  type RendererStreamRecoveryBarrier,
} from "@/shared/backendHostProtocol";
import type { ElectronHostBridge } from "@/shared/clientRuntime";
import { ipcProcedureMap, type IpcProcedureName, type SupervisorEvent } from "@/shared/ipc";
import { utf8ByteLength } from "@/shared/rendererStreamChunks";
import {
  beginRendererPerfSpan,
  noteRendererPerfEvent,
} from "./diagnostics/rendererPerfDiagnostics";
import { RendererStreamReassembly } from "./rendererStreamReassembly";

const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
const RECONNECT_DELAY_MS = 1_000;
/** Keep the direct stream bounded; callers beyond this point use the existing
 * main-process fallback instead of retaining more renderer promises. */
const MAX_PENDING_REQUESTS = 64;
/** Bounded ownership re-negotiation cadence; a grant-sync/bind race retries
 * at this interval until the bind confirms, so one rejected frame never
 * leaves the window on permanent silent bulk fallback. */
const OWNERSHIP_RETRY_DELAY_MS = 250;

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
}

interface RendererInterests {
  terminalThreadIds: string[];
  runtimeThreadIds: string[];
}

export class ElectronBackendTransport {
  private info: BackendRendererStreamInfo | null = null;
  private socket: WebSocket | null = null;
  private connectPromise: Promise<WebSocket> | null = null;
  private refreshingInfo = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSequence = 0;
  private directEventsConnected = false;
  /**
   * latestSeq echoed by the CURRENT connection's interests-ack: everything at
   * or below it was proven received on this socket. A recovery barrier whose
   * window is already covered by this cursor is stale and must not tear the
   * healthy connection down.
   */
  private ackedSequence: number | null = null;
  private readonly listeners = new Set<
    (event: SupervisorEvent, rendererSequence?: number) => void
  >();
  private readonly generationListeners = new Set<() => void>();
  private readonly pending = new Map<string, PendingRequest>();
  private readonly largeReassembly = new RendererStreamReassembly();
  private interests: RendererInterests = { terminalThreadIds: [], runtimeThreadIds: [] };
  /**
   * The ownership grant this window pulled from main for the current
   * connection. Presented on every interests frame; the backend's ack echo is
   * the acknowledged handoff that lets it stop copying this window's bulk
   * through Electron main.
   */
  private ownership: RendererStreamOwnershipGrant | null = null;
  private ownershipRetryScheduled = false;
  private ownershipRetryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly host: ElectronHostBridge) {
    host.onSupervisorEvent((event, rendererSequence) => {
      if (this.directEventsConnected) return;
      if (rendererSequence !== undefined) {
        if (rendererSequence <= this.lastSequence) return;
        this.lastSequence = rendererSequence;
      }
      this.dispatch(event, rendererSequence);
    });
    host.onSupervisorEventGap(() => {
      if (this.directEventsConnected) return;
      // Even a trailing shed event needs recovery. Keep the cursor unchanged:
      // retained events inside a merged loss range must still be delivered.
      this.dispatchRebuildForInterests();
    });
    host.onRendererStreamRecovery((barrier) => this.handleStreamRecovery(barrier));
    host.onBackendRendererStreamChanged((info) => this.replaceInfo(info));
    this.refreshInfo();
  }

  private refreshInfo(): void {
    if (this.refreshingInfo) return;
    this.refreshingInfo = true;
    const previousInfo = this.info;
    void this.host
      .getBackendRendererStreamInfo()
      .then((info) => {
        if (info && this.info === previousInfo) this.replaceInfo(info);
      })
      .catch(() => undefined)
      .finally(() => {
        this.refreshingInfo = false;
      });
  }

  subscribe(listener: (event: SupervisorEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onGenerationChanged(listener: () => void): () => void {
    this.generationListeners.add(listener);
    return () => this.generationListeners.delete(listener);
  }

  async setEventInterests(interests: RendererInterests): Promise<void> {
    this.interests = {
      terminalThreadIds: [...new Set(interests.terminalThreadIds)],
      runtimeThreadIds: [...new Set(interests.runtimeThreadIds)],
    };
    this.sendInterests();
    await this.syncMainEventInterests();
  }

  operationFor(name: IpcProcedureName): BackendRendererRequestOperation | null {
    if (name === "revertCheckpoint") return "revert-checkpoint";
    if (ipcProcedureMap[name].transport === "supervisor") return "supervisor";
    if (isDirectRendererDatabaseProcedure(name)) return "database";
    if (isDirectRendererServiceProcedure(name)) return "service";
    return null;
  }

  async call(
    operation: BackendRendererRequestOperation,
    name: IpcProcedureName,
    payload: unknown,
    fallbackArgs: unknown[],
  ): Promise<unknown> {
    let socket: WebSocket;
    try {
      socket = await this.connect();
    } catch {
      return this.host.invokeProcedure(name, fallbackArgs);
    }
    if (this.pending.size >= MAX_PENDING_REQUESTS) {
      return this.host.invokeProcedure(name, fallbackArgs);
    }
    const id = crypto.randomUUID();
    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pending.delete(id)) {
          // Delivery-cancel on timeout: frees backend payload state; the
          // handler slot stays held there until real settlement and late
          // completion cannot publish. No AbortSignal/user-cancel claim.
          this.sendRequestCancel(id);
          this.largeReassembly.drop(id);
          reject(new Error(`Backend request ${name} timed out.`));
        }
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timeout });
      try {
        socket.send(
          JSON.stringify({
            version: BACKEND_RENDERER_STREAM_VERSION,
            type: "request",
            id,
            operation,
            name,
            payload,
          }),
        );
      } catch (error) {
        this.pending.delete(id);
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private replaceInfo(info: BackendRendererStreamInfo): void {
    if (this.info?.url === info.url && this.info.token === info.token) return;
    this.info = info;
    this.lastSequence = 0;
    this.ackedSequence = null;
    for (const listener of this.generationListeners) listener();
    this.disconnect(new Error("Backend renderer transport changed."));
    void this.connect().catch(() => undefined);
  }

  private connect(): Promise<WebSocket> {
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve(this.socket);
    if (this.connectPromise) return this.connectPromise;
    const info = this.info;
    if (!info) return Promise.reject(new Error("Backend renderer transport is unavailable."));
    const endpoint = new URL(info.url);
    endpoint.searchParams.set("token", info.token);
    const socket = new WebSocket(endpoint);
    this.socket = socket;
    this.connectPromise = new Promise<WebSocket>((resolve, reject) => {
      socket.addEventListener(
        "open",
        () => {
          if (this.socket !== socket) return;
          this.connectPromise = null;
          this.ownershipRetryScheduled = false;
          // Pull this window's grant first so the interests frame can carry
          // the ownership binding. A failed or unsupported pull presents no
          // binding: the window simply keeps the desktop-IPC fallback.
          void this.pullOwnershipAndSendInterests(socket);
          resolve(socket);
        },
        { once: true },
      );
      socket.addEventListener(
        "close",
        () => reject(new Error("Backend renderer transport closed before connecting.")),
        { once: true },
      );
      socket.addEventListener(
        "error",
        () => {
          if (this.socket === socket) this.connectPromise = null;
          reject(new Error("Unable to connect to the backend renderer transport."));
        },
        { once: true },
      );
    });
    socket.addEventListener("message", (event) => this.handleMessage(socket, String(event.data)));
    socket.addEventListener("close", () => this.handleClose(socket));
    return this.connectPromise;
  }

  private reassemblyEvents() {
    return {
      sendAck: (id: string, seq: number): void => {
        if (this.socket?.readyState !== WebSocket.OPEN) return;
        try {
          this.socket.send(
            JSON.stringify({
              version: BACKEND_RENDERER_STREAM_VERSION,
              type: "reply-ack",
              id,
              seq,
            }),
          );
        } catch {
          // A failed ACK send leaves the backend to credit-timeout the
          // transfer with a bounded error; never tear the socket down here.
        }
      },
      sendCancel: (id: string): void => this.sendRequestCancel(id),
      resolveReply: (id: string, data: unknown): void => {
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        clearTimeout(pending.timeout);
        // Perf-diag point event: a bounded large-reply finished reassembling
        // and its caller promise resolved (no-op when the monitor is inert).
        noteRendererPerfEvent("large-reply-complete", { id });
        pending.resolve(data);
      },
      rejectReply: (id: string, error: Error): void => {
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        clearTimeout(pending.timeout);
        pending.reject(error);
      },
    };
  }

  private sendRequestCancel(id: string): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    try {
      this.socket.send(
        JSON.stringify({
          version: BACKEND_RENDERER_STREAM_VERSION,
          type: "request-cancel",
          id,
        }),
      );
    } catch {
      // Best-effort delivery-cancel only; the pending timeout/close path
      // already rejects the caller.
    }
  }

  private handleMessage(socket: WebSocket, raw: string): void {
    // Perf-diag span around one transport frame (parse + reassembly + dispatch);
    // a no-op handle when the diagnostics were not requested at launch.
    const frameSpan = beginRendererPerfSpan("transport-frame");
    let frameType: string | undefined;
    try {
      if (this.socket !== socket) return;
      let message: unknown;
      try {
        message = JSON.parse(raw);
      } catch {
        socket.close(1008, "Invalid backend renderer message");
        return;
      }
      if (
        typeof message === "object" &&
        message !== null &&
        typeof (message as { type?: unknown }).type === "string"
      ) {
        frameType = (message as { type: string }).type;
      }
      // Bounded large-reply frames first: stale/duplicate/out-of-order safely
      // drop inside reassembly (socket alive); version mismatches fall through
      // to the loud 1008 gate below.
      if (
        this.largeReassembly.handleBackendFrame(
          message,
          utf8ByteLength(raw),
          this.reassemblyEvents(),
          (id) => this.pending.has(id),
        )
      ) {
        return;
      }
      if (!isBackendRendererMessage(message)) {
        socket.close(1008, "Invalid backend renderer message");
        return;
      }
      if (message.type === "reply") {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timeout);
        if (message.ok) pending.resolve(message.data);
        else pending.reject(new Error(message.error));
        return;
      }
      if (message.type === "interests-ack") {
        this.lastSequence = Math.max(this.lastSequence, message.latestSeq);
        // The acknowledged handoff cursor for THIS connection: the backend may
        // anchor a recovery barrier's loss window at it, and this window may
        // treat a barrier as stale when this cursor already covers the loss.
        this.ackedSequence = message.latestSeq;
        this.directEventsConnected = true;
        this.handleOwnershipAck(message.ownership);
        return;
      }
      if (message.type === "event") {
        if (message.seq <= this.lastSequence) return;
        this.lastSequence = message.seq;
        this.dispatch(message.event, message.seq);
        return;
      }
      if (message.type === "resync-required") {
        this.lastSequence = message.latestSeq;
        this.dispatchRebuildForInterests(
          message.threadIds && message.threadIds.length > 0
            ? new Set(message.threadIds)
            : undefined,
        );
      }
    } finally {
      frameSpan.end({ bytes: raw.length, ...(frameType ? { type: frameType } : {}) });
    }
  }

  /**
   * Honors a generation-fenced recovery barrier from the backend. The
   * backend enqueues it when it revokes this window's direct owner — a
   * failed, backpressured, or lost socket — so it can arrive BEFORE the
   * local onclose fires and before any later fallback copy. Handling:
   *
   * 1. Generation fence: a barrier for another grant generation describes a
   *    window state this transport never had (reload, re-mint) and is
   *    ignored — a stale barrier must never revoke or corrupt the current
   *    connection.
   * 2. Stale-supersede fence: when the CURRENT connection's acknowledged
   *    cursor already covers the barrier's loss window, the loss was healed
   *    before the barrier arrived and only the idempotent rebuild is
   *    skipped.
   * 3. Recovery: the barrier's premise is "you certainly received everything
   *    below fromSequence". When the cursor satisfies it, a scoped
   *    authoritative rebuild covers [fromSequence, toSequence] and the cursor
   *    advances to toSequence; when it does not (the queued ack never
   *    processed — a message being queued is not receiver acknowledgement),
   *    the window rebuilds EVERYTHING subscribed and takes toSequence.
   * 4. Socket fence: a live connection is torn down immediately, so later
   *    fallback copies apply through the sequence gate even before the
   *    close event lands.
   */
  private handleStreamRecovery(barrier: RendererStreamRecoveryBarrier): void {
    const presentedGeneration = this.ownership?.generation ?? RENDERER_STREAM_UNGRANTED_GENERATION;
    if (barrier.generation !== presentedGeneration) return;
    if (
      this.directEventsConnected &&
      this.ackedSequence !== null &&
      this.ackedSequence >= barrier.toSequence
    ) {
      // Already healed: the current connection acknowledged past the loss.
      return;
    }
    const premiseHolds =
      this.lastSequence >= barrier.fromSequence - 1 && this.lastSequence <= barrier.toSequence;
    const scope =
      premiseHolds && barrier.threadIds && barrier.threadIds.length > 0
        ? new Set(barrier.threadIds)
        : undefined;
    this.dispatchRebuildForInterests(scope);
    this.lastSequence = premiseHolds
      ? Math.max(this.lastSequence, barrier.toSequence)
      : barrier.toSequence;
    if (this.socket) {
      // Fence before onclose: this window's direct delivery is revoked
      // backend-side, so any live socket — mid-handshake or established — is
      // a zombie. Stop trusting it immediately and let its close event
      // schedule the reconnect, whose interests frame presents the repaired
      // cursor. Not disconnect(): that clears this.socket first and the
      // close handler would then swallow the reconnect.
      // Event-only barriers that do not fence the socket must NOT drop
      // large-reply partials; this fence invalidates the request transport
      // generation, so partials drop here (close will drop again, idempotent).
      this.directEventsConnected = false;
      this.ackedSequence = null;
      this.largeReassembly.dropAll();
      this.rejectPending(new Error("Backend renderer transport revoked."));
      this.socket.close();
    }
  }

  /**
   * Rebuilds subscribed threads after unrecoverable stream loss. Without a
   * loss scope every subscribed thread resets (legacy semantics — the safe
   * fallback); a scope narrows the reset to the threads this window actually
   * subscribes to, so one thread's lost events no longer wipe every open
   * transcript (WS6 P1-10).
   */
  private dispatchRebuildForInterests(lostThreadIds?: ReadonlySet<string>): void {
    const inScope = (threadId: string): boolean =>
      lostThreadIds === undefined || lostThreadIds.has(threadId);
    for (const threadId of this.interests.terminalThreadIds) {
      if (inScope(threadId)) this.dispatch({ type: "thread-scrollback-resync", threadId });
    }
    for (const threadId of this.interests.runtimeThreadIds) {
      if (inScope(threadId)) this.dispatch({ type: "thread-reset", threadId });
    }
  }

  private handleClose(socket: WebSocket): void {
    if (this.socket !== socket) return;
    this.socket = null;
    this.connectPromise = null;
    this.directEventsConnected = false;
    this.ackedSequence = null;
    this.resetOwnershipForConnection();
    this.largeReassembly.dropAll();
    this.rejectPending(new Error("Backend renderer transport disconnected."));
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.refreshInfo();
      void this.connect().catch(() => undefined);
    }, RECONNECT_DELAY_MS);
  }

  private disconnect(error: Error): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    this.connectPromise = null;
    this.directEventsConnected = false;
    this.ackedSequence = null;
    this.resetOwnershipForConnection();
    this.largeReassembly.dropAll();
    socket?.close();
    this.rejectPending(error);
  }

  private resetOwnershipForConnection(): void {
    if (this.ownershipRetryTimer) clearTimeout(this.ownershipRetryTimer);
    this.ownershipRetryTimer = null;
    this.ownershipRetryScheduled = false;
  }

  private async pullOwnershipAndSendInterests(socket: WebSocket): Promise<void> {
    let grant: RendererStreamOwnershipGrant | null = null;
    try {
      grant = (await this.host.getRendererStreamOwnershipGrant?.()) ?? null;
    } catch {
      grant = null;
    }
    if (this.socket !== socket) return;
    this.ownership = grant;
    this.sendInterests();
  }

  /**
   * The ack's ownership echo is the acknowledged handoff: only a backend that
   * validated our binding against main's minted grant confirms it, and only a
   * confirming backend stops copying this window's bulk through main. An
   * unconfirmed ack (grant sync still in flight, superseded generation, stale
   * backend) re-pulls and re-sends on a bounded 250 ms cadence for as long as
   * the connection lives, so a transient grant-sync/bind race heals instead
   * of silently parking the window on permanent bulk fallback. A confirming
   * echo stops the loop.
   */
  private handleOwnershipAck(echo: RendererStreamOwnershipClaim | undefined): void {
    const presented = this.ownership;
    const confirmed =
      presented !== null &&
      echo !== undefined &&
      echo.windowId === presented.windowId &&
      echo.generation === presented.generation;
    if (confirmed) {
      this.ownershipRetryScheduled = false;
      if (this.ownershipRetryTimer) clearTimeout(this.ownershipRetryTimer);
      this.ownershipRetryTimer = null;
      return;
    }
    if (presented === null || this.ownershipRetryScheduled) return;
    this.ownershipRetryScheduled = true;
    this.ownershipRetryTimer = setTimeout(() => {
      this.ownershipRetryTimer = null;
      this.ownershipRetryScheduled = false;
      const socket = this.socket;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      void this.pullOwnershipAndSendInterests(socket);
    }, OWNERSHIP_RETRY_DELAY_MS);
  }

  private rejectPending(error: Error): void {
    for (const [id, pending] of this.pending) {
      this.pending.delete(id);
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
  }

  private sendInterests(): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "interests",
        terminalThreadIds: this.interests.terminalThreadIds,
        runtimeThreadIds: this.interests.runtimeThreadIds,
        lastSeq: this.lastSequence,
        ...(this.ownership ? { ownership: this.ownership } : {}),
      }),
    );
  }

  private async syncMainEventInterests(): Promise<void> {
    await this.host.invokeProcedure("setRendererEventInterests", [this.interests]);
  }

  private dispatch(event: SupervisorEvent, rendererSequence?: number): void {
    for (const listener of this.listeners) listener(event, rendererSequence);
  }
}

type BackendRendererMessage =
  | BackendRendererReply
  | {
      version: typeof BACKEND_RENDERER_STREAM_VERSION;
      type: "hello";
      latestSeq: number;
    }
  | {
      version: typeof BACKEND_RENDERER_STREAM_VERSION;
      type: "interests-ack";
      latestSeq: number;
      /** Present exactly when the backend activated the ownership handoff. */
      ownership?: RendererStreamOwnershipClaim;
    }
  | {
      version: typeof BACKEND_RENDERER_STREAM_VERSION;
      type: "resync-required";
      latestSeq: number;
      /**
       * Loss scope hint from the host (WS6 P1-10): threads whose events are
       * unrecoverable by replay. Absent or empty keeps the legacy meaning —
       * rebuild every subscribed thread; the host cannot always attribute a
       * gap to specific threads. A present list narrows the rebuild to the
       * intersection with this window's subscriptions only.
       */
      threadIds?: string[];
    }
  | {
      version: typeof BACKEND_RENDERER_STREAM_VERSION;
      type: "event";
      seq: number;
      event: SupervisorEvent;
    };

function isBackendRendererMessage(value: unknown): value is BackendRendererMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  if (message.version !== BACKEND_RENDERER_STREAM_VERSION || typeof message.type !== "string") {
    return false;
  }
  if (message.type === "reply") {
    return (
      typeof message.id === "string" &&
      typeof message.ok === "boolean" &&
      (message.ok || typeof message.error === "string")
    );
  }
  if (message.type === "event") {
    return (
      typeof message.seq === "number" &&
      typeof message.event === "object" &&
      message.event !== null &&
      typeof (message.event as { type?: unknown }).type === "string"
    );
  }
  if (message.type === "resync-required") {
    if (typeof message.latestSeq !== "number") return false;
    return (
      message.threadIds === undefined ||
      (Array.isArray(message.threadIds) &&
        message.threadIds.every((threadId) => typeof threadId === "string"))
    );
  }
  if (message.type === "hello") {
    return typeof message.latestSeq === "number";
  }
  return (
    message.type === "interests-ack" &&
    typeof message.latestSeq === "number" &&
    (message.ownership === undefined || isOwnershipClaim(message.ownership))
  );
}

function isOwnershipClaim(value: unknown): value is RendererStreamOwnershipClaim {
  if (typeof value !== "object" || value === null) return false;
  const claim = value as Record<string, unknown>;
  return (
    typeof claim.windowId === "number" &&
    Number.isSafeInteger(claim.windowId) &&
    claim.windowId > 0 &&
    typeof claim.generation === "number" &&
    Number.isSafeInteger(claim.generation) &&
    claim.generation > 0
  );
}
