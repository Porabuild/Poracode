import {
  PORACODE_REMOTE_PROTOCOL_VERSION,
  REMOTE_BROWSER_FORWARD_VERSION,
  TERMINAL_CURSOR_SYNC_V2_VERSION,
} from "@/shared/remote/protocol";
import { parsePairingUrlParts } from "@/shared/remote/pairingUrl";
import type { StandaloneAttachInfo } from "@/shared/standaloneAttach";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { msg } from "@lingui/core/macro";
import { toast } from "@heroui/react";
import type { BrowseHostDirectoryResult, Thread, TerminalSize } from "@/shared/contracts";
import { friendlyError, msg as sharedMsg } from "@/shared/messages";
import {
  isRemoteTransportFailure,
  RemoteClientError,
  RemoteDesktopClient,
} from "@/shared/remote/client";
import { waitForRemoteThreadAppearance } from "@/shared/remote/threadAppearance";
import { filterKnownRemoteAccessScopes, REMOTE_OPERATOR_SCOPES } from "@/shared/remote";
import { readBridge } from "@/renderer/bridge";
import { i18n } from "@/renderer/i18n/i18n";
import {
  registerRemoteProcedureHost,
  releaseRemoteTerminalsForServer,
  resetRemoteProcedureRouterForTest,
} from "@/renderer/remoteProcedureRouter";
import { applyThreadSnapshot, type ApplyThreadSnapshotResult } from "@/renderer/state/remote";
import {
  recordAuthoritativeHistoryInstall,
  resetTruncateRecoveryEpoch,
  resetTruncateReloadBackoff,
  __resetTruncateRecoveryForTest,
} from "@/renderer/state/remote/truncateRecovery";
import { useAppStore } from "@/renderer/state/appStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import {
  applyCachedSlashCommandCatalogs,
  fetchSlashCommandCatalog,
} from "@/renderer/state/remoteServers/slashCommandCatalogs";
import { captureThreadFollowUpQueueSnapshot } from "@/renderer/state/threadFollowUpQueueStore";
import {
  runtimePageOverlapsExistingTranscript,
  seedOlderThreadRuntimeItemsCursor,
} from "@/renderer/state/chatRuntimePersister";
import {
  projectRemoteThread,
  projectRemoteThreadSnapshot,
  remoteOwner,
  remoteProjectId,
  remoteThreadId,
  unprojectRemoteThreadMentionSegments,
} from "@/renderer/state/remoteProjection";
import {
  resetRemoteTerminalFeed,
  setRemoteTerminalSocketSender,
} from "@/renderer/state/remoteTerminalFeed";
import { pickAndUploadBrowserFiles } from "@/renderer/utils/browserFilePicker";
import {
  createTerminalFeedConnections,
  terminalCapabilitiesFromEnvironment,
  type TerminalConnectionCapabilities,
} from "@/renderer/state/remoteServers/terminalCapabilities";
import { syncRemoteGitSummaries } from "@/renderer/state/remoteServers/gitSummaries";
import { waitForHostUpdateReconnect } from "@/renderer/state/remoteServers/hostUpdateReconnect";
import { mainProcessFetch } from "@/renderer/state/remoteServers/mainProcessFetch";
import {
  persistedRemoteServersState,
  removeCachedProjects,
  replaceCachedProjects,
} from "@/renderer/state/remoteServers/projectCache";
import {
  clearRemoteGitState,
  syncRemoteGitStateSnapshot,
} from "@/renderer/state/remoteServers/gitState";
import { withRemoteProjectSync } from "@/renderer/state/remoteServers/projectSync";
import { syncRemoteAppRows, removeRemoteAppRows } from "@/renderer/state/remoteServers/appRows";
import {
  addRemoteServerThreadItemInterest,
  bumpRemoteServerGeneration,
  bumpRemoteServerSnapshotSeq,
  clearRemoteServerEventSocketConnectTimeout,
  clearRemoteServerEventSocketHealth,
  clearRemoteThreadAppliedSeqs,
  currentRemoteServerGeneration,
  deleteRemoteServerEventSocketEntry,
  deleteRemoteServerSnapshotSeq,
  forgetRemoteServerThreadItemInterests,
  getRemoteServerEventSocketEntry,
  hasRemoteServerCursorSyncV2,
  listRemoteServerEventSocketDesktopIds,
  markRemoteServerCursorSyncV2,
  remoteThreadAppliedSeq,
  removeRemoteServerThreadItemInterest,
  setHydratingRemoteServerThreadItemInterest,
  setRemoteServerSnapshotSeq,
  __resetEventSocketRegistryForTest,
} from "@/renderer/state/remoteServers/eventSocketRegistry";
import type {
  OpenRemoteThread,
  RemoteClientFactory,
  RemoteServerRecord,
  RemoteServerRuntime,
  RemoteServersState,
  RemoteSocketFactory,
  RemoteSocketLike,
  RemoteThreadLaunchResult,
} from "@/renderer/state/remoteServers/types";
import { createSecureRemoteServersStorage } from "@/renderer/state/remoteServers/secureStorage";
import {
  syncDesktopBrowserBridgeClient,
  __resetBrowserBridgeForTest,
} from "@/renderer/state/remoteServers/browserBridge";
import {
  clearRemoteServerRefreshTimer,
  deleteRemoteHostUpdateRequestSeq,
  invalidateRemoteServerRefresh,
  isRemoteServerRefreshCurrent,
  nextRemoteHostUpdateSequence,
  nextRemoteServerRefreshRequestSeq,
  remoteHostUpdateReconnectSeq,
  remoteHostUpdateRequestSeq,
  scheduleServerRefresh as scheduleRemoteServerRefresh,
  setRemoteHostUpdateReconnectSeq,
  setRemoteHostUpdateRequestSeq,
  takeRemoteServerRowResyncPending,
  __resetConnectionRefreshForTest,
} from "@/renderer/state/remoteServers/connectionRefresh";
import { startRemoteServerEventStream as startRemoteServerEventStreamSession } from "@/renderer/state/remoteServers/eventSocketSession";
import {
  reconcileThreadRowsWithAppliedEvents,
  reuseRemoteRows,
} from "@/renderer/state/remoteServers/rowReuse";

