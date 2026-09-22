import type { IpcProcedureName } from "@/shared/ipc";
import { REMOTE_IPC_ADAPTER_SPECS } from "@/shared/remote";
import {
  REMOTE_PROCEDURE_SPECS,
  type RemoteProcedureName,
  type RemoteProcedureOwner,
} from "@/shared/remote/procedures";

export type RemoteRouteHandler =
  | "passthrough"
  | "adapter"
  | "thread-clipboard-image"
  | "thread-handoff-context"
  | "shell-start"
  | "shell-close";

export interface RemoteProcedureRouteSpec {
  readonly owner: RemoteProcedureOwner;
  readonly handler: RemoteRouteHandler;
}

const passthroughRoutes = Object.fromEntries(
  Object.entries(REMOTE_PROCEDURE_SPECS).map(([procedure, spec]) => [
    procedure,
    { owner: spec.owner, handler: "passthrough" },
  ]),
) as Record<RemoteProcedureName, RemoteProcedureRouteSpec>;

const adapterRoutes = Object.fromEntries(
  Object.entries(REMOTE_IPC_ADAPTER_SPECS).map(([procedure, owner]) => [
    procedure,
    { owner, handler: "adapter" },
  ]),
) as Record<keyof typeof REMOTE_IPC_ADAPTER_SPECS, RemoteProcedureRouteSpec>;

/** Single policy table for choosing the host and transport for project-aware IPC. */
export const REMOTE_PROCEDURE_ROUTES = {
  ...passthroughRoutes,
  ...adapterRoutes,
  saveClipboardImage: { owner: "thread", handler: "thread-clipboard-image" },
  saveHandoffContext: { owner: "thread", handler: "thread-handoff-context" },
  startShell: { owner: "projectLocation", handler: "shell-start" },
  closeThread: { owner: "terminal", handler: "shell-close" },
} as const satisfies Partial<Record<IpcProcedureName, RemoteProcedureRouteSpec>>;

/**
 * Every procedure dispatched OUTSIDE the router, with the reason it can never
 * leave the local shell (V6 B.2). A name must be classified in exactly one of
 * {@link REMOTE_PROCEDURE_ROUTES} (router-owned; refused over preload IPC) or
 * this table (executes over preload IPC on every leg; never expected to work
 * remotely). A classification test enumerates `IpcProcedureName` and fails on
 * any unclassified fall-through or missing justification.
 */
