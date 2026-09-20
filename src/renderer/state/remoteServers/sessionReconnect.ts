import { UNKNOWN_HOST_SERVICE_CAPABILITIES } from "@/shared/hostControlProtocol";
import { msg } from "@lingui/core/macro";
import { toast } from "@heroui/react";
import { friendlyError, msg as sharedMsg } from "@/shared/messages";
import { RemoteClientError } from "@/shared/remote/client";
import { REMOTE_BROWSER_FORWARD_VERSION } from "@/shared/remote/protocol";
import { readBridge } from "@/renderer/bridge";
import { i18n } from "@/renderer/i18n/i18n";
import { resetTruncateRecoveryEpoch } from "@/renderer/state/remote/truncateRecovery";
import { releaseRemoteTerminalsForServer } from "@/renderer/remoteProcedureRouter";
import { waitForHostUpdateReconnect } from "./hostUpdateReconnect";
import { clearRemoteGitState } from "./gitState";
import { removeRemoteAppRows, syncRemoteAppRows } from "./appRows";
import { removeCachedProjects } from "./projectCache";
import {
  bumpRemoteServerGeneration,
  clearRemoteServerEventSocketConnectTimeout,
  clearRemoteServerEventSocketHealth,
  clearRemoteThreadAppliedSeqs,
  deleteRemoteServerEventSocketEntry,
  deleteRemoteServerSnapshotSeq,
  forgetRemoteServerThreadItemInterests,
  getRemoteServerEventSocketEntry,
  listRemoteServerEventSocketDesktopIds,
} from "./eventSocketRegistry";
import { syncDesktopBrowserBridgeClient } from "./browserBridge";
import {
  clearRemoteServerRefreshTimer,
  deleteRemoteHostUpdateRequestSeq,
  invalidateRemoteServerRefresh,
  nextRemoteHostUpdateSequence,
  remoteHostUpdateReconnectSeq,
  remoteHostUpdateRequestSeq,
  setRemoteHostUpdateReconnectSeq,
  setRemoteHostUpdateRequestSeq,
  takeRemoteServerRowResyncPending,
} from "./connectionRefresh";
import { resetRemoteTerminalFeed } from "@/renderer/state/remoteTerminalFeed";
import {
  terminalCapabilitiesFromEnvironment,
  type TerminalConnectionCapabilities,
} from "./terminalCapabilities";
import { forgetCertPin, normalizeEndpoint } from "./pairing";
import { deleteRefreshTokenFromVault } from "./refreshTokens";
import type {
  RemoteServerClientBindings,
  RemoteServersStoreApi,
  StartRemoteServerEventStream,
} from "./storeClient";
import type { RemoteServerRecord } from "./types";

export function closeRemoteServerEventSocket(
  desktopId: string,
  options: { readonly preserveReplayState?: boolean } = {},
): void {
  // A pending debounced snapshot refresh for this server is now moot; cancel it
  // so a closed/removed server never fires a late GET (finding #5).
  clearRemoteServerRefreshTimer(desktopId);
  const entry = getRemoteServerEventSocketEntry(desktopId);
  if (!entry) return;
  deleteRemoteServerEventSocketEntry(desktopId);
  if (!options.preserveReplayState) {
    deleteRemoteServerSnapshotSeq(desktopId);
    clearRemoteThreadAppliedSeqs(desktopId);
    resetTruncateRecoveryEpoch(desktopId);
    takeRemoteServerRowResyncPending(desktopId);
  }
  if (entry.reconnectTimer) {
    clearTimeout(entry.reconnectTimer);
    entry.reconnectTimer = null;
  }
  clearRemoteServerEventSocketConnectTimeout(entry);
  clearRemoteServerEventSocketHealth(entry);
  resetRemoteTerminalFeed(desktopId);
  if (!entry.socket) return;
  try {
    entry.socket.close();
  } catch {
    // already closed
  }
  entry.socket = null;
}

export function closeAllRemoteServerEventSockets(): void {
  for (const desktopId of listRemoteServerEventSocketDesktopIds()) {
    closeRemoteServerEventSocket(desktopId);
  }
}

/** In-flight connectAll(), so concurrent callers coalesce onto one pass. */
let connectAllInFlight: Promise<void> | null = null;
let connectAllInFlightForce = false;
let connectAllForceRequested = false;

export function __resetConnectAllForTest(): void {
  connectAllInFlight = null;
  connectAllInFlightForce = false;
  connectAllForceRequested = false;
}