export {
  selectBrowserBridgeDesktop,
  selectBrowserBridgeServer,
  selectBrowserPanelAvailable,
} from "@/renderer/state/remoteServers/browserBridge";

/**
 * Desktop-as-client. Lets the Electron desktop connect to *other* Poracode
 * servers (another desktop's remote access, or a headless `pnpm run server`)
 * and surface their projects in the sidebar — the mirror image of the PWA,
 * which connects to a single desktop. See docs/REMOTE_ARCHITECTURE.md, Phase 4.
 *
 * Connection bookkeeping (endpoint + bearer token + label) is persisted to
 * localStorage; live snapshot data is kept in memory and re-fetched on connect.
 */

/**
 * Standalone-attach session memo (in-memory only, never persisted): the
 * authenticated owner generation from main's HMAC-verified describe plus the
 * pairing-time check, and the desktopId paired from it. Genuine only at
 * describe+pairing: persisted bearers survive a same-root restart (the auth
 * store restores unexpired token hashes), so authentication alone never
 * proves continuous generation pin. No production reader enforces this memo
 * after pairing — continuous owner/epoch enforcement is a Gate 2 remainder.
 */
let standaloneOwnerGeneration: string | null = null;
let standaloneOwnerDesktopId: string | null = null;

export function getStandaloneOwnerGeneration(): string | null {
  return standaloneOwnerGeneration;
}

export function getStandaloneOwnerDesktopId(): string | null {
  return standaloneOwnerDesktopId;
}

export function __resetStandaloneOwnerForTest(): void {
  standaloneOwnerGeneration = null;
  standaloneOwnerDesktopId = null;
}

const defaultClientFactory: RemoteClientFactory = (endpoint, accessToken) =>
  new RemoteDesktopClient(endpoint, accessToken, mainProcessFetch);

const defaultSocketFactory: RemoteSocketFactory = (url) =>
  new WebSocket(url) as unknown as RemoteSocketLike;

let openRemoteThreadRequestSeq = 0;

/** In-flight connectAll(), so concurrent callers coalesce onto one pass. */
let connectAllInFlight: Promise<void> | null = null;
let connectAllInFlightForce = false;
let connectAllForceRequested = false;

/** Maps a thread-history snapshot to the openThread slice (terminal fields only when present). */
function buildOpenThread(
  desktopId: string,
  snapshot: {
    readonly thread: Thread;
    readonly terminalScrollback?: string | undefined;
    readonly terminalSize?: TerminalSize | undefined;
  },
): OpenRemoteThread {
  const projectedThread = projectRemoteThread(desktopId, snapshot.thread);
  return {
    desktopId,
    threadId: snapshot.thread.id,
    thread: projectedThread,
    ...(snapshot.terminalScrollback !== undefined
      ? { terminalScrollback: snapshot.terminalScrollback }
      : {}),
    ...(snapshot.terminalSize ? { terminalSize: snapshot.terminalSize } : {}),
  };
}

