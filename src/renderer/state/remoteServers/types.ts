import type {
  BrowseHostDirectoryResult,
  Project,
  RemoteThreadCommand,
  Thread,
  TerminalSize,
} from "@/shared/contracts";
import type { RemoteDesktopClient, StartRemoteNewThreadInput } from "@/shared/remote/client";
import type {
  RemoteAccessScope,
  RemoteAgentStatuses,
  RemoteHostUpdateState,
  RemoteHostMode,
  RemoteImageRefValue,
  RemoteProjectCommand,
  RemoteShellSnapshot,
} from "@/shared/remote";
import type { HostServiceCapabilities } from "@/shared/hostControlProtocol";
import type { SshConnectionConfig } from "@/shared/ssh";

/** Transport reachability is offline; reachable protocol or action failures are errors. */
export type RemoteServerStatus = "connecting" | "online" | "offline" | "error";

/**
 * Host-owned environment transport (C1, R2). `environmentId` is the host-minted
 * environment identity; `childDesktopId` is the verified child identity and is
 * never a map key. The parent is additively discriminated, one variant only:
 *
 * - `parentConnectionId` (v2, remote parent): resolves the reachability owner
 *   (a direct/ssh record on this device);
 * - `managedHostDesktopId` (managed parent): resolves the desktop's own active
 *   loopback authority (no persisted row, no persisted parent token).
 *
 * A persisted managed child can never be read as a remote child: an older
 * reader looks up `findServer(undefined)` and fails closed. The writer never
 * emits both fields, and {@link environmentParentRef} refuses anything but
 * exactly one non-empty string.
 */
export interface RemoteEnvironmentTransport {
  readonly kind: "environment";
  readonly environmentId: string;
  readonly childDesktopId?: string;
  readonly parentConnectionId?: string;
  readonly managedHostDesktopId?: string;
}

/**
 * The structurally discriminated parent of one host-owned environment. Kind is
 * checked before every comparison and cache key, so an arbitrary direct
 * `connectionId` (including one shaped like a managed or grant key) can never
 * select the managed authority and a managed host id can never select a
 * persisted record.
 */
export type EnvironmentParentRef =
  | { readonly kind: "connection"; readonly connectionId: string }
  | { readonly kind: "managed"; readonly hostDesktopId: string };

/**
 * Boundary resolver: EXACTLY one parent field may be present, and it must be a
 * non-empty string. Both-present (even when one side is null/empty), neither,
 * empty, and non-string all fail closed (`undefined`), so a crafted or future
 * transport variant gains no authority and no mixed record ever selects a
 * parent.
 */
export function environmentParentRef(transport: {
  readonly parentConnectionId?: unknown;
  readonly managedHostDesktopId?: unknown;
}): EnvironmentParentRef | undefined {
  const hasRemote = transport.parentConnectionId !== undefined;
  const hasManaged = transport.managedHostDesktopId !== undefined;
  if (hasRemote === hasManaged) return undefined;
  if (hasRemote) {
    const connectionId = transport.parentConnectionId;
    return typeof connectionId === "string" && connectionId.length > 0
      ? { kind: "connection", connectionId }
      : undefined;
  }
  const hostDesktopId = transport.managedHostDesktopId;
  return typeof hostDesktopId === "string" && hostDesktopId.length > 0
    ? { kind: "managed", hostDesktopId }
    : undefined;
}

/** One canonical in-memory key per parent ref; never a raw parent string. */
export function environmentParentCacheKey(ref: EnvironmentParentRef): string {
  return ref.kind === "connection"
    ? `connection\u0000${ref.connectionId}`
    : `managed\u0000${ref.hostDesktopId}`;
}

/**
 * Rebuild a ref from its canonical cache key. The key is lossless for both
 * variants, so effect dependencies can be the string key and reconstruct the
 * (per-render) ref inside the effect without depending on object identity.
 */
export function environmentParentRefFromCacheKey(key: string): EnvironmentParentRef | undefined {
  const separator = key.indexOf("\u0000");
  if (separator <= 0) return undefined;
  const kind = key.slice(0, separator);
  const id = key.slice(separator + 1);
  if (id.length === 0) return undefined;
  if (kind === "connection") return { kind: "connection", connectionId: id };
  if (kind === "managed") return { kind: "managed", hostDesktopId: id };
  return undefined;
}

/** True when this transport's parent is the given ref. */
export function environmentTransportHasParent(
  transport: RemoteEnvironmentTransport,
  ref: EnvironmentParentRef,
): boolean {
  const resolved = environmentParentRef(transport);
  if (!resolved) return false;
  if (resolved.kind === "connection" && ref.kind === "connection") {
    return resolved.connectionId === ref.connectionId;
  }
  if (resolved.kind === "managed" && ref.kind === "managed") {
    return resolved.hostDesktopId === ref.hostDesktopId;
  }
  return false;
}

