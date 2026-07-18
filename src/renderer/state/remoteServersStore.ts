import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { msg } from "@lingui/core/macro";
import { toast } from "@heroui/react";
import type {
  Project,
  ProjectLocation,
  ReadProjectFileResult,
  Thread,
  ThreadServerRequestId,
  ThreadConfig,
  ThreadPresentationMode,
  TerminalSize,
  WriteProjectFileResult,
} from "@/shared/contracts";
import { RemoteDesktopClient, type RemoteFetch } from "@/shared/remote/client";
import { reconnectBackoffDelay } from "@/shared/remote/backoff";
import { waitForRemoteThreadAppearance } from "@/shared/remote/threadAppearance";
import {
  filterKnownRemoteAccessScopes,
  REMOTE_STANDARD_SCOPES,
  type RemoteAgentStatuses,
  type RemoteAccessScope,
  type RemoteProjectCommand,
} from "@/shared/remote";
import type { SshConnectionConfig } from "@/shared/ssh";
import { readBridge } from "@/renderer/bridge";
import { i18n } from "@/renderer/i18n/i18n";
import {
  applyThreadSnapshot,
  collectRuntimeEventsFromSupervisoryMessage,
  dispatchRemoteSupervisorEvent,
} from "@/renderer/state/remote";
import {
  emitRemoteTerminalExited,
  emitRemoteTerminalReset,
  handleRemoteTerminalServerMessage,
  resetRemoteTerminalFeed,
  setRemoteTerminalSocketSender,
} from "@/renderer/state/remoteTerminalFeed";

/**
 * Remote requests run in the main process (no browser CORS — the remote
 * server's allowlist doesn't include the desktop renderer's origin). The result
 * is re-wrapped as a real Response so the shared client is unchanged.
 */
const mainProcessFetch: RemoteFetch = async (url, init) => {
  const result = await readBridge().remoteHttpRequest({
    url: String(url),
    ...(init?.method ? { method: init.method as "GET" | "POST" } : {}),
    ...(init?.headers ? { headers: init.headers } : {}),
    ...(init?.body !== undefined ? { body: init.body } : {}),
  });
  // The Response constructor rejects a body for null-body statuses (1xx / 204 /
  // 205 / 304); the remote API doesn't return those, but guard so an unexpected
  // status never throws here.
  const nullBody =
    result.status < 200 || result.status === 204 || result.status === 205 || result.status === 304;
  return new Response(nullBody ? null : result.body, {
    status: result.status,
    headers: result.headers,
  });
};

/**
 * Desktop-as-client. Lets the Electron desktop connect to *other* Poracode
 * servers (another desktop's remote access, or a headless `pnpm run server`)
 * and surface their projects in the sidebar — the mirror image of the PWA,
 * which connects to a single desktop. See docs/REMOTE_ARCHITECTURE.md, Phase 4.
 *
 * Connection bookkeeping (endpoint + bearer token + label) is persisted to
 * localStorage; live snapshot data is kept in memory and re-fetched on connect.
 */
export type RemoteServerStatus = "connecting" | "online" | "offline" | "error";

/** Persisted, durable identity of a paired remote server. */
export interface RemoteServerRecord {
  readonly desktopId: string;
  readonly label: string;
  readonly endpoint: string;
  readonly accessToken: string;
  readonly scopes: RemoteAccessScope[];
  /** Absent on records persisted before transport metadata existed. */
  readonly transport?:
    | { readonly kind: "direct" }
    | { readonly kind: "ssh"; readonly connection: SshConnectionConfig };
}

/** In-memory connection state for a server; never persisted. */
export interface RemoteServerRuntime {
  readonly status: RemoteServerStatus;
  readonly message?: string;
  readonly projects: Project[];
  readonly threads: Thread[];
  readonly agentStatuses?: RemoteAgentStatuses;
}

/** The remote thread currently open for live chat in the desktop. */
export interface OpenRemoteThread {
  readonly desktopId: string;
  readonly threadId: string;
  readonly thread: Thread;
  readonly terminalScrollback?: string;
  readonly terminalSize?: TerminalSize;
}

export interface RemoteProjectDraft {
  readonly desktopId: string;
  readonly projectId: string;
}

/** Injectable so tests can supply a fake client; defaults to the real one. */
export type RemoteClientFactory = (endpoint: string, accessToken?: string) => RemoteDesktopClient;

/** Minimal WebSocket shape; injectable so tests don't need a real socket. */
export interface RemoteSocketLike {
  close(): void;
  send?(data: string): void;
  readonly readyState?: number;
  onopen?: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
}
export type RemoteSocketFactory = (url: string) => RemoteSocketLike;

const defaultClientFactory: RemoteClientFactory = (endpoint, accessToken) =>
  new RemoteDesktopClient(endpoint, accessToken, mainProcessFetch);

const defaultSocketFactory: RemoteSocketFactory = (url) =>
  new WebSocket(url) as unknown as RemoteSocketLike;