export const NON_ROUTER_PROJECT_PROCEDURES = {
  // Native dialogs, clipboard, and local files
  pickFolder: "local-shell: native folder dialog on this machine",
  pickFiles: "local-shell: native file dialog on this machine",
  browserStartPicker: "local-shell: native in-page picker dialog",
  saveImageFile: "local-shell: native save dialog writes this machine's disk",
  copyImageToClipboard: "local-shell: OS clipboard of this machine",
  copyShareImage: "local-shell: OS clipboard share handoff of this machine",
  readLocalImageFile: "local-shell: reads a file from this machine's disk for inline preview",
  openPluginsFolder: "local-shell: reveals a folder in this machine's file manager",

  // R1: this machine's file manager and disk probes — meaningless against a
  // paired host's paths, and already guarded off or null-tolerated remotely.
  revealProjectEntry: "local-shell: reveals a project path in this machine's file manager",
  detectProjectIcon: "local-shell: probes this machine's disk for a project icon image",
  listProjectIconFiles: "local-shell: probes this machine's disk for candidate icon files",

  // Window, OS, and app lifecycle
  focusWindow: "local-shell: focuses this desktop's own window",
  setWindowChrome: "local-shell: restyles this desktop window's native chrome",
  relaunchApp: "local-shell: restarts this desktop's app process",
  openExternal: "local-shell: opens a URL in this machine's default browser",
  openExternalNative: "local-shell: opens a URL via this machine's OS shell",
  openMicrophoneSettings: "local-shell: opens this machine's OS settings app",
  showNotification: "local-shell: OS notification",
  requestLegacyDataMigration: "local-shell: one-time migration of this machine's legacy data",
  getHomeScopeLocation: "local-shell: this machine's home directory as the default project parent",
  listWslDistros: "local-shell: enumerates this machine's WSL distros for location picking",
  getAvailableWindowsShells: "local-shell: this machine's terminal shell inventory",

  // Keybindings and global shortcuts (accelerators registered by this main process)
  getKeybindings: "local-shell: keybindings consumed by this desktop's main-process accelerators",
  setKeybindings: "local-shell: keybinding writes consumed by this desktop's accelerators",
  setGlobalShortcutsSuspended: "local-shell: OS-global shortcuts registered by this desktop",

  // Transport bootstrap (must run before any other data plane exists)
  getManagedLoopbackBootstrap:
    "local-shell: mints the loopback credential itself, so it precedes the loopback leg on IPC",

  // Host-owned destructive-retirement check (housekeeping purge)
  closeThreadConfirmed:
    "local-shell: host-owned confirmed-retirement close for destructive housekeeping; the renderer never issues it and no remote route exists",

  // R1: host-custody thread/project deletion — the renderer's real deletes ride
  // the thread-command / project-command registry routes, which own
  // notifications and housekeeping; the raw DB row deletes stay preload-only.
  dbDeleteThread:
    "local-shell: thread deletion goes through the thread-command registry route, which owns notifications and housekeeping; the raw DB row delete stays preload-only",
  dbDeleteProject:
    "local-shell: project deletion goes through the project-command registry route with host custody; the raw DB row delete stays preload-only",

  // R1: raw runtime persistence writes are host-owned. Remote history mutation
  // is the truncate/bounded registry surface, never a renderer DB replace.
  dbReplaceThreadRuntimeItems:
    "local-shell: raw runtime item persistence is host-owned; remote clients mutate history through the truncate registry route, never a renderer DB replace",
  dbReplaceThreadCompletedTurns:
    "local-shell: raw completed-turn persistence is host-owned; remote clients never replace turn history through a renderer DB write",
  dbReplaceThreadRuntimeSnapshot:
    "local-shell: raw runtime snapshot persistence is host-owned; remote clients never replace the snapshot through a renderer DB write",

  // R1: unbounded full-transcript read — the bounded history-items pages are
  // the remote data plane (the experiment judge walks them).
  dbGetThreadRuntimeItems:
    "local-shell: unbounded full-transcript read; remote clients page the bounded history-items route instead of one raw DB read",

  // Remote-access server control — the host's own trust surface
  getRemoteAccessPairing:
    "local-shell: this host's pairing surface; a remote operator must never reconfigure the trust boundary",
  refreshRemoteAccessPairing:
    "local-shell: re-mints this host's pairing credential; trust-surface control stays with the physical host",
  setRemoteAccessEnabled:
    "local-shell: toggles this host's remote-access server; trust-surface control stays with the physical host",
  revokeRemoteAccessSession:
    "local-shell: revokes sessions on this host's server; trust-surface control stays with the physical host",
  getRemoteAccessTailscaleStatus:
    "local-shell: this host's Tailscale status; trust-surface control stays with the physical host",
  setRemoteAccessTailscaleHttps:
    "local-shell: reconfigures this host's Tailscale HTTPS; trust-surface control stays with the physical host",
  startTailscale:
    "local-shell: launches this host's Tailscale GUI; trust-surface control stays with the physical host",
  setRemoteAccessAdvertisedUrl:
    "local-shell: overrides this host's advertised URL; trust-surface control stays with the physical host",
  probeTlsCertificateFingerprint:
    "local-shell: probes a TLS host from this machine's network stack for pairing pinning",

  // Renderer-to-main push that feeds THIS host's server
  publishRemoteGitSummaries:
    "local-shell: renderer-to-main push of live git state feeding this host's server; the server, not a client, serves the summaries",

  // This install's auto-updater
  getUpdateStatus:
    "local-shell: this app install's updater state; remote clients read host update state via the host-update registry routes",
  checkForUpdate:
    "local-shell: runs this app install's updater; remote clients use the host-update-check registry route",
  startUpdateDownload:
    "local-shell: downloads into this app install; remote clients use the host-update registry route",
  installUpdate:
    "local-shell: quits and replaces this app install; remote clients use the host-update-install registry route",

  // Window catalog mirrors — this window's SQLite, not host truth
  dbGetProjects: "local-shell: this window's project catalog rows; host truth is the describe API",
  dbGetThreads:
    "local-shell: this window's thread catalog rows; host truth is the thread-list registry route",
  dbGetThreadsPage:
    "local-shell: this window's paginated catalog hydration; host truth is the thread-list registry route",
  dbUpsertProject: "local-shell: this window's catalog write; host truth is the snapshot/API",
  dbUpsertThread: "local-shell: this window's catalog write; host truth is the snapshot/API",
  dbSyncAll: "local-shell: this window's catalog sync; host truth is the snapshot/API",
  dbSyncChanges: "local-shell: this window's catalog sync; host truth is the snapshot/API",
  dbGetState: "local-shell: this window's persisted UI state blob",
  dbSetState: "local-shell: this window's persisted UI state blob",

  // Shared settings — desktop store; remote legs use the settings registry routes
  getSharedSettings:
    "local-shell: this desktop's settings store; remote clients read via the settings-read registry route",
  setSharedSettings:
    "local-shell: this desktop's settings store; remote clients write via the settings-write registry route",
  settingsTransactionMutate:
    "local-shell: atomic multi-write over this desktop's settings store; remote legs write per-key via settings-write",
  settingsTransactionSnapshot: "local-shell: snapshot phase of this desktop's settings transaction",

  // Profile — device reads plus local CLI profile files
  getProfileIdentity:
    "local-shell: this device's profile identity read; remote clients use the profile-identity registry route",
  setProfileIdentity:
    "local-shell: this device's profile identity write; remote clients use the profile-identity registry route",
  getProfileCoreStats:
    "local-shell: this device's profile stats; remote clients use the profile-core-stats registry route",
  getProfileDevices:
    "local-shell: this device's paired devices; remote clients use the profile-devices registry route",
  getProfileTokenStats:
    "local-shell: this device's token stats; remote clients use the profile-token-stats registry route",
  setProfileEnvironment: "local-shell: writes this machine's CLI profile environment files",
  createProfile: "local-shell: creates a CLI profile on this machine's disk",

  // Usage capture and device login
  appendUsageEvents: "local-shell: this device's usage capture into its own catalog",
  getUsageLoginState: "local-shell: this device's provider login flow state",
  startUsageLogin: "local-shell: device login flow (local OAuth window plus secret storage)",
  cancelUsageLogin: "local-shell: device login flow (local OAuth window plus secret storage)",
  clearUsageLogin: "local-shell: clears this device's stored provider login",
  submitUsageApiKey: "local-shell: stores an API key in this device's secret storage",
  resolveUsageLoginConfirmation: "local-shell: resolves this device's login confirmation dialog",
  getProviderUsage:
    "local-shell: reads this device's provider accounts; remote clients use the provider-usage registry route",
  refreshProviderUsage:
    "local-shell: re-probes this device's provider accounts; remote clients use the provider-usage registry route",

  // Device agent + CLI management — installs, binaries, auth, secrets
  getAgentStatuses:
    "local-shell: this machine's CLI agent inventory; remote clients read via the agent-statuses registry route",
  refreshAgentStatuses: "local-shell: re-probes this machine's CLI agent installs",
  getAgentHookPluginStatuses: "local-shell: this machine's agent hook plugin inventory",
  installAgentHookPlugin: "local-shell: installs into this machine's CLI hook plugins",
  uninstallAgentHookPlugin: "local-shell: uninstalls from this machine's CLI hook plugins",
  listAcpRegistry: "local-shell: this machine's ACP registry catalog",
  installAcpRegistryAgent: "local-shell: installs a CLI agent on this machine",
  updateAcpRegistryAgent: "local-shell: updates a CLI agent install on this machine",
  removeAcpRegistryAgent: "local-shell: removes a CLI agent install from this machine",
  setAcpRegistryAgentAuth: "local-shell: stores agent auth on this machine",
  authenticateAcpAgent: "local-shell: runs this machine's agent OAuth window and secret store",
  logoutAcpAgent: "local-shell: clears agent auth on this machine",
  resolveAgentAccount: "local-shell: resolves accounts against this machine's agent auth",
  updateAgentBinary: "local-shell: downloads and swaps this machine's agent binaries",
  getLatestAgentVersion: "local-shell: version probe for this machine's agent installs",
  manageAgentPlugins: "local-shell: manages this machine's agent plugin packages",
  manageAgentCredentials: "local-shell: this machine's keychain-stored agent credentials",
  setAgentSecretSetting: "local-shell: writes a secret into this machine's keychain",
  getNativeMcpSetup: "local-shell: reads this machine's CLI MCP config files",
  applyNativeMcpSetup: "local-shell: rewrites this machine's CLI MCP config files",
  reloadAgentMcpServers: "local-shell: reloads CLI servers registered on this machine",

  // Cross-agent routing and memory — this device's config
  getCrossagentRouting: "local-shell: this device's cross-agent routing config",
  confirmCrossagentRoutingOverride: "local-shell: this device's routing override decision",
  removeCrossagentRoutingOverride: "local-shell: this device's routing override decision",
  updateCrossagentMemoryEntryTags: "local-shell: this device's memory catalog",
  removeCrossagentMemoryEntry: "local-shell: this device's memory catalog",

  // Desktop browser panel — the WebContentsView tab strip of this window
  browserGetState: "local-shell: this desktop window's browser tab strip",
  browserCreateTab:
    "local-shell: drives this desktop window's in-app browser; remote page control is the browser-state/browser-command registry routes",
  browserCloseTab:
    "local-shell: drives this desktop window's in-app browser; remote page control is the browser-state/browser-command registry routes",
  browserActivateTab:
    "local-shell: drives this desktop window's in-app browser; remote page control is the browser-state/browser-command registry routes",
  browserMoveTab:
    "local-shell: drives this desktop window's in-app browser; remote page control is the browser-state/browser-command registry routes",
  browserSetGroupCollapsed:
    "local-shell: drives this desktop window's in-app browser; remote page control is the browser-state/browser-command registry routes",
  browserUngroupGroup:
    "local-shell: drives this desktop window's in-app browser; remote page control is the browser-state/browser-command registry routes",
  browserCloseGroup:
    "local-shell: drives this desktop window's in-app browser; remote page control is the browser-state/browser-command registry routes",
  browserNewTabInGroup:
    "local-shell: drives this desktop window's in-app browser; remote page control is the browser-state/browser-command registry routes",
  browserRenameGroup:
    "local-shell: drives this desktop window's in-app browser; remote page control is the browser-state/browser-command registry routes",
  browserSetGroupColor:
    "local-shell: drives this desktop window's in-app browser; remote page control is the browser-state/browser-command registry routes",
  browserNavigate:
    "local-shell: drives this desktop window's in-app browser; remote page control is the browser-state/browser-command registry routes",
  browserBack:
    "local-shell: drives this desktop window's in-app browser; remote page control is the browser-state/browser-command registry routes",
  browserForward:
    "local-shell: drives this desktop window's in-app browser; remote page control is the browser-state/browser-command registry routes",
  browserReload:
    "local-shell: drives this desktop window's in-app browser; remote page control is the browser-state/browser-command registry routes",
  browserHardReload:
    "local-shell: drives this desktop window's in-app browser; remote page control is the browser-state/browser-command registry routes",
  browserToggleDevTools: "local-shell: devtools of this desktop window's in-app browser view",
  browserClearHistory: "local-shell: this desktop window's browser profile data",
  browserClearCookies: "local-shell: this desktop window's browser profile data",
  browserClearCache: "local-shell: this desktop window's browser profile data",
  browserCopyScreenshot: "local-shell: copies a shot of this window's browser view",
  browserCapturePreview: "local-shell: captures this window's browser view preview",
  browserAttachWebContents: "local-shell: hosts a view inside this desktop window",
  browserCancelPicker: "local-shell: cancels this window's native picker dialog",
  browserSuggest: "local-shell: this window's address-bar suggestions",
  browserAddBookmark: "local-shell: this window's browser bookmarks",
  browserRemoveBookmark: "local-shell: this window's browser bookmarks",
  browserSetBookmarkBarVisible: "local-shell: this window's bookmark bar visibility",
  browserRecentHistory: "local-shell: this window's browser history",
  browserExtractToWindow: "local-shell: reparents a view inside this desktop window",
  browserInjectToMain: "local-shell: injects scripts into this window's browser views",

  // SSH dials out from this device; no registry surface by design
  sshDiscoverHosts: "local-shell: SSH discovery runs from this device's network",
  sshConnect: "local-shell: SSH dials out from this device; no registry surface by design",
  sshDisconnect: "local-shell: SSH dials out from this device; no registry surface by design",

  // Snapshot hydration reads for this window
  getThreadSnapshots:
    "local-shell: this window's hydration read of the backend snapshot stores; remote clients page snapshots through the server surfaces",
  getTerminalShellSnapshots:
    "local-shell: this window's hydration read of the backend snapshot stores; remote clients page snapshots through the server surfaces",
  getResourceAdmissionStatus:
    "local-shell: internal managed-supervisor diagnostics; network diagnostics are restricted to loopback metrics, not the remote procedure allowlist",

  // Local language clients and plugins
  lspStop: "local-shell: language-client lifetime is bound to this renderer window",
  lspSendMessage: "local-shell: LSP JSON-RPC is a per-window language client",
  listPlugins: "local-shell: plugin package scan is this window's disk catalog",
  refreshPlugins: "local-shell: plugin package rescan is this window's disk catalog",

  // New-project local prep
  createProjectDirectory:
    "local-shell: preps a directory on this machine's disk; creating projects on a remote host is the project-command registry route",

  // Experiments — this window's git catalog
  createExperimentWorktrees:
    "local-shell: experiment worktrees are this window's git catalog; unique-candidate refinements are not portable wire validators",
  removeExperimentWorktrees:
    "local-shell: experiment worktrees are this window's git catalog; unique-candidate refinements are not portable wire validators",
  captureExperimentSnapshot:
    "local-shell: experiment snapshots are this window's git catalog; unique-candidate refinements are not portable wire validators",
  judgeExperimentSnapshot:
    "local-shell: experiment judging is this window's catalog; response-match refinements are not portable wire validators",
  getExperimentCandidateStats: "local-shell: experiment diff stats are this window's git catalog",
  cancelJudgeExperiment: "local-shell: experiment judge cancellation is this window's catalog",
} as const satisfies Partial<Record<IpcProcedureName, string>>;

export type RemoteRoutableProcedureName = keyof typeof REMOTE_PROCEDURE_ROUTES;

export function isRemoteRoutableProcedure(
  procedure: string,
): procedure is RemoteRoutableProcedureName {
  return Object.hasOwn(REMOTE_PROCEDURE_ROUTES, procedure);
}

/** Whether `procedure` is a router-owned PASSTHROUGH: a supervisor-allowlist
 * name the generic remote passthrough (`/api/git/call`) executes. The managed
 * loopback transport uses this metadata to decide that a local-resolving
 * routable call still belongs to the co-located server — the single policy
 * table stays the only source of that fact. */
export function isPassthroughRemoteProcedure(procedure: IpcProcedureName): boolean {
  return (
    isRemoteRoutableProcedure(procedure) &&
    REMOTE_PROCEDURE_ROUTES[procedure].handler === "passthrough"
  );
}
