import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { msg } from "@lingui/core/macro";
import type {
  Project,
  ProjectLocation,
  ReadProjectFileResult,
  Thread,
  ThreadServerRequestId,
  WriteProjectFileResult,
} from "@/shared/contracts";
import { RemoteDesktopClient, type RemoteFetch } from "@/shared/remote/client";
import {
  REMOTE_STANDARD_SCOPES,
  type RemoteAccessScope,
  type RemoteProjectCommand,
} from "@/shared/remote";
import { readBridge } from "@/renderer/bridge";
import { i18n } from "@/renderer/i18n/i18n";
// storeSync lives under src/mobile but only depends on @/renderer state (it is
// the PWA's counterpart to the renderer's IPC listeners). Reused here so the
// desktop hydrates a remote thread into the same threadId-keyed runtime store.
// TODO(phase-4): relocate the shared sync helpers to a renderer/shared module.
import { applyThreadSnapshot, dispatchRemoteSupervisorEvent } from "@/mobile/storeSync";

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
 * Desktop-as-client. Lets the Electron desktop connect to *other* Lightcode
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
}

/** In-memory connection state for a server; never persisted. */
export interface RemoteServerRuntime {
  readonly status: RemoteServerStatus;
  readonly message?: string;
  readonly projects: Project[];
  readonly threads: Thread[];
}

/** The remote thread currently open for live chat in the desktop. */
export interface OpenRemoteThread {
  readonly desktopId: string;
  readonly threadId: string;
  readonly thread: Thread;
}

/** Injectable so tests can supply a fake client; defaults to the real one. */
export type RemoteClientFactory = (endpoint: string, accessToken?: string) => RemoteDesktopClient;

