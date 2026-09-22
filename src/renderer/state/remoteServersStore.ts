import { TERMINAL_CURSOR_SYNC_V2_VERSION } from "@/shared/remote/protocol";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BrowseHostDirectoryResult } from "@/shared/contracts";
import { RemoteDesktopClient } from "@/shared/remote/client";
import {
  registerRemoteProcedureHost,
  resetRemoteProcedureRouterForTest,
} from "@/renderer/remoteProcedureRouter";
import { __resetTruncateRecoveryForTest } from "@/renderer/state/remote/truncateRecovery";
import { useAppStore } from "@/renderer/state/appStore";
import { remoteOwner } from "@/renderer/state/remoteProjection";
import {
  resetRemoteTerminalFeed,
  setRemoteTerminalSocketSender,
} from "@/renderer/state/remoteTerminalFeed";
import { pickAndUploadBrowserFiles } from "@/renderer/utils/browserFilePicker";
import {
  createTerminalFeedConnections,
  type TerminalConnectionCapabilities,
} from "@/renderer/state/remoteServers/terminalCapabilities";
import { mainProcessFetch } from "@/renderer/state/remoteServers/mainProcessFetch";
import { electronCertFingerprintProbe } from "@/renderer/state/remoteServers/certFingerprintProbe";
import { persistedRemoteServersState } from "@/renderer/state/remoteServers/projectCache";
import { clearRemoteGitState } from "@/renderer/state/remoteServers/gitState";
import { withRemoteProjectSync } from "@/renderer/state/remoteServers/projectSync";
import { syncRemoteAppRows } from "@/renderer/state/remoteServers/appRows";
import {
  getRemoteServerEventSocketEntry,
  markRemoteServerCursorSyncV2,
  __resetEventSocketRegistryForTest,
} from "@/renderer/state/remoteServers/eventSocketRegistry";
import type {
  RemoteClientFactory,
  RemoteServerRecord,
  RemoteServersState,
  RemoteSocketFactory,
  RemoteSocketLike,
} from "@/renderer/state/remoteServers/types";
import { createSecureRemoteServersStorage } from "@/renderer/state/remoteServers/secureStorage";
import { __resetBrowserBridgeForTest } from "@/renderer/state/remoteServers/browserBridge";
import { __resetBoundedCatalogForTest } from "@/renderer/state/remoteServers/catalog/boundedCatalogController";
import { __resetCatalogOrderFencesForTest } from "@/renderer/state/remoteServers/catalog/catalogOrderFence";
import { __resetCatalogMutationsCapabilityForTest } from "@/renderer/state/remote/catalogMutationsCapability";
import { __resetBoundedHistoryForTest } from "@/renderer/state/remoteServers/catalog/boundedHistory";
import {
  sendClientProjectCommand,
  sendClientThreadCommand,
} from "@/renderer/state/remoteServers/catalog/clientCatalogCommands";
import { hostSupportsProjectCommandResultsForConnection } from "@/renderer/state/remote/projectCommandResultsCapability";
import {
  scheduleServerRefresh as scheduleRemoteServerRefresh,
  __resetConnectionRefreshForTest,
} from "@/renderer/state/remoteServers/connectionRefresh";
import { startRemoteServerEventStream as startRemoteServerEventStreamSession } from "@/renderer/state/remoteServers/eventSocketSession";
import {
  deleteRefreshTokenFromVault,
  hydrateRefreshTokens,
  refreshTokenForSubject,
  rememberRefreshTokenForSubject,
  writeRefreshTokenToVault,
  __peekRefreshTokenForTest,
  type RefreshSubject,
  type RemoteEnvironmentGrantSubject,
} from "@/renderer/state/remoteServers/refreshTokens";
import { createRemoteServerClientBindings } from "@/renderer/state/remoteServers/storeClient";
import {
  configureEnvironmentSessions,
  environmentChildGrantSubject,
  environmentImageUrl,
  requestEnvironmentImage,
  subscribeEnvironmentImage,
  __resetEnvironmentSessionsForTest,
} from "@/renderer/state/remoteServers/environmentSessions";
import {
  environmentTransportHasParent,
  remoteConnectionKey,
} from "@/renderer/state/remoteServers/types";
import {
  certPinForDesktop,
  createPairingActions,
  getStandaloneOwnerDesktopId,
  getStandaloneOwnerGeneration,
  __resetStandaloneOwnerForTest,
} from "@/renderer/state/remoteServers/pairing";
import {
  closeAllRemoteServerEventSockets,
  closeRemoteServerEventSocket,
  createSessionReconnectActions,
  __resetConnectAllForTest,
} from "@/renderer/state/remoteServers/sessionReconnect";
import {
  buildOpenThread,
  createSnapshotProjectionActions,
  __resetOpenRemoteThreadRequestSeqForTest,
} from "@/renderer/state/remoteServers/snapshotProjection";

