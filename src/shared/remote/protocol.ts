import { z } from "zod";
import {
  agentStatusSchema,
  cloneRepoSourceSchema,
  projectSchema,
  terminalSizeSchema,
  threadContextUsageSchema,
  threadSchema,
} from "../contracts";
import { persistedCompletedTurnSchema, persistedRuntimeItemSchema } from "../ipc/schemas";
import { sharedSettingsSchema } from "../settings";

export const LIGHTCODE_REMOTE_PROTOCOL_VERSION = 1;

export const remoteAccessScopeSchema = z.enum([
  "session:read",
  "session:operate",
  "terminal:read",
  "terminal:operate",
  "requests:resolve",
  // Create/clone/remove projects on the desktop or server. Sensitive: it writes
  // the project list and can clone arbitrary repos, so it gates its own routes.
  "projects:manage",
]);
export type RemoteAccessScope = z.infer<typeof remoteAccessScopeSchema>;

export const REMOTE_STANDARD_SCOPES: readonly RemoteAccessScope[] = remoteAccessScopeSchema.options;

const KNOWN_REMOTE_ACCESS_SCOPES: ReadonlySet<string> = new Set(remoteAccessScopeSchema.options);

/** Narrow an arbitrary string to a {@link RemoteAccessScope} if it is one we know. */
export function isKnownRemoteAccessScope(value: string): value is RemoteAccessScope {
  return KNOWN_REMOTE_ACCESS_SCOPES.has(value);
}

/**
 * Filter a server-advertised scope list down to the {@link RemoteAccessScope}
 * values this client build understands. A newer server may advertise scopes an
 * older client does not know (this is what happened when `projects:manage` was
 * added); those are dropped rather than rejected so parsing an advertised list
 * never throws and does not burn a one-time pairing credential.
 */
export function filterKnownRemoteAccessScopes(scopes: readonly string[]): RemoteAccessScope[] {
  return scopes.filter(isKnownRemoteAccessScope);
}

/**
 * Lenient wire schema for scope lists a **server advertises** (environment
 * descriptor, token-exchange echo). Parsed as raw strings so an unknown scope
 * from a newer server does not throw; callers narrow with
 * {@link filterKnownRemoteAccessScopes} before use. Use the strict
 * {@link remoteAccessScopeSchema} for scopes the **client itself sends**.
 */
export const advertisedRemoteAccessScopesSchema = z.array(z.string().min(1));

/** Derive the WebSocket base URL for a remote desktop's HTTP endpoint. */
export function toWebSocketUrl(httpUrl: string | URL): URL {
  const url = new URL(httpUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url;
}

export const remoteClientMetadataSchema = z.object({
  label: z.string().min(1).optional(),
  deviceType: z.enum(["desktop", "mobile", "tablet", "browser", "unknown"]).optional(),
  os: z.string().min(1).optional(),
});
export type RemoteClientMetadata = z.infer<typeof remoteClientMetadataSchema>;

export const remoteEnvironmentDescriptorSchema = z.object({
  protocolVersion: z.literal(LIGHTCODE_REMOTE_PROTOCOL_VERSION),
  desktopId: z.string().min(1),
  label: z.string().min(1),
  appVersion: z.string().min(1),
  auth: z.object({
    policy: z.literal("remote-reachable"),
    bootstrapMethods: z.array(z.literal("one-time-token")),
    sessionMethods: z.array(z.literal("bearer-access-token")),
    // Lenient on the wire: a newer server may advertise a scope this client
    // build does not know. Parsing must not throw (it precedes pairing on
    // desktop); the client filters to known scopes before use.
    scopes: advertisedRemoteAccessScopesSchema,
  }),
  endpoints: z.object({
    httpBaseUrl: z.string().url(),
    wsBaseUrl: z.string().url(),
  }),
});
export type RemoteEnvironmentDescriptor = z.infer<typeof remoteEnvironmentDescriptorSchema>;

export const remoteTokenExchangePayloadSchema = z.object({
  grantType: z.literal("pairing-token"),
  credential: z.string().min(1),
  scopes: z.array(remoteAccessScopeSchema).optional(),
  client: remoteClientMetadataSchema.optional(),
});
export type RemoteTokenExchangePayload = z.infer<typeof remoteTokenExchangePayloadSchema>;

export const remoteAccessTokenResultSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.literal("Bearer"),
  expiresAt: z.string().min(1),
  // Server-echoed granted scopes: lenient on the wire (see descriptor). Token
  // exchange happens FIRST on desktop pairing, so a ZodError here would burn
  // the one-time credential; the client narrows to known scopes before use.
  scopes: advertisedRemoteAccessScopesSchema,
});
export type RemoteAccessTokenResult = z.infer<typeof remoteAccessTokenResultSchema>;