/** The live socket for the open remote thread; kept outside the store so the
 * non-serializable handle never lands in persisted state. */
let activeThreadSocket: RemoteSocketLike | null = null;
let activeThreadReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let openRemoteThreadRequestSeq = 0;

/** In-flight connectAll(), so concurrent callers coalesce onto one pass. */
let connectAllInFlight: Promise<void> | null = null;
const REMOTE_THREAD_SOCKET_RECONNECT_BASE_MS = 1000;
const REMOTE_THREAD_SOCKET_RECONNECT_MAX_MS = 20_000;

interface RemoteServerEventSocketEntry {
  readonly serverKey: string;
  socket: RemoteSocketLike | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempt: number;
  connecting: boolean;
}

const remoteServerEventSockets = new Map<string, RemoteServerEventSocketEntry>();
const remoteServerSnapshotSeqByDesktopId = new Map<string, number>();

/** Tailwind dot class for a remote server's connection state. */
export function remoteServerStatusDotClass(status: RemoteServerStatus | undefined): string {
  return status === "online"
    ? "bg-success"
    : status === "connecting"
      ? "bg-warning"
      : status === "error"
        ? "bg-danger"
        : "bg-default-400";
}

function closeActiveThreadSocket(): void {
  setRemoteTerminalSocketSender(null);
  if (activeThreadReconnectTimer) {
    clearTimeout(activeThreadReconnectTimer);
    activeThreadReconnectTimer = null;
  }
  if (!activeThreadSocket) return;
  try {
    activeThreadSocket.close();
  } catch {
    // already closed
  }
  activeThreadSocket = null;
}

/** Maps a thread-history snapshot to the openThread slice (terminal fields only when present). */
function buildOpenThread(
  desktopId: string,
  threadId: string,
  snapshot: {
    readonly thread: Thread;
    readonly terminalScrollback?: string | undefined;
    readonly terminalSize?: TerminalSize | undefined;
  },
): OpenRemoteThread {
  return {
    desktopId,
    threadId,
    thread: snapshot.thread,
    ...(snapshot.terminalScrollback !== undefined
      ? { terminalScrollback: snapshot.terminalScrollback }
      : {}),
    ...(snapshot.terminalSize ? { terminalSize: snapshot.terminalSize } : {}),
  };
}

function remoteThreadSocketReconnectDelay(attempt: number): number {
  return Math.min(
    REMOTE_THREAD_SOCKET_RECONNECT_MAX_MS,
    REMOTE_THREAD_SOCKET_RECONNECT_BASE_MS * 2 ** attempt,
  );
}

function remoteServerEventSocketReconnectDelay(attempt: number): number {
  return reconnectBackoffDelay(attempt, {
    baseMs: REMOTE_THREAD_SOCKET_RECONNECT_BASE_MS,
    maxMs: REMOTE_THREAD_SOCKET_RECONNECT_MAX_MS,
  });
}

function closeRemoteServerEventSocket(desktopId: string): void {
  // A pending debounced snapshot refresh for this server is now moot; cancel it
  // so a closed/removed server never fires a late GET (finding #5).
  clearRemoteServerRefreshTimer(desktopId);
  const entry = remoteServerEventSockets.get(desktopId);
  if (!entry) return;
  remoteServerEventSockets.delete(desktopId);
  remoteServerSnapshotSeqByDesktopId.delete(desktopId);
  if (entry.reconnectTimer) {
    clearTimeout(entry.reconnectTimer);
    entry.reconnectTimer = null;
  }
  if (!entry.socket) return;
  try {
    entry.socket.close();
  } catch {
    // already closed
  }
  entry.socket = null;
}

function closeAllRemoteServerEventSockets(): void {
  for (const desktopId of [...remoteServerEventSockets.keys()]) {
    closeRemoteServerEventSocket(desktopId);
  }
}

function shouldRefreshRemoteServerAfterEvent(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === "thread-state" ||
    type === "thread-exited" ||
    type === "thread-reset" ||
    type === "windows-agent-statuses" ||
    type === "wsl-agent-statuses" ||
    type === "remote-projects-changed" ||
    type === "remote-threads-changed"
  );
}

/**
 * Filter a remote WebSocket event down to what may safely be dispatched into the
 * desktop's *shared* runtime store for the open remote thread. The remote server
 * publishes ALL of its supervisor events, but this desktop is a client: it must
 * NOT let a remote machine's events clobber local desktop-global stores.
 *
 * - Desktop-global events (agent statuses, git summaries, project/thread-change
 *   broadcasts, provider usage, project/session-scoped events) are DROPPED — they
 *   would otherwise overwrite the local supervisor's detected-agent list, local
 *   git summaries, etc.
 * - Thread-scoped lifecycle events (thread-state/reset/exited/…) are forwarded
 *   ONLY when their `threadId` matches the open thread.
 * - Runtime-event batches are filtered per-batch (a `thread-runtime-events-multi`
 *   may carry batches for several threads) down to the open thread's batches so
 *   the shared appStore is never hydrated with other threads' runtime deltas.
 *
 * Returns the value to dispatch (possibly a narrowed `thread-runtime-events-multi`)
 * or `null` when nothing pertains to the open thread.
 */