/** Minimal WebSocket shape; injectable so tests don't need a real socket. */
export interface RemoteSocketLike {
  close(): void;
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

function remoteThreadSocketReconnectDelay(attempt: number): number {
  return Math.min(
    REMOTE_THREAD_SOCKET_RECONNECT_MAX_MS,
    REMOTE_THREAD_SOCKET_RECONNECT_BASE_MS * 2 ** attempt,
  );
}

function remoteServerEventSocketReconnectDelay(attempt: number): number {
  const ceiling = remoteThreadSocketReconnectDelay(attempt);
  return ceiling / 2 + Math.random() * (ceiling / 2);
}

function closeRemoteServerEventSocket(desktopId: string): void {
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
  /** Open a remote thread: hydrate its history into the store and stream live
   * events over a WebSocket so the desktop ChatPane renders it live. */
  openRemoteThread(desktopId: string, threadId: string): Promise<void>;
  /** Close the open remote thread and its socket. */
  closeRemoteThread(): void;
  /** Send a prompt to the open remote thread. */
  sendRemotePrompt(prompt: string): Promise<void>;
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
  removeServer(desktopId: string): void;
  /** Re-fetch a connected server's snapshot. */
  refreshServer(desktopId: string): Promise<void>;
  /** Connect every persisted server (called once on app start). */
  connectAll(): Promise<void>;
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
                    void get().refreshServer(server.desktopId);
                  }
                }
                if (message.type === "resync-required") {
                  void get().refreshServer(server.desktopId);
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

      return {
        servers: [],
        runtime: {},
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

        openRemoteThread: async (desktopId, threadId) => {
          const requestSeq = openRemoteThreadRequestSeq + 1;
          openRemoteThreadRequestSeq = requestSeq;
          const server = get().servers.find((entry) => entry.desktopId === desktopId);
          if (!server) throw new Error(i18n._(msg`Remote server not found.`));
          const client = get().clientFactory(server.endpoint, server.accessToken);
          // Hydrate the thread's history into the shared, threadId-keyed runtime
          // store so the desktop ChatPane renders it (coexists with local threads).
          const snapshot = await client.threadHistory(threadId);
          if (requestSeq !== openRemoteThreadRequestSeq) return;
          applyThreadSnapshot(snapshot);
          closeActiveThreadSocket();
          set({ openThread: { desktopId, threadId, thread: snapshot.thread } });
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
                      ? { openThread: { desktopId, threadId, thread: nextSnapshot.thread } }
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
                  if (message.type === "event") {
                    reconnectAttempt = 0;
                    lastSeenSeq = Math.max(lastSeenSeq, message.seq);
                    dispatchRemoteSupervisorEvent(message.event);
                    if (shouldRefreshRemoteServerAfterEvent(message.event)) {
                      void get()
                        .refreshServer(desktopId)
                        .catch(() => undefined);
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
          if (get().openThread) set({ openThread: null });
        },

        sendRemotePrompt: async (prompt) => {
          const open = get().openThread;
          if (!open || !prompt.trim()) return;
          const server = get().servers.find((entry) => entry.desktopId === open.desktopId);
          if (!server) throw new Error(i18n._(msg`Remote server not found.`));
          await get()
            .clientFactory(server.endpoint, server.accessToken)
            .sendThreadInput({ threadId: open.threadId, prompt, config: open.thread.config });
        },

        resolveThreadRequest: async (input) => {
          const server = get().servers.find((entry) => entry.desktopId === input.desktopId);
          if (!server) throw new Error(i18n._(msg`Remote server not found.`));
          await get().clientFactory(server.endpoint, server.accessToken).resolveRequest({
            threadId: input.threadId,
            requestId: input.requestId,
            method: input.method,
            response: input.response,
          });
        },

        rollbackThreadConversation: async (input) => {
          const server = get().servers.find((entry) => entry.desktopId === input.desktopId);
          if (!server) throw new Error(i18n._(msg`Remote server not found.`));
          await get()
            .clientFactory(server.endpoint, server.accessToken)
            .gitCall("rollbackThreadConversation", {
              threadId: input.threadId,
              numTurns: input.numTurns,
            });
        },

        restoreFileCheckpoint: async (input) => {
          const server = get().servers.find((entry) => entry.desktopId === input.desktopId);
          if (!server) throw new Error(i18n._(msg`Remote server not found.`));
          await get()
            .clientFactory(server.endpoint, server.accessToken)
            .gitCall("restoreFileCheckpoint", {
              threadId: input.threadId,
              checkpointItemId: input.checkpointItemId,
              projectLocation: input.projectLocation,
            });
        },

        readProjectFile: async (input) => {
          const server = get().servers.find((entry) => entry.desktopId === input.desktopId);
          if (!server) throw new Error(i18n._(msg`Remote server not found.`));
          return (await get()
            .clientFactory(server.endpoint, server.accessToken)
            .gitCall("readProjectFile", {
              projectLocation: input.projectLocation,
              path: input.path,
            })) as ReadProjectFileResult;
        },

        writeProjectFile: async (input) => {
          const server = get().servers.find((entry) => entry.desktopId === input.desktopId);
          if (!server) throw new Error(i18n._(msg`Remote server not found.`));
          return (await get()
            .clientFactory(server.endpoint, server.accessToken)
            .gitCall("writeProjectFile", {
              projectLocation: input.projectLocation,
              path: input.path,
              content: input.content,
              baseModifiedAtMs: input.baseModifiedAtMs,
            })) as WriteProjectFileResult;
        },

        pairServer: async ({ endpoint, token }) => {
          const normalized = normalizeEndpoint(endpoint);
          const factory = get().clientFactory;
          const tokenResult = await factory(normalized).exchangePairingCredential({
            credential: token,
            scopes: REMOTE_STANDARD_SCOPES,
          });
          const client = factory(normalized, tokenResult.accessToken);
          const [environment, snapshot] = await Promise.all([
            client.environment(),
            client.snapshot(),
          ]);
          const record: RemoteServerRecord = {
            desktopId: environment.desktopId,
            label: environment.label,
            endpoint: normalized,
            accessToken: tokenResult.accessToken,
            scopes: tokenResult.scopes,
          };
          set((state) => ({
            servers: [...state.servers.filter((s) => s.desktopId !== record.desktopId), record],
            runtime: {
              ...state.runtime,
              [record.desktopId]: {
                status: "online",
                projects: snapshot.projects,
                threads: snapshot.threads,
              },
            },
          }));
          remoteServerSnapshotSeqByDesktopId.set(record.desktopId, snapshot.snapshotSeq);
          return record;
        },

        removeServer: (desktopId) => {
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
        },

        refreshServer: async (desktopId) => {
          const server = get().servers.find((entry) => entry.desktopId === desktopId);
          if (!server) return;
          // Replace the whole runtime entry; snapshots are kept across a
          // connecting/error transition so the UI doesn't flash empty.
          const setRuntime = (entry: RemoteServerRuntime) =>
            set((state) => ({ runtime: { ...state.runtime, [desktopId]: entry } }));
          const cached = () => get().runtime[desktopId];
          setRuntime({
            status: "connecting",
            projects: cached()?.projects ?? [],
            threads: cached()?.threads ?? [],
          });
          try {
            const snapshot = await get()
              .clientFactory(server.endpoint, server.accessToken)
              .snapshot();
            remoteServerSnapshotSeqByDesktopId.set(desktopId, snapshot.snapshotSeq);
            setRuntime({
              status: "online",
              projects: snapshot.projects,
              threads: snapshot.threads,
            });
          } catch (error) {
            setRuntime({
              status: "error",
              message: error instanceof Error ? error.message : i18n._(msg`Connection failed.`),
              projects: cached()?.projects ?? [],
              threads: cached()?.threads ?? [],
            });
          }
        },

        connectAll: async () => {
          // Coalesce concurrent callers (the sidebar and the settings panel both
          // connect on mount) so servers aren't snapshotted twice on startup.
          if (connectAllInFlight) return connectAllInFlight;
          connectAllInFlight = Promise.all(
            get().servers.map(async (server) => {
              await get().refreshServer(server.desktopId);
              startRemoteServerEventStream(server);
            }),
          )
            .then(() => undefined)
            .finally(() => {
              connectAllInFlight = null;
            });
          return connectAllInFlight;
        },

        runProjectCommand: async (desktopId, command) => {
          const server = get().servers.find((entry) => entry.desktopId === desktopId);
          if (!server) throw new Error(i18n._(msg`Remote server not found.`));
          await get().clientFactory(server.endpoint, server.accessToken).projectCommand(command);
          await get().refreshServer(desktopId);
        },

        interruptThread: async (desktopId, threadId) => {
          const server = get().servers.find((entry) => entry.desktopId === desktopId);
          if (!server) throw new Error(i18n._(msg`Remote server not found.`));
          await get().clientFactory(server.endpoint, server.accessToken).interruptThread(threadId);
        },

        closeThread: async (desktopId, threadId) => {
          const server = get().servers.find((entry) => entry.desktopId === desktopId);
          if (!server) throw new Error(i18n._(msg`Remote server not found.`));
          await get().clientFactory(server.endpoint, server.accessToken).closeThread(threadId);
          await get().refreshServer(desktopId);
        },
      };
    },
    {
      name: "lightcode-remote-servers",
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
