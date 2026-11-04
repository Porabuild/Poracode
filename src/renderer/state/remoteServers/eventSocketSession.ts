import type { TerminalSize, Thread } from "@/shared/contracts";
import { friendlyError, msg as sharedMsg } from "@/shared/messages";
import {
  isRemoteTransportFailure,
  isUnauthorizedRemoteError,
  RemoteClientError,
} from "@/shared/remote/client";
import {
  isUnauthorizedRemoteSocketClose,
  REMOTE_ACCESS_SESSION_EXPIRED_REASON,
  REMOTE_SOCKET_POLICY,
  RemoteSocketHealthMonitor,
  RemoteSocketReconnectPolicy,
} from "@/shared/remote/socketPolicy";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import { getRemoteSocketEngine } from "@/renderer/state/remote/engine";
import { setRemoteTerminalSocketSender } from "@/renderer/state/remoteTerminalFeed";
import { syncDesktopBrowserBridgeClient } from "./browserBridge";
import { bindRemoteEngineLaneOverflow } from "./eventSocketEngine";
import { type EventSocketConnectionContext } from "./eventSocketContext";
import { declareEventSocketCapabilities } from "./eventSocketUpgrade";
import { bindEventSocketMessages } from "./eventSocketMessages";
import { setAgentVisionSocketSender } from "@/renderer/browser/agentVisionStream";
import {
  clearRemoteServerEventSocketConnectTimeout,
  clearRemoteServerEventSocketHealth,
  deleteRemoteServerEventSocketEntry,
  forgetRemoteServerCursorSyncV2,
  getRemoteServerEventSocketEntry,
  rememberRemoteServerThreadItemInterests,
  remoteServerSnapshotEpoch,
  remoteServerSnapshotSeq,
  sameRemoteServerThreadItemInterests,
  setRemoteServerEventSocketEntry,
  setRemoteServerThreadItemInterests,
  type RemoteServerEventSocketEntry,
} from "./eventSocketRegistry";
import { bindEventSocketResync } from "./eventSocketResync";
import { notePairedItemInterestCoverage, pairedItemInterests } from "./pairedItemInterests";
import { useAppStore } from "@/renderer/state/appStore";
import { hasHydratedThreadRuntimeItems } from "@/renderer/state/chatRuntimePersister";
import { remoteThreadId } from "@/renderer/state/remoteProjection";
import {
  declaresBoundedCatalogChangesForConnection,
  noteBoundedCatalogChangesCapability,
} from "@/renderer/state/remote/boundedCatalogChangesCapability";
import { remoteConnectionKey } from "./types";
import { refreshTokenForDesktop } from "./refreshTokens";
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
  const serverKey = server.endpoint;
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

  closeRemoteServerEventSocket(connectionKey, { preserveReplayState: true });
  const entry: RemoteServerEventSocketEntry = {
    serverKey,
    socket: null,
    reconnectTimer: null,
    reconnectPolicy: new RemoteSocketReconnectPolicy(),
    connecting: false,
    connectTimeout: null,
    healthPingInterval: null,
    health: null,
    dispose: () => decodeLane.dispose(),
  };
  setRemoteServerEventSocketEntry(connectionKey, entry);
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
    entry.disposeFrames?.();
    delete entry.disposeFrames;
    clearRemoteServerEventSocketConnectTimeout(entry);
    clearRemoteServerEventSocketHealth(entry);
    forgetRemoteServerCursorSyncV2(connectionKey);
    notePairedItemInterestCoverage(connectionKey, false);
    setRemoteTerminalSocketSender(connectionKey, null);
    setAgentVisionSocketSender(connectionKey, null);
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
      const lastSeenEpoch = remoteServerSnapshotEpoch(connectionKey);
      const threadItemInterests = pairedItemInterests(connectionKey);
      const socket = await get().socketFactory(
        declareEventSocketCapabilities(
          client.websocketUrl(ticket, lastSeenSeq, { threadItemInterests }),
          {
            boundedCatalogChanges: declaresBoundedCatalogChangesForConnection(connectionKey),
            resume: { lastSeenEpoch },
          },
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
        resumeCursor: lastSeenSeq,
        client,
        get,
        set,
        buildOpenThread,
        setRemoteServerFailure,
        isCurrent,
        forceReconnect,
        noteClientDetectedLoss,
        decodeFrame: (raw) => decodeLane.decodeRemote(raw),
        renewDecoder: () => decodeLane.renew(),
        decodeInline: !engine.isWorkerSupported(),
        dispatchForwardEvent: () => {},
        recoverInterestedThreads: async () => false,
      };
      bindEventSocketResync(ctx);
      bindEventSocketMessages(ctx);
      const activateSocket = () => {
        if (!isCurrent() || entry.socket !== socket) return;
        clearRemoteServerEventSocketConnectTimeout(entry);
        entry.reconnectPolicy.reset();
        activateRemoteTerminalFeed(connectionKey, socket);
        setAgentVisionSocketSender(connectionKey, (message) => {
          if (!isCurrent() || entry.socket !== socket || socket.readyState !== 1) return false;
          socket.send?.(JSON.stringify(message));
          return true;
        });
        syncDesktopBrowserBridgeClient(get());
        const currentThreadItemInterests = pairedItemInterests(connectionKey);
        if (sameRemoteServerThreadItemInterests(currentThreadItemInterests, threadItemInterests)) {
          rememberRemoteServerThreadItemInterests(connectionKey, currentThreadItemInterests);
        } else {
          setRemoteServerThreadItemInterests(connectionKey, currentThreadItemInterests, true);
        }
        notePairedItemInterestCoverage(connectionKey, true);
        startHealthProbe(socket);
        setSocketStatus("online");
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
          entry.disposeFrames?.();
          delete entry.disposeFrames;
          clearRemoteServerEventSocketConnectTimeout(entry);
          clearRemoteServerEventSocketHealth(entry);
          forgetRemoteServerCursorSyncV2(connectionKey);
          notePairedItemInterestCoverage(connectionKey, false);
          setRemoteTerminalSocketSender(connectionKey, null);
          setAgentVisionSocketSender(connectionKey, null);
          // The deadline close is routine (the 24-hour bearer reached its
          // end) and the reconnect's ticket mint refreshes the same session;
          // the terminal "pairing expired" state belongs to a refused refresh
          // grant, which the next connect actually proves.
          setSocketStatus("connecting");
          // The routine deadline close reconnects at once, like any transport
          // loss (the desktop host's leg does the same): the ticket mint renews
          // the session, and a refused grant retires it there. Any other
          // unauthorized close waits, so a dead credential is not hammered.
          scheduleReconnect(
            event?.reason === REMOTE_ACCESS_SESSION_EXPIRED_REASON
              ? REMOTE_SOCKET_POLICY.reconnectBaseMs
              : REMOTE_SOCKET_POLICY.unauthorizedReconnectMs,
          );
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
      } else {
        // A pane that mounted while this host was unreachable reads its
        // history once the connection is live, as the managed host rebuilds
        // its retained threads when its leg activates. Threads whose history
        // already loaded keep streaming. One thread's failed read stays that
        // thread's failure.
        const unloaded = new Set(
          pairedItemInterests(connectionKey).filter((threadId) => {
            const viewThreadId = remoteThreadId(connectionKey, threadId);
            return (
              !hasHydratedThreadRuntimeItems(viewThreadId) ||
              useAppStore.getState().runtimeHydrationStatus[viewThreadId] === "failed"
            );
          }),
        );
        if (unloaded.size > 0) void ctx.recoverInterestedThreads(unloaded);
      }
    } catch (error) {
      if (!isCurrent()) return;
      // Terminal retire: stop the automatic ladder (the finally must not
      // re-arm it) and leave a stable state a later explicit reconnect or
      // re-pair can build on.
      const retireSession = (message: string) => {
        setRemoteServerFailure(connectionKey, "error", message);
        deleteRemoteServerEventSocketEntry(connectionKey);
        entry.disposeFrames?.();
        entry.dispose?.();
        setAgentVisionSocketSender(connectionKey, null);
        forgetRemoteServerCursorSyncV2(connectionKey);
        notePairedItemInterestCoverage(connectionKey, false);
        setRemoteTerminalSocketSender(connectionKey, null);
      };
      if (error instanceof RemoteClientError && error.code === "protocol_version_mismatch") {
        retireSession(friendlyError(error));
        return;
      }
      if (isUnauthorizedRemoteError(error)) {
        // A refused or absent grant never recovers by retrying: retire the
        // session and show the stable "pair again" state instead of a
        // reconnect loop. With a grant still held, this attempt's refresh
        // simply lost the race or hit a transient failure — keep the slow
        // retry, the next attempt can recover.
        if (refreshTokenForDesktop(connectionKey) === undefined) {
          retireSession(sharedMsg("remote.session.expired"));
          return;
        }
        setSocketStatus("connecting");
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