export function filterRemoteThreadEvent(value: unknown, openThreadId: string): unknown {
  if (!value || typeof value !== "object") return null;
  const type = (value as { type?: unknown }).type;

  // Runtime-event batches: keep only the open thread's events. A `-multi`
  // message may carry other threads' batches, so re-shape it to a multi that
  // contains only the open thread's runtime events.
  if (
    type === "thread-runtime-event" ||
    type === "thread-runtime-events" ||
    type === "thread-runtime-events-multi"
  ) {
    const batches = collectRuntimeEventsFromSupervisoryMessage(value).filter(
      (batch) => batch.threadId === openThreadId,
    );
    if (batches.length === 0) return null;
    return {
      type: "thread-runtime-events-multi",
      batches: batches.map((batch) => ({ threadId: batch.threadId, events: [...batch.events] })),
    };
  }

  // Thread-scoped lifecycle events all carry a threadId; forward only ours.
  if (
    type === "thread-state" ||
    type === "thread-reset" ||
    type === "thread-exited" ||
    type === "thread-pending-steer" ||
    type === "thread-output" ||
    type === "thread-osc-notification" ||
    type === "thread-osc-shell"
  ) {
    const threadId = (value as { threadId?: unknown }).threadId;
    return threadId === openThreadId ? value : null;
  }

  // Everything else is desktop-global (agent statuses, git summaries, project /
  // thread-change broadcasts, provider usage) or scoped to a project/session
  // that this desktop-as-client path does not mirror — drop it so it never
  // clobbers the local desktop's shared stores.
  return null;
}

// ── Per-server snapshot refresh: coalesced + debounced ──────────────
// Both the per-server event socket and the open-thread socket trigger snapshot
// refreshes on qualifying events. Route them through one per-desktopId debounced
// scheduler (mirrors the PWA's 600ms) so a burst of events yields a single GET,
// and tag each in-flight refresh with a monotonic request id so an out-of-order
// (stale) snapshot never overwrites a newer one.
const REMOTE_SERVER_REFRESH_DEBOUNCE_MS = 600;
const remoteServerRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
const remoteServerRefreshSeqByDesktopId = new Map<string, number>();

