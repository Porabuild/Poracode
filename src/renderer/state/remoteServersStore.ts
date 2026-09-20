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
import { remoteOwner, remoteProjectId } from "@/renderer/state/remoteProjection";
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
import {
  scheduleServerRefresh as scheduleRemoteServerRefresh,
  __resetConnectionRefreshForTest,
} from "@/renderer/state/remoteServers/connectionRefresh";
import { startRemoteServerEventStream as startRemoteServerEventStreamSession } from "@/renderer/state/remoteServers/eventSocketSession";
import {
  hydrateRefreshTokens,
  __peekRefreshTokenForTest,
} from "@/renderer/state/remoteServers/refreshTokens";
import { createRemoteServerClientBindings } from "@/renderer/state/remoteServers/storeClient";
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
        sendThreadCommand: async (desktopId, command) => {
          await withClient(desktopId, (client) => client.sendThreadCommand(command));
          get().scheduleServerRefresh(desktopId);
        },

        pairServer: pairing.pairServer,
        ensureStandaloneOwner: pairing.ensureStandaloneOwner,
        pairSshServer: pairing.pairSshServer,
        renameServer: (desktopId, label) => {
          set((state) => {
            const server = state.servers.find((candidate) => candidate.desktopId === desktopId);
            if (!server || server.label === label) return {};
            return {
              servers: state.servers.map((candidate) =>
                candidate.desktopId === desktopId
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

        runProjectCommand: async (desktopId, command) => {
          await withClient(desktopId, (client) => client.projectCommand(command));
          if (command.kind === "update") {
            get().scheduleServerRefresh(desktopId);
          } else {
            await get().refreshServer(desktopId);
          }
        },

        loadProjectSettings: async (desktopId, projectId) => {
          const settings = await withClient(desktopId, (client) =>
            client.projectSettings(projectId),
          );
          const projectedId = remoteProjectId(desktopId, projectId);
          useAppStore.getState().updateProjectMcpServers(projectedId, settings.mcpServers ?? []);
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

        localImageUrl: (desktopId, path) => {
          try {
            return requireClient(desktopId).localImageUrl(path);
          } catch {
            return "";
          }
        },

        imageRefUrl: (desktopId, ref) => {
          try {
            return requireClient(desktopId).imageRefUrl(ref);
          } catch {
            return "";
          }
        },
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
      version: 1,
      // v1 reserves null in projectWorkspaceIds for an explicit "unfiled"
      // override. Older string-valued entries and absent entries remain valid.
      migrate: (persistedState) => persistedState as RemoteServersState,
      // Gate 6 item 4.6 (S6): once the persisted server records land, fill the
      // synchronous refresh-token map from the encrypted vault, so the first
      // 401 of any session can already refresh transparently. Runs out of the
      // connectAll path on purpose — connectAll keeps its synchronous
      // "connecting" state contract.
      onRehydrateStorage: () => (state) => {
        if (state?.servers?.length) {
          void hydrateRefreshTokens(state.servers.map((server) => server.desktopId));
        }
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
  __resetStandaloneOwnerForTest();
  __resetConnectionRefreshForTest();
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
