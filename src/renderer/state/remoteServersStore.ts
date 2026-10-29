import { defaultClientFactory, defaultSocketFactory } from "./remoteServers/transportFactories";
import { TERMINAL_CURSOR_SYNC_V2_VERSION } from "@/shared/remote/protocol";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BrowseHostDirectoryResult } from "@/shared/contracts";
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
import { persistedRemoteServersState } from "@/renderer/state/remoteServers/projectCache";
import { clearRemoteGitState } from "@/renderer/state/remoteServers/gitState";
import { withRemoteProjectSync } from "@/renderer/state/remoteServers/projectSync";
import { syncRemoteAppRows } from "@/renderer/state/remoteServers/appRows";
import {
  getRemoteServerEventSocketEntry,
  markRemoteServerCursorSyncV2,
  __resetEventSocketRegistryForTest,
} from "@/renderer/state/remoteServers/eventSocketRegistry";
import type { RemoteServerRecord, RemoteServersState } from "@/renderer/state/remoteServers/types";
import {
  createSecureRemoteServersStorage,
  patchRemoteServersFields,
} from "@/renderer/state/remoteServers/secureStorage";
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
  forgetRefreshTokenForSubject,
  hydrateRefreshTokens,
  refreshTokenForSubject,
  rememberRefreshTokenForSubject,
  writeRefreshTokenToVault,
  __peekRefreshTokenForTest,
  type RefreshHydrationPlan,
  type RefreshSubject,
  type RemoteEnvironmentGrantSubject,
} from "@/renderer/state/remoteServers/refreshTokens";
import { createRemoteServerClientBindings } from "@/renderer/state/remoteServers/storeClient";
import {
  configureEnvironmentSessions,
  environmentChildGrantSubject,
  environmentImageReadinessFor,
  environmentImageUrl,
  requestEnvironmentImage,
  subscribeEnvironmentImage,
  __resetEnvironmentSessionsForTest,
} from "@/renderer/state/remoteServers/environmentSessions";
import {
  __resetDirectImageSessionsForTest,
  directImageUrl,
} from "@/renderer/state/remoteServers/directImages";
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

const REMOTE_SERVERS_STORE_NAME = "poracode-remote-servers";

/** Shared by every renderer realm of this origin; see secureStorage. */
const remoteServersStorage = createSecureRemoteServersStorage<
  ReturnType<typeof persistedRemoteServersState>
>((servers) => ({
  servers,
  excludedProjectIds: {},
  projectWorkspaceIds: {},
  projectNameOverrides: {},
  lastKnownProjects: {},
}));

/**
 * Refresh grants to load for persisted records. Environment records hydrate
 * their parent-scoped child grant in addition to the record key; a persisted
 * remote-environment grant still at the pre-correction
 * `refresh.environment.<parent>.<envId>` slot migrates only when that slot is
 * unambiguously the environment's (never a direct record's own grant), and
 * only after a strict vault write succeeded.
 */