function closeRemoteServerEventSocket(
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

function closeAllRemoteServerEventSockets(): void {
  for (const desktopId of listRemoteServerEventSocketDesktopIds()) {
    closeRemoteServerEventSocket(desktopId);
  }
}

/**
 * Bounded shell-snapshot thread list (Gate 4 hazard #3): the client opts into
 * a first page plus cursor-paged continuations instead of transferring the
 * whole host list on every pair/refresh. 100 rows keeps each page response
 * inside the 64 KiB bound at realistic thread sizes (asserted by the
 * snapshots pagination acceptance test). Hosts without the capability ignore
 * the parameter and answer with the full list, which the client accepts.
 */
const REMOTE_SHELL_THREAD_PAGE_LIMIT = 100;

function normalizeEndpoint(raw: string): string {
  const trimmed = raw.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  // Normalize to an origin with a trailing slash so relative URLs resolve.
  return new URL(withScheme).toString();
}

export const useRemoteServersStore = create<RemoteServersState>()(
  persist(
    (set, get) => {
      const setRemoteServerFailure = (
        desktopId: string,
        status: "offline" | "error",
        message: string,
      ) => {
        const previous = get().runtime[desktopId]?.status;
        set((state) => {
          const current = state.runtime[desktopId];
          if (!current) return {};
          if (current.status === status && current.message === message) return state;
          return {
            runtime: { ...state.runtime, [desktopId]: { ...current, status, message } },
          };
        });
        // Offline/error drops re-arm unknown-checkpoint reload budgets without
        // clearing installed authoritative baselines (transport flap, not a
        // server restart).
        if (previous !== status) resetTruncateReloadBackoff(desktopId);
        syncDesktopBrowserBridgeClient(get());
      };

      /** Surface a remote-server action failure without ever rejecting: toast it
       * and reflect the server's runtime status/message so the sidebar shows it
       * offline/errored. The renderer's global unhandledrejection handler would
       * otherwise crash-screen on any stray rejection from a `void action(...)`. */
      const reportRemoteServerError = (desktopId: string, error: unknown, fallback: string) => {
        const message = friendlyError(error) || fallback;
        toast.danger(message);
        setRemoteServerFailure(
          desktopId,
          isRemoteTransportFailure(error) ? "offline" : "error",
          message,
        );
      };

      /** Resolve the paired server and build a client for it, or throw the
       * shared "not found" error the action callers already surface. An
       * offline runtime is deliberately still probeable: explicit refresh and
       * retry actions are how a paired server proves it has recovered. */
      const requireClient = (desktopId: string): RemoteDesktopClient => {
        const state = get();
        const server = state.servers.find((entry) => entry.desktopId === desktopId);
        if (!server) throw new Error(i18n._(msg`Remote server not found.`));
        return state.clientFactory(server.endpoint, server.accessToken);
      };

      const withClient = async <Result>(
        desktopId: string,
        invoke: (client: RemoteDesktopClient) => Promise<Result>,
      ): Promise<Result> => {
        try {
          const result = await invoke(requireClient(desktopId));
          const status = get().runtime[desktopId]?.status;
          if (status === "error" || status === "offline") {
            set((state) => {
              const current = state.runtime[desktopId];
              if (current?.status !== "error" && current?.status !== "offline") return {};
              return {
                runtime: {
                  ...state.runtime,
                  [desktopId]: {
                    status: "online",
                    projects: current.projects,
                    threads: current.threads,
                    ...(current.agentStatuses ? { agentStatuses: current.agentStatuses } : {}),
                  },
                },
              };
            });
            // Reactivation re-arms bounded reloads (offline cleared them, but
            // an explicit success proves reachability again).
            resetTruncateReloadBackoff(desktopId);
            syncDesktopBrowserBridgeClient(get());
          }
          return result;
        } catch (error) {
          if (!isRemoteTransportFailure(error)) {
            throw error;
          }
          const message = sharedMsg("remote.server.unreachable");
          if (get().runtime[desktopId]?.status !== "connecting") {
            setRemoteServerFailure(desktopId, "offline", message);
          }
          throw new Error(message, { cause: error });
        }
      };

      const checkHostUpdateInBackground = (server: RemoteServerRecord): void => {
        if (server.hostMode === "helper" || !server.scopes.includes("projects:manage")) return;
        const requestSeq = nextRemoteHostUpdateSequence();
        setRemoteHostUpdateRequestSeq(server.desktopId, requestSeq);
        void get()
          .clientFactory(server.endpoint, server.accessToken)
          .checkHostUpdate()
          .then((update) => {
            if (remoteHostUpdateRequestSeq(server.desktopId) !== requestSeq) return;
            set((state) => ({
              hostUpdates: { ...state.hostUpdates, [server.desktopId]: update },
            }));
          })
          .catch(() => undefined);
      };

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
        const environmentPromise = get()
          .clientFactory(server.endpoint, server.accessToken)
          .environment();
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
            const environment = await get()
              .clientFactory(persistedServer.endpoint, persistedServer.accessToken)
              .environment();
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

      const pairAtEndpoint = async (input: {
        endpoint: string;
        token: string;
        transport: NonNullable<RemoteServerRecord["transport"]>;
      }): Promise<RemoteServerRecord> => {
        const normalized = normalizeEndpoint(input.endpoint);
        const factory = get().clientFactory;
        const tokenResult = await factory(normalized).exchangePairingCredential({
          credential: input.token,
          // Gate 6 item 4.3 (S2): pairings carry scopes. This client requests
          // the operator preset by name (the pairing credential remains the
          // ceiling — the exchange rejects requests beyond it). A read-only
          // device UI would request REMOTE_VIEWER_SCOPES instead.
          scopes: REMOTE_OPERATOR_SCOPES,
          client: { label: "Poracode Desktop", deviceType: "desktop" },
        });
        const client = factory(normalized, tokenResult.accessToken);
        const [environment, snapshot, agentStatuses] = await Promise.all([
          client.environment(),
          client.snapshot({ threadListPageLimit: REMOTE_SHELL_THREAD_PAGE_LIMIT }),
          client
            .agentStatuses({ omitSlashCommands: true })
            .then((statuses) => applyCachedSlashCommandCatalogs(normalized, statuses)),
        ]);
        const record: RemoteServerRecord = {
          desktopId: environment.desktopId,
          label: environment.label,
          remoteLabel: environment.label,
          endpoint: normalized,
          accessToken: tokenResult.accessToken,
          scopes: filterKnownRemoteAccessScopes(tokenResult.scopes),
          appVersion: environment.appVersion,
          browserForwardAvailable:
            environment.capabilities?.browserForward?.versions.includes(
              REMOTE_BROWSER_FORWARD_VERSION,
            ) ?? false,
          ...(environment.platform ? { platform: environment.platform } : {}),
          ...(environment.hostMode ? { hostMode: environment.hostMode } : {}),
          transport: input.transport,
        };
        setRemoteHostUpdateReconnectSeq(record.desktopId, nextRemoteHostUpdateSequence());
        bumpRemoteServerGeneration(record.desktopId);
        set((state) => ({
          servers: [...state.servers.filter((s) => s.desktopId !== record.desktopId), record],
          lastKnownProjects: replaceCachedProjects(
            state.lastKnownProjects,
            record.desktopId,
            snapshot.projects,
          ),
          runtime: {
            ...state.runtime,
            [record.desktopId]: {
              status: "online",
              projects: snapshot.projects,
              threads: snapshot.threads,
              agentStatuses,
            },
          },
        }));
        syncRemoteAppRows(record.desktopId, snapshot.projects, snapshot.threads);
        if (snapshot.gitSummariesByThread) {
          syncRemoteGitSummaries(record.desktopId, snapshot.gitSummariesByThread);
        }
        if (snapshot.gitState) syncRemoteGitStateSnapshot(record.desktopId, snapshot.gitState);
        setRemoteServerSnapshotSeq(record.desktopId, snapshot.snapshotSeq);
        // Pairing overwrites the seq baseline; stale per-thread marks from a
        // previous pairing of the same host must not refuse this snapshot.
        clearRemoteThreadAppliedSeqs(record.desktopId);
        resetTruncateRecoveryEpoch(record.desktopId);
        syncDesktopBrowserBridgeClient(get());
        await startRemoteServerEventStream(
          record,
          terminalCapabilitiesFromEnvironment(environment),
        );
        checkHostUpdateInBackground(record);
        return record;
      };

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

        launchRemoteThread: async (input, options) => {
          const runtime = get().runtime[input.desktopId];
          const project = runtime?.projects.find((entry) => entry.id === input.projectId);
          if (!project) throw new Error(i18n._(msg`Remote project not found.`));
          const result = await withClient(input.desktopId, (client) =>
            client.startNewThread({
              ...(input.threadId ? { threadId: input.threadId } : {}),
              projectId: input.projectId,
              agentKind: input.agentKind,
              config: input.config,
              prompt: input.prompt,
              ...(input.segments
                ? {
                    segments: unprojectRemoteThreadMentionSegments(
                      input.desktopId,
                      input.segments,
                      useAppStore.getState().threads,
                    ),
                  }
                : {}),
              presentationMode: input.presentationMode,
              ...(input.userMessageItemId ? { userMessageItemId: input.userMessageItemId } : {}),
              ...(input.worktreePath ? { worktreePath: input.worktreePath } : {}),
              ...(input.worktreeBranch ? { worktreeBranch: input.worktreeBranch } : {}),
              ...(input.isNewWorktree ? { isNewWorktree: true } : {}),
              ...(input.title ? { title: input.title } : {}),
              ...(input.groupId ? { groupId: input.groupId } : {}),
              ...(input.groupName ? { groupName: input.groupName } : {}),
            }),
          );
          const compensateIfAbandoned = async (): Promise<
            Exclude<RemoteThreadLaunchResult, "started"> | undefined
          > => {
            if (options?.isPendingLaunchOwned?.() !== false) return undefined;
            const clearProjectedLaunch = () => {
              const open = get().openThread;
              if (open?.desktopId === input.desktopId && open.threadId === result.threadId) {
                get().closeRemoteThread();
              }
              useAppStore.getState().deleteThread(remoteThreadId(input.desktopId, result.threadId));
            };
            try {
              await withClient(input.desktopId, (client) =>
                client.sendThreadCommand({ kind: "delete", threadId: result.threadId }),
              );
            } catch (error) {
              toast.danger(friendlyError(error));
              clearProjectedLaunch();
              return "cancellation-failed";
            }
            clearProjectedLaunch();
            return "cancelled";
          };
          let cancellation = await compensateIfAbandoned();
          if (cancellation) return cancellation;
          const appeared = await waitForRemoteThreadAppearance({
            refresh: () => get().refreshServer(input.desktopId),
            hasThread: () =>
              get().runtime[input.desktopId]?.threads.some(
                (thread) => thread.id === result.threadId,
              ) ?? false,
          });
          if (!appeared) throw new Error(i18n._(msg`Unable to start the remote thread.`));
          cancellation = await compensateIfAbandoned();
          if (cancellation) return cancellation;
          await get().openRemoteThread(input.desktopId, result.threadId);
          cancellation = await compensateIfAbandoned();
          if (cancellation) return cancellation;
          return "started";
        },

        openRemoteThread: async (desktopId, threadId, options) => {
          const focus = options?.focus ?? true;
          const requestSeq = openRemoteThreadRequestSeq + 1;
          openRemoteThreadRequestSeq = requestSeq;
          const previousOpenThread = get().openThread;
          const server = get().servers.find((entry) => entry.desktopId === desktopId);
          if (!server) {
            reportRemoteServerError(
              desktopId,
              new Error(i18n._(msg`Remote server not found.`)),
              i18n._(msg`Remote server not found.`),
            );
            return false;
          }
          const serverIdentityAtStart = `${server.endpoint}\0${server.accessToken}`;
          const serverGenerationAtStart = currentRemoteServerGeneration(desktopId);
          setHydratingRemoteServerThreadItemInterest(desktopId, threadId, previousOpenThread);
          // Hydrate the thread's history into the shared, threadId-keyed runtime
          // store so the desktop ChatPane renders it (coexists with local threads).
          // A failed history fetch (server asleep/unreachable) must not reject.
          let snapshot: Awaited<ReturnType<RemoteDesktopClient["threadHistory"]>>;
          const followUpQueueSnapshotGuard = captureThreadFollowUpQueueSnapshot(
            remoteThreadId(desktopId, threadId),
          );
          try {
            // WS3 #2: cursor-sync v2 connections get the authoritative tail
            // from the chunked watch baseline — never send it twice.
            const omitScrollback = hasRemoteServerCursorSyncV2(desktopId);
            snapshot = await withClient(desktopId, (client) =>
              omitScrollback
                ? client.threadHistory(threadId, { omitScrollback: true })
                : client.threadHistory(threadId),
            );
          } catch (error) {
            // Drop this thread's hydration interest even when superseded: a
            // refresh that cleared the open slice invalidates the request seq,
            // and leaving the hydrating thread registered would leak a dead
            // interest (e.g. a replacement for a deleted thread). Every other
            // interest stays untouched, so a failed open never strips a live
            // pane; a same-thread retry re-registers on success.
            removeRemoteServerThreadItemInterest(desktopId, threadId);
            if (requestSeq !== openRemoteThreadRequestSeq) return false;
            // Re-assert the previous open thread only while it is still the
            // open slice: a superseding open owns its own registration, and a
            // thread the server deleted (refreshServer cleared the slice) must
            // not be resurrected as an interest.
            const currentOpen = get().openThread;
            if (
              previousOpenThread &&
              currentOpen?.desktopId === previousOpenThread.desktopId &&
              currentOpen.threadId === previousOpenThread.threadId
            ) {
              addRemoteServerThreadItemInterest(
                previousOpenThread.desktopId,
                previousOpenThread.threadId,
              );
            }
            // Background reattaches (focus:false) retry quietly; the sidebar's
            // server status already shows an unreachable host, and one toast
            // per retry attempt would be spam.
            if (!options?.quiet) {
              toast.danger(friendlyError(error) || i18n._(msg`Failed to open remote thread.`));
            }
            return false;
          }
          const currentServer = get().servers.find((entry) => entry.desktopId === desktopId);
          if (
            !currentServer ||
            `${currentServer.endpoint}\0${currentServer.accessToken}` !== serverIdentityAtStart ||
            currentRemoteServerGeneration(desktopId) !== serverGenerationAtStart
          ) {
            return false;
          }
          const projectedSnapshot = projectRemoteThreadSnapshot(desktopId, snapshot);
          const viewThreadId = projectedSnapshot.thread.id;
          const existingRuntimeItemIds =
            useAppStore.getState().runtimeItemIdsByThread[viewThreadId] ?? [];
          seedOlderThreadRuntimeItemsCursor(
            viewThreadId,
            projectedSnapshot.runtimeNextCursor ?? null,
            {
              preserveExistingCursor: runtimePageOverlapsExistingTranscript(
                projectedSnapshot.runtimeItems,
                existingRuntimeItemIds,
              ),
            },
          );
          const applied: ApplyThreadSnapshotResult = applyThreadSnapshot(projectedSnapshot, {
            fromServer: true,
            lastSeenEventSeq: remoteThreadAppliedSeq(desktopId, threadId),
            followUpQueueSnapshotGuard,
          });
          if (applied.installedAuthoritativeHistory) {
            recordAuthoritativeHistoryInstall(desktopId, threadId, snapshot.snapshotSeq);
          }
          addRemoteServerThreadItemInterest(desktopId, threadId);
          bumpRemoteServerSnapshotSeq(desktopId, snapshot.snapshotSeq);
          // WS3-A: the agent-statuses fetch omitted slash-command catalogs, so
          // the opened thread's agent catalog is fetched once, on first use.
          const openedThread = snapshot.thread;
          if (openedThread.agentKind) {
            const catalogScope = currentServer.endpoint;
            void fetchSlashCommandCatalog(catalogScope, openedThread.agentKind, () =>
              withClient(desktopId, (client) =>
                client.agentSlashCommands(openedThread.agentKind),
              ).then((result) => result.commands),
            )
              .then(() => {
                const statuses = get().runtime[desktopId]?.agentStatuses;
                if (!statuses) return;
                const patched = applyCachedSlashCommandCatalogs(catalogScope, statuses);
                set((state) => {
                  const latest = state.runtime[desktopId];
                  if (!latest || latest.agentStatuses !== statuses) return state;
                  return {
                    runtime: {
                      ...state.runtime,
                      [desktopId]: { ...latest, agentStatuses: patched },
                    },
                  };
                });
                useAgentStatusesStore.getState().setAgentStatuses(patched.windows);
              })
              .catch(() => {
                // Slash commands stay absent until the next open/refresh; the
                // menu must not crash or toast for a lazy enhancement.
              });
          }
          await startRemoteServerEventStream(currentServer);
          const eventSocket = getRemoteServerEventSocketEntry(desktopId)?.socket;
          if (eventSocket) activateRemoteTerminalFeed(desktopId, eventSocket);
          if (!focus) {
            // Background reattach never steals focus and never depends on the
            // single global open slice: history + interests are the attach.
            // Still track the slice when latest so single-pane restores keep
            // the existing `openThread` expectation, but always report success
            // once history installed.
            if (requestSeq === openRemoteThreadRequestSeq) {
              set({ openThread: buildOpenThread(desktopId, snapshot) });
            }
            return true;
          }
          if (requestSeq !== openRemoteThreadRequestSeq) return false;
          const openThread = buildOpenThread(desktopId, snapshot);
          set({ openThread });
          // Focus is caller-owned: the startup restore reattaches the live
          // subscription for an already-visible thread and must not yank the
          // view back if the user navigated away while the history fetch was
          // in flight.
          useAppStore.getState().openThread(openThread.thread.id);
          return true;
        },

        closeRemoteThread: () => {
          openRemoteThreadRequestSeq += 1;
          // Only the closing thread's own interest goes away: other interests
          // (other visible remote panes) are independent live subscriptions.
          const open = get().openThread;
          if (open) removeRemoteServerThreadItemInterest(open.desktopId, open.threadId);
          if (get().openThread) set({ openThread: null });
        },

        sendThreadCommand: async (desktopId, command) => {
          await withClient(desktopId, (client) => client.sendThreadCommand(command));
          get().scheduleServerRefresh(desktopId);
        },

        pairServer: ({ endpoint, token }) =>
          pairAtEndpoint({ endpoint, token, transport: { kind: "direct" } }),

        ensureStandaloneOwner: async (attach: StandaloneAttachInfo) => {
          if (attach.remoteProtocolVersion !== PORACODE_REMOTE_PROTOCOL_VERSION) {
            throw new Error("Invalid standalone attach configuration.");
          }
          const parts = parsePairingUrlParts(attach.pairingUrl);
          if (!parts) throw new Error("Invalid standalone attach configuration.");
          const record = await pairAtEndpoint({
            endpoint: attach.endpoint,
            token: parts.token,
            transport: { kind: "direct" },
          });
          standaloneOwnerGeneration = attach.ownerGeneration;
          standaloneOwnerDesktopId = record.desktopId;
          return record;
        },

        pairSshServer: async (connection) => {
          const launched = await readBridge().sshConnect({
            connection,
            issuePairingCredential: true,
          });
          if (!launched.pairingCredential) {
            await readBridge().sshDisconnect({ connectionId: connection.id });
            throw new Error(i18n._(msg`The remote server returned no pairing credential.`));
          }
          try {
            return await pairAtEndpoint({
              endpoint: launched.endpoint,
              token: launched.pairingCredential,
              transport: { kind: "ssh", connection },
            });
          } catch (error) {
            await readBridge().sshDisconnect({ connectionId: connection.id });
            throw error;
          }
        },

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

        removeServer: (desktopId) => {
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
          set((state) => {
            const { [desktopId]: _removed, ...runtime } = state.runtime;
            const { [desktopId]: _removedUpdate, ...hostUpdates } = state.hostUpdates;
            const { [desktopId]: _removedRestart, ...hostUpdateRestarts } =
              state.hostUpdateRestarts;
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

        refreshServer: async (desktopId, options = {}) => {
          const server = get().servers.find((entry) => entry.desktopId === desktopId);
          if (!server) return;
          // A debounced refresh may already be pending; this immediate refresh
          // supersedes it so we don't fire a second GET moments later.
          clearRemoteServerRefreshTimer(desktopId);
          // Tag this refresh with a monotonic request id. Two sockets can each
          // trigger a refresh, and their snapshot GETs may resolve out of order;
          // ignore any result that isn't the latest so a stale snapshot never
          // overwrites a newer one (e.g. shows "running" after "finished").
          const requestSeq = nextRemoteServerRefreshRequestSeq(desktopId);
          const isLatest = () => isRemoteServerRefreshCurrent(desktopId, requestSeq);
          // Replace the whole runtime entry; snapshots are kept across a
          // connecting/error transition so the UI doesn't flash empty. Skip the
          // write if the server was removed while a refresh was in flight, so a
          // late snapshot doesn't resurrect a removed server's runtime.
          const setRuntime = (entry: RemoteServerRuntime) =>
            set((state) => {
              if (!state.servers.some((s) => s.desktopId === desktopId)) return state;
              if (state.runtime[desktopId] === entry) return state;
              return { runtime: { ...state.runtime, [desktopId]: entry } };
            });
          const cached = () => get().runtime[desktopId];
          // Skip the "connecting" flicker once a snapshot is cached — only
          // downgrade the status on failure. First-ever refresh still shows it.
          if (!cached()) {
            setRuntime({ status: "connecting", projects: [], threads: [] });
          }
          try {
            const client = get().clientFactory(server.endpoint, server.accessToken);
            const snapshotPromise = client.snapshot({
              threadListPageLimit: REMOTE_SHELL_THREAD_PAGE_LIMIT,
            });
            const [snapshot, agentStatuses] =
              options.includeAgentStatuses === false
                ? [await snapshotPromise, cached()?.agentStatuses]
                : await Promise.all([
                    snapshotPromise,
                    client
                      .agentStatuses({ omitSlashCommands: true })
                      .then((statuses) =>
                        applyCachedSlashCommandCatalogs(server.endpoint, statuses),
                      ),
                  ]);
            // Drop a stale (superseded) result so out-of-order resolutions don't
            // regress the UI or the seq cursor.
            if (!isLatest()) return;
            // Clamp the stored seq with Math.max so a stale response can't
            // regress the cursor a live socket already advanced past.
            bumpRemoteServerSnapshotSeq(desktopId, snapshot.snapshotSeq);
            const current = cached();
            const projects = reuseRemoteRows(current?.projects ?? [], snapshot.projects);
            const { rows: reconciledThreads, staleThreadIds } =
              reconcileThreadRowsWithAppliedEvents(
                desktopId,
                snapshot.snapshotSeq,
                snapshot.threads,
                current?.threads ?? [],
              );
            const threads = reuseRemoteRows(current?.threads ?? [], reconciledThreads);
            const projectsChanged = projects !== current?.projects;
            const threadsChanged = threads !== current?.threads;
            const nextAgentStatuses =
              agentStatuses === undefined
                ? current?.agentStatuses
                : current?.agentStatuses &&
                    JSON.stringify(current.agentStatuses.windows) ===
                      JSON.stringify(agentStatuses.windows) &&
                    JSON.stringify(current.agentStatuses.wsl) === JSON.stringify(agentStatuses.wsl)
                  ? current.agentStatuses
                  : agentStatuses;
            const nextRuntime: RemoteServerRuntime =
              current?.status === "online" &&
              current.message === undefined &&
              projects === current.projects &&
              threads === current.threads &&
              nextAgentStatuses === current.agentStatuses
                ? current
                : {
                    status: "online",
                    projects,
                    threads,
                    ...(nextAgentStatuses ? { agentStatuses: nextAgentStatuses } : {}),
                  };
            set((state) => {
              if (!state.servers.some((entry) => entry.desktopId === desktopId)) return state;
              const lastKnownProjects = projectsChanged
                ? replaceCachedProjects(state.lastKnownProjects, desktopId, projects)
                : state.lastKnownProjects;
              if (
                state.runtime[desktopId] === nextRuntime &&
                lastKnownProjects === state.lastKnownProjects
              ) {
                return state;
              }
              return {
                runtime: { ...state.runtime, [desktopId]: nextRuntime },
                lastKnownProjects,
              };
            });
            // One-shot: a resync-required refresh re-mirrors authoritative
            // rows even when the HTTP cache already matches them.
            const forceRowSync = takeRemoteServerRowResyncPending(desktopId);
            if (projectsChanged || threadsChanged || forceRowSync) {
              syncRemoteAppRows(
                desktopId,
                projectsChanged || forceRowSync ? projects : undefined,
                threadsChanged || forceRowSync ? threads : undefined,
                { preserveThreadIds: staleThreadIds },
              );
            }
            if (snapshot.gitSummariesByThread) {
              syncRemoteGitSummaries(desktopId, snapshot.gitSummariesByThread);
            }
            if (snapshot.gitState) syncRemoteGitStateSnapshot(desktopId, snapshot.gitState);
            const openThread = get().openThread;
            if (
              threadsChanged &&
              openThread?.desktopId === desktopId &&
              !threads.some((thread) => thread.id === openThread.threadId)
            ) {
              openRemoteThreadRequestSeq += 1;
              // The open thread no longer exists server-side: drop its interest
              // without touching this server's other live subscriptions.
              removeRemoteServerThreadItemInterest(desktopId, openThread.threadId);
              set({ openThread: null });
            }
            syncDesktopBrowserBridgeClient(get());
          } catch (error) {
            if (!isLatest()) return;
            setRuntime({
              status: isRemoteTransportFailure(error) ? "offline" : "error",
              message: friendlyError(error) || i18n._(msg`Connection failed.`),
              projects: cached()?.projects ?? [],
              threads: cached()?.threads ?? [],
            });
            syncDesktopBrowserBridgeClient(get());
          }
        },

        scheduleServerRefresh: (desktopId, options = {}) => {
          scheduleRemoteServerRefresh(get, desktopId, options);
        },

        connectAll: async (options = {}) => {
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
            if (!useRemoteServersStore.persist.hasHydrated()) {
              await useRemoteServersStore.persist.rehydrate();
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

        reconnectServer: async (desktopId) => {
          if (get().hostUpdateRestarts[desktopId] !== undefined) return;
          const server = get().servers.find((entry) => entry.desktopId === desktopId);
          if (!server) return;
          setServersConnecting([server]);
          await connectServer(server);
        },

        getHostUpdateState: async (desktopId) => {
          const requestSeq = nextRemoteHostUpdateSequence();
          setRemoteHostUpdateRequestSeq(desktopId, requestSeq);
          const update = await withClient(desktopId, (client) => client.hostUpdateState());
          if (remoteHostUpdateRequestSeq(desktopId) !== requestSeq) return update;
          set((state) => ({ hostUpdates: { ...state.hostUpdates, [desktopId]: update } }));
          return update;
        },

        checkHostUpdate: async (desktopId) => {
          const requestSeq = nextRemoteHostUpdateSequence();
          setRemoteHostUpdateRequestSeq(desktopId, requestSeq);
          const update = await withClient(desktopId, (client) => client.checkHostUpdate());
          if (remoteHostUpdateRequestSeq(desktopId) !== requestSeq) return update;
          set((state) => ({ hostUpdates: { ...state.hostUpdates, [desktopId]: update } }));
          return update;
        },

        installHostUpdate: async (desktopId) => {
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
  connectAllInFlight = null;
  connectAllInFlightForce = false;
  connectAllForceRequested = false;
  __resetBrowserBridgeForTest();
  openRemoteThreadRequestSeq = 0;
  resetRemoteTerminalFeed();
  useAppStore.setState((state) => ({
    projects: state.projects.filter((project) => !project.remoteServerId),
    threads: state.threads.filter((thread) => !thread.remoteServerId),
  }));
  useRemoteServersStore.setState({ openThread: null, hostUpdates: {}, hostUpdateRestarts: {} });
}