export const remoteAccessSessionSchema = z.object({
  id: z.string().min(1),
  scopes: z.array(remoteAccessScopeSchema),
  client: remoteClientMetadataSchema.optional(),
  issuedAt: z.string().min(1),
  expiresAt: z.string().min(1),
});
export type RemoteAccessSessionSummary = z.infer<typeof remoteAccessSessionSchema>;

export const remoteWebSocketTicketResultSchema = z.object({
  ticket: z.string().min(1),
  expiresAt: z.string().min(1),
});
export type RemoteWebSocketTicketResult = z.infer<typeof remoteWebSocketTicketResultSchema>;

export const remoteRuntimeSummarySchema = z.object({
  itemCount: z.number().int().nonnegative(),
  latestItemId: z.string().min(1).optional(),
  latestItemType: z.string().min(1).optional(),
  latestItemState: z.enum(["started", "updated", "completed"]).optional(),
  contextUsage: threadContextUsageSchema.nullable().optional(),
});
export type RemoteRuntimeSummary = z.infer<typeof remoteRuntimeSummarySchema>;

/**
 * Read-only per-thread git/PR summary for remote clients. The desktop
 * renderer owns the live git state (gitStore); it publishes these compact
 * summaries to main, which serves them in the shell snapshot and streams
 * updates over the WebSocket as `remote-git-summaries` events.
 */
export const remoteThreadGitSummarySchema = z.object({
  isRepo: z.boolean(),
  branch: z.string(),
  totalInsertions: z.number().int().nonnegative(),
  totalDeletions: z.number().int().nonnegative(),
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  pr: z
    .object({
      number: z.number().int(),
      state: z.enum(["open", "draft", "merged", "closed"]),
      title: z.string(),
      url: z.string(),
      isDraft: z.boolean(),
      checksStatus: z.string().optional(),
    })
    .nullable(),
});
export type RemoteThreadGitSummary = z.infer<typeof remoteThreadGitSummarySchema>;

export const remoteGitSummariesSchema = z.record(z.string(), remoteThreadGitSummarySchema);
export type RemoteGitSummaries = z.infer<typeof remoteGitSummariesSchema>;

/** Out-of-band event broadcast on the WS event stream alongside supervisor
 * events whenever the desktop's git state changes. */
export const remoteGitSummariesEventSchema = z.object({
  type: z.literal("remote-git-summaries"),
  summaries: remoteGitSummariesSchema,
});
export type RemoteGitSummariesEvent = z.infer<typeof remoteGitSummariesEventSchema>;

/**
 * Remote project management. Lets a paired client add/clone/remove projects on
 * the desktop or a headless server. Locations are referenced by an absolute
 * path string (the server derives the platform-specific {@link ProjectLocation}
 * itself) or by `projectId` for edits to an existing row. There is deliberately
 * no filesystem-browsing command yet — clients pass an explicit path — because
 * exposing the server's directory tree is a separate security decision (see
 * docs/REMOTE_ARCHITECTURE.md, Phase 3). All commands require `projects:manage`.
 */
