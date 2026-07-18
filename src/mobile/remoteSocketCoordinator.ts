import { reconnectBackoffDelay } from "@/shared/remote/backoff";
import { handleBrowserServerMessage, setBrowserSocketSender } from "./browserMirror";
import { RemoteClientError, type RemoteDesktopClient } from "./remoteClient";
import { createRemoteSocketSender } from "./remoteSocketSender";
import { dispatchRemoteSupervisorEvent } from "./storeSync";
import { handleTerminalServerMessage, setTerminalSocketSender } from "./terminalFeed";

/** WebSocket reconnect backoff: full-jitter exponential, capped. */
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 20000;
/** How long to wait for a health-check pong before treating the socket as dead. */
const HEALTH_PING_TIMEOUT_MS = 5000;
// Foreground keepalive: periodically probe a seemingly-open socket so a
// half-open stream is detected even when no visibility/online event fires.
const HEALTH_PING_INTERVAL_MS = 25000;
// Force-close a WebSocket handshake that never completes so a stuck
// `connecting` flag cannot wedge every later reconnect path.
const CONNECT_TIMEOUT_MS = 15000;
const REFRESH_DEBOUNCE_MS = 600;

export type SocketConnectionState = "online" | "reconnecting" | "offline" | "unauthorized";

export interface SocketRefreshRequest {
  readonly refreshSelectedThread: boolean;
  readonly includeAuxiliary: boolean;
}

type SocketClient = Pick<
  RemoteDesktopClient,
  "websocketTicket" | "websocketUrl" | "parseSocketMessage"
>;

export interface RemoteSocketCoordinatorOptions {
  readonly createClient: () => SocketClient;
  readonly initialLastSeenSeq: number;
  readonly getSelectedThreadId: () => string | null;
  readonly requestRefresh: (request: SocketRefreshRequest) => void;
  readonly onConnectionChange: (state: SocketConnectionState) => void;
  readonly onMessageChange: (message: string) => void;
  readonly onOpenChange: (open: boolean) => void;
  /** Resolves the localized fallback when an unauthorized close has no reason. */
  readonly getPairingExpiredMessage: () => string;
}

export interface RemoteSocketCoordinator {
  start(): void;
  getLastSeenSeq(): number;
  advanceLastSeenSeq(seq: number): void;
  dispose(): void;
}

export function isUnauthorizedRemoteError(error: unknown): error is RemoteClientError {
  return error instanceof RemoteClientError && (error.status === 401 || error.status === 403);
}

function isUnauthorizedClose(code: number, reason: string): boolean {
  return code === 1008 || reason === "Remote access session expired";
}

/** Status-affecting events warrant a snapshot refresh; streaming deltas do not. */
function shouldRefreshAfterSupervisorEvent(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === "thread-state" ||
    type === "thread-exited" ||
    type === "thread-reset" ||
    type === "windows-agent-statuses" ||
    type === "wsl-agent-statuses" ||
    type === "remote-projects-changed" ||
    type === "remote-threads-changed"
  );
}

/**
 * Owns one identity-scoped remote event socket: reconnect backoff, replay
 * sequence, health probes, refresh coalescing, protocol multiplexing, and
 * teardown. Construction is inert; {@link RemoteSocketCoordinator.start}
 * attaches browser listeners and begins the first connection attempt.
 */
