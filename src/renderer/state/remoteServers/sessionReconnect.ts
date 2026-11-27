import {
  UNKNOWN_HOST_SERVICE_CAPABILITIES,
  type HostServiceCapabilities,
} from "@/shared/hostControlProtocol";
import { setAgentVisionSocketSender } from "@/renderer/browser/agentVisionStream";
import { msg } from "@lingui/core/macro";
import { toast } from "@heroui/react";
import { friendlyError, msg as sharedMsg } from "@/shared/messages";
import { RemoteClientError, isRemoteTransportFailure } from "@/shared/remote/client";
import { REMOTE_SOCKET_POLICY } from "@/shared/remote/socketPolicy";
import { REMOTE_BROWSER_FORWARD_VERSION } from "@/shared/remote/protocol";
import { REMOTE_MEMORY_CATALOG_VERSION } from "@/shared/memory";
import {
  environmentAdvertisesRuntimeHistoryNotices,
  forgetRuntimeHistoryNoticesCapability,
  noteRuntimeHistoryNoticesCapability,
} from "@/renderer/state/remote/historyNoticeCapability";
import { clearThreadHistoryNoticesForAuthority } from "@/renderer/state/remote/historyNoticeStore";
import { purgeRecentHistoryForConnection } from "@/renderer/browser/recentHistoryCache";
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
import {
  environmentAdvertisesBulkThreadRemoval,
  forgetBulkThreadRemovalCapability,
  noteBulkThreadRemovalCapability,
} from "@/renderer/state/remote/bulkThreadRemovalCapability";
import { readBridge } from "@/renderer/bridge";
import { i18n } from "@/renderer/i18n/i18n";
import { remoteThreadId } from "@/renderer/state/remoteProjection";
import { pruneLiveObservedCrossagentItems } from "@/renderer/state/slices/staleSubAgents";
import { forgetHistoryBaselines } from "@/renderer/state/historyBaselines";
import { releaseRemoteTerminalsForServer } from "@/renderer/remoteProcedureRouter";
import { waitForHostUpdateReconnect } from "./hostUpdateReconnect";
import { clearRemoteGitState } from "./gitState";
import { disposeDirectImageSession } from "./directImages";
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
  remoteServerHostSession,
} from "./eventSocketRegistry";
import { hasLiveRemoteServerEventSocket } from "./eventSocketLiveness";
import { notePairedItemInterestCoverage } from "./pairedItemInterests";
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
import {
  resetRemoteTerminalFeed,
  setRemoteTerminalSocketSender,
} from "@/renderer/state/remoteTerminalFeed";
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
  setAgentVisionSocketSender(desktopId, null);
  // A pending debounced snapshot refresh for this server is now moot; cancel it
  // so a closed/removed server never fires a late GET (finding #5).
  clearRemoteServerRefreshTimer(desktopId);
  const entry = getRemoteServerEventSocketEntry(desktopId);
  deleteRemoteServerEventSocketEntry(desktopId);
  if (!options.preserveReplayState) {
    deleteRemoteServerSnapshotSeq(desktopId);
    clearRemoteThreadAppliedSeqs(desktopId);
    forgetHistoryBaselines(remoteServerHostSession(desktopId));
    takeRemoteServerRowResyncPending(desktopId);
  }
  if (options.preserveReplayState) setRemoteTerminalSocketSender(desktopId, null);
  else resetRemoteTerminalFeed(desktopId);
  if (!entry) return;
  entry.disposeFrames?.();
  entry.dispose?.();
  if (entry.reconnectTimer) {
    clearTimeout(entry.reconnectTimer);
    entry.reconnectTimer = null;
  }
  clearRemoteServerEventSocketConnectTimeout(entry);
  clearRemoteServerEventSocketHealth(entry);
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

/** Coalesced per-connection reconnect passes so one offline host never stalls others. */
interface InFlightConnectionAttempt {
  readonly promise: Promise<void>;
  readonly force: boolean;
}
let hydrationInFlight: Promise<void> | null = null;
const connectInFlightByKey = new Map<string, InFlightConnectionAttempt>();