export {
  selectBrowserBridgeDesktop,
  selectBrowserBridgeServer,
  selectBrowserPanelAvailable,
} from "@/renderer/state/remoteServers/browserBridge";

export { getStandaloneOwnerDesktopId, getStandaloneOwnerGeneration, __resetStandaloneOwnerForTest };

/**
 * Renderer remote-servers store v1 → v2 migration (pure, fixture-tested).
 *
 * v2 makes `connectionId` the per-connection key. Every v1 record is a
 * direct/ssh pairing, so `connectionId = desktopId` preserves persisted
 * projections, certificate-pin keys, and vault keys byte-for-byte. A v1
 * document can never contain an environment record (the transport kind is new),
 * so no other rewrite is needed.
 */
export function migrateRemoteServersPersistedState(
  persistedState: unknown,
  version: number,
): RemoteServersState {
  const state = (persistedState ?? {}) as RemoteServersState & {
    servers?: RemoteServerRecord[];
  };
  if (version >= 2) return state;
  const servers = (state.servers ?? []).map((server) => ({
    ...server,
    connectionId: server.connectionId ?? server.desktopId,
  }));
  return { ...state, servers } as RemoteServersState;
}

export { hydrateRefreshTokens, __peekRefreshTokenForTest };

/**
 * Desktop-as-client. Lets the Electron desktop connect to *other* Poracode
 * servers (another desktop's remote access, or a headless `pnpm run server`)
 * and surface their projects in the sidebar — the mirror image of the PWA,
 * which connects to a single desktop. See docs/REMOTE_ARCHITECTURE.md, Phase 4.
 *
 * Connection bookkeeping (endpoint + bearer token + label) is persisted to
 * localStorage; live snapshot data is kept in memory and re-fetched on connect.
 */

const defaultClientFactory: RemoteClientFactory = (endpoint, accessToken) =>
  new RemoteDesktopClient(endpoint, accessToken, mainProcessFetch, {
    certFingerprintProbe: electronCertFingerprintProbe,
  });

const defaultSocketFactory: RemoteSocketFactory = (url) =>
  new WebSocket(url) as unknown as RemoteSocketLike;

