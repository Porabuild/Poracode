import { UNKNOWN_HOST_SERVICE_CAPABILITIES } from "@/shared/hostControlProtocol";
import { msg } from "@lingui/core/macro";
import { toast } from "@heroui/react";
import { friendlyError, msg as sharedMsg } from "@/shared/messages";
import { RemoteClientError } from "@/shared/remote/client";
import { REMOTE_BROWSER_FORWARD_VERSION } from "@/shared/remote/protocol";
import {
  environmentAdvertisesRuntimeHistoryNotices,
  forgetRuntimeHistoryNoticesCapability,
  noteRuntimeHistoryNoticesCapability,
} from "@/renderer/state/remote/historyNoticeCapability";
import { clearThreadHistoryNoticesForAuthority } from "@/renderer/state/remote/historyNoticeStore";
import {
  environmentAdvertisesBoundedCatalogChanges,
  forgetBoundedCatalogChangesCapability,
  noteBoundedCatalogChangesCapability,
} from "@/renderer/state/remote/boundedCatalogChangesCapability";
import {
  environmentAdvertisesProjectCommandResults,
  forgetProjectCommandResultsCapability,
  noteProjectCommandResultsCapability,
} from "@/renderer/state/remote/projectCommandResultsCapability";
import {
  environmentAdvertisesCatalogMutations,
  forgetCatalogMutationsCapability,
  noteCatalogMutationsCapability,
} from "@/renderer/state/remote/catalogMutationsCapability";
import { readBridge } from "@/renderer/bridge";
import { i18n } from "@/renderer/i18n/i18n";
import { remoteThreadId } from "@/renderer/state/remoteProjection";
import { pruneLiveObservedCrossagentItems } from "@/renderer/state/slices/staleSubAgents";
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
  beginBoundedCatalogAttempt,
  disposeBoundedCatalog,
} from "./catalog/boundedCatalogController";
import { forgetBoundedHistoryForServer } from "./catalog/boundedHistory";
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
import {
  disposeEnvironmentParentSession,
  disposeEnvironmentSession,
  disposeEnvironmentSessionsForParent,
  environmentChildGrantSubject,
  environmentParentEndpointFor,
  environmentProxyEndpoint,
} from "./environmentSessions";
import {
  environmentParentRef,
  environmentTransportHasParent,
  remoteConnectionKey,
  type EnvironmentParentRef,
  type RemoteServerRecord,
} from "./types";
import type {
  RemoteServerClientBindings,
  RemoteServersStoreApi,
  StartRemoteServerEventStream,
} from "./storeClient";

/**
 * Thrown by `removeServer` when a direct/ssh record still owns host-owned
 * environment records and the caller did not pass the explicit
 * `cascadeEnvironments: true` confirmation. Host-side environments are never
 * deleted by the cascade — only this device's records and child grants.
 */