/** Connections waiting to retry a pass that could not read their saved
 * credentials (a transient vault failure must not end the ladder). */
const credentialRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** A connect pass (descriptor, snapshot, socket start) is running for this connection. */
export function isRemoteConnectAttemptInFlight(connectionKey: string): boolean {
  return connectInFlightByKey.has(connectionKey);
}
const connectSeqByKey = new Map<string, number>();

export function __resetConnectAllForTest(): void {
  hydrationInFlight = null;
  connectInFlightByKey.clear();
  connectSeqByKey.clear();
  for (const timer of credentialRetryTimers.values()) clearTimeout(timer);
  credentialRetryTimers.clear();
}

export interface SessionReconnectActionDeps extends RemoteServersStoreApi {
  readonly setRemoteServerFailure: RemoteServerClientBindings["setRemoteServerFailure"];
  readonly clientForServer: RemoteServerClientBindings["clientForServer"];
  readonly restoreStoredCredentials: RemoteServerClientBindings["restoreStoredCredentials"];
  readonly withClient: RemoteServerClientBindings["withClient"];
  readonly disposeSessionRenewal: RemoteServerClientBindings["disposeSessionRenewal"];
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
    restoreStoredCredentials,
    withClient,
    disposeSessionRenewal,
    checkHostUpdateInBackground,
    startRemoteServerEventStream,
    persistHasHydrated,
    persistRehydrate,
  } = deps;

  /** Online with an open event socket on the record's current endpoint: the
   * live stream already keeps this server current, so a reconnect pass that is
   * not forced must not downgrade it to "connecting" or re-snapshot it. */
  const isLiveConnection = (server: RemoteServerRecord): boolean => {
    const connectionKey = remoteConnectionKey(server);
    return (
      get().runtime[connectionKey]?.status === "online" &&
      getRemoteServerEventSocketEntry(connectionKey)?.serverKey === server.endpoint &&
      hasLiveRemoteServerEventSocket(connectionKey)
    );
  };

  const setServersConnecting = (
    servers: readonly RemoteServerRecord[],
    options: { readonly keepKnownFailure?: boolean } = {},
  ) => {
    if (servers.length === 0) return;
    set((state) => {
      const runtime = { ...state.runtime };
      for (const server of servers) {
        // Every runtime/app row is keyed by the connection key, never the host
        // identity: an environment record's desktopId is the child host, and a
        // direct pairing of that child has its own row.
        const connectionKey = remoteConnectionKey(server);
        const current = state.runtime[connectionKey];
        // An automatic pass (mount, tab switch, network change) retries an
        // offline or failed host in the background: it stays offline until
        // the attempt proves otherwise, instead of flipping to "connecting"
        // for a full request deadline on every pass.
        if (
          options.keepKnownFailure === true &&
          (current?.status === "offline" || current?.status === "error")
        ) {
          continue;
        }
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
    try {
      const restore = restoreStoredCredentials(connectionKey);
      if (restore) await restore;
      if (!canContinue()) return;
      const current = get().servers.find((entry) => remoteConnectionKey(entry) === connectionKey);
      if (!current) return;
      server = current;
    } catch (error) {
      if (!canContinue()) return;
      // The saved credentials could not be read right now (an IndexedDB
      // hiccup or timeout). That is no refusal: stay offline and keep
      // retrying the pass, so nobody has to press Reconnect.
      setRemoteServerFailure(connectionKey, "offline", friendlyError(error));
      scheduleCredentialRetry(connectionKey);
      return;
    }
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
        const endpoint = normalizeEndpoint(launched.endpoint);
        // The tunnel owns only the endpoint: a bearer rotated or a label
        // renamed while it started stays on the current record.
        set((state) => ({
          servers: state.servers.map((candidate) =>
            remoteConnectionKey(candidate) === connectionKey
              ? { ...candidate, endpoint }
              : candidate,
          ),
        }));
        const current = get().servers.find(
          (candidate) => remoteConnectionKey(candidate) === connectionKey,
        );
        if (!current) return;
        server = current;
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
    const environmentPromise = clientForServer(server).environment({
      timeoutMs: REMOTE_SOCKET_POLICY.connectTimeoutMs,
    });
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
      noteBulkThreadRemovalCapability(
        connectionKey,
        environmentAdvertisesBulkThreadRemoval(environment),
      );
      // Narrow catalog mutations (reorder / workspace / draft config) ride the
      // same descriptor fact: a host that does not advertise them keeps the
      // paired sidebar's intents local instead of receiving a command it
      // cannot persist.
      noteCatalogMutationsCapability(
        connectionKey,
        environmentAdvertisesCatalogMutations(environment),
      );
      const negotiated = {
        remoteLabel: environment.label,
        appVersion: environment.appVersion,
        // Assigned unconditionally so an authoritative descriptor that
        // drops the capability clears any stale support flag.
        browserForwardAvailable:
          environment.capabilities?.browserForward?.versions.includes(
            REMOTE_BROWSER_FORWARD_VERSION,
          ) ?? false,
        memoryCatalogAvailable:
          environment.capabilities?.memoryCatalog?.versions.includes(
            REMOTE_MEMORY_CATALOG_VERSION,
          ) ?? false,
        ...(environment.platform ? { platform: environment.platform } : {}),
        ...(environment.hostMode ? { hostMode: environment.hostMode } : {}),
      };
      let hostCapabilities: HostServiceCapabilities;
      try {
        hostCapabilities = await clientForServer(server).describeHost();
      } catch {
        // A failed negotiation must not retain previously advertised services.
        hostCapabilities = UNKNOWN_HOST_SERVICE_CAPABILITIES;
      }
      // Either outcome commits only for this attempt: a re-pair or removal
      // while describe was pending owns the record now.
      if (!canContinue()) return;
      const current = get().servers.find(
        (candidate) =>
          remoteConnectionKey(candidate) === connectionKey &&
          candidate.endpoint === server.endpoint,
      );
      if (!current) return;
      // Negotiation owns only descriptor metadata. Everything else (a bearer
      // rotated meanwhile, scopes, transport, a local rename) stays current.
      const keepsLocalAlias =
        current.remoteLabel !== undefined && current.label !== current.remoteLabel;
      const updated: RemoteServerRecord = {
        ...current,
        ...negotiated,
        label: keepsLocalAlias ? current.label : environment.label,
        hostCapabilities,
        // A record persisted before per-pairing cache ids gains one only after
        // this authenticated read proved the host it was paired with.
        ...(current.recentHistoryCacheId === undefined &&
        environment.desktopId === current.desktopId
          ? { recentHistoryCacheId: crypto.randomUUID() }
          : {}),
      };
      server = updated;
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
      // An unreachable host answers neither read. Report it once the short
      // reachability probe gives up instead of holding "connecting" for the
      // snapshot's full request deadline; a later snapshot success still
      // marks it online. refreshServer owns every other visible error.
      if (
        isRemoteTransportFailure(error) &&
        get().runtime[connectionKey]?.status === "connecting" &&
        !hasLiveRemoteServerEventSocket(connectionKey)
      ) {
        setRemoteServerFailure(connectionKey, "offline", sharedMsg("remote.server.unreachable"));
      }
    }
    await refreshPromise;
    if (!canContinue()) return;
    const current = get().servers.find(
      (candidate) => remoteConnectionKey(candidate) === connectionKey,
    );
    if (!current) return;
    server = current;
    const statusAfterRefresh = get().runtime[connectionKey]?.status;
    await startRemoteServerEventStream(server, initialTerminalCapabilities, {
      ...options,
      ...(statusAfterRefresh === "offline" ? { deferInitialConnect: true } : {}),
    });
    if (statusAfterRefresh === "online") {
      checkHostUpdateInBackground(server);
    }
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
    // A slow restart is not the end: hand the host back to the normal
    // reconnect ladder (it stays offline until a socket is live) instead of
    // waiting for the user to press Reconnect.
    if (outcome.type !== "terminal-error") void connectServerEntry(persistedKey, false);
  };

  const scheduleCredentialRetry = (connectionKey: string): void => {
    if (credentialRetryTimers.has(connectionKey)) return;
    const timer = setTimeout(() => {
      credentialRetryTimers.delete(connectionKey);
      if (!get().servers.some((entry) => remoteConnectionKey(entry) === connectionKey)) return;
      if (get().runtime[connectionKey]?.status === "online") return;
      void connectServerEntry(connectionKey, false);
    }, REMOTE_SOCKET_POLICY.reconnectMaxMs);
    credentialRetryTimers.set(connectionKey, timer);
  };

  const connectServerEntry = (
    connectionKey: string,
    forceTransportReconnect: boolean,
    explicit = false,
  ): Promise<void> => {
    const existing = connectInFlightByKey.get(connectionKey);
    if (existing && (!forceTransportReconnect || existing.force)) {
      return existing.promise;
    }
    const server = get().servers.find((entry) => remoteConnectionKey(entry) === connectionKey);
    if (!server || get().hostUpdateRestarts[connectionKey] !== undefined) {
      return Promise.resolve();
    }
    if (!forceTransportReconnect && isLiveConnection(server)) {
      return Promise.resolve();
    }
    const seq = (connectSeqByKey.get(connectionKey) ?? 0) + 1;
    connectSeqByKey.set(connectionKey, seq);
    if (forceTransportReconnect) {
      // Requests from before the network change can linger until their deadlines.
      // Fence their snapshots before starting the replacement connection.
      invalidateRemoteServerRefresh(connectionKey);
      closeRemoteServerEventSocket(connectionKey, { preserveReplayState: true });
    }
    setServersConnecting([server], { keepKnownFailure: !explicit });
    const attempt: InFlightConnectionAttempt = {
      force: forceTransportReconnect,
      promise: connectServer(
        server,
        () => connectSeqByKey.get(connectionKey) === seq,
        forceTransportReconnect ? { resyncInterestedThreads: true } : undefined,
      ).finally(() => {
        if (connectInFlightByKey.get(connectionKey) === attempt) {
          connectInFlightByKey.delete(connectionKey);
        }
      }),
    };
    connectInFlightByKey.set(connectionKey, attempt);
    return attempt.promise;
  };

  return {
    connectAll: async (options: { readonly forceTransportReconnect?: boolean } = {}) => {
      // The secure browser vault hydrates asynchronously. Sidebar mount
      // can otherwise observe the empty initial state, finish a no-op
      // connection pass, and never reconnect the restored servers.
      if (!persistHasHydrated()) {
        if (!hydrationInFlight) {
          hydrationInFlight = persistRehydrate().finally(() => {
            hydrationInFlight = null;
          });
        }
        await hydrationInFlight;
      }
      const forceTransportReconnect = options.forceTransportReconnect === true;
      await Promise.all(
        get().servers.map((server) =>
          connectServerEntry(remoteConnectionKey(server), forceTransportReconnect),
        ),
      );
    },

    verifyConnections: async () => {
      const toReconnect: string[] = [];
      for (const server of get().servers) {
        const key = remoteConnectionKey(server);
        const entry = getRemoteServerEventSocketEntry(key);
        if (isLiveConnection(server)) {
          // Force a fresh, bounded probe on foreground resume so a pre-sleep
          // pending ping never hides a suspended/dead mobile socket.
          if (entry?.socket) {
            entry.health?.probe(entry.socket, {
              force: true,
              timeoutMs: REMOTE_SOCKET_POLICY.resumeHealthPingTimeoutMs,
            });
          }
          continue;
        }
        // An offline peer that already has its own backoff reconnect loop
        // running should stay on that loop instead of flapping "connecting"
        // and starting duplicate hanging HTTP fetches on every tab switch.
        const runtimeStatus = get().runtime[key]?.status;
        if (
          runtimeStatus === "offline" &&
          entry &&
          (entry.connecting || entry.reconnectTimer !== null)
        ) {
          // Returning to the app is fresh evidence: run the ladder's next
          // attempt now rather than waiting out a backoff the suspended page
          // could not count down, without flipping the status.
          entry.nudge?.();
          continue;
        }
        toReconnect.push(key);
      }
      if (toReconnect.length > 0) {
        await Promise.all(toReconnect.map((key) => connectServerEntry(key, false)));
      }
    },

    reconnectServer: async (connectionKey: string) => {
      if (get().hostUpdateRestarts[connectionKey] !== undefined) return;
      const server = get().servers.find((entry) => remoteConnectionKey(entry) === connectionKey);
      if (!server) return;
      connectSeqByKey.set(connectionKey, (connectSeqByKey.get(connectionKey) ?? 0) + 1);
      connectInFlightByKey.delete(connectionKey);
      // A user-initiated reconnect shows "connecting" even from offline.
      await connectServerEntry(connectionKey, true, true);
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
        const credentialRetry = credentialRetryTimers.get(key);
        if (credentialRetry !== undefined) clearTimeout(credentialRetry);
        credentialRetryTimers.delete(key);
        connectSeqByKey.set(key, (connectSeqByKey.get(key) ?? 0) + 1);
        connectInFlightByKey.delete(key);
        disposeDirectImageSession(key);
        setRemoteHostUpdateReconnectSeq(key, nextRemoteHostUpdateSequence());
        deleteRemoteHostUpdateRequestSeq(key);
        invalidateRemoteServerRefresh(key);
        closeRemoteServerEventSocket(key);
        forgetHistoryBaselines(remoteServerHostSession(key));
        disposeSessionRenewal(key);
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
        forgetBulkThreadRemovalCapability(key);
        forgetCatalogMutationsCapability(key);
        clearThreadHistoryNoticesForAuthority(key);
        // Its on-device recent tails go with it; the generation bump above
        // already fences any read or write still in flight.
        void purgeRecentHistoryForConnection(key);
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
        notePairedItemInterestCoverage(key, false);
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
          // The connection identity is gone: its client-owned Home thread pins
          // (including cascaded environment children) must not attach to a
          // future re-pair. Only full thread ids for this exact connection.
          const previousHomeThreadWorkspaceIds = state.homeThreadWorkspaceIds ?? {};
          const threadPrefix = remoteThreadId(key, "");
          const homeThreadWorkspaceIds = Object.fromEntries(
            Object.entries(previousHomeThreadWorkspaceIds).filter(
              ([threadId]) => !threadId.startsWith(threadPrefix),
            ),
          );
          return {
            servers: state.servers.filter((candidate) => remoteConnectionKey(candidate) !== key),
            runtime,
            hostUpdates,
            hostUpdateRestarts,
            lastKnownProjects: removeCachedProjects(state.lastKnownProjects, key),
            ...(Object.keys(homeThreadWorkspaceIds).length ===
            Object.keys(previousHomeThreadWorkspaceIds).length
              ? {}
              : { homeThreadWorkspaceIds }),
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
      const reconnectGeneration = remoteHostUpdateReconnectSeq(connectionKey);
      try {
        await withClient(connectionKey, (client) => client.installHostUpdate());
      } catch (error) {
        if (
          error instanceof RemoteClientError &&
          error.code === "host_update_not_ready" &&
          remoteHostUpdateReconnectSeq(connectionKey) === reconnectGeneration
        ) {
          // The host rejection is authoritative; fence polls that still report
          // the old download so they cannot bring back the install action.
          setRemoteHostUpdateRequestSeq(connectionKey, nextRemoteHostUpdateSequence());
          set((state) => {
            const { [connectionKey]: _stale, ...hostUpdates } = state.hostUpdates;
            return { hostUpdates };
          });
        }
        throw error;
      }
      if (!server || status?.type !== "downloaded") return;
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
