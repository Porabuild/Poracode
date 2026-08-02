import type {
  BrowseHostDirectoryResult,
  ControlThreadGoalPayload,
  ProjectLocation,
  RemoteThreadCommand,
  SendThreadInputPayload,
  SetPendingSteerPayload,
  Thread,
  ThreadConfig,
  ThreadServerRequestId,
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
  /** Absent on records paired before standalone helpers advertised their host mode. */
  readonly hostMode?: RemoteHostMode;
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
  onclose: (() => void) | null;
}

export type RemoteSocketFactory = (url: string) => RemoteSocketLike;

export interface RemoteServersState {
  servers: RemoteServerRecord[];
  runtime: Record<string, RemoteServerRuntime>;
  hostUpdates: Record<string, RemoteHostUpdateState>;
  /**
   * Remote (server-side) project ids the user excluded from sync, keyed by
   * desktopId. Local-only state, so a project can be dropped from — or restored
   * to — the sidebar while its server is offline. See `projectSync.ts`.
   */
  excludedProjectIds: Record<string, readonly string[]>;
  /** Local workspace assignments for mirrored projects, keyed by desktop and remote project id. */
  projectWorkspaceIds: Record<string, Readonly<Record<string, string>>>;
  /** Local display-name overrides for mirrored projects, keyed by desktop and remote project id. */
  projectNameOverrides: Record<string, Readonly<Record<string, string>>>;
  setProjectNameOverride(desktopId: string, remoteProjectId: string, name: string): void;
  setRemoteProjectSynced(desktopId: string, remoteProjectId: string, synced: boolean): void;
  clientFactory: RemoteClientFactory;
  socketFactory: RemoteSocketFactory;
  setClientFactory(factory: RemoteClientFactory): void;
  setSocketFactory(factory: RemoteSocketFactory): void;
  openThread: OpenRemoteThread | null;
  launchRemoteThread(
    input: StartRemoteNewThreadInput & { readonly desktopId: string },
  ): Promise<void>;
  openRemoteThread(desktopId: string, threadId: string): Promise<void>;
  closeRemoteThread(): void;
  sendThreadInput(input: SendThreadInputPayload & { readonly desktopId: string }): Promise<void>;
  sendThreadCommand(desktopId: string, command: RemoteThreadCommand): Promise<void>;
  setPendingSteer(input: SetPendingSteerPayload & { readonly desktopId: string }): Promise<void>;
  clearPendingSteer(desktopId: string, threadId: string): Promise<void>;
  controlThreadGoal(desktopId: string, input: ControlThreadGoalPayload): Promise<void>;
  writeThreadTerminal(desktopId: string, threadId: string, data: string): Promise<void>;
  resizeThreadTerminal(desktopId: string, threadId: string, size: TerminalSize): Promise<void>;
  resolveThreadRequest(input: {
    readonly desktopId: string;
    readonly threadId: string;
    readonly requestId: ThreadServerRequestId;
    readonly method: string;
    readonly response: unknown;
  }): Promise<void>;
  rollbackThreadConversation(input: {
    readonly desktopId: string;
    readonly threadId: string;
    readonly numTurns: number;
    readonly config?: ThreadConfig;
  }): Promise<void>;
  restoreFileCheckpoint(input: {
    readonly desktopId: string;
    readonly threadId: string;
    readonly checkpointItemId: string;
    readonly projectLocation: ProjectLocation;
  }): Promise<void>;
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
  interruptThread(desktopId: string, threadId: string): Promise<void>;
  closeThread(desktopId: string, threadId: string): Promise<void>;
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
