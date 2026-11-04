import { pinThreadRow } from "@/renderer/state/threadLaunchIntents";
import type { PromptSegment, RemoteThreadCommand, RuntimeEvent, Thread } from "@/shared/contracts";
import type { HostSession } from "@/renderer/hostTransport/hostSession";
import { inlinePromptSegmentText } from "@/shared/promptContent";
import type { RemoteProjectCommand, RemoteThreadSnapshot } from "@/shared/remote";
import type { PersistedRuntimeItem } from "@/shared/ipc";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import {
  readManagedLoopbackActivation,
  subscribeManagedLoopbackActivation,
} from "@/renderer/hostTransport/loopbackHttpWsTransport";
import {
  managedRootHostSession,
  refreshManagedRootCatalogSoon,
} from "./managedRootCatalog/rootCatalogAdapter";
import { getManagedParentAuthorityState } from "./remoteServers/managedLoopbackOwner";
import { remoteConnectionKey } from "./remoteServers/types";
import {
  isApplyingHostOriginatedManagedRootMutation,
  managedRootOfflineError,
  managedRootOwner,
  sendManagedRootProjectCommand,
  sendManagedRootThreadCommand,
} from "./managedRootCatalog/rootCatalogCommands";
import { applyRootCatalogThreadRows } from "./managedRootCatalog/rootCatalogRows";
import {
  isProjectedRemoteEntityId,
  projectRemoteThread,
  projectRemoteRuntimeItems,
  projectRemoteThreadEvent,
  projectRemoteThreadSnapshot,
  remoteOwner,
  remoteProjectId,
  remoteThreadId,
  unprojectRemoteThreadId,
} from "./remoteProjection";
import { useAppStore } from "./appStore";
import { managedCatalogOrder, pairedCatalogOrder, type HostCatalogOrder } from "./hostCatalogOrder";
import {
  currentRemoteServerGeneration,
  hasRemoteServerCursorSyncV2,
  remoteHistoryResumeAuthority,
  remoteServerHostSession,
} from "./remoteServers/eventSocketRegistry";
import { useRemoteServersStore } from "./remoteServersStore";

/**
 * The host that owns one thread or project, whichever host that is.
 *
 * The desktop's own threads live on its managed host (reached over the
 * loopback client); a paired host's threads are projected rows. Both speak the
 * same host contract, so every flow resolves the owner once and calls through
 * this handle instead of branching on where the row lives.
 */
export interface EntityHost {
  readonly kind: "managed" | "paired";
  /** Paired connection key; undefined for the managed host. */
  readonly connectionKey: string | undefined;
  /** The entity's id on its owning host. */
  readonly hostId: string;
  /**
   * The host and the connection this handle was resolved on. A response read
   * through an older connection must not be applied after a reconnect.
   */
  readonly sessionKey: string;
  /** True while that connection is still the live one. */
  isCurrent(): boolean;
  /** Calls `listener` once this handle's connection has been replaced. */
  onReplaced(listener: () => void): () => void;
  /**
   * The opaque authority this host's history notices and capabilities are
   * recorded under, or undefined while it has no live connection.
   */
  readonly authority: string | undefined;
  /**
   * The authority this connection's history-resume cursors are recorded
   * under, or undefined while it has no live connection. It changes with every
   * reconnect, so a cursor never resumes across connection incarnations.
   */
  readonly historyResumeAuthority: string | undefined;
  /** This host's live sequence session: applied event sequences and the resume fence. */
  readonly session: HostSession;
  /** True while this host's connection is up. */
  isConnected(): boolean;
  /**
   * Whether this connection's history reads omit terminal scrollback because
   * its event stream delivers the scrollback baseline itself.
   */
  readonly omitsHistoryScrollback: boolean;
  /** Maps a history snapshot this host served into the store's namespace. */
  projectSnapshot(snapshot: RemoteThreadSnapshot): RemoteThreadSnapshot;
  /** Maps runtime items this host served into the store's namespace. */
  projectRuntimeItems(items: PersistedRuntimeItem[]): PersistedRuntimeItem[];
  /** Maps a thread row this host served into the store's namespace. */
  projectThread(thread: Thread): Thread;
  /** Maps live runtime events of this handle's thread into the store's namespace. */
  projectRuntimeEvents(events: RuntimeEvent[]): RuntimeEvent[];
  /**
   * Stable key of this host's entries in the on-device recent-history cache,
   * or undefined while the host's identity is not verified.
   */
  readonly recentHistoryKey: string | undefined;
  withClient<Result>(run: (client: RemoteDesktopClient) => Promise<Result>): Promise<Result>;
  /** Sends one thread intent, then lets the host's catalog catch up. */
  sendThreadCommand(
    command: RemoteThreadCommand,
    options?: { readonly commandId?: string },
  ): Promise<void>;
  /** Sends one project intent, then lets the host's catalog catch up. */
  runProjectCommand(
    command: RemoteProjectCommand,
    options?: { readonly commandId?: string },
  ): Promise<void>;
  /** Keeps a thread row (by store id) resident while an intent on it is unconfirmed. */
  pinThread(viewThreadId: string): () => void;
  /** Asks the host's catalog for a follow-up pass. */
  refreshCatalog(): void;
  /** Maps a store thread id on this host to the host's own id. */
  hostThreadId(viewThreadId: string): string | undefined;
  /** The store identity of a new thread row this host will own. */
  projectThreadRow(hostThreadId: string): {
    readonly threadId: string;
    readonly remoteServerId?: string;
    readonly remoteId?: string;
  };
  /** Maps a store project id on this host to the host's own id. */
  hostProjectId(viewProjectId: string): string | undefined;
  /**
   * Whether this host files threads and projects in this client's own
   * workspace ids. A paired host keeps its own workspaces, so a client
   * workspace id means nothing there.
   */
  readonly sharesClientWorkspaces: boolean;
  /**
   * Whether this host runs on this machine (see `hostRunsOnThisMachine`): it
   * shares this machine's filesystem, home directory, native dialogs, CLI
   * sign-ins and desktop-internal event frames. A flow that hands this machine's
   * files, paths or credentials to the host branches on this, never on the
   * connection kind.
   */
  readonly runsOnThisMachine: boolean;
  /**
   * Maps prompt segments into this host's namespace. A thread mention this
   * host cannot resolve (a thread on another host) degrades to its inline
   * text, so the agent still sees the reference.
   */
  toHostSegments(segments: readonly PromptSegment[]): PromptSegment[];
  /** Installs a thread row this host returned, as the store row it maps to. */
  adoptThreadRow(row: Thread): Thread;
  /** How this host's catalog fences, confirms, and recovers order intents. */
  readonly catalogOrder: HostCatalogOrder;
}

