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
import type { RemoteDesktopClient } from "@/shared/remote/client";
import { getRemoteSocketEngine } from "@/renderer/state/remote/engine";
import { resetTruncateReloadBackoff } from "@/renderer/state/remote/truncateRecovery";
import { setRemoteTerminalSocketSender } from "@/renderer/state/remoteTerminalFeed";
import { syncDesktopBrowserBridgeClient } from "./browserBridge";
import { bindRemoteEngineLaneOverflow } from "./eventSocketEngine";
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
import { withRuntimeHistoryNoticesDeclaration } from "@/renderer/state/remote/historyNoticeCapability";
import {
  declaresBoundedCatalogChangesForConnection,
  noteBoundedCatalogChangesCapability,
  withBoundedCatalogChangesDeclaration,
} from "@/renderer/state/remote/boundedCatalogChangesCapability";
import { remoteConnectionKey } from "./types";
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
  readonly clientForServer: (server: RemoteServerRecord) => RemoteDesktopClient;
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
    clientForServer,
    buildOpenThread,
  } = deps;

  const connectionKey = remoteConnectionKey(server);
  const serverKey = `${server.endpoint}\0${server.accessToken}`;
  // This session's consumer-scoped decode engine (V5 2.2) and its per-host lane
  // (A3): independent of the desktop renderer-stream and persist engines, and
  // isolated from every other paired host's flood, so their resets/overflows
  // cannot reject this session's in-flight decodes.
  const engine = getRemoteSocketEngine();
  const existing = getRemoteServerEventSocketEntry(connectionKey);
  if (existing?.serverKey === serverKey && !options.resyncInterestedThreads) return;
  // Creating the lane supersedes a previous session's lane for this desktop:
  // its pending callbacks reject typed and its late results are fenced.
  const decodeLane = engine.createLane({ key: `event-socket:${connectionKey}` });

  closeRemoteServerEventSocket(
    connectionKey,
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
  setRemoteServerEventSocketEntry(connectionKey, entry);
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
    getRemoteServerEventSocketEntry(connectionKey) === entry &&
    get().servers.some((candidate) => remoteConnectionKey(candidate) === connectionKey);

  const setSocketStatus = (status: "connecting" | "online") => {
    set((state) => {
      const current = state.runtime[connectionKey];
      if (!current || (current.status === status && current.message === undefined)) return {};
      return {
        runtime: {
          ...state.runtime,
          [connectionKey]: {
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
    if (get().runtime[connectionKey]?.status === "online") {
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
    forgetRemoteServerCursorSyncV2(connectionKey);
    setRemoteTerminalSocketSender(connectionKey, null);
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

  bindRemoteEngineLaneOverflow(decodeLane, () => {
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
      const client = clientForServer(server);
      const seed = connectionCapabilitiesSeed;
      connectionCapabilitiesSeed = undefined;
      const { ticket, capabilities } = await prepareTerminalConnection(client, seed);
      if (!isCurrent()) return;
      // The fresh descriptor verdict for THIS connection: recorded before the
      // upgrade so the declaration gate reads the same fact every consumer
      // sees. An old host clears any earlier support.
      noteBoundedCatalogChangesCapability(
        connectionKey,
        capabilities.boundedCatalogChanges === true,
      );
      const lastSeenSeq = remoteServerSnapshotSeq(connectionKey);
      const openThread = get().openThread;
      const threadItemInterests =
        getRemoteServerThreadItemInterests(connectionKey) ??
        (openThread?.desktopId === connectionKey ? [openThread.threadId] : []);
      const socket = get().socketFactory(
        // B1: declare notice capability at upgrade only because the renderer
        // renders and can acknowledge the durable notice. boundedCatalogChanges
        // rides the same upgrade only when this descriptor advertised it AND
        // the bounded controller (which refreshes through bounded reads on the
        // payload-less signal) is installed for this connection.
        withBoundedCatalogChangesDeclaration(
          withRuntimeHistoryNoticesDeclaration(
            client.websocketUrl(ticket, lastSeenSeq, { threadItemInterests }),
          ),
          declaresBoundedCatalogChangesForConnection(connectionKey),
        ),
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
      // A3 generation fence: a new connection supersedes the old lane
      // generation; pending decodes from the previous socket reject typed and
      // can never be applied to this one.
      decodeLane.renew();
      entry.connectTimeout = setTimeout(() => {
        forceReconnect(socket);
      }, REMOTE_SOCKET_POLICY.connectTimeoutMs);
      const ctx: EventSocketConnectionContext = {
        server,
        entry,
        socket,
        client,
        get,
        set,
        buildOpenThread,
        setRemoteServerFailure,
        isCurrent,
        forceReconnect,
        noteClientDetectedLoss,
        decodeFrame: (raw) => decodeLane.decodeRemote(raw),
        decodeInline: !engine.isWorkerSupported(),
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
        activateRemoteTerminalFeed(connectionKey, socket);
        syncDesktopBrowserBridgeClient(get());
        const currentThreadItemInterests =
          getRemoteServerThreadItemInterests(connectionKey) ?? threadItemInterests;
        if (sameRemoteServerThreadItemInterests(currentThreadItemInterests, threadItemInterests)) {
          rememberRemoteServerThreadItemInterests(connectionKey, currentThreadItemInterests);
        } else {
          setRemoteServerThreadItemInterests(connectionKey, currentThreadItemInterests, true);
        }
        startHealthProbe(socket);
        if (get().runtime[connectionKey]?.status !== "online") {
          resetTruncateReloadBackoff(connectionKey);
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
          forgetRemoteServerCursorSyncV2(connectionKey);
          setRemoteTerminalSocketSender(connectionKey, null);
          setRemoteServerFailure(connectionKey, "error", sharedMsg("remote.session.expired"));
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
        setRemoteServerFailure(connectionKey, "error", friendlyError(error));
        // Stop automatic attempts, but retain terminal listeners so a
        // later explicit reconnect can install a fresh supported stream.
        deleteRemoteServerEventSocketEntry(connectionKey);
        forgetRemoteServerCursorSyncV2(connectionKey);
        setRemoteTerminalSocketSender(connectionKey, null);
        return;
      }
      if (isUnauthorizedRemoteError(error)) {
        setRemoteServerFailure(connectionKey, "error", sharedMsg("remote.session.expired"));
        scheduleReconnect(REMOTE_SOCKET_POLICY.unauthorizedReconnectMs);
        return;
      }
      const transportFailure = isRemoteTransportFailure(error);
      setRemoteServerFailure(
        connectionKey,
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