export const remoteProjectCommandSchema = z.discriminatedUnion("kind", [
  // Register an existing folder on the server as a project.
  z.object({
    kind: z.literal("add-existing"),
    path: z.string().min(1),
    name: z.string().min(1).optional(),
  }),
  // Create a new empty folder under `parentPath` and register it.
  z.object({
    kind: z.literal("create"),
    parentPath: z.string().min(1),
    name: z.string().min(1),
  }),
  // Clone a repo into `parentPath/name` and register it.
  z.object({
    kind: z.literal("clone"),
    parentPath: z.string().min(1),
    name: z.string().min(1),
    source: cloneRepoSourceSchema,
  }),
  // Remove a project. Edits that reorder/cascade (rename, disable) still flow
  // through the renderer store on the desktop; see Phase 2 in the design doc.
  z.object({ kind: z.literal("remove"), projectId: z.string().min(1) }),
]);
export type RemoteProjectCommand = z.infer<typeof remoteProjectCommandSchema>;

/** Result of a project command: the full updated list plus the affected row. */
export const remoteProjectCommandResultSchema = z.object({
  projects: z.array(projectSchema),
  project: projectSchema.optional(),
});
export type RemoteProjectCommandResult = z.infer<typeof remoteProjectCommandResultSchema>;

/** Broadcast on the WS event stream after a project change so clients refresh
 * the shell snapshot. Rides the same stream as supervisor/git events. */
export const remoteProjectsChangedEventSchema = z.object({
  type: z.literal("remote-projects-changed"),
  projects: z.array(projectSchema),
});
export type RemoteProjectsChangedEvent = z.infer<typeof remoteProjectsChangedEventSchema>;

/** Broadcast after durable thread metadata changes so remote clients refresh
 * the shell snapshot. The payload intentionally carries ids only; clients
 * already have a snapshot endpoint for current thread/project/runtime state. */
export const remoteThreadsChangedEventSchema = z.object({
  type: z.literal("remote-threads-changed"),
  threadIds: z.array(z.string().min(1)),
});
export type RemoteThreadsChangedEvent = z.infer<typeof remoteThreadsChangedEventSchema>;

export const remoteShellSnapshotSchema = z.object({
  snapshotSeq: z.number().int().nonnegative(),
  projects: z.array(projectSchema),
  threads: z.array(threadSchema),
  runtimeSummariesByThread: z.record(z.string(), remoteRuntimeSummarySchema),
  /** Absent on desktops that predate git summaries. */
  gitSummariesByThread: remoteGitSummariesSchema.optional(),
  updatedAt: z.string().min(1),
});
export type RemoteShellSnapshot = z.infer<typeof remoteShellSnapshotSchema>;

export const remoteAgentStatusesSchema = z.object({
  windows: z.array(agentStatusSchema),
  wsl: z.array(agentStatusSchema),
  updatedAt: z.string().min(1),
});
export type RemoteAgentStatuses = z.infer<typeof remoteAgentStatusesSchema>;

export const remoteThreadSnapshotSchema = z.object({
  snapshotSeq: z.number().int().nonnegative(),
  thread: threadSchema,
  runtimeItems: z.array(persistedRuntimeItemSchema),
  completedTurns: z.array(persistedCompletedTurnSchema),
  contextUsage: threadContextUsageSchema.nullable(),
  terminalScrollback: z.string().optional(),
  terminalSize: terminalSizeSchema.optional(),
  updatedAt: z.string().min(1),
});
export type RemoteThreadSnapshot = z.infer<typeof remoteThreadSnapshotSchema>;

/**
 * Desktop settings editable from a remote client ("Remote settings" in the
 * PWA, as opposed to its device-local settings). Only settings the desktop
 * itself acts on belong here — the AI helpers (title/commit generation,
 * conflict resolver) and the agent/model configuration (each desktop has its
 * own set of agents and models). Deliberately excludes secrets
 * (providerConfigs) and device-local preferences (theme, fonts, audio, …).
 */
export const remoteSettingsSchema = sharedSettingsSchema.pick({
  agentSettings: true,
  hiddenModels: true,
  disabledAgents: true,
  providerOrder: true,
  titleGenProvider: true,
  titleGenModel: true,
  titleGenEffort: true,
  commitGenProvider: true,
  commitGenModel: true,
  commitGenEffort: true,
  conflictResolverProvider: true,
  conflictResolverModel: true,
  conflictResolverEffort: true,
  conflictResolverPresentationMode: true,
  wslTitleGenProvider: true,
  wslTitleGenModel: true,
  wslTitleGenEffort: true,
  wslCommitGenProvider: true,
  wslCommitGenModel: true,
  wslCommitGenEffort: true,
  wslConflictResolverProvider: true,
  wslConflictResolverModel: true,
  wslConflictResolverEffort: true,
  wslConflictResolverPresentationMode: true,
});
export type RemoteSettings = z.infer<typeof remoteSettingsSchema>;

