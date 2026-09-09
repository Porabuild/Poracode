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
import type { SshConnectionConfig } from "@/shared/ssh";

/** Transport reachability is offline; reachable protocol or action failures are errors. */
export type RemoteServerStatus = "connecting" | "online" | "offline" | "error";

export interface RemoteServerRecord {
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
  /**
   * Browser-origin port entry support from the last environment descriptor.
   * `false` is authoritative once a descriptor loaded; absent means unknown
   * and never implies anything about raw TCP forwarding.
   */
  readonly browserForwardAvailable?: boolean;
  /** Absent on records persisted before transport metadata existed. */
  readonly transport?:
    | { readonly kind: "direct" }
    | { readonly kind: "ssh"; readonly connection: SshConnectionConfig };
}

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
    options?: { readonly focus?: boolean; readonly quiet?: boolean },
  ): Promise<boolean>;
  closeRemoteThread(): void;
  sendThreadCommand(desktopId: string, command: RemoteThreadCommand): Promise<void>;
  pairServer(input: { endpoint: string; token: string }): Promise<RemoteServerRecord>;
  pairSshServer(connection: SshConnectionConfig): Promise<RemoteServerRecord>;
  renameServer(desktopId: string, label: string): void;
  removeServer(desktopId: string): void;
  refreshServer(
    desktopId: string,
    options?: { readonly includeAgentStatuses?: boolean },
  ): Promise<void>;
  scheduleServerRefresh(
    desktopId: string,
    options?: { readonly includeAgentStatuses?: boolean },
  ): void;
  connectAll(): Promise<void>;
  reconnectServer(desktopId: string): Promise<void>;
  getHostUpdateState(desktopId: string): ReturnType<RemoteDesktopClient["hostUpdateState"]>;
  checkHostUpdate(desktopId: string): ReturnType<RemoteDesktopClient["checkHostUpdate"]>;
  installHostUpdate(desktopId: string): Promise<void>;
  runProjectCommand(desktopId: string, command: RemoteProjectCommand): Promise<void>;
  loadProjectSettings(desktopId: string, projectId: string): Promise<void>;
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
  localImageUrl(desktopId: string, path: string): string;
  imageRefUrl(desktopId: string, ref: RemoteImageRefValue): string;
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