export class EnvironmentCascadeConfirmationRequiredError extends Error {
  readonly code = "environment_cascade_confirmation_required";
  constructor(readonly dependentConnectionKeys: readonly string[]) {
    super("Removing this connection also removes its host-owned environment records.");
  }
}

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
        // Every runtime/app row is keyed by the connection key, never the host
        // identity: an environment record's desktopId is the child host, and a
        // direct pairing of that child has its own row.
        const connectionKey = remoteConnectionKey(server);
        const current = state.runtime[connectionKey];
        runtime[connectionKey] = {
          status: "connecting",
          projects: current?.projects ?? state.lastKnownProjects[connectionKey] ?? [],
          threads: current?.threads ?? [],
          ...(current?.agentStatuses ? { agentStatuses: current.agentStatuses } : {}),
        };
      }
      return { runtime };
    });
    syncDesktopBrowserBridgeClient(get());
    for (const server of servers) {
      const connectionKey = remoteConnectionKey(server);
      // A connect/reconnect always restarts the bounded catalog walks; a
      // cursor from the previous session must not be resumed across the gap.
      beginBoundedCatalogAttempt(connectionKey);
      const runtime = get().runtime[connectionKey];
      if (runtime) syncRemoteAppRows(connectionKey, runtime.projects);
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
    const connectionKey = remoteConnectionKey(persistedServer);
    const reconnectGeneration = remoteHostUpdateReconnectSeq(connectionKey);
    const canContinue = () =>
      remoteHostUpdateReconnectSeq(connectionKey) === reconnectGeneration && shouldContinue();
    let server = persistedServer;
    let initialTerminalCapabilities: TerminalConnectionCapabilities | undefined;
    if (server.transport?.kind === "environment") {
      // The environment endpoint is the parent proxy prefix, re-derived from
      // the CURRENT parent authority on every connect (a remote parent record
      // may have moved endpoints, e.g. an SSH tunnel restart; the managed
      // parent endpoint comes from the live loopback descriptor).
      const ref = environmentParentRef(server.transport);
      const parentEndpoint = ref ? environmentParentEndpointFor(ref) : undefined;
      if (parentEndpoint === undefined) {
        setRemoteServerFailure(
          connectionKey,
          "offline",
          i18n._(msg`The paired server that owns this environment is not connected.`),
        );
        return;
      }
      server = {
        ...server,
        endpoint: environmentProxyEndpoint(parentEndpoint, server.transport.environmentId),
      };
      const updated = server;
      set((state) => ({
        servers: state.servers.map((candidate) =>
          remoteConnectionKey(candidate) === connectionKey ? updated : candidate,
        ),
      }));
    } else if (server.transport?.kind === "ssh") {
      try {
        const launched = await readBridge().sshConnect({
          connection: server.transport.connection,
        });
        if (!canContinue()) return;
        server = { ...server, endpoint: normalizeEndpoint(launched.endpoint) };
        const updated = server;
        set((state) => ({
          servers: state.servers.map((candidate) =>
            remoteConnectionKey(candidate) === connectionKey ? updated : candidate,
          ),
        }));
      } catch (error) {
        if (!canContinue()) return;
        const message = friendlyError(error) || i18n._(msg`SSH connection failed.`);
        toast.danger(message);
        setRemoteServerFailure(connectionKey, "offline", message);
        return;
      }
    }
    // WS3 #6: probe the environment while the first snapshot refresh is
    // in flight — one RTT saved per cold connect. Environment failures
    // keep their classification below; the concurrent refreshServer owns
    // visible snapshot errors either way.
    const environmentPromise = clientForServer(server).environment();
    const refreshPromise = get().refreshServer(connectionKey);
    try {
      const environment = await environmentPromise;
      if (!canContinue()) return;
      initialTerminalCapabilities = terminalCapabilitiesFromEnvironment(environment);
      // B1: the notices capability is negotiated from the fresh descriptor on
      // every connect; an old host clears any stale declaration.
      noteRuntimeHistoryNoticesCapability(
        connectionKey,
        environmentAdvertisesRuntimeHistoryNotices(environment),
      );
      // boundedCatalogChanges / projectCommandResults are the same kind of
      // per-connection fact: re-proven from this descriptor and cleared when
      // the host stops advertising (or predates) them.
      noteBoundedCatalogChangesCapability(
        connectionKey,
        environmentAdvertisesBoundedCatalogChanges(environment),
      );
      noteProjectCommandResultsCapability(
        connectionKey,
        environmentAdvertisesProjectCommandResults(environment),
      );
      // Narrow catalog mutations (reorder / workspace / draft config) ride the
      // same descriptor fact: a host that does not advertise them keeps the
      // paired sidebar's intents local instead of receiving a command it
      // cannot persist.
      noteCatalogMutationsCapability(
        connectionKey,
        environmentAdvertisesCatalogMutations(environment),
      );
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
          remoteConnectionKey(candidate) === connectionKey ? updated : candidate,
        ),
      }));
    } catch (error) {
      if (!canContinue()) return;
      if (error instanceof RemoteClientError && error.code === "protocol_version_mismatch") {
        setRemoteServerFailure(connectionKey, "error", friendlyError(error));
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
    const persistedKey = remoteConnectionKey(persistedServer);
    const isCurrent = () =>
      remoteHostUpdateReconnectSeq(persistedKey) === reconnectSeq &&
      get().servers.some((server) => remoteConnectionKey(server) === persistedKey);
    const outcome = await waitForHostUpdateReconnect({
      isCurrent,
      isTerminalError: (error) =>
        error instanceof RemoteClientError && error.code === "protocol_version_mismatch",
      attempt: async () => {
        const environment = await clientForServer(persistedServer).environment();
        if (environment.appVersion !== expectedVersion) return false;
        const current = get().servers.find(
          (server) => remoteConnectionKey(server) === persistedKey,
        );
        if (!current || !isCurrent()) return false;
        await connectServer(current, () => isCurrent());
        if (
          isCurrent() &&
          get().runtime[persistedKey]?.status === "online" &&
          get().servers.find((server) => remoteConnectionKey(server) === persistedKey)
            ?.appVersion === expectedVersion
        ) {
          return true;
        }
        closeRemoteServerEventSocket(persistedKey);
        const latest = get().servers.find((server) => remoteConnectionKey(server) === persistedKey);
        if (latest && isCurrent()) setServersConnecting([latest]);
        return false;
      },
    });
    if (outcome.type === "cancelled" || !isCurrent()) {
      set((state) => {
        const { [persistedKey]: _stale, ...hostUpdateRestarts } = state.hostUpdateRestarts;
        return { hostUpdateRestarts };
      });
      return;
    }
    setRemoteHostUpdateReconnectSeq(persistedKey, nextRemoteHostUpdateSequence());
    if (outcome.type === "connected") {
      set((state) => {
        const { [persistedKey]: _finished, ...hostUpdateRestarts } = state.hostUpdateRestarts;
        return { hostUpdateRestarts };
      });
      return;
    }
    invalidateRemoteServerRefresh(persistedKey);
    closeRemoteServerEventSocket(persistedKey);
    const status = outcome.type === "terminal-error" ? "error" : "offline";
    const message =
      outcome.type === "terminal-error"
        ? friendlyError(outcome.error)
        : sharedMsg("remote.server.unreachable");
    setRemoteServerFailure(persistedKey, status, message);
    set((state) => {
      const { [persistedKey]: _finished, ...hostUpdateRestarts } = state.hostUpdateRestarts;
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
            (server) => get().hostUpdateRestarts[remoteConnectionKey(server)] === undefined,
          );
          if (forceTransportReconnect) {
            for (const server of servers) {
              closeRemoteServerEventSocket(remoteConnectionKey(server), {
                preserveReplayState: true,
              });
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

    reconnectServer: async (connectionKey: string) => {
      if (get().hostUpdateRestarts[connectionKey] !== undefined) return;
      const server = get().servers.find((entry) => remoteConnectionKey(entry) === connectionKey);
      if (!server) return;
      setServersConnecting([server]);
      await connectServer(server);
    },

    removeServer: (
      connectionKey: string,
      options: { readonly cascadeEnvironments?: boolean } = {},
    ) => {
      const removed = get().servers.find((server) => remoteConnectionKey(server) === connectionKey);
      const connectionParentRef: EnvironmentParentRef = {
        kind: "connection",
        connectionId: connectionKey,
      };
      // Only a persisted connection's OWN children are dependents: a managed
      // child's parent is the ephemeral authority, so removing any persisted
      // record never cascades into it.
      const dependents = get().servers.filter(
        (server) =>
          server.transport?.kind === "environment" &&
          environmentTransportHasParent(server.transport, connectionParentRef),
      );
      if (dependents.length > 0 && options.cascadeEnvironments !== true) {
        throw new EnvironmentCascadeConfirmationRequiredError(
          dependents.map((server) => remoteConnectionKey(server)),
        );
      }

      const removeRecord = (server: RemoteServerRecord | undefined, key: string) => {
        setRemoteHostUpdateReconnectSeq(key, nextRemoteHostUpdateSequence());
        deleteRemoteHostUpdateRequestSeq(key);
        invalidateRemoteServerRefresh(key);
        closeRemoteServerEventSocket(key);
        resetTruncateRecoveryEpoch(key);
        bumpRemoteServerGeneration(key);
        // The connection is gone: its bounded walks, cursors and history
        // continuation proofs must not survive a future re-pair.
        disposeBoundedCatalog(key);
        forgetBoundedHistoryForServer(key);
        // The negotiated notice capability dies with the connection record: a
        // future re-pair must prove it again from the new descriptor. Its
        // retained notice entries go with it (authoritative server removal).
        forgetRuntimeHistoryNoticesCapability(key);
        forgetBoundedCatalogChangesCapability(key);
        forgetProjectCommandResultsCapability(key);
        forgetCatalogMutationsCapability(key);
        clearThreadHistoryNoticesForAuthority(key);
        // The host session is gone: its Crossagent runs died with it, so their
        // live-observation records must not outlive the connection and keep
        // those tiles preserved as "running" on a future attach.
        pruneLiveObservedCrossagentItems((threadId) =>
          threadId.startsWith(remoteThreadId(key, "")),
        );
        // If the open live-chat thread belongs to this server, tear it (and its
        // socket) down first so it isn't left orphaned with no way to interact.
        if (get().openThread?.desktopId === key) {
          get().closeRemoteThread();
        }
        forgetRemoteServerThreadItemInterests(key);
        disposeEnvironmentSession(key);
        // Gate 6 items 4.2/4.6: the record is gone — its certificate pin and
        // its refresh-token half go with it, so a stale pin or a dead
        // refresh token can never attach to a future server with the same id.
        // An environment's own pin map entry is empty by construction (the
        // parent pin is keyed by the parent connection); its child grant is
        // parent-scoped and removed below.
        forgetCertPin(key);
        if (server?.transport?.kind === "environment") {
          // Subject-derived slot: remote grants live at
          // `environmentRefresh.<parent>.<envId>`, managed grants at
          // `managedEnvironment.<hostDesktopId>.<envId>`. An old reader's
          // `refresh.<key>` delete cannot touch either root.
          const grantSubject = environmentChildGrantSubject(server.transport);
          if (grantSubject) void deleteRefreshTokenFromVault(grantSubject);
        } else {
          // A removed direct/ssh record's long-lived parent session goes with
          // it, and `deleteRefreshTokenFromVault` below revokes the connection
          // incarnation, so its delayed rotation is inert (no memory or vault
          // resurrection of the deleted grant).
          disposeEnvironmentParentSession(key);
          void deleteRefreshTokenFromVault({ kind: "connection", connectionId: key });
        }
        set((state) => {
          const { [key]: _removed, ...runtime } = state.runtime;
          const { [key]: _removedUpdate, ...hostUpdates } = state.hostUpdates;
          const { [key]: _removedRestart, ...hostUpdateRestarts } = state.hostUpdateRestarts;
          return {
            servers: state.servers.filter((candidate) => remoteConnectionKey(candidate) !== key),
            runtime,
            hostUpdates,
            hostUpdateRestarts,
            lastKnownProjects: removeCachedProjects(state.lastKnownProjects, key),
          };
        });
        releaseRemoteTerminalsForServer(key);
        clearRemoteGitState(key);
        removeRemoteAppRows(key);
        if (server?.transport?.kind === "ssh") {
          void readBridge()
            .sshDisconnect({ connectionId: server.transport.connection.id })
            .catch(() => undefined);
        }
      };

      // Local records and grants only: a host-owned environment is never
      // deleted from the host by removing this device's parent pairing.
      for (const dependent of dependents) removeRecord(dependent, remoteConnectionKey(dependent));
      if (dependents.length > 0) {
        disposeEnvironmentSessionsForParent(connectionParentRef);
      }
      // Key-based cleanup always runs (a stale/absent record must not leave
      // event sockets, queues, or projections behind).
      removeRecord(removed, connectionKey);
      syncDesktopBrowserBridgeClient(get());
    },

    getHostUpdateState: async (connectionKey: string) => {
      const requestSeq = nextRemoteHostUpdateSequence();
      setRemoteHostUpdateRequestSeq(connectionKey, requestSeq);
      const update = await withClient(connectionKey, (client) => client.hostUpdateState());
      if (remoteHostUpdateRequestSeq(connectionKey) !== requestSeq) return update;
      set((state) => ({ hostUpdates: { ...state.hostUpdates, [connectionKey]: update } }));
      return update;
    },

    checkHostUpdate: async (connectionKey: string) => {
      const requestSeq = nextRemoteHostUpdateSequence();
      setRemoteHostUpdateRequestSeq(connectionKey, requestSeq);
      const update = await withClient(connectionKey, (client) => client.checkHostUpdate());
      if (remoteHostUpdateRequestSeq(connectionKey) !== requestSeq) return update;
      set((state) => ({ hostUpdates: { ...state.hostUpdates, [connectionKey]: update } }));
      return update;
    },

    installHostUpdate: async (connectionKey: string) => {
      if (get().hostUpdateRestarts[connectionKey] !== undefined) return;
      const server = get().servers.find((entry) => remoteConnectionKey(entry) === connectionKey);
      const status = get().hostUpdates[connectionKey]?.status;
      if (!server || status?.type !== "downloaded") {
        await withClient(connectionKey, (client) => client.installHostUpdate());
        return;
      }

      const reconnectGeneration = remoteHostUpdateReconnectSeq(connectionKey);
      await withClient(connectionKey, (client) => client.installHostUpdate());
      if (remoteHostUpdateReconnectSeq(connectionKey) !== reconnectGeneration) {
        return;
      }
      setRemoteHostUpdateRequestSeq(connectionKey, nextRemoteHostUpdateSequence());
      const reconnectSeq = nextRemoteHostUpdateSequence();
      setRemoteHostUpdateReconnectSeq(connectionKey, reconnectSeq);
      invalidateRemoteServerRefresh(connectionKey);
      closeRemoteServerEventSocket(connectionKey);
      // The host process restarts to install the update: every run it owned
      // dies, and reconnect snapshots must be free to settle their rows.
      pruneLiveObservedCrossagentItems((threadId) =>
        threadId.startsWith(remoteThreadId(connectionKey, "")),
      );
      set((state) => {
        const { [connectionKey]: _installed, ...hostUpdates } = state.hostUpdates;
        return {
          hostUpdates,
          hostUpdateRestarts: { ...state.hostUpdateRestarts, [connectionKey]: status.version },
        };
      });
      setServersConnecting([server]);
      void reconnectAfterHostUpdate(server, status.version, reconnectSeq);
    },
  };
}