function clearRemoteServerRefreshTimer(desktopId: string): void {
  const timer = remoteServerRefreshTimers.get(desktopId);
  if (timer) {
    clearTimeout(timer);
    remoteServerRefreshTimers.delete(desktopId);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface RemoteServersState {
  servers: RemoteServerRecord[];
  runtime: Record<string, RemoteServerRuntime>;
  /** Swapped in tests; not persisted. */
  clientFactory: RemoteClientFactory;
  socketFactory: RemoteSocketFactory;
  setClientFactory(factory: RemoteClientFactory): void;
  setSocketFactory(factory: RemoteSocketFactory): void;
  /** The remote thread open for live chat, or null. */
  openThread: OpenRemoteThread | null;
  remoteProjectDraft: RemoteProjectDraft | null;
  openRemoteProject(desktopId: string, projectId: string): void;
  closeRemoteProject(): void;
  startRemoteThread(input: {
    readonly desktopId: string;
    readonly projectId: string;
    readonly agentKind: string;
    readonly config: ThreadConfig;
    readonly prompt: string;
    readonly presentationMode: ThreadPresentationMode;
  }): Promise<void>;
  /** Open a remote thread: hydrate its history into the store and stream live
   * events over a WebSocket so the desktop ChatPane renders it live. */
  openRemoteThread(desktopId: string, threadId: string): Promise<void>;
  /** Close the open remote thread and its socket. */
  closeRemoteThread(): void;
  /** Send a prompt to the open remote thread. */
  sendRemotePrompt(prompt: string): Promise<void>;
  writeRemoteTerminal(data: string): Promise<void>;
  resizeRemoteTerminal(size: TerminalSize): Promise<void>;
  /** Resolve an approval/input request on the open remote thread. */
  resolveThreadRequest(input: {
    readonly desktopId: string;
    readonly threadId: string;
    readonly requestId: ThreadServerRequestId;
    readonly method: string;
    readonly response: unknown;
  }): Promise<void>;
  /** Roll back the provider-side conversation for a remote checkpoint revert. */
  rollbackThreadConversation(input: {
    readonly desktopId: string;
    readonly threadId: string;
    readonly numTurns: number;
    readonly config?: ThreadConfig;
  }): Promise<void>;
  /** Restore files on the remote server for a checkpoint revert. */
  restoreFileCheckpoint(input: {
    readonly desktopId: string;
    readonly threadId: string;
    readonly checkpointItemId: string;
    readonly projectLocation: ProjectLocation;
  }): Promise<void>;
  /** Read a file from a remote server for the desktop file editor overlay. */
  readProjectFile(input: {
    readonly desktopId: string;
    readonly projectLocation: ProjectLocation;
    readonly path: string;
  }): Promise<ReadProjectFileResult>;
  /** Write a project-relative file on a remote server from the file editor. */
  writeProjectFile(input: {
    readonly desktopId: string;
    readonly projectLocation: ProjectLocation;
    readonly path: string;
    readonly content: string;
    readonly baseModifiedAtMs: number;
  }): Promise<WriteProjectFileResult>;
  /** Exchange a pairing token for an access token, then connect + snapshot. */
  pairServer(input: { endpoint: string; token: string }): Promise<RemoteServerRecord>;
  /** Bootstrap a remote Poracode host over SSH, then pair through the same protocol. */
  pairSshServer(connection: SshConnectionConfig): Promise<RemoteServerRecord>;
  removeServer(desktopId: string): void;
  /** Re-fetch a connected server's snapshot. */
  refreshServer(desktopId: string): Promise<void>;
  /** Debounced+coalesced refresh: bursts of socket events yield one snapshot. */
  scheduleServerRefresh(desktopId: string): void;
  /** Connect every persisted server (called once on app start). */
  connectAll(): Promise<void>;
  /** Reconnect one server: restore its transport (SSH), refresh, re-stream. */
  reconnectServer(desktopId: string): Promise<void>;
  /** Add/clone/remove a project on a remote server, then refresh it. */
  runProjectCommand(desktopId: string, command: RemoteProjectCommand): Promise<void>;
  /** Interrupt a running thread/agent on a remote server. */
  interruptThread(desktopId: string, threadId: string): Promise<void>;
  /** Close (tear down) a thread on a remote server, then refresh it. */
  closeThread(desktopId: string, threadId: string): Promise<void>;
}

function normalizeEndpoint(raw: string): string {
  const trimmed = raw.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  // Normalize to an origin with a trailing slash so relative URLs resolve.
  return new URL(withScheme).toString();
}

export const useRemoteServersStore = create<RemoteServersState>()(
  persist(
    (set, get) => {
      /** Surface a remote-server action failure without ever rejecting: toast it
       * and reflect the server's runtime status/message so the sidebar shows it
       * offline/errored. The renderer's global unhandledrejection handler would
       * otherwise crash-screen on any stray rejection from a `void action(...)`. */
      const reportRemoteServerError = (desktopId: string, error: unknown, fallback: string) => {
        const message = errorMessage(error) || fallback;
        toast.danger(message);
        set((state) => {
          const current = state.runtime[desktopId];
          if (!current) return {};
          return {
            runtime: { ...state.runtime, [desktopId]: { ...current, status: "error", message } },
          };
        });
      };

      /** Resolve the paired server and build a client for it, or throw the
       * shared "not found" error the action callers already surface. */
      const requireClient = (desktopId: string): RemoteDesktopClient => {
        const server = get().servers.find((entry) => entry.desktopId === desktopId);
        if (!server) throw new Error(i18n._(msg`Remote server not found.`));
        return get().clientFactory(server.endpoint, server.accessToken);
      };

      const startRemoteServerEventStream = (server: RemoteServerRecord) => {
        const serverKey = `${server.endpoint}\0${server.accessToken}`;
        const existing = remoteServerEventSockets.get(server.desktopId);
        if (existing?.serverKey === serverKey) return;

        closeRemoteServerEventSocket(server.desktopId);
        const entry: RemoteServerEventSocketEntry = {
          serverKey,
          socket: null,
          reconnectTimer: null,
          reconnectAttempt: 0,
          connecting: false,
        };
        remoteServerEventSockets.set(server.desktopId, entry);

        const isCurrent = () =>
          remoteServerEventSockets.get(server.desktopId) === entry &&
          get().servers.some((candidate) => candidate.desktopId === server.desktopId);

        const scheduleReconnect = () => {
          if (!isCurrent()) return;
          if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
          const delay = remoteServerEventSocketReconnectDelay(entry.reconnectAttempt);
          entry.reconnectAttempt += 1;
          entry.reconnectTimer = setTimeout(() => {
            entry.reconnectTimer = null;
            void connect();
          }, delay);
        };

        const connect = async () => {
          if (!isCurrent() || entry.connecting || entry.socket) return;
          entry.connecting = true;
          try {
            const client = get().clientFactory(server.endpoint, server.accessToken);
            const ticket = await client.websocketTicket();
            if (!isCurrent()) return;
            const lastSeenSeq = remoteServerSnapshotSeqByDesktopId.get(server.desktopId) ?? 0;
            const socket = get().socketFactory(client.websocketUrl(ticket, lastSeenSeq));
            if (!isCurrent()) {
              try {
                socket.close();
              } catch {
                // already closed
              }
              return;
            }
            entry.socket = socket;
            entry.reconnectAttempt = 0;
            socket.onmessage = (event) => {
              try {
                const message = client.parseSocketMessage(String(event.data));
                if (message.type === "event") {
                  const nextSeq = Math.max(
                    remoteServerSnapshotSeqByDesktopId.get(server.desktopId) ?? 0,
                    message.seq,
                  );
                  remoteServerSnapshotSeqByDesktopId.set(server.desktopId, nextSeq);
                  if (shouldRefreshRemoteServerAfterEvent(message.event)) {
                    // Debounced so a burst of events yields a single snapshot GET
                    // (shared with the open-thread socket via the scheduler).
                    get().scheduleServerRefresh(server.desktopId);
                  }
                }
                if (message.type === "resync-required") {
                  get().scheduleServerRefresh(server.desktopId);
                }
              } catch {
                // HTTP snapshots remain authoritative; ignore malformed frames.
              }
            };
            socket.onclose = () => {
              if (!isCurrent() || entry.socket !== socket) return;
              entry.socket = null;
              scheduleReconnect();
            };
          } catch {
            scheduleReconnect();
          } finally {
            entry.connecting = false;
          }
        };

        void connect();
      };

      /** Restore a server's transport (SSH tunnel) when needed, then snapshot
       * it and (re)attach its event stream. Shared by connectAll and
       * reconnectServer so transport handling lives in one place. */
      const connectServer = async (persistedServer: RemoteServerRecord): Promise<void> => {
        let server = persistedServer;
        if (server.transport?.kind === "ssh") {
          try {
            const launched = await readBridge().sshConnect({
              connection: server.transport.connection,
            });
            server = { ...server, endpoint: normalizeEndpoint(launched.endpoint) };
            const updated = server;
            set((state) => ({
              servers: state.servers.map((candidate) =>
                candidate.desktopId === updated.desktopId ? updated : candidate,
              ),
            }));
          } catch (error) {
            reportRemoteServerError(server.desktopId, error, i18n._(msg`SSH connection failed.`));
            return;
          }
        }
        await get().refreshServer(server.desktopId);
        startRemoteServerEventStream(server);
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
          scopes: REMOTE_STANDARD_SCOPES,
          client: { label: "Poracode Desktop", deviceType: "desktop" },
        });
        const client = factory(normalized, tokenResult.accessToken);
        const [environment, snapshot, agentStatuses] = await Promise.all([
          client.environment(),
          client.snapshot(),
          client.agentStatuses(),
        ]);
        const record: RemoteServerRecord = {
          desktopId: environment.desktopId,
          label: environment.label,
          endpoint: normalized,
          accessToken: tokenResult.accessToken,
          scopes: filterKnownRemoteAccessScopes(tokenResult.scopes),
          transport: input.transport,
        };
        set((state) => ({
          servers: [...state.servers.filter((s) => s.desktopId !== record.desktopId), record],
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
        remoteServerSnapshotSeqByDesktopId.set(record.desktopId, snapshot.snapshotSeq);
        startRemoteServerEventStream(record);
        return record;
      };

      return {
        servers: [],
        runtime: {},
        openThread: null,
        remoteProjectDraft: null,
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

        openRemoteProject: (desktopId, projectId) => {
          set({ remoteProjectDraft: { desktopId, projectId } });
        },

        closeRemoteProject: () => {
          if (get().remoteProjectDraft) set({ remoteProjectDraft: null });
        },

        startRemoteThread: async (input) => {
          const client = requireClient(input.desktopId);
          const result = await client.startNewThread({
            projectId: input.projectId,
            agentKind: input.agentKind,
            config: input.config,
            prompt: input.prompt,
            presentationMode: input.presentationMode,
          });
          const appeared = await waitForRemoteThreadAppearance({
            refresh: () => get().refreshServer(input.desktopId),
            hasThread: () =>
              get().runtime[input.desktopId]?.threads.some(
                (thread) => thread.id === result.threadId,
              ) ?? false,
          });
          if (!appeared) throw new Error(i18n._(msg`Unable to start the remote thread.`));
          set({ remoteProjectDraft: null });
          await get().openRemoteThread(input.desktopId, result.threadId);
        },

        openRemoteThread: async (desktopId, threadId) => {
          const requestSeq = openRemoteThreadRequestSeq + 1;
          openRemoteThreadRequestSeq = requestSeq;
          const server = get().servers.find((entry) => entry.desktopId === desktopId);
          if (!server) {
            // Never reject: sidebar rows call this via `void openRemoteThread(...)`
            // and the renderer's global unhandledrejection handler crash-screens
            // on any stray rejection. Surface the failure as a toast instead.
            reportRemoteServerError(
              desktopId,
              new Error(i18n._(msg`Remote server not found.`)),
              i18n._(msg`Remote server not found.`),
            );
            return;
          }
          const client = get().clientFactory(server.endpoint, server.accessToken);
          // Hydrate the thread's history into the shared, threadId-keyed runtime
          // store so the desktop ChatPane renders it (coexists with local threads).
          // A failed history fetch (server asleep/unreachable) must not reject.
          let snapshot: Awaited<ReturnType<RemoteDesktopClient["threadHistory"]>>;
          try {
            snapshot = await client.threadHistory(threadId);
          } catch (error) {
            if (requestSeq !== openRemoteThreadRequestSeq) return;
            reportRemoteServerError(desktopId, error, i18n._(msg`Failed to open remote thread.`));
            return;
          }
          if (requestSeq !== openRemoteThreadRequestSeq) return;
          applyThreadSnapshot(snapshot);
          closeActiveThreadSocket();
          resetRemoteTerminalFeed();
          set({ openThread: buildOpenThread(desktopId, threadId, snapshot) });
          let lastSeenSeq = snapshot.snapshotSeq;
          let reconnectAttempt = 0;
          let resyncInFlight = false;

          const scheduleReconnect = () => {
            if (requestSeq !== openRemoteThreadRequestSeq) {
              return;
            }
            if (activeThreadReconnectTimer) clearTimeout(activeThreadReconnectTimer);
            const delay = remoteThreadSocketReconnectDelay(reconnectAttempt);
            reconnectAttempt += 1;
            activeThreadReconnectTimer = setTimeout(() => {
              activeThreadReconnectTimer = null;
              void connectSocket();
            }, delay);
          };

          const connectSocket = async () => {
            // Stream live events so the conversation updates in real time.
            try {
              const ticket = await client.websocketTicket();
              if (requestSeq !== openRemoteThreadRequestSeq) return;
              const socket = get().socketFactory(client.websocketUrl(ticket, lastSeenSeq));
              if (requestSeq !== openRemoteThreadRequestSeq) {
                try {
                  socket.close();
                } catch {
                  // already closed
                }
                return;
              }
              activeThreadSocket = socket;
              const activateTerminalFeed = () => {
                if (activeThreadSocket !== socket) return;
                setRemoteTerminalSocketSender((message) => {
                  if (!socket.send) return false;
                  try {
                    socket.send(JSON.stringify(message));
                    return true;
                  } catch {
                    return false;
                  }
                });
              };
              socket.onopen = activateTerminalFeed;
              if (socket.readyState === undefined || socket.readyState === 1) {
                activateTerminalFeed();
              }
              const resyncThread = async () => {
                if (resyncInFlight) return;
                resyncInFlight = true;
                try {
                  const nextSnapshot = await client.threadHistory(threadId);
                  if (requestSeq !== openRemoteThreadRequestSeq) return;
                  applyThreadSnapshot(nextSnapshot);
                  lastSeenSeq = Math.max(lastSeenSeq, nextSnapshot.snapshotSeq);
                  set((state) =>
                    state.openThread?.desktopId === desktopId &&
                    state.openThread.threadId === threadId
                      ? { openThread: buildOpenThread(desktopId, threadId, nextSnapshot) }
                      : {},
                  );
                  void get()
                    .refreshServer(desktopId)
                    .catch(() => undefined);
                } catch {
                  if (activeThreadSocket === socket) {
                    try {
                      socket.close();
                    } catch {
                      // already closed
                    }
                  }
                } finally {
                  resyncInFlight = false;
                }
              };
              socket.onmessage = (event) => {
                try {
                  const message = client.parseSocketMessage(String(event.data));
                  if (handleRemoteTerminalServerMessage(message)) return;
                  if (message.type === "event") {
                    reconnectAttempt = 0;
                    lastSeenSeq = Math.max(lastSeenSeq, message.seq);
                    const terminalEvent = message.event as {
                      type?: unknown;
                      threadId?: unknown;
                      exitCode?: unknown;
                    };
                    if (
                      terminalEvent.threadId === threadId &&
                      terminalEvent.type === "thread-reset"
                    ) {
                      emitRemoteTerminalReset(threadId);
                    } else if (
                      terminalEvent.threadId === threadId &&
                      terminalEvent.type === "thread-exited"
                    ) {
                      emitRemoteTerminalExited(
                        threadId,
                        typeof terminalEvent.exitCode === "number" ? terminalEvent.exitCode : null,
                      );
                    }
                    // The remote server publishes ALL of its supervisor events on
                    // this stream. This desktop is a CLIENT, so forward only what
                    // pertains to the open thread — never the remote machine's
                    // desktop-global events (agent statuses, git summaries, …),
                    // which would clobber the local desktop's shared stores.
                    const forward = filterRemoteThreadEvent(message.event, threadId);
                    if (forward !== null) dispatchRemoteSupervisorEvent(forward);
                    if (shouldRefreshRemoteServerAfterEvent(message.event)) {
                      // Debounced+coalesced with the per-server event socket.
                      get().scheduleServerRefresh(desktopId);
                    }
                  }
                  if (message.type === "resync-required") {
                    reconnectAttempt = 0;
                    void resyncThread();
                  }
                } catch {
                  // Ignore malformed frames; the next snapshot refresh re-syncs.
                }
              };
              socket.onclose = () => {
                if (activeThreadSocket !== socket) return;
                activeThreadSocket = null;
                setRemoteTerminalSocketSender(null);
                scheduleReconnect();
              };
            } catch {
              // Static history remains visible; reconnect keeps trying in case the
              // ticket/socket failure was transient.
              scheduleReconnect();
            }
          };

          await connectSocket();
        },

        closeRemoteThread: () => {
          openRemoteThreadRequestSeq += 1;
          closeActiveThreadSocket();
          resetRemoteTerminalFeed();
          if (get().openThread) set({ openThread: null });
        },

        sendRemotePrompt: async (prompt) => {
          const open = get().openThread;
          if (!open || !prompt.trim()) return;
          const client = requireClient(open.desktopId);
          // The overlay captured `open.thread` when it opened; the model/mode may
          // have changed on the remote (or PWA) since. Prefer the latest thread
          // from the refreshed runtime snapshot so we don't ride a stale config
          // that silently reverts the thread. Fall back to the opened snapshot.
          const latest =
            get().runtime[open.desktopId]?.threads.find((t) => t.id === open.threadId) ??
            open.thread;
          await client.sendThreadInput({ threadId: open.threadId, prompt, config: latest.config });
        },

        writeRemoteTerminal: async (data) => {
          const open = get().openThread;
          if (!open) return;
          await requireClient(open.desktopId).writeTerminal({ threadId: open.threadId, data });
        },

        resizeRemoteTerminal: async (size) => {
          const open = get().openThread;
          if (!open) return;
          await requireClient(open.desktopId).resizeTerminal({ threadId: open.threadId, ...size });
        },

        resolveThreadRequest: async (input) => {
          await requireClient(input.desktopId).resolveRequest({
            threadId: input.threadId,
            requestId: input.requestId,
            method: input.method,
            response: input.response,
          });
        },

        rollbackThreadConversation: async (input) => {
          await requireClient(input.desktopId).gitCall("rollbackThreadConversation", {
            threadId: input.threadId,
            numTurns: input.numTurns,
            ...(input.config ? { config: input.config } : {}),
          });
        },

        restoreFileCheckpoint: async (input) => {
          await requireClient(input.desktopId).gitCall("restoreFileCheckpoint", {
            threadId: input.threadId,
            checkpointItemId: input.checkpointItemId,
            projectLocation: input.projectLocation,
          });
        },

        readProjectFile: async (input) => {
          return (await requireClient(input.desktopId).gitCall("readProjectFile", {
            projectLocation: input.projectLocation,
            path: input.path,
          })) as ReadProjectFileResult;
        },

        writeProjectFile: async (input) => {
          return (await requireClient(input.desktopId).gitCall("writeProjectFile", {
            projectLocation: input.projectLocation,
            path: input.path,
            content: input.content,
            baseModifiedAtMs: input.baseModifiedAtMs,
          })) as WriteProjectFileResult;
        },

        pairServer: ({ endpoint, token }) =>
          pairAtEndpoint({ endpoint, token, transport: { kind: "direct" } }),

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

        removeServer: (desktopId) => {
          const removed = get().servers.find((server) => server.desktopId === desktopId);
          closeRemoteServerEventSocket(desktopId);
          // If the open live-chat thread belongs to this server, tear it (and its
          // socket) down first so it isn't left orphaned with no way to interact.
          if (get().openThread?.desktopId === desktopId) {
            get().closeRemoteThread();
          }
          set((state) => {
            const { [desktopId]: _removed, ...runtime } = state.runtime;
            return {
              servers: state.servers.filter((server) => server.desktopId !== desktopId),
              runtime,
            };
          });
          if (removed?.transport?.kind === "ssh") {
            void readBridge()
              .sshDisconnect({ connectionId: removed.transport.connection.id })
              .catch(() => undefined);
          }
        },

        refreshServer: async (desktopId) => {
          const server = get().servers.find((entry) => entry.desktopId === desktopId);
          if (!server) return;
          // A debounced refresh may already be pending; this immediate refresh
          // supersedes it so we don't fire a second GET moments later.
          clearRemoteServerRefreshTimer(desktopId);
          // Tag this refresh with a monotonic request id. Two sockets can each
          // trigger a refresh, and their snapshot GETs may resolve out of order;
          // ignore any result that isn't the latest so a stale snapshot never
          // overwrites a newer one (e.g. shows "running" after "finished").
          const requestSeq = (remoteServerRefreshSeqByDesktopId.get(desktopId) ?? 0) + 1;
          remoteServerRefreshSeqByDesktopId.set(desktopId, requestSeq);
          const isLatest = () => remoteServerRefreshSeqByDesktopId.get(desktopId) === requestSeq;
          // Replace the whole runtime entry; snapshots are kept across a
          // connecting/error transition so the UI doesn't flash empty. Skip the
          // write if the server was removed while a refresh was in flight, so a
          // late snapshot doesn't resurrect a removed server's runtime.
          const setRuntime = (entry: RemoteServerRuntime) =>
            set((state) =>
              state.servers.some((s) => s.desktopId === desktopId)
                ? { runtime: { ...state.runtime, [desktopId]: entry } }
                : {},
            );
          const cached = () => get().runtime[desktopId];
          // Skip the "connecting" flicker once a snapshot is cached — only
          // downgrade the status on failure. First-ever refresh still shows it.
          if (!cached()) {
            setRuntime({ status: "connecting", projects: [], threads: [] });
          }
          try {
            const client = get().clientFactory(server.endpoint, server.accessToken);
            const [snapshot, agentStatuses] = await Promise.all([
              client.snapshot(),
              client.agentStatuses(),
            ]);
            // Drop a stale (superseded) result so out-of-order resolutions don't
            // regress the UI or the seq cursor.
            if (!isLatest()) return;
            // Clamp the stored seq with Math.max so a stale response can't
            // regress the cursor a live socket already advanced past.
            remoteServerSnapshotSeqByDesktopId.set(
              desktopId,
              Math.max(
                remoteServerSnapshotSeqByDesktopId.get(desktopId) ?? 0,
                snapshot.snapshotSeq,
              ),
            );
            setRuntime({
              status: "online",
              projects: snapshot.projects,
              threads: snapshot.threads,
              agentStatuses,
            });
          } catch (error) {
            if (!isLatest()) return;
            setRuntime({
              status: "error",
              message: error instanceof Error ? error.message : i18n._(msg`Connection failed.`),
              projects: cached()?.projects ?? [],
              threads: cached()?.threads ?? [],
            });
          }
        },

        scheduleServerRefresh: (desktopId) => {
          if (!get().servers.some((entry) => entry.desktopId === desktopId)) return;
          clearRemoteServerRefreshTimer(desktopId);
          remoteServerRefreshTimers.set(
            desktopId,
            setTimeout(() => {
              remoteServerRefreshTimers.delete(desktopId);
              if (!get().servers.some((entry) => entry.desktopId === desktopId)) return;
              void get()
                .refreshServer(desktopId)
                .catch(() => undefined);
            }, REMOTE_SERVER_REFRESH_DEBOUNCE_MS),
          );
        },

        connectAll: async () => {
          // Coalesce concurrent callers (the sidebar and the settings panel both
          // connect on mount) so servers aren't snapshotted twice on startup.
          if (connectAllInFlight) return connectAllInFlight;
          connectAllInFlight = Promise.all(get().servers.map(connectServer))
            .then(() => undefined)
            .finally(() => {
              connectAllInFlight = null;
            });
          return connectAllInFlight;
        },

        reconnectServer: async (desktopId) => {
          const server = get().servers.find((entry) => entry.desktopId === desktopId);
          if (!server) return;
          await connectServer(server);
        },

        runProjectCommand: async (desktopId, command) => {
          await requireClient(desktopId).projectCommand(command);
          await get().refreshServer(desktopId);
        },

        interruptThread: async (desktopId, threadId) => {
          // Callers use `void interruptThread(...)`; the renderer's global
          // unhandledrejection handler shows the full-app crash screen for any
          // stray rejection. Catch here so an offline/unreachable server surfaces
          // a toast (and the server's runtime status) instead of crashing the UI.
          try {
            await requireClient(desktopId).interruptThread(threadId);
          } catch (error) {
            reportRemoteServerError(
              desktopId,
              error,
              i18n._(msg`Failed to interrupt remote thread.`),
            );
          }
        },

        closeThread: async (desktopId, threadId) => {
          try {
            await requireClient(desktopId).closeThread(threadId);
            await get().refreshServer(desktopId);
          } catch (error) {
            reportRemoteServerError(desktopId, error, i18n._(msg`Failed to close remote thread.`));
          }
        },
      };
    },
    {
      name: "poracode-remote-servers",
      storage: createJSONStorage(() => localStorage),
      // Persist only durable connection identity (incl. the bearer accessToken)
      // so connections survive a reload; runtime snapshots are re-fetched on
      // connect and the socket/client factories are process-local. Storing the
      // token in renderer localStorage mirrors the PWA (IndexedDB) and is scoped
      // to the Electron renderer; the server can revoke a session at any time.
      partialize: (state) => ({ servers: state.servers }),
    },
  ),
);

/**
 * Test-only: tear down all process-local connection state (event sockets, the
 * open-thread socket, debounce/refresh timers, and seq cursors) so each test
 * starts from a clean slate. Pairing now opens an event socket, so leaked module
 * state would otherwise bleed across tests.
 */
export function __resetRemoteServersStoreForTest(): void {
  closeAllRemoteServerEventSockets();
  closeActiveThreadSocket();
  for (const desktopId of [...remoteServerRefreshTimers.keys()]) {
    clearRemoteServerRefreshTimer(desktopId);
  }
  remoteServerSnapshotSeqByDesktopId.clear();
  remoteServerRefreshSeqByDesktopId.clear();
  connectAllInFlight = null;
  openRemoteThreadRequestSeq = 0;
  resetRemoteTerminalFeed();
  useRemoteServersStore.setState({ openThread: null, remoteProjectDraft: null });
}