export interface RemoteServerRecord {
  /**
   * Local connection key (store v2). All per-connection maps, grants, pins,
   * event sockets, and projections key by this value; `desktopId` is the host
   * identity only. v2 migration sets `connectionId = desktopId` for existing
   * direct/ssh records (byte-identical behavior); environment records mint a
   * fresh local UUID at pairing and set `desktopId` to the verified
   * `childDesktopId`. Absent only on pre-migration in-memory fixtures; use
   * {@link remoteConnectionKey}.
   */
  readonly connectionId?: string;
  readonly desktopId: string;
  readonly label: string;
  /** Host-reported label retained when `label` is overridden locally. */
  readonly remoteLabel?: string;
  readonly endpoint: string;
  readonly accessToken: string;
  readonly scopes: RemoteAccessScope[];
  /** Last version reported by the host environment descriptor. */
  readonly appVersion?: string;
  /** Host OS advertised by protocol-v1 servers; absent for older records. */
  readonly platform?: "win32" | "darwin" | "linux";
  /** Absent on records paired before standalone helpers advertised their host mode. */
  readonly hostMode?: RemoteHostMode;
  /** V6 C.2: last GET /api/host/describe. Absent records fail closed. */
  readonly hostCapabilities?: HostServiceCapabilities;
  /**
   * Browser-origin port entry support from the last environment descriptor.
   * `false` is authoritative once a descriptor loaded; absent means unknown
   * and never implies anything about raw TCP forwarding.
   */
  readonly browserForwardAvailable?: boolean;
  /** Absent on records persisted before transport metadata existed. */
  readonly transport?:
    | { readonly kind: "direct" }
    | { readonly kind: "ssh"; readonly connection: SshConnectionConfig }
    | RemoteEnvironmentTransport;
}

/**
 * The store's per-connection key. v1 records are equal by construction; v2
 * environment records use their locally minted `connectionId`.
 */
export function remoteConnectionKey(server: RemoteServerRecord): string {
  return server.connectionId ?? server.desktopId;
}

export function isEnvironmentServer(server: RemoteServerRecord): boolean {
  return server.transport?.kind === "environment";
}

/** A readiness request for an environment-held image. */
export type RemoteEnvironmentImageTarget =
  | { readonly kind: "ref"; readonly ref: RemoteImageRefValue }
  | { readonly kind: "localPath"; readonly path: string };

export interface RemoteServerRuntime {
  readonly status: RemoteServerStatus;
  readonly message?: string;
  readonly projects: RemoteShellSnapshot["projects"];
  readonly threads: RemoteShellSnapshot["threads"];
  readonly agentStatuses?: RemoteAgentStatuses;
}

export interface OpenRemoteThread {
  readonly desktopId: string;
  readonly threadId: string;
  readonly thread: Thread;
  readonly terminalScrollback?: string;
  readonly terminalSize?: TerminalSize;
}

export type RemoteClientFactory = (endpoint: string, accessToken?: string) => RemoteDesktopClient;

export interface RemoteSocketLike {
  close(): void;
  send?(data: string): void;
  readonly readyState?: number;
  onopen?: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event?: { readonly code?: number; readonly reason?: string }) => void) | null;
}

export type RemoteSocketFactory = (url: string) => RemoteSocketLike;

export type RemoteThreadLaunchResult = "started" | "cancelled" | "cancellation-failed";