export const useRemoteServersStore = create<RemoteServersState>()(
  persist(
    (set, get) => {
      configureEnvironmentSessions({
        getState: get,
        clientFactory: () => get().clientFactory,
        certPinForConnection: certPinForDesktop,
        refreshTokenForSubject,
        rememberRefreshToken: rememberRefreshTokenForSubject,
        writeRefreshTokenToVault,
        deleteRefreshTokenFromVault,
      });
      const {
        setRemoteServerFailure,
        reportRemoteServerError,
        clientForServer,
        requireClient,
        withClient,
        checkHostUpdateInBackground,
      } = createRemoteServerClientBindings({ set, get }, certPinForDesktop);

      const terminalConnections = createTerminalFeedConnections(
        (desktopId, sender, capabilities) => {
          if (capabilities.cursorSyncVersion === TERMINAL_CURSOR_SYNC_V2_VERSION) {
            markRemoteServerCursorSyncV2(desktopId, true);
          } else {
            markRemoteServerCursorSyncV2(desktopId, false);
          }
          setRemoteTerminalSocketSender(desktopId, sender, capabilities);
        },
        (desktopId, socket) => getRemoteServerEventSocketEntry(desktopId)?.socket === socket,
      );
      const activateRemoteTerminalFeed = terminalConnections.activate;

      const startRemoteServerEventStream = async (
        server: RemoteServerRecord,
        initialCapabilities?: TerminalConnectionCapabilities,
        options: { readonly resyncInterestedThreads?: boolean } = {},
      ): Promise<void> =>
        startRemoteServerEventStreamSession({
          server,
          ...(initialCapabilities !== undefined ? { initialCapabilities } : {}),
          options,
          set,
          get,
          setRemoteServerFailure,
          closeRemoteServerEventSocket,
          activateRemoteTerminalFeed,
          rememberTerminalConnection: terminalConnections.remember,
          clientForServer,
          buildOpenThread,
        });

      const pairing = createPairingActions({
        set,
        get,
        checkHostUpdateInBackground,
        startRemoteServerEventStream,
      });
      const session = createSessionReconnectActions({
        set,
        get,
        setRemoteServerFailure,
        clientForServer,
        withClient,
        checkHostUpdateInBackground,
        startRemoteServerEventStream,
        persistHasHydrated: () => useRemoteServersStore.persist.hasHydrated(),
        persistRehydrate: async () => {
          await useRemoteServersStore.persist.rehydrate();
        },
      });
      const projection = createSnapshotProjectionActions({
        set,
        get,
        withClient,
        clientForServer,
        reportRemoteServerError,
        startRemoteServerEventStream,
        activateRemoteTerminalFeed,
      });

      return {
        servers: [],
        runtime: {},
        hostUpdates: {},
        hostUpdateRestarts: {},
        excludedProjectIds: {},
        projectWorkspaceIds: {},
        projectNameOverrides: {},
        lastKnownProjects: {},
        openThread: null,
        clientFactory: defaultClientFactory,
        socketFactory: defaultSocketFactory,
        setClientFactory: (factory) => {
          closeAllRemoteServerEventSockets();
          set({ clientFactory: factory });
        },
        setSocketFactory: (factory) => {
          closeAllRemoteServerEventSockets();
          set({ socketFactory: factory });
        },

        launchRemoteThread: projection.launchRemoteThread,
        openRemoteThread: projection.openRemoteThread,
        closeRemoteThread: projection.closeRemoteThread,
        sendThreadCommand: async (desktopId, command, options = {}) => {
          await withClient(desktopId, (client) =>
            sendClientThreadCommand(client, command, options),
          );
          get().scheduleServerRefresh(desktopId);
        },

        pairServer: pairing.pairServer,
        ensureStandaloneOwner: pairing.ensureStandaloneOwner,
        pairSshServer: pairing.pairSshServer,
        renameServer: (connectionKey, label) => {
          set((state) => {
            const server = state.servers.find(
              (candidate) => remoteConnectionKey(candidate) === connectionKey,
            );
            if (!server || server.label === label) return {};
            return {
              servers: state.servers.map((candidate) =>
                remoteConnectionKey(candidate) === connectionKey
                  ? { ...candidate, label, remoteLabel: candidate.remoteLabel ?? candidate.label }
                  : candidate,
              ),
            };
          });
        },
        removeServer: session.removeServer,
        refreshServer: projection.refreshServer,
        scheduleServerRefresh: (desktopId, options = {}) => {
          scheduleRemoteServerRefresh(get, desktopId, options);
        },
        connectAll: session.connectAll,
        reconnectServer: session.reconnectServer,
        getHostUpdateState: session.getHostUpdateState,
        checkHostUpdate: session.checkHostUpdate,
        installHostUpdate: session.installHostUpdate,

        setProjectNameOverride: (desktopId, remoteId, name) => {
          set((state) => ({
            projectNameOverrides: {
              ...state.projectNameOverrides,
              [desktopId]: {
                ...state.projectNameOverrides[desktopId],
                [remoteId]: name,
              },
            },
          }));
        },

        setRemoteProjectSynced: (desktopId, remoteId, synced) => {
          const current = get().excludedProjectIds;
          const next = withRemoteProjectSync(current, desktopId, remoteId, synced);
          if (next === current) return;
          set({ excludedProjectIds: next });
          // Re-mirror from the cached snapshot. Selection is local state, so
          // adding or dropping a project never needs the server to be reachable.
          const runtime = get().runtime[desktopId];
          if (runtime) syncRemoteAppRows(desktopId, runtime.projects, runtime.threads);
        },

        runProjectCommand: async (desktopId, command, options = {}) => {
          // Declare the bounded result mode only for a connection whose fresh
          // descriptor advertised it; every other host keeps the complete
          // legacy response (and receives no unsupported declaration). The
          // explicit per-operation id the mode requires is minted in the
          // shared command seam, which also honors a caller's reused id.
          await withClient(desktopId, (client) =>
            sendClientProjectCommand(client, command, {
              ...options,
              ...(hostSupportsProjectCommandResultsForConnection(desktopId)
                ? { result: "bounded" as const }
                : {}),
            }),
          );
          if (command.kind === "update") {
            get().scheduleServerRefresh(desktopId);
          } else {
            await get().refreshServer(desktopId);
          }
        },

        browseHostDirectory: async (desktopId, path) => {
          return (await withClient(desktopId, (client) =>
            client.callRemoteProcedure("browseHostDirectory", { path }),
          )) as BrowseHostDirectoryResult;
        },

        withClient,

        saveClipboardImage: (desktopId, input) => {
          return withClient(desktopId, (client) =>
            client.uploadAttachment({
              threadId: input.threadId,
              fileName: `clipboard-${crypto.randomUUID()}.${input.extension}`,
              data: input.data,
            }),
          );
        },

        pickAndUploadFiles: async (desktopId, attachmentThreadId) => {
          return withClient(desktopId, (client) =>
            pickAndUploadBrowserFiles({
              attachmentThreadId,
              upload: (input) => client.uploadAttachment(input),
            }),
          );
        },

        localImageUrl: (connectionKey, path) => {
          try {
            return requireClient(connectionKey).localImageUrl(path);
          } catch {
            return "";
          }
        },

        imageRefUrl: (connectionKey, ref) => {
          try {
            return requireClient(connectionKey).imageRefUrl(ref);
          } catch {
            return "";
          }
        },

        listEnvironmentDependents: (connectionKey) => {
          const parentRef = { kind: "connection", connectionId: connectionKey } as const;
          return get().servers.filter(
            (server) =>
              server.transport?.kind === "environment" &&
              environmentTransportHasParent(server.transport, parentRef),
          );
        },

        resolveEnvironmentImage: (connectionKey, key) => environmentImageUrl(connectionKey, key),

        requestEnvironmentImage: (connectionKey, target) => {
          requestEnvironmentImage(connectionKey, target);
        },

        subscribeEnvironmentImage: (connectionKey, key, listener, target) =>
          subscribeEnvironmentImage(connectionKey, key, listener, target),
      };
    },
    {
      name: "poracode-remote-servers",
      storage: createSecureRemoteServersStorage((servers) => ({
        servers,
        excludedProjectIds: {},
        projectWorkspaceIds: {},
        projectNameOverrides: {},
        lastKnownProjects: {},
      })),
      // Persist durable connection identity and
      // last-known projects so offline servers keep their sidebar rows. Live
      // runtime state and threads are re-fetched on connect; socket/client
      // factories stay process-local. Bearer tokens live in the native OS
      // keystore or the browser/Electron WebCrypto vault, not plaintext storage.
      partialize: persistedRemoteServersState,
      version: 2,
      /**
       * v1 → v2: `connectionId` becomes the per-connection key.
       *
       * For every existing record `connectionId = desktopId`, so direct/ssh
       * records stay byte-identical in behavior; persisted projections, vault
       * keys, and certificate pins keep their v1 identifiers. Environment
       * records never exist in a v1 document, so no other rewrite is needed.
       * v1's reserved `null` in projectWorkspaceIds (explicit "unfiled")
       * remains valid.
       */
      migrate: (persistedState, version) =>
        migrateRemoteServersPersistedState(persistedState, version),
      // Gate 6 item 4.6 (S6): once the persisted server records land, fill the
      // synchronous refresh-token map from the encrypted vault, so the first
      // 401 of any session can already refresh transparently. Runs out of the
      // connectAll path on purpose — connectAll keeps its synchronous
      // "connecting" state contract. Environment records hydrate their
      // parent-scoped child grant in addition to the record key; a persisted
      // remote-environment grant still at the pre-correction
      // `refresh.environment.<parent>.<envId>` slot migrates only when that
      // slot is unambiguously the environment's (never a direct record's own
      // grant), and only after a strict vault write succeeded.
      onRehydrateStorage: () => (state) => {
        if (!state?.servers?.length) return;
        const subjects: RefreshSubject[] = [];
        const legacyRemoteEnvironmentSubjects: RemoteEnvironmentGrantSubject[] = [];
        const directConnectionIds = new Set<string>();
        for (const server of state.servers) {
          const connectionKey = remoteConnectionKey(server);
          subjects.push({ kind: "connection", connectionId: connectionKey });
          if (server.transport?.kind === "environment") {
            const grant = environmentChildGrantSubject(server.transport);
            if (grant) {
              subjects.push(grant);
              if (grant.kind === "remoteEnvironmentGrant") {
                legacyRemoteEnvironmentSubjects.push(grant);
              }
            }
          } else {
            directConnectionIds.add(connectionKey);
          }
        }
        void hydrateRefreshTokens({
          subjects,
          legacyRemoteEnvironmentSubjects,
          directConnectionIds,
        });
      },
    },
  ),
);