export const REMOTE_SETTINGS_KEYS = Object.keys(
  remoteSettingsSchema.shape,
) as readonly (keyof RemoteSettings)[];

export const remoteSettingsPatchSchema = remoteSettingsSchema.partial();
export type RemoteSettingsPatch = z.infer<typeof remoteSettingsPatchSchema>;

/** Extracts the remote-editable subset from a full settings object (zod
 * object parsing strips the keys that are not in the schema). */
export function pickRemoteSettings(settings: unknown): RemoteSettings {
  return remoteSettingsSchema.parse(settings);
}

export const remoteHttpErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
});
export type RemoteHttpErrorPayload = z.infer<typeof remoteHttpErrorSchema>;

/**
 * Request body for the generic desktop-supervisor passthrough (`POST
 * /api/git/call`). Desktop-backed PWA surfaces drive the paired desktop through
 * this single endpoint; `procedure` is validated against the remote procedure
 * allowlist and `payload` against that procedure's own schema.
 */
export const remoteGitCallPayloadSchema = z.object({
  procedure: z.string().min(1),
  payload: z.unknown(),
});
export type RemoteGitCallPayload = z.infer<typeof remoteGitCallPayloadSchema>;

export const remoteAccessPairingInfoSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("disabled"),
  }),
  z.object({
    status: z.literal("starting"),
  }),
  z.object({
    status: z.literal("ready"),
    httpBaseUrl: z.string().url(),
    wsBaseUrl: z.string().url(),
    pairingUrl: z.string().url(),
    sessions: z.array(remoteAccessSessionSchema),
  }),
]);
export type RemoteAccessPairingInfo = z.infer<typeof remoteAccessPairingInfoSchema>;

/**
 * Browser mirroring. The desktop's built-in browser tabs are native
 * `WebContentsView`s, so the PWA cannot embed them; instead the desktop
 * streams CDP screencast frames (JPEG) over the WebSocket and the phone sends
 * taps/scrolls back. Tab management (create/close/navigate/…) is
 * low-frequency and goes over HTTP (`/api/browser/*`).
 */

export const remoteBrowserTabSchema = z.object({
  tabId: z.string().min(1),
  url: z.string(),
  title: z.string(),
  faviconUrl: z.string().optional(),
  loading: z.boolean(),
  canGoBack: z.boolean(),
  canGoForward: z.boolean(),
});
export type RemoteBrowserTab = z.infer<typeof remoteBrowserTabSchema>;

export const remoteBrowserStateSchema = z.object({
  tabs: z.array(remoteBrowserTabSchema),
  activeTabId: z.string().nullable(),
});
export type RemoteBrowserState = z.infer<typeof remoteBrowserStateSchema>;

export const remoteBrowserCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create-tab"), url: z.string().min(1).optional() }),
  z.object({ kind: z.literal("close-tab"), tabId: z.string().min(1) }),
  z.object({ kind: z.literal("activate-tab"), tabId: z.string().min(1) }),
  z.object({
    kind: z.literal("move-tab"),
    tabId: z.string().min(1),
    targetTabId: z.string().min(1),
    position: z.enum(["before", "after"]),
  }),
  z.object({ kind: z.literal("navigate"), tabId: z.string().min(1), url: z.string().min(1) }),
  z.object({ kind: z.literal("back"), tabId: z.string().min(1) }),
  z.object({ kind: z.literal("forward"), tabId: z.string().min(1) }),
  z.object({ kind: z.literal("reload"), tabId: z.string().min(1) }),
]);
export type RemoteBrowserCommand = z.infer<typeof remoteBrowserCommandSchema>;

/** Non-printable keys the phone keyboard can forward; constrained to a safe
 * allowlist instead of arbitrary key codes. */