export function createRemoteSocketCoordinator(
  options: RemoteSocketCoordinatorOptions,
): RemoteSocketCoordinator {
  let started = false;
  let closed = false;
  let ws: WebSocket | null = null;
  // Guards against online/visibility listeners stacking another socket while
  // one is already opening.
  let connecting = false;
  let reconnectTimer = 0;
  let refreshTimer = 0;
  // Coalesced refreshes retain the strongest flags requested before the flush.
  let pendingRecovery = false;
  let pendingRefreshSelected = false;
  let attempt = 0;
  let lastSeenSeq = options.initialLastSeenSeq;
  let pingTimer = 0;
  let pendingPingId: string | null = null;
  let connectWatchdog = 0;
  let heartbeat = 0;

  function scheduleRefresh(
    request: { readonly triggerThreadId?: string; readonly recovery?: boolean } = {},
  ): void {
    const recovery = request.recovery ?? false;
    const refreshSelectedThread =
      recovery ||
      (request.triggerThreadId !== undefined &&
        request.triggerThreadId === options.getSelectedThreadId());
    pendingRecovery ||= recovery;
    pendingRefreshSelected ||= refreshSelectedThread;
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      const runRecovery = pendingRecovery;
      const runRefreshSelected = pendingRefreshSelected;
      pendingRecovery = false;
      pendingRefreshSelected = false;
      options.requestRefresh({
        refreshSelectedThread: runRefreshSelected,
        includeAuxiliary: runRecovery,
      });
    }, REFRESH_DEBOUNCE_MS);
  }

  function scheduleReconnect(): void {
    if (closed) return;
    options.onConnectionChange(navigator.onLine === false ? "offline" : "reconnecting");
    window.clearTimeout(reconnectTimer);
    reconnectTimer = window.setTimeout(
      connect,
      reconnectBackoffDelay(attempt, { baseMs: RECONNECT_BASE_MS, maxMs: RECONNECT_MAX_MS }),
    );
    attempt += 1;
  }

  function connect(): void {
    if (closed || navigator.onLine === false) return;
    if (connecting || ws?.readyState === WebSocket.OPEN) return;
    connecting = true;
    void (async () => {
      try {
        const client = options.createClient();
        const ticket = await client.websocketTicket(CONNECT_TIMEOUT_MS);
        if (closed) {
          connecting = false;
          return;
        }
        const socket = new WebSocket(client.websocketUrl(ticket, lastSeenSeq));
        // A new socket supersedes any health probe owned by the previous one.
        // Keeping its ping id would block probes on the replacement forever
        // once the stale close callback is (correctly) ignored below.
        pendingPingId = null;
        window.clearTimeout(pingTimer);
        ws = socket;
        window.clearTimeout(connectWatchdog);
        connectWatchdog = window.setTimeout(() => {
          if (socket.readyState === WebSocket.CONNECTING) socket.close();
        }, CONNECT_TIMEOUT_MS);

        socket.addEventListener("open", () => {
          if (closed || ws !== socket) {
            if (!closed) socket.close();
            return;
          }
          connecting = false;
          window.clearTimeout(connectWatchdog);
          attempt = 0;
          options.onOpenChange(true);
          options.onConnectionChange("online");
          options.onMessageChange("");
          const socketSender = createRemoteSocketSender(socket);
          setBrowserSocketSender(socketSender);
          setTerminalSocketSender(socketSender);
          scheduleRefresh({ recovery: true });
        });

        socket.addEventListener("message", (event) => {
          if (closed || ws !== socket) return;
          try {
            const parsed = client.parseSocketMessage(String(event.data));
            if (parsed.type === "pong") {
              if (pendingPingId !== null && parsed.id === pendingPingId) {
                pendingPingId = null;
                window.clearTimeout(pingTimer);
              }
              return;
            }
            if (handleBrowserServerMessage(parsed)) return;
            if (handleTerminalServerMessage(parsed)) return;
            if (parsed.type === "event") {
              if (parsed.seq <= lastSeenSeq) return;
              lastSeenSeq = parsed.seq;
              dispatchRemoteSupervisorEvent(parsed.event);
              if (shouldRefreshAfterSupervisorEvent(parsed.event)) {
                const triggerThreadId =
                  parsed.event &&
                  typeof parsed.event === "object" &&
                  typeof (parsed.event as { threadId?: unknown }).threadId === "string"
                    ? (parsed.event as { threadId: string }).threadId
                    : undefined;
                scheduleRefresh(triggerThreadId !== undefined ? { triggerThreadId } : {});
              }
            }
            if (parsed.type === "resync-required") {
              scheduleRefresh({ recovery: true });
            }
          } catch {
            // Bad frames are ignored; HTTP refresh remains authoritative.
          }
        });

        socket.addEventListener("close", (event) => {
          if (ws !== socket) return;
          ws = null;
          connecting = false;
          window.clearTimeout(connectWatchdog);
          if (closed) return;
          options.onOpenChange(false);
          pendingPingId = null;
          window.clearTimeout(pingTimer);
          setBrowserSocketSender(null);
          setTerminalSocketSender(null);
          if (isUnauthorizedClose(event.code, event.reason)) {
            options.onConnectionChange("unauthorized");
            options.onMessageChange(
              event.reason ? event.reason : options.getPairingExpiredMessage(),
            );
            return;
          }
          scheduleReconnect();
        });
      } catch (error) {
        connecting = false;
        if (closed) return;
        if (isUnauthorizedRemoteError(error)) {
          window.clearTimeout(reconnectTimer);
          options.onConnectionChange("unauthorized");
          options.onMessageChange(error.message);
          return;
        }
        scheduleReconnect();
      }
    })();
  }

  /** Probe a seemingly-open socket and force-close it when no matching pong arrives. */
  function sendHealthPing(): void {
    const socket = ws;
    if (socket?.readyState !== WebSocket.OPEN) return;
    if (pendingPingId !== null) return;
    const id = crypto.randomUUID();
    pendingPingId = id;
    try {
      socket.send(JSON.stringify({ type: "ping", id, sentAt: Date.now() }));
    } catch {
      pendingPingId = null;
      window.clearTimeout(pingTimer);
      socket.close();
      return;
    }
    window.clearTimeout(pingTimer);
    pingTimer = window.setTimeout(() => {
      if (pendingPingId === id) socket.close();
    }, HEALTH_PING_TIMEOUT_MS);
  }

  function handleOnline(): void {
    if (closed) return;
    attempt = 0;
    window.clearTimeout(reconnectTimer);
    connect();
    scheduleRefresh({ recovery: true });
  }

  function handleOffline(): void {
    if (closed) return;
    options.onConnectionChange("offline");
  }

  function handleVisibility(): void {
    if (closed || document.visibilityState !== "visible") return;
    if (ws?.readyState === WebSocket.OPEN) {
      sendHealthPing();
      scheduleRefresh({ recovery: true });
      return;
    }
    handleOnline();
  }

  return {
    start() {
      if (started || closed) return;
      started = true;
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
      document.addEventListener("visibilitychange", handleVisibility);
      heartbeat = window.setInterval(() => {
        if (document.visibilityState === "visible") sendHealthPing();
      }, HEALTH_PING_INTERVAL_MS);
      connect();
    },
    getLastSeenSeq() {
      return lastSeenSeq;
    },
    advanceLastSeenSeq(seq) {
      if (Number.isInteger(seq) && seq >= 0) lastSeenSeq = Math.max(lastSeenSeq, seq);
    },
    dispose() {
      if (closed) return;
      closed = true;
      options.onOpenChange(false);
      window.clearTimeout(reconnectTimer);
      window.clearTimeout(refreshTimer);
      window.clearTimeout(pingTimer);
      window.clearTimeout(connectWatchdog);
      window.clearInterval(heartbeat);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
      setBrowserSocketSender(null);
      setTerminalSocketSender(null);
      ws?.close();
    },
  };
}