interface HostedEntity {
  readonly id: string;
  readonly remoteServerId?: string | undefined;
  readonly remoteId?: string | undefined;
}

function mapThreadMentions(
  segments: readonly PromptSegment[],
  hostThreadId: (viewThreadId: string) => string | undefined,
): PromptSegment[] {
  return segments.map((segment) => {
    if (segment.kind !== "thread") return segment;
    const threadId = hostThreadId(segment.threadId);
    return threadId
      ? { ...segment, threadId }
      : { kind: "text", content: inlinePromptSegmentText(segment) };
  });
}

function pairedHost(desktopId: string, hostId: string): EntityHost {
  const store = () => useRemoteServersStore.getState();
  const generation = currentRemoteServerGeneration(desktopId);
  return {
    kind: "paired",
    connectionKey: desktopId,
    hostId,
    sessionKey: `paired:${desktopId}:${generation}`,
    authority: desktopId,
    historyResumeAuthority: remoteHistoryResumeAuthority(desktopId),
    get session() {
      return remoteServerHostSession(desktopId);
    },
    isConnected: () => store().runtime[desktopId]?.status === "online",
    get omitsHistoryScrollback() {
      return hasRemoteServerCursorSyncV2(desktopId);
    },
    projectSnapshot: (snapshot) => projectRemoteThreadSnapshot(desktopId, snapshot),
    projectRuntimeItems: (items) => projectRemoteRuntimeItems(desktopId, items),
    projectThread: (thread) => projectRemoteThread(desktopId, thread),
    projectRuntimeEvents: (events) =>
      (
        projectRemoteThreadEvent(desktopId, {
          type: "thread-runtime-events",
          threadId: hostId,
          events,
        }) as { readonly events: RuntimeEvent[] }
      ).events,
    get recentHistoryKey() {
      const server = store().servers.find((entry) => remoteConnectionKey(entry) === desktopId);
      return server ? `paired:${server.desktopId}` : undefined;
    },
    isCurrent: () => currentRemoteServerGeneration(desktopId) === generation,
    onReplaced: (listener) =>
      useRemoteServersStore.subscribe(() => {
        if (currentRemoteServerGeneration(desktopId) !== generation) listener();
      }),
    withClient: (run) => store().withClient(desktopId, run),
    // The store's command entry already schedules the catalog refresh.
    sendThreadCommand: (command, ...options) =>
      store().sendThreadCommand(desktopId, command, ...options),
    runProjectCommand: (command, ...options) =>
      store().runProjectCommand(desktopId, command, ...options),
    pinThread: pinThreadRow,
    hostThreadId: (viewThreadId) => unprojectRemoteThreadId(desktopId, viewThreadId),
    projectThreadRow: (hostThreadId) => ({
      threadId: remoteThreadId(desktopId, hostThreadId),
      remoteServerId: desktopId,
      remoteId: hostThreadId,
    }),
    hostProjectId: (viewProjectId) => {
      // The project row carries its host id; the id form is only a fallback.
      const row = remoteOwner(
        useAppStore.getState().projects.find((project) => project.id === viewProjectId),
      );
      if (row) return row.desktopId === desktopId ? row.remoteId : undefined;
      const prefix = remoteProjectId(desktopId, "");
      return viewProjectId.startsWith(prefix) && viewProjectId.length > prefix.length
        ? viewProjectId.slice(prefix.length)
        : undefined;
    },
    sharesClientWorkspaces: false,
    runsOnThisMachine: false,
    catalogOrder: pairedCatalogOrder(desktopId, generation, (run) =>
      store().withClient(desktopId, run),
    ),
    toHostSegments: (segments) =>
      mapThreadMentions(segments, (viewThreadId) =>
        unprojectRemoteThreadId(desktopId, viewThreadId),
      ),
    refreshCatalog: () => store().scheduleServerRefresh(desktopId),
    adoptThreadRow: (row) => {
      const projected = projectRemoteThread(desktopId, row);
      useAppStore.setState((state) => ({
        threads: [...state.threads.filter((thread) => thread.id !== projected.id), projected],
      }));
      store().scheduleServerRefresh(desktopId);
      return projected;
    },
  };
}