export const remoteBrowserKeySchema = z.enum([
  "enter",
  "backspace",
  "tab",
  "escape",
  "arrow-up",
  "arrow-down",
  "arrow-left",
  "arrow-right",
]);
export type RemoteBrowserKey = z.infer<typeof remoteBrowserKeySchema>;

/** Coordinates are CSS pixels of the mirrored page's viewport; the client maps
 * touch positions through the frame metadata before sending. Text lands in
 * whatever element the page has focused (usually via a prior tap). */
export const remoteBrowserInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tap"), x: z.number(), y: z.number() }),
  z.object({
    kind: z.literal("scroll"),
    x: z.number(),
    y: z.number(),
    deltaX: z.number(),
    deltaY: z.number(),
  }),
  z.object({ kind: z.literal("insert-text"), text: z.string().min(1).max(1024) }),
  z.object({ kind: z.literal("key"), key: remoteBrowserKeySchema }),
]);
export type RemoteBrowserInput = z.infer<typeof remoteBrowserInputSchema>;

/** CDP `Page.screencastFrame` metadata subset needed to map coordinates. */
export const remoteBrowserFrameMetadataSchema = z.object({
  deviceWidth: z.number(),
  deviceHeight: z.number(),
  pageScaleFactor: z.number(),
  offsetTop: z.number(),
  scrollOffsetX: z.number(),
  scrollOffsetY: z.number(),
});
export type RemoteBrowserFrameMetadata = z.infer<typeof remoteBrowserFrameMetadataSchema>;

export const remoteBrowserMirrorStatusSchema = z.object({
  status: z.enum(["starting", "active", "unavailable"]),
  tabId: z.string().nullable(),
  reason: z.string().optional(),
});
export type RemoteBrowserMirrorStatus = z.infer<typeof remoteBrowserMirrorStatusSchema>;

export const remoteWebSocketClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ping"),
    id: z.string().min(1).optional(),
    sentAt: z.number().optional(),
  }),
  // Start/stop receiving browser-state, browser-frame, and
  // browser-mirror-status messages; the mirror follows the active tab.
  z.object({ type: z.literal("browser-watch") }),
  z.object({ type: z.literal("browser-unwatch") }),
  z.object({ type: z.literal("browser-input"), input: remoteBrowserInputSchema }),
  // Start/stop receiving live `terminal-output` for a terminal (a CLI thread or
  // a dev shell), keyed by its supervisor id. PTY bytes are high-volume, so
  // they only stream to clients that opted in via terminal-watch.
  z.object({ type: z.literal("terminal-watch"), id: z.string().min(1) }),
  z.object({ type: z.literal("terminal-unwatch"), id: z.string().min(1) }),
]);
export type RemoteWebSocketClientMessage = z.infer<typeof remoteWebSocketClientMessageSchema>;

export const remoteWebSocketServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ready"),
    seq: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("event"),
    seq: z.number().int().positive(),
    event: z.unknown(),
  }),
  z.object({
    type: z.literal("resync-required"),
    seq: z.number().int().nonnegative(),
    reason: z.string().min(1),
  }),
  z.object({
    type: z.literal("pong"),
    id: z.string().min(1).optional(),
    sentAt: z.number().optional(),
    receivedAt: z.number(),
  }),
  // Sent only to clients that requested browser-watch.
  z.object({ type: z.literal("browser-state"), state: remoteBrowserStateSchema }),
  z.object({
    type: z.literal("browser-frame"),
    tabId: z.string().min(1),
    /** Base64 JPEG straight from the CDP screencast. */
    data: z.string().min(1),
    metadata: remoteBrowserFrameMetadataSchema,
  }),
  z.object({ type: z.literal("browser-mirror-status"), status: remoteBrowserMirrorStatusSchema }),
  // Live PTY bytes for a watched terminal. Out-of-band from the replayable
  // `event` stream — never buffered (replaying terminal bytes would garble the
  // screen; scrollback re-hydrates on reconnect instead).
  z.object({
    type: z.literal("terminal-output"),
    id: z.string().min(1),
    data: z.string(),
  }),
]);
export type RemoteWebSocketServerMessage = z.infer<typeof remoteWebSocketServerMessageSchema>;
