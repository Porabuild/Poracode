import type { TerminalSize, Thread } from "@/shared/contracts";
import { friendlyError, msg as sharedMsg } from "@/shared/messages";
import {
  isRemoteTransportFailure,
  isUnauthorizedRemoteError,
  RemoteClientError,
} from "@/shared/remote/client";
import {
  isUnauthorizedRemoteSocketClose,
  REMOTE_SOCKET_POLICY,
  RemoteSocketHealthMonitor,
  RemoteSocketReconnectPolicy,
} from "@/shared/remote/socketPolicy";
import { getRemoteSocketEngine } from "@/renderer/state/remote/engine";
import { resetTruncateReloadBackoff } from "@/renderer/state/remote/truncateRecovery";
import { setRemoteTerminalSocketSender } from "@/renderer/state/remoteTerminalFeed";
import { syncDesktopBrowserBridgeClient } from "./browserBridge";
import { bindRemoteEngineOverflowListener } from "./eventSocketEngine";
import {
  createEventSocketRecoveryState,
  type EventSocketConnectionContext,
} from "./eventSocketContext";
import { bindEventSocketMessages } from "./eventSocketMessages";
import {
  clearRemoteServerEventSocketConnectTimeout,
  clearRemoteServerEventSocketHealth,
  deleteRemoteServerEventSocketEntry,
  forgetRemoteServerCursorSyncV2,
  getRemoteServerEventSocketEntry,
  getRemoteServerThreadItemInterests,
  rememberRemoteServerThreadItemInterests,
  remoteServerSnapshotSeq,
  sameRemoteServerThreadItemInterests,
  setRemoteServerEventSocketEntry,
  setRemoteServerThreadItemInterests,
  type RemoteServerEventSocketEntry,
} from "./eventSocketRegistry";
import { bindEventSocketResync } from "./eventSocketResync";
import {
  prepareTerminalConnection,
  type TerminalConnectionCapabilities,
} from "./terminalCapabilities";
import type {
  OpenRemoteThread,
  RemoteServerRecord,
  RemoteServersState,
  RemoteSocketLike,
} from "./types";

export interface StartRemoteServerEventStreamDeps {
  readonly server: RemoteServerRecord;
  readonly initialCapabilities?: TerminalConnectionCapabilities;
  readonly options?: { readonly resyncInterestedThreads?: boolean };
  readonly set: (
    partial:
      | RemoteServersState
      | Partial<RemoteServersState>
      | ((state: RemoteServersState) => RemoteServersState | Partial<RemoteServersState>),
  ) => void;
  readonly get: () => RemoteServersState;
  readonly setRemoteServerFailure: (
    desktopId: string,
    status: "offline" | "error",
    message: string,
  ) => void;
  readonly closeRemoteServerEventSocket: (
    desktopId: string,
    options?: { readonly preserveReplayState?: boolean },
  ) => void;
  readonly activateRemoteTerminalFeed: (desktopId: string, socket: RemoteSocketLike) => void;
  readonly rememberTerminalConnection: (
    socket: RemoteSocketLike,
    capabilities: TerminalConnectionCapabilities,
  ) => void;
  readonly buildOpenThread: (
    desktopId: string,
    snapshot: {
      readonly thread: Thread;
      readonly terminalScrollback?: string | undefined;
      readonly terminalSize?: TerminalSize | undefined;
    },
  ) => OpenRemoteThread;
}