export interface SessionReconnectActionDeps extends RemoteServersStoreApi {
  readonly setRemoteServerFailure: RemoteServerClientBindings["setRemoteServerFailure"];
  readonly clientForServer: RemoteServerClientBindings["clientForServer"];
  readonly withClient: RemoteServerClientBindings["withClient"];
  readonly checkHostUpdateInBackground: RemoteServerClientBindings["checkHostUpdateInBackground"];
  readonly startRemoteServerEventStream: StartRemoteServerEventStream;
  readonly persistHasHydrated: () => boolean;
  readonly persistRehydrate: () => Promise<void>;
}

export function createSessionReconnectActions(deps: SessionReconnectActionDeps) {
  const {
    set,
    get,
    setRemoteServerFailure,
    clientForServer,
    withClient,
    checkHostUpdateInBackground,
    startRemoteServerEventStream,
    persistHasHydrated,
    persistRehydrate,
  } = deps;

  const setServersConnecting = (servers: readonly RemoteServerRecord[]) => {
    if (servers.length === 0) return;
    set((state) => {
      const runtime = { ...state.runtime };
      for (const server of servers) {
        const current = state.runtime[server.desktopId];
        runtime[server.desktopId] = {
          status: "connecting",
          projects: current?.projects ?? state.lastKnownProjects[server.desktopId] ?? [],
          threads: current?.threads ?? [],
          ...(current?.agentStatuses ? { agentStatuses: current.agentStatuses } : {}),
        };
      }
      return { runtime };
    });
    syncDesktopBrowserBridgeClient(get());
    for (const server of servers) {
      const runtime = get().runtime[server.desktopId];
      if (runtime) syncRemoteAppRows(server.desktopId, runtime.projects);
    }
  };

  /** Restore a server's transport (SSH tunnel) when needed, then snapshot
   * it and (re)attach its event stream. Shared by connectAll and
   * reconnectServer so transport handling lives in one place. */
  const connectServer = async (
    persistedServer: RemoteServerRecord,
    shouldContinue: () => boolean = () => true,
    options: { readonly resyncInterestedThreads?: boolean } = {},
  ): Promise<void> => {
    const reconnectGeneration = remoteHostUpdateReconnectSeq(persistedServer.desktopId);
    const canContinue = () =>
      remoteHostUpdateReconnectSeq(persistedServer.desktopId) === reconnectGeneration &&
      shouldContinue();
    let server = persistedServer;
    let initialTerminalCapabilities: TerminalConnectionCapabilities | undefined;
    if (server.transport?.kind === "ssh") {
      try {
        const launched = await readBridge().sshConnect({
          connection: server.transport.connection,
        });
        if (!canContinue()) return;
        server = { ...server, endpoint: normalizeEndpoint(launched.endpoint) };
        const updated = server;
        set((state) => ({
          servers: state.servers.map((candidate) =>
            candidate.desktopId === updated.desktopId ? updated : candidate,
          ),
        }));
      } catch (error) {
        if (!canContinue()) return;
        const message = friendlyError(error) || i18n._(msg`SSH connection failed.`);
        toast.danger(message);
        setRemoteServerFailure(server.desktopId, "offline", message);
        return;
      }
    }
    // WS3 #6: probe the environment while the first snapshot refresh is
    // in flight — one RTT saved per cold connect. Environment failures
    // keep their classification below; the concurrent refreshServer owns
    // visible snapshot errors either way.
    const environmentPromise = clientForServer(server).environment();
    const refreshPromise = get().refreshServer(server.desktopId);
    try {
      const environment = await environmentPromise;
      if (!canContinue()) return;
      initialTerminalCapabilities = terminalCapabilitiesFromEnvironment(environment);
      const keepsLocalAlias =
        server.remoteLabel !== undefined && server.label !== server.remoteLabel;
      server = {
        ...server,
        label: keepsLocalAlias ? server.label : environment.label,
        remoteLabel: environment.label,
        appVersion: environment.appVersion,
        // Assigned unconditionally so an authoritative descriptor that
        // drops the capability clears any stale support flag.
        browserForwardAvailable:
          environment.capabilities?.browserForward?.versions.includes(
            REMOTE_BROWSER_FORWARD_VERSION,
          ) ?? false,
        ...(environment.platform ? { platform: environment.platform } : {}),
        ...(environment.hostMode ? { hostMode: environment.hostMode } : {}),
      };
      try {
        const hostCapabilities = await clientForServer(server).describeHost();
        if (!canContinue()) return;
        server = { ...server, hostCapabilities };
      } catch {
        // A failed negotiation must not retain previously advertised services.
        server = { ...server, hostCapabilities: UNKNOWN_HOST_SERVICE_CAPABILITIES };
      }
      const updated = server;
      set((state) => ({
        servers: state.servers.map((candidate) =>
          candidate.desktopId === updated.desktopId ? updated : candidate,
        ),
      }));
    } catch (error) {
      if (!canContinue()) return;
      if (error instanceof RemoteClientError && error.code === "protocol_version_mismatch") {
        setRemoteServerFailure(server.desktopId, "error", friendlyError(error));
        return;
      }
      // refreshServer above owns other visible connection errors.
    }
    await refreshPromise;
    if (!canContinue()) return;
    await startRemoteServerEventStream(server, initialTerminalCapabilities, options);
    checkHostUpdateInBackground(server);
  };

  const reconnectAfterHostUpdate = async (
    persistedServer: RemoteServerRecord,
    expectedVersion: string,
    reconnectSeq: number,
  ): Promise<void> => {
    const isCurrent = () =>
      remoteHostUpdateReconnectSeq(persistedServer.desktopId) === reconnectSeq &&
      get().servers.some((server) => server.desktopId === persistedServer.desktopId);
    const outcome = await waitForHostUpdateReconnect({
      isCurrent,
      isTerminalError: (error) =>
        error instanceof RemoteClientError && error.code === "protocol_version_mismatch",
      attempt: async () => {
        const environment = await clientForServer(persistedServer).environment();
        if (environment.appVersion !== expectedVersion) return false;
        const current = get().servers.find(
          (server) => server.desktopId === persistedServer.desktopId,
        );
        if (!current || !isCurrent()) return false;
        await connectServer(current, () => isCurrent());
        if (
          isCurrent() &&
          get().runtime[persistedServer.desktopId]?.status === "online" &&
          get().servers.find((server) => server.desktopId === persistedServer.desktopId)
            ?.appVersion === expectedVersion
        ) {
          return true;
        }
        closeRemoteServerEventSocket(persistedServer.desktopId);
        const latest = get().servers.find(
          (server) => server.desktopId === persistedServer.desktopId,
        );
        if (latest && isCurrent()) setServersConnecting([latest]);
        return false;
      },
    });
    if (outcome.type === "cancelled" || !isCurrent()) {
      set((state) => {
        const { [persistedServer.desktopId]: _stale, ...hostUpdateRestarts } =
          state.hostUpdateRestarts;
        return { hostUpdateRestarts };
      });
      return;
    }
    setRemoteHostUpdateReconnectSeq(persistedServer.desktopId, nextRemoteHostUpdateSequence());
    if (outcome.type === "connected") {
      set((state) => {
        const { [persistedServer.desktopId]: _finished, ...hostUpdateRestarts } =
          state.hostUpdateRestarts;
        return { hostUpdateRestarts };
      });
      return;
    }
    invalidateRemoteServerRefresh(persistedServer.desktopId);
    closeRemoteServerEventSocket(persistedServer.desktopId);
    const status = outcome.type === "terminal-error" ? "error" : "offline";
    const message =
      outcome.type === "terminal-error"
        ? friendlyError(outcome.error)
        : sharedMsg("remote.server.unreachable");
    setRemoteServerFailure(persistedServer.desktopId, status, message);
    set((state) => {
      const { [persistedServer.desktopId]: _finished, ...hostUpdateRestarts } =
        state.hostUpdateRestarts;
      return { hostUpdateRestarts };
    });
  };

  return {
    connectAll: async (options: { readonly forceTransportReconnect?: boolean } = {}) => {
      // Coalesce concurrent callers (the sidebar and the settings panel both
      // connect on mount) so servers aren't snapshotted twice on startup.
      if (connectAllInFlight) {
        if (options.forceTransportReconnect && !connectAllInFlightForce) {
          connectAllForceRequested = true;
        }
        return connectAllInFlight;
      }
      connectAllInFlight = (async () => {
        // The secure browser vault hydrates asynchronously. Sidebar mount
        // can otherwise observe the empty initial state, finish a no-op
        // connection pass, and never reconnect the restored servers.
        if (!persistHasHydrated()) {
          await persistRehydrate();
        }
        const connectPass = async (forceTransportReconnect: boolean): Promise<void> => {
          connectAllInFlightForce = forceTransportReconnect;
          const servers = get().servers.filter(
            (server) => get().hostUpdateRestarts[server.desktopId] === undefined,
          );
          if (forceTransportReconnect) {
            for (const server of servers) {
              closeRemoteServerEventSocket(server.desktopId, { preserveReplayState: true });
            }
          }
          setServersConnecting(servers);
          await Promise.all(
            servers.map((server) =>
              connectServer(
                server,
                () => true,
                forceTransportReconnect ? { resyncInterestedThreads: true } : undefined,
              ),
            ),
          );
        };
        await connectPass(options.forceTransportReconnect === true);
        if (connectAllForceRequested) {
          connectAllForceRequested = false;
          await connectPass(true);
        }
      })().finally(() => {
        connectAllInFlight = null;
        connectAllInFlightForce = false;
        connectAllForceRequested = false;
      });
      return connectAllInFlight;
    },

    reconnectServer: async (desktopId: string) => {
      if (get().hostUpdateRestarts[desktopId] !== undefined) return;
      const server = get().servers.find((entry) => entry.desktopId === desktopId);
      if (!server) return;
      setServersConnecting([server]);
      await connectServer(server);
    },

    removeServer: (desktopId: string) => {
      const removed = get().servers.find((server) => server.desktopId === desktopId);
      setRemoteHostUpdateReconnectSeq(desktopId, nextRemoteHostUpdateSequence());
      deleteRemoteHostUpdateRequestSeq(desktopId);
      invalidateRemoteServerRefresh(desktopId);
      closeRemoteServerEventSocket(desktopId);
      resetTruncateRecoveryEpoch(desktopId);
      bumpRemoteServerGeneration(desktopId);
      // If the open live-chat thread belongs to this server, tear it (and its
      // socket) down first so it isn't left orphaned with no way to interact.
      if (get().openThread?.desktopId === desktopId) {
        get().closeRemoteThread();
      }
      forgetRemoteServerThreadItemInterests(desktopId);
      // Gate 6 items 4.2/4.6: the record is gone — its certificate pin and
      // its refresh-token half go with it, so a stale pin or a dead
      // refresh token can never attach to a future server with the same id.
      forgetCertPin(desktopId);
      void deleteRefreshTokenFromVault(desktopId);
      set((state) => {
        const { [desktopId]: _removed, ...runtime } = state.runtime;
        const { [desktopId]: _removedUpdate, ...hostUpdates } = state.hostUpdates;
        const { [desktopId]: _removedRestart, ...hostUpdateRestarts } = state.hostUpdateRestarts;
        return {
          servers: state.servers.filter((server) => server.desktopId !== desktopId),
          runtime,
          hostUpdates,
          hostUpdateRestarts,
          lastKnownProjects: removeCachedProjects(state.lastKnownProjects, desktopId),
        };
      });
      releaseRemoteTerminalsForServer(desktopId);
      clearRemoteGitState(desktopId);
      removeRemoteAppRows(desktopId);
      if (removed?.transport?.kind === "ssh") {
        void readBridge()
          .sshDisconnect({ connectionId: removed.transport.connection.id })
          .catch(() => undefined);
      }
      syncDesktopBrowserBridgeClient(get());
    },

    getHostUpdateState: async (desktopId: string) => {
      const requestSeq = nextRemoteHostUpdateSequence();
      setRemoteHostUpdateRequestSeq(desktopId, requestSeq);
      const update = await withClient(desktopId, (client) => client.hostUpdateState());
      if (remoteHostUpdateRequestSeq(desktopId) !== requestSeq) return update;
      set((state) => ({ hostUpdates: { ...state.hostUpdates, [desktopId]: update } }));
      return update;
    },

    checkHostUpdate: async (desktopId: string) => {
      const requestSeq = nextRemoteHostUpdateSequence();
      setRemoteHostUpdateRequestSeq(desktopId, requestSeq);
      const update = await withClient(desktopId, (client) => client.checkHostUpdate());
      if (remoteHostUpdateRequestSeq(desktopId) !== requestSeq) return update;
      set((state) => ({ hostUpdates: { ...state.hostUpdates, [desktopId]: update } }));
      return update;
    },

    installHostUpdate: async (desktopId: string) => {
      if (get().hostUpdateRestarts[desktopId] !== undefined) return;
      const server = get().servers.find((entry) => entry.desktopId === desktopId);
      const status = get().hostUpdates[desktopId]?.status;
      if (!server || status?.type !== "downloaded") {
        await withClient(desktopId, (client) => client.installHostUpdate());
        return;
      }

      const reconnectGeneration = remoteHostUpdateReconnectSeq(desktopId);
      await withClient(desktopId, (client) => client.installHostUpdate());
      if (remoteHostUpdateReconnectSeq(desktopId) !== reconnectGeneration) {
        return;
      }
      setRemoteHostUpdateRequestSeq(desktopId, nextRemoteHostUpdateSequence());
      const reconnectSeq = nextRemoteHostUpdateSequence();
      setRemoteHostUpdateReconnectSeq(desktopId, reconnectSeq);
      invalidateRemoteServerRefresh(desktopId);
      closeRemoteServerEventSocket(desktopId);
      set((state) => {
        const { [desktopId]: _installed, ...hostUpdates } = state.hostUpdates;
        return {
          hostUpdates,
          hostUpdateRestarts: { ...state.hostUpdateRestarts, [desktopId]: status.version },
        };
      });
      setServersConnecting([server]);
      void reconnectAfterHostUpdate(server, status.version, reconnectSeq);
    },
  };
}