function refreshHydrationPlan(servers: readonly RemoteServerRecord[]): RefreshHydrationPlan {
  const subjects: RefreshSubject[] = [];
  const legacyRemoteEnvironmentSubjects: RemoteEnvironmentGrantSubject[] = [];
  const directConnectionIds = new Set<string>();
  for (const server of servers) {
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
  return { subjects, legacyRemoteEnvironmentSubjects, directConnectionIds };
}

/**
 * Desktop-as-client. Lets the Electron desktop connect to *other* Poracode
 * servers (another desktop's remote access, or a headless `pnpm run server`)
 * and surface their projects in the sidebar — the mirror image of the PWA,
 * which connects to a single desktop. See docs/REMOTE_ARCHITECTURE.md, Phase 4.
 *
 * Connection bookkeeping (endpoint + bearer token + label) is persisted to
 * localStorage; live snapshot data is kept in memory and re-fetched on connect.
 */

export const useRemoteServersStore = create<RemoteServersState>()(
  persist(
    (set, get) => {
      const {
        setRemoteServerFailure,
        reportRemoteServerError,
        persistAccessToken,
        clientForServer,
        requireClient,
        directImagesFor,
        withClient,
        checkHostUpdateInBackground,
      } = createRemoteServerClientBindings({ set, get }, certPinForDesktop, remoteServersStorage);
      configureEnvironmentSessions({
        getState: get,
        clientFactory: () => get().clientFactory,
        persistAccessToken,
        certPinForConnection: certPinForDesktop,
        refreshTokenForSubject,
        rememberRefreshToken: rememberRefreshTokenForSubject,
        writeRefreshTokenToVault,
        deleteRefreshTokenFromVault,
        shared: remoteServersStorage,
      });

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
        closeRemoteServerEventSocket,
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
            const direct = directImagesFor(connectionKey);
            if (direct) return directImageUrl(direct, { kind: "path", path });
            return requireClient(connectionKey).localImageUrl(path);
          } catch {
            return "";
          }
        },

        imageRefUrl: (connectionKey, ref) => {
          try {
            const direct = directImagesFor(connectionKey);
            if (direct) return directImageUrl(direct, { kind: "ref", ref });
            return requireClient(connectionKey).imageRefUrl(ref);
          } catch {
            return "";
          }
        },

        imageReadinessFor: (connectionKey) =>
          environmentImageReadinessFor(connectionKey) ?? directImagesFor(connectionKey)?.readiness,

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
      name: REMOTE_SERVERS_STORE_NAME,
      storage: remoteServersStorage,
      // Persist durable connection identity and
      // last-known projects so offline servers keep their sidebar rows. Live
      // runtime state and threads are re-fetched on connect; socket/client
      // factories stay process-local. Bearer tokens live in the native OS
      // keystore or the browser/Electron WebCrypto vault, not plaintext storage.
      partialize: persistedRemoteServersState,
      // Browser default filings reuse the released string/null project pins.
      // v2 documents, including explicit unfiling and cached projects, remain
      // valid; workspaceFilings.test covers delayed hydration and reload.
      // Token rotation updates existing bearer slots through secure storage;
      // v1/v2 records and encrypted vault keys remain valid without a bump.
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
      // "connecting" state contract.
      onRehydrateStorage: () => (state) => {
        if (!state?.servers?.length) return;
        void hydrateRefreshTokens(refreshHydrationPlan(state.servers));
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
 * Applies what another window or tab committed to the shared records: a
 * removal tears this realm's connection down (its callbacks go inert), an
 * addition or endpoint move loads the vault credentials and connects, and
 * field edits are merged. Keys with pending local writes are left to them.
 */
export function reconcileRemoteServersFromSharedStorage(): Promise<void> {
  return remoteServersStorage.reconcile(REMOTE_SERVERS_STORE_NAME, (changes) => {
    for (const connectionKey of changes.removed) {
      try {
        useRemoteServersStore.getState().removeServer(connectionKey, { cascadeEnvironments: true });
      } catch (error) {
        console.warn("[remoteServers] unable to apply a removal from another window", error);
      }
    }
    useRemoteServersStore.setState((state) => {
      const known = new Set(state.servers.map(remoteConnectionKey));
      const servers = [
        ...state.servers.map((server) => {
          const change = changes.changed.find(
            (candidate) => candidate.key === remoteConnectionKey(server),
          );
          if (!change) return server;
          return {
            ...server,
            ...change.fields,
            ...(change.accessToken !== undefined ? { accessToken: change.accessToken } : {}),
          };
        }),
        ...changes.added.filter((server) => !known.has(remoteConnectionKey(server))),
      ];
      return { servers, ...patchRemoteServersFields(state, changes.fields) };
    });
    const reconnected = useRemoteServersStore
      .getState()
      .servers.filter((server) =>
        [
          ...changes.added.map(remoteConnectionKey),
          ...changes.changed.filter((change) => change.fields.endpoint).map((change) => change.key),
        ].includes(remoteConnectionKey(server)),
      );
    if (reconnected.length === 0) return;
    const plan = refreshHydrationPlan(reconnected);
    for (const subject of plan.subjects) forgetRefreshTokenForSubject(subject);
    void hydrateRefreshTokens(plan).then(() => {
      for (const server of reconnected) {
        void useRemoteServersStore.getState().reconnectServer(remoteConnectionKey(server));
      }
    });
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== null && event.key !== REMOTE_SERVERS_STORE_NAME) return;
    void reconcileRemoteServersFromSharedStorage().catch(() => undefined);
  });
}

/**
 * Test-only: tear down all process-local connection state (event sockets,
 * debounce/refresh timers, terminal feed, and seq cursors) so each test starts
 * from a clean slate. Pairing opens an event socket, so leaked module state
 * would otherwise bleed across tests.
 */
export function __resetRemoteServersStoreForTest(): void {
  __resetDirectImageSessionsForTest();
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