registerRemoteProcedureHost({
  resolveThreadOwner: (threadId) => {
    const thread = useAppStore.getState().threads.find((candidate) => candidate.id === threadId);
    return remoteOwner(thread);
  },
  resolveProjectOwner: (projectId) => {
    const project = useAppStore.getState().projects.find((candidate) => candidate.id === projectId);
    return remoteOwner(project);
  },
  resolveDesktopOwner: () => {
    // Standalone-attach and browser runtimes answer desktop-scoped calls
    // (schedules, skill marketplace) on their single attached desktop. The
    // managed desktop has no standalone owner — its loopback host supplies
    // its own desktop id instead.
    const desktopId = getStandaloneOwnerDesktopId();
    return desktopId ? { desktopId } : undefined;
  },
  withClient: (desktopId, invoke) => useRemoteServersStore.getState().withClient(desktopId, invoke),
});

/**
 * Test-only: tear down all process-local connection state (event sockets,
 * debounce/refresh timers, terminal feed, and seq cursors) so each test starts
 * from a clean slate. Pairing opens an event socket, so leaked module state
 * would otherwise bleed across tests.
 */
export function __resetRemoteServersStoreForTest(): void {
  closeAllRemoteServerEventSockets();
  __resetEnvironmentSessionsForTest();
  __resetStandaloneOwnerForTest();
  __resetConnectionRefreshForTest();
  __resetBoundedCatalogForTest();
  __resetCatalogOrderFencesForTest();
  __resetCatalogMutationsCapabilityForTest();
  __resetBoundedHistoryForTest();
  __resetEventSocketRegistryForTest();
  __resetTruncateRecoveryForTest();
  clearRemoteGitState();
  resetRemoteProcedureRouterForTest();
  __resetConnectAllForTest();
  __resetBrowserBridgeForTest();
  __resetOpenRemoteThreadRequestSeqForTest();
  resetRemoteTerminalFeed();
  useAppStore.setState((state) => ({
    projects: state.projects.filter((project) => !project.remoteServerId),
    threads: state.threads.filter((thread) => !thread.remoteServerId),
  }));
  useRemoteServersStore.setState({ openThread: null, hostUpdates: {}, hostUpdateRestarts: {} });
}