export async function startRemoteServerEventStream(
  deps: StartRemoteServerEventStreamDeps,
): Promise<void> {
  const {
    server,
    initialCapabilities,
    options = {},
    set,
    get,
    setRemoteServerFailure,
    closeRemoteServerEventSocket,
    activateRemoteTerminalFeed,
    rememberTerminalConnection,
    buildOpenThread,
  } = deps;

  const serverKey = `${server.endpoint}\0${server.accessToken}`;
  // This session's consumer-scoped decode engine (V5 2.2): independent of the
  // desktop renderer-stream and persist engines, so their resets and overflows
  // cannot reject this session's in-flight decodes.
  const engine = getRemoteSocketEngine();
  const existing = getRemoteServerEventSocketEntry(server.desktopId);
  if (existing?.serverKey === serverKey && !options.resyncInterestedThreads) return;

  closeRemoteServerEventSocket(
    server.desktopId,
    options.resyncInterestedThreads ? { preserveReplayState: true } : undefined,
  );
  const entry: RemoteServerEventSocketEntry = {
    serverKey,
    socket: null,
    reconnectTimer: null,
    reconnectPolicy: new RemoteSocketReconnectPolicy(),
    connecting: false,
    connectTimeout: null,
    healthPingInterval: null,
    health: null,
  };
  setRemoteServerEventSocketEntry(server.desktopId, entry);
  /** Socket the in-flight resync promise belongs to. A recovery must never be
   * reused across connections: a dead socket's recovery resolving `false`
   * would force-reconnect a healthy replacement and report a false offline. */
  const resyncSlots: EventSocketConnectionContext["resyncSlots"] = {
    promise: null,
    socket: null,
  };
  const recovery = createEventSocketRecoveryState();
  /** Set when a frame was provably dropped client-side (engine overflow/reset
   * rejection, expected-seq gap). The next connection re-baselines interested
   * threads from authoritative snapshots after resuming from the last APPLIED
   * seq — the resume cursor never advances past a lost frame. */
  let resyncRequired = false;

  const isCurrent = () =>
    getRemoteServerEventSocketEntry(server.desktopId) === entry &&
    get().servers.some((candidate) => candidate.desktopId === server.desktopId);

  const setSocketStatus = (status: "connecting" | "online") => {
    set((state) => {
      const current = state.runtime[server.desktopId];
      if (!current || (current.status === status && current.message === undefined)) return {};
      return {
        runtime: {
          ...state.runtime,
          [server.desktopId]: {
            status,
            projects: current.projects,
            threads: current.threads,
            ...(current.agentStatuses ? { agentStatuses: current.agentStatuses } : {}),
          },
        },
      };
    });
    syncDesktopBrowserBridgeClient(get());
  };

  const scheduleReconnect = (minimumDelayMs = 0) => {
    if (!isCurrent()) return;
    if (get().runtime[server.desktopId]?.status === "online") {
      setSocketStatus("connecting");
    }
    if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
    const delay = Math.max(entry.reconnectPolicy.nextDelay(), minimumDelayMs);
    entry.reconnectTimer = setTimeout(() => {
      entry.reconnectTimer = null;
      void connect();
    }, delay);
  };

  const disconnectSocket = (socket: RemoteSocketLike) => {
    if (!isCurrent() || entry.socket !== socket) return;
    entry.socket = null;
    clearRemoteServerEventSocketConnectTimeout(entry);
    clearRemoteServerEventSocketHealth(entry);
    forgetRemoteServerCursorSyncV2(server.desktopId);
    setRemoteTerminalSocketSender(server.desktopId, null);
    syncDesktopBrowserBridgeClient(get());
    scheduleReconnect();
  };

  const forceReconnect = (socket: RemoteSocketLike) => {
    disconnectSocket(socket);
    try {
      socket.close();
    } catch {
      // already closed
    }
  };

  /**
   * Client-detected frame loss (engine overflow/reset rejection, expected-seq
   * gap). The dropped frame(s) cannot be recovered in place, so the session
   * marks itself resync-required and reconnects: the resume cursor sent on
   * the next connect is the last APPLIED seq (the watermark only advances
   * after a frame is applied), so the server replays exactly the lost range,
   * and the next connection re-baselines interested threads from
   * authoritative snapshots in case replay retention already expired.
   */
  const noteClientDetectedLoss = (): void => {
    resyncRequired = true;
    if (!isCurrent()) return;
    const current = entry.socket;
    if (current) forceReconnect(current);
  };

  bindRemoteEngineOverflowListener(engine, () => {
    if (!isCurrent()) return;
    noteClientDetectedLoss();
  });

  entry.health = new RemoteSocketHealthMonitor({
    isCurrent: (socket) => isCurrent() && entry.socket === socket,
    isOpen: (socket) =>
      typeof socket.send === "function" &&
      (socket.readyState === undefined || socket.readyState === 1),
    send: (socket, payload) => socket.send?.(payload),
    onDead: forceReconnect,
  });

  const startHealthProbe = (socket: RemoteSocketLike) => {
    clearRemoteServerEventSocketHealth(entry);
    const sendHealthPing = () => {
      entry.health?.probe(socket);
    };
    entry.healthPingInterval = setInterval(
      sendHealthPing,
      REMOTE_SOCKET_POLICY.healthPingIntervalMs,
    );
  };

  // Consume a freshly fetched descriptor only for the first socket;
  // later automatic reconnects revalidate capabilities from the host.
  let connectionCapabilitiesSeed = initialCapabilities;
  const connect = async () => {
    if (!isCurrent() || entry.connecting || entry.socket) return;
    entry.connecting = true;
    try {
      const client = get().clientFactory(server.endpoint, server.accessToken);
      const seed = connectionCapabilitiesSeed;
      connectionCapabilitiesSeed = undefined;
      const { ticket, capabilities } = await prepareTerminalConnection(client, seed);
      if (!isCurrent()) return;
      const lastSeenSeq = remoteServerSnapshotSeq(server.desktopId);
      const openThread = get().openThread;
      const threadItemInterests =
        getRemoteServerThreadItemInterests(server.desktopId) ??
        (openThread?.desktopId === server.desktopId ? [openThread.threadId] : []);
      const socket = get().socketFactory(
        client.websocketUrl(ticket, lastSeenSeq, { threadItemInterests }),
      );
      if (!isCurrent()) {
        try {
          socket.close();
        } catch {
          // already closed
        }
        return;
      }
      rememberTerminalConnection(socket, capabilities);
      entry.socket = socket;
      entry.connectTimeout = setTimeout(() => {
        forceReconnect(socket);
      }, REMOTE_SOCKET_POLICY.connectTimeoutMs);
      const ctx: EventSocketConnectionContext = {
        server,
        entry,
        socket,
        client,
        engine,
        get,
        set,
        buildOpenThread,
        setRemoteServerFailure,
        isCurrent,
        forceReconnect,
        noteClientDetectedLoss,
        recovery,
        resyncSlots,
        dispatchForwardEvent: () => {},
        recoverInterestedThreads: async () => false,
      };
      bindEventSocketResync(ctx);
      const resumePendingTruncateReloads = bindEventSocketMessages(ctx);
      const activateSocket = () => {
        if (!isCurrent() || entry.socket !== socket) return;
        clearRemoteServerEventSocketConnectTimeout(entry);
        entry.reconnectPolicy.reset();
        activateRemoteTerminalFeed(server.desktopId, socket);
        syncDesktopBrowserBridgeClient(get());
        const currentThreadItemInterests =
          getRemoteServerThreadItemInterests(server.desktopId) ?? threadItemInterests;
        if (sameRemoteServerThreadItemInterests(currentThreadItemInterests, threadItemInterests)) {
          rememberRemoteServerThreadItemInterests(server.desktopId, currentThreadItemInterests);
        } else {
          setRemoteServerThreadItemInterests(server.desktopId, currentThreadItemInterests, true);
        }
        startHealthProbe(socket);
        if (get().runtime[server.desktopId]?.status !== "online") {
          resetTruncateReloadBackoff(server.desktopId);
        }
        setSocketStatus("online");
        resumePendingTruncateReloads();
      };
      socket.onopen = activateSocket;
      if (socket.readyState === undefined || socket.readyState === 1) {
        activateSocket();
      }
      socket.onclose = (event) => {
        if (
          isUnauthorizedRemoteSocketClose(event?.code ?? 0, event?.reason ?? "") &&
          isCurrent() &&
          entry.socket === socket
        ) {
          entry.socket = null;
          clearRemoteServerEventSocketConnectTimeout(entry);
          clearRemoteServerEventSocketHealth(entry);
          forgetRemoteServerCursorSyncV2(server.desktopId);
          setRemoteTerminalSocketSender(server.desktopId, null);
          setRemoteServerFailure(server.desktopId, "error", sharedMsg("remote.session.expired"));
          scheduleReconnect(REMOTE_SOCKET_POLICY.unauthorizedReconnectMs);
          return;
        }
        disconnectSocket(socket);
      };
      if (options.resyncInterestedThreads || resyncRequired) {
        // A client-detected loss (engine overflow/reset, expected-seq gap)
        // re-baselines interested threads from authoritative snapshots on the
        // fresh connection, in case replay retention already expired.
        resyncRequired = false;
        await ctx.recoverInterestedThreads();
      }
    } catch (error) {
      if (!isCurrent()) return;
      if (error instanceof RemoteClientError && error.code === "protocol_version_mismatch") {
        setRemoteServerFailure(server.desktopId, "error", friendlyError(error));
        // Stop automatic attempts, but retain terminal listeners so a
        // later explicit reconnect can install a fresh supported stream.
        deleteRemoteServerEventSocketEntry(server.desktopId);
        forgetRemoteServerCursorSyncV2(server.desktopId);
        setRemoteTerminalSocketSender(server.desktopId, null);
        return;
      }
      if (isUnauthorizedRemoteError(error)) {
        setRemoteServerFailure(server.desktopId, "error", sharedMsg("remote.session.expired"));
        scheduleReconnect(REMOTE_SOCKET_POLICY.unauthorizedReconnectMs);
        return;
      }
      const transportFailure = isRemoteTransportFailure(error);
      setRemoteServerFailure(
        server.desktopId,
        transportFailure ? "offline" : "error",
        transportFailure ? sharedMsg("remote.server.unreachable") : friendlyError(error),
      );
      scheduleReconnect();
    } finally {
      entry.connecting = false;
      if (isCurrent() && !entry.socket && !entry.reconnectTimer) scheduleReconnect();
    }
  };

  await connect();
}