function managedHost(hostId: string): EntityHost {
  const activation = readManagedLoopbackActivation();
  return {
    kind: "managed",
    connectionKey: undefined,
    hostId,
    sessionKey: `managed:${activation?.seq ?? "offline"}`,
    authority: activation?.authority,
    historyResumeAuthority: activation?.authority,
    session: managedRootHostSession(),
    isConnected: () => readManagedLoopbackActivation() !== null,
    omitsHistoryScrollback: false,
    projectSnapshot: (snapshot) => snapshot,
    projectRuntimeItems: (items) => items,
    projectThread: (thread) => thread,
    projectRuntimeEvents: (events) => events,
    get recentHistoryKey() {
      const parent = getManagedParentAuthorityState();
      return activation &&
        parent.status === "ready" &&
        parent.authority.client === activation.client
        ? `managed:${parent.authority.ref.hostDesktopId}`
        : undefined;
    },
    isCurrent: () => activation !== null && readManagedLoopbackActivation() === activation,
    onReplaced: (listener) =>
      subscribeManagedLoopbackActivation(() => {
        if (readManagedLoopbackActivation() !== activation) listener();
      }),
    withClient: (run) => {
      if (!activation) return Promise.reject(managedRootOfflineError());
      return run(activation.client);
    },
    sendThreadCommand: async (command, ...options) => {
      try {
        await sendManagedRootThreadCommand(command, ...options);
      } finally {
        refreshManagedRootCatalogSoon();
      }
    },
    runProjectCommand: async (command, ...options) => {
      try {
        await sendManagedRootProjectCommand(command, ...options);
      } finally {
        refreshManagedRootCatalogSoon();
      }
    },
    pinThread: pinThreadRow,
    hostThreadId: (viewThreadId) =>
      isProjectedRemoteEntityId(viewThreadId, "thread") ? undefined : viewThreadId,
    projectThreadRow: (hostThreadId) => ({ threadId: hostThreadId }),
    hostProjectId: (viewProjectId) =>
      isProjectedRemoteEntityId(viewProjectId, "project") ? undefined : viewProjectId,
    sharesClientWorkspaces: true,
    runsOnThisMachine: true,
    catalogOrder: managedCatalogOrder,
    toHostSegments: (segments) =>
      mapThreadMentions(segments, (viewThreadId) =>
        isProjectedRemoteEntityId(viewThreadId, "thread") ? undefined : viewThreadId,
      ),
    refreshCatalog: refreshManagedRootCatalogSoon,
    adoptThreadRow: (row) => {
      applyRootCatalogThreadRows([row], new Set());
      return row;
    },
  };
}

/** True when both handles address the same host. */
export function isSameHost(left: EntityHost, right: EntityHost): boolean {
  return left.kind === right.kind && left.connectionKey === right.connectionKey;
}

/** The owning host of a thread or project row, if any host owns it. */
export function entityHost(entity: HostedEntity | null | undefined): EntityHost | undefined {
  if (!entity) return undefined;
  const paired = remoteOwner(entity);
  if (paired) return pairedHost(paired.desktopId, paired.remoteId);
  const managed = managedRootOwner(entity);
  return managed ? managedHost(managed.threadId) : undefined;
}

/**
 * A host itself, for flows that act on a host rather than on one of its rows
 * (importing its sessions). `undefined` selects the desktop's managed host,
 * which exists only under the desktop runtime; a connection key selects that
 * paired host. There is no row, so the handle's `hostId` is empty.
 */
export function hostHandle(connectionKey: string | undefined): EntityHost | undefined {
  if (connectionKey !== undefined) return pairedHost(connectionKey, "");
  return managedRootOwner({ id: "" }) ? managedHost("") : undefined;
}

/**
 * The host a user intent on this row must be sent to. A host-forwarded
 * command being mirrored locally is not a new intent: echoing it back would
 * resend the host its own command, so callers apply it locally instead.
 */
export function intentHost(entity: HostedEntity | null | undefined): EntityHost | undefined {
  if (isApplyingHostOriginatedManagedRootMutation()) return undefined;
  return entityHost(entity);
}