export interface RemoteServersState {
  servers: RemoteServerRecord[];
  runtime: Record<string, RemoteServerRuntime>;
  hostUpdates: Record<string, RemoteHostUpdateState>;
  /** Expected version while a remotely installed desktop update restarts its host. */
  hostUpdateRestarts: Record<string, string>;
  /**
   * Remote (server-side) project ids the user excluded from sync, keyed by
   * desktopId. Local-only state, so a project can be dropped from — or restored
   * to — the sidebar while its server is offline. See `projectSync.ts`.
   */
  excludedProjectIds: Record<string, readonly string[]>;
  /** Local workspace overrides for mirrored projects; null explicitly means unfiled. */
  projectWorkspaceIds: Record<string, Readonly<Record<string, string | null>>>;
  /** Local display-name overrides for mirrored projects, keyed by desktop and remote project id. */
  projectNameOverrides: Record<string, Readonly<Record<string, string>>>;
  /** Last discovered host projects, retained so offline servers keep their sidebar rows. */
  lastKnownProjects: Record<string, Project[]>;
  setProjectNameOverride(desktopId: string, remoteProjectId: string, name: string): void;
  setRemoteProjectSynced(desktopId: string, remoteProjectId: string, synced: boolean): void;
  clientFactory: RemoteClientFactory;
  socketFactory: RemoteSocketFactory;
  setClientFactory(factory: RemoteClientFactory): void;
  setSocketFactory(factory: RemoteSocketFactory): void;
  openThread: OpenRemoteThread | null;
  launchRemoteThread(
    input: StartRemoteNewThreadInput & { readonly desktopId: string },
    options?: { readonly isPendingLaunchOwned?: () => boolean },
  ): Promise<RemoteThreadLaunchResult>;
  /**
   * Hydrate a remote thread's history and focus it. Never rejects. Resolves
   * `true` only when the snapshot was actually applied — `false` when the
   * server is missing/unreachable or a newer open superseded this one, so
   * callers can gate follow-up work (e.g. relaunching an inactive thread) on
   * the open having taken effect.
   *
   * `focus: false` keeps the live attach (history, `thread-item-interests`,
   * event stream, open-thread slice) but skips the app-view navigation. The
   * startup restore uses it to reattach an already-visible thread without
   * stealing the view when the user navigates away mid-attach.
   *
   * `quiet: true` also skips the failure toast: background reattaches retry
   * with backoff and would otherwise toast per attempt; the server's runtime
   * status already surfaces an unreachable host in the sidebar.
   */
  openRemoteThread(
    desktopId: string,
    threadId: string,
    options?: {
      readonly focus?: boolean;
      readonly quiet?: boolean;
      /**
       * Caller-owned cancellation for a bounded recovery read. Aborting the
       * read rejects it with a `cancelled` error — never a transport failure —
       * so a local deadline cannot mark the host offline.
       */
      readonly signal?: AbortSignal;
    },
  ): Promise<boolean>;
  closeRemoteThread(): void;
  sendThreadCommand(
    desktopId: string,
    command: RemoteThreadCommand,
    options?: { readonly commandId?: string },
  ): Promise<void>;
  pairServer(input: { endpoint: string; token: string }): Promise<RemoteServerRecord>;
  /**
   * Standalone-attach pairing: Electron as a client of the already-running
   * headless owner described by main's authenticated attach info. Reuses the
   * existing pairing parser, OAuth exchange, credential vault, and
   * RemoteDesktopClient; pins the owner generation in memory (never
   * persisted) and fails closed on version mismatch. Existing local startup
   * and other remote-host selection stay unchanged.
   */
  ensureStandaloneOwner(input: {
    endpoint: string;
    pairingUrl: string;
    ownerGeneration: string;
    remoteProtocolVersion: number;
  }): Promise<RemoteServerRecord>;
  pairSshServer(connection: SshConnectionConfig): Promise<RemoteServerRecord>;
  renameServer(connectionKey: string, label: string): void;
  /**
   * Removes one connection. Removing a direct/ssh record that owns host-owned
   * environment records cascades to those local records and their child grants
   * ONLY when the caller passes `cascadeEnvironments: true` (the explicit
   * confirmation). Host-side environments are never deleted either way.
   */
  removeServer(connectionKey: string, options?: { readonly cascadeEnvironments?: boolean }): void;
  /** Host-owned environment records whose `parentConnectionId` is this key. */
  listEnvironmentDependents(connectionKey: string): RemoteServerRecord[];
  refreshServer(
    desktopId: string,
    options?: { readonly includeAgentStatuses?: boolean },
  ): Promise<void>;
  scheduleServerRefresh(
    desktopId: string,
    options?: { readonly includeAgentStatuses?: boolean },
  ): void;
  connectAll(options?: { readonly forceTransportReconnect?: boolean }): Promise<void>;
  reconnectServer(desktopId: string): Promise<void>;
  getHostUpdateState(desktopId: string): ReturnType<RemoteDesktopClient["hostUpdateState"]>;
  checkHostUpdate(desktopId: string): ReturnType<RemoteDesktopClient["checkHostUpdate"]>;
  installHostUpdate(desktopId: string): Promise<void>;
  runProjectCommand(
    desktopId: string,
    command: RemoteProjectCommand,
    options?: { readonly commandId?: string },
  ): Promise<void>;
  browseHostDirectory(desktopId: string, path: string): Promise<BrowseHostDirectoryResult>;
  withClient<Result>(
    desktopId: string,
    invoke: (client: RemoteDesktopClient) => Promise<Result>,
  ): Promise<Result>;
  saveClipboardImage(
    desktopId: string,
    input: { readonly threadId: string; readonly data: Uint8Array; readonly extension: string },
  ): Promise<string>;
  pickAndUploadFiles(desktopId: string, attachmentThreadId: string): Promise<string[] | null>;
  localImageUrl(connectionKey: string, path: string): string;
  imageRefUrl(connectionKey: string, ref: RemoteImageRefValue): string;
  /**
   * Pure keyed readiness read for environment image consumers driving
   * `useSyncExternalStore`: `""` while pending, failed, evicted, or unknown.
   * Never starts a fetch; pair it with `requestEnvironmentImage` in an effect.
   */
  resolveEnvironmentImage(connectionKey: string, key: string): string;
  /** Starts or retries exactly one authenticated environment image fetch. */
  requestEnvironmentImage(connectionKey: string, target: RemoteEnvironmentImageTarget): void;
  /**
   * Keyed readiness subscription; returns the unsubscribe function. Supplying
   * the request target lets a genuine session rebuild re-request it and notify
   * mounted consumers instead of relying on an incidental remount.
   */
  subscribeEnvironmentImage(
    connectionKey: string,
    key: string,
    listener: () => void,
    target?: RemoteEnvironmentImageTarget,
  ): () => void;
}

export function remoteServerStatusDotClass(status: RemoteServerStatus | undefined): string {
  return status === "online"
    ? "bg-success"
    : status === "connecting"
      ? "bg-warning"
      : status === "error"
        ? "bg-danger"
        : "bg-default-400";
}
