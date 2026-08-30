import { z } from "zod";
import { sensitiveAgentSettingKeys } from "../agentSecrets";
import {
  agentStatusSchema,
  cloneRepoSourceSchema,
  projectSchema,
  scheduledTaskIdPayloadSchema,
  scheduledTaskInputSchema,
  scheduledTaskRunSchema,
  scheduledTaskSchema,
  terminalSizeSchema,
  threadContextUsageSchema,
  threadSchema,
} from "../contracts";
import { persistedCompletedTurnSchema, persistedRuntimeItemSchema } from "../ipc/schemas";
import { gitStateInterestSchema, gitStatePatchSchema, gitStateSnapshotSchema } from "../gitState";
import { sharedSettingsSchema } from "../settings";
import { userNotificationSchema } from "../threadNotification";

// v8 adds thread prompt segments and canonical thread content blocks. Older
// clients cannot paint or preserve those structured mentions correctly.
export const PORACODE_REMOTE_PROTOCOL_VERSION = 8;
export const REMOTE_COMMAND_ID_HEADER = "x-poracode-command-id";

export const remoteAccessScopeSchema = z.enum([
  "session:read",
  "session:operate",
  "terminal:read",
  "terminal:operate",
  "requests:resolve",
  // Create/clone/remove projects on the desktop or server. Sensitive: it writes
  // the project list and can clone arbitrary repos, so it gates its own routes.
  "projects:manage",
  // Discover local dev servers and open/close a raw TCP port forward from the
  // desktop's LAN-reachable interface to 127.0.0.1:<port>. Gates its own
  // routes (see RemotePortForwardGateway).
  "ports:forward",
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

export const remoteHostModeSchema = z.enum(["desktop", "helper"]);
export type RemoteHostMode = z.infer<typeof remoteHostModeSchema>;

export const remoteHostUpdateStatusSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("checking") }),
  z.object({ type: z.literal("update-available"), version: z.string().min(1) }),
  z.object({ type: z.literal("update-not-available") }),
  z.object({
    type: z.literal("downloading"),
    percent: z.number(),
    bytesPerSecond: z.number(),
    transferred: z.number(),
    total: z.number(),
  }),
  z.object({ type: z.literal("downloaded"), version: z.string().min(1) }),
  z.object({
    type: z.literal("error"),
    message: z.string().optional(),
    messageKey: z.string().optional(),
  }),
]);
export type RemoteHostUpdateStatus = z.infer<typeof remoteHostUpdateStatusSchema>;

export const remoteHostUpdateStateSchema = z.object({
  currentVersion: z.string().min(1),
  status: remoteHostUpdateStatusSchema.nullable(),
});
export type RemoteHostUpdateState = z.infer<typeof remoteHostUpdateStateSchema>;

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

/**
 * Additive, capability-gated remote features. Keep this object optional so
 * protocol-v3 clients that never opted into new capabilities stay byte-compatible
 * with older servers. Unknown capability keys from a newer server are stripped
 * by Zod (and ignored by older clients).
 */
export const TERMINAL_CURSOR_SYNC_VERSION = 1 as const;

/** Positive capability version integers; unknown future versions are accepted. */
export const remoteCapabilityVersionsSchema = z.array(z.number().int().positive()).min(1);

export const remoteTerminalCursorSyncCapabilitySchema = z.object({
  versions: remoteCapabilityVersionsSchema,
});
export type RemoteTerminalCursorSyncCapability = z.infer<
  typeof remoteTerminalCursorSyncCapabilitySchema
>;

/**
 * Versioned native-push routing. Version 1 binds one mobile host-registry entry
 * to a stable client-generated UUID. `desktopId` remains part of the route for
 * validation and display, but is not unique enough to be the routing key.
 */
export const REMOTE_PUSH_ROUTING_VERSION = 1 as const;

export const remotePushRoutingCapabilitySchema = z.object({
  versions: remoteCapabilityVersionsSchema,
});
export type RemotePushRoutingCapability = z.infer<typeof remotePushRoutingCapabilitySchema>;

export const remoteEnvironmentCapabilitiesSchema = z.object({
  terminalCursorSync: remoteTerminalCursorSyncCapabilitySchema.optional(),
  pushRouting: remotePushRoutingCapabilitySchema.optional(),
});
export type RemoteEnvironmentCapabilities = z.infer<typeof remoteEnvironmentCapabilitiesSchema>;

/** Opaque JS-string-unit absolute terminal cursor (safe nonnegative integer). */
export const remoteTerminalCursorSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
export type RemoteTerminalCursor = z.infer<typeof remoteTerminalCursorSchema>;

/**
 * Client opt-in on `terminal-watch`. Accepts any positive version so unsupported
 * future values are explicit server errors rather than silent schema drops.
 * Servers advertise supported versions via environment capabilities (currently [1]).
 */
export const remoteTerminalCursorSyncRequestSchema = z.object({
  version: z.number().int().positive(),
  watchId: z.string().min(1),
});
export type RemoteTerminalCursorSyncRequest = z.infer<typeof remoteTerminalCursorSyncRequestSchema>;

/** @deprecated Prefer {@link remoteTerminalCursorSyncRequestSchema}; kept as v1 alias. */
export const remoteTerminalCursorSyncV1Schema = remoteTerminalCursorSyncRequestSchema;
export type RemoteTerminalCursorSyncV1 = RemoteTerminalCursorSyncRequest;

/**
 * Ready snapshot for a cursor-sync watch.
 *
 * `generation: null` is **snapshot/replace-only**: it is never append-compatible
 * with prior or subsequent ranges (including another null). Clients and helpers
 * must reset/replace on null rather than inventing a durable generation id.
 *
 * Range invariant (JS UTF-16 code units / `String.length`):
 * `fromCursor <= toCursor` and `toCursor - fromCursor === data.length`.
 */
export const remoteTerminalWatchResultReadySchema = z
  .object({
    status: z.literal("ready"),
    generation: z.string().min(1).nullable(),
    fromCursor: remoteTerminalCursorSchema,
    toCursor: remoteTerminalCursorSchema,
    data: z.string(),
    processState: z.enum(["running", "exited"]),
    terminalSize: terminalSizeSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.fromCursor > value.toCursor) {
      ctx.addIssue({
        code: "custom",
        message: "fromCursor must be <= toCursor",
        path: ["fromCursor"],
      });
    }
    if (value.toCursor - value.fromCursor !== value.data.length) {
      ctx.addIssue({
        code: "custom",
        message: "toCursor - fromCursor must equal data.length (JS UTF-16 code units)",
        path: ["data"],
      });
    }
  });
export type RemoteTerminalWatchResultReady = z.infer<typeof remoteTerminalWatchResultReadySchema>;

export const remoteTerminalWatchResultErrorSchema = z.object({
  status: z.literal("error"),
  code: z.enum(["forbidden", "not-found", "unavailable"]),
  retryable: z.boolean(),
});
export type RemoteTerminalWatchResultError = z.infer<typeof remoteTerminalWatchResultErrorSchema>;

export const remoteTerminalWatchResultSchema = z.discriminatedUnion("status", [
  remoteTerminalWatchResultReadySchema,
  remoteTerminalWatchResultErrorSchema,
]);
export type RemoteTerminalWatchResult = z.infer<typeof remoteTerminalWatchResultSchema>;

/** Live `terminal-output` cursor metadata (server always emits supported version). */
export const remoteTerminalOutputCursorSyncV1Schema = z
  .object({
    version: z.literal(TERMINAL_CURSOR_SYNC_VERSION),
    watchId: z.string().min(1),
    generation: z.string().min(1),
    fromCursor: remoteTerminalCursorSchema,
    toCursor: remoteTerminalCursorSchema,
  })
  .superRefine((value, ctx) => {
    if (value.fromCursor > value.toCursor) {
      ctx.addIssue({
        code: "custom",
        message: "fromCursor must be <= toCursor",
        path: ["fromCursor"],
      });
    }
  });
export type RemoteTerminalOutputCursorSyncV1 = z.infer<
  typeof remoteTerminalOutputCursorSyncV1Schema
>;

export const remoteEnvironmentDescriptorSchema = z.object({
  protocolVersion: z.literal(PORACODE_REMOTE_PROTOCOL_VERSION),
  /**
   * Process hosting the shared remote-access server. Optional on the wire for
   * protocol-v1 servers released before standalone helpers advertised it.
   */
  hostMode: remoteHostModeSchema.optional(),
  desktopId: z.string().min(1),
  label: z.string().min(1),
  appVersion: z.string().min(1),
  /**
   * Host OS of the paired desktop (`win32` / `darwin` / `linux`). Optional for
   * older servers; clients that need host-gated features (Computer Use) should
   * treat a missing value as "unknown" rather than the mobile device's OS.
   */
  platform: z.enum(["win32", "darwin", "linux"]).optional(),
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
  /**
   * Optional additive capabilities. `terminalCursorSync` version 1 is the
   * compatibility boundary for reliable terminal snapshot/live cursor sync —
   * emitted only by servers that implement it; clients must not opt in unless
   * version 1 is listed.
   */
  capabilities: remoteEnvironmentCapabilitiesSchema.optional(),
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

export const remoteGitStateEventSchema = z.object({
  type: z.literal("remote-git-state"),
  patch: gitStatePatchSchema,
});
export type RemoteGitStateEvent = z.infer<typeof remoteGitStateEventSchema>;

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
  z.object({
    kind: z.literal("update"),
    projectId: z.string().min(1),
    patch: z.object({
      name: projectSchema.shape.name.optional(),
      icon: projectSchema.shape.icon.unwrap().nullable().optional(),
      scripts: projectSchema.shape.scripts.unwrap().nullable().optional(),
      searchSettings: projectSchema.shape.searchSettings.unwrap().nullable().optional(),
      worktreeLocation: projectSchema.shape.worktreeLocation.unwrap().nullable().optional(),
      // Project values default an omitted list to [], but a patch must
      // distinguish "not supplied" from an explicit empty list.
      mcpServers: projectSchema.shape.mcpServers.unwrap().removeDefault().nullable().optional(),
      ghAccount: projectSchema.shape.ghAccount.unwrap().nullable().optional(),
      disabled: projectSchema.shape.disabled,
    }),
  }),
  z.object({
    kind: z.literal("relocate"),
    projectId: z.string().min(1),
    path: z.string().min(1),
  }),
  z.object({ kind: z.literal("remove"), projectId: z.string().min(1) }),
]);
export type RemoteProjectCommand = z.infer<typeof remoteProjectCommandSchema>;

/** Project metadata safe to expose remotely; MCP definitions may contain secrets. */
export const remoteProjectSchema = projectSchema.omit({ mcpServers: true });
export type RemoteProject = z.infer<typeof remoteProjectSchema>;

/** Sensitive project settings are fetched separately behind `projects:manage`. */
export const remoteProjectSettingsSchema = projectSchema.pick({ mcpServers: true });
export type RemoteProjectSettings = z.infer<typeof remoteProjectSettingsSchema>;

/** Result of a project command: the full updated list plus the affected row. */
export const remoteProjectCommandResultSchema = z.object({
  projects: z.array(remoteProjectSchema),
  project: remoteProjectSchema.optional(),
});
export type RemoteProjectCommandResult = z.infer<typeof remoteProjectCommandResultSchema>;

export const remoteScheduleCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create"), task: scheduledTaskInputSchema }),
  z.object({ kind: z.literal("update"), id: z.string().uuid(), task: scheduledTaskInputSchema }),
  scheduledTaskIdPayloadSchema.extend({ kind: z.literal("delete") }),
  scheduledTaskIdPayloadSchema.extend({ kind: z.literal("run") }),
]);
export type RemoteScheduleCommand = z.infer<typeof remoteScheduleCommandSchema>;

export const remoteSchedulesResponseSchema = z.object({
  schedules: z.array(scheduledTaskSchema),
  schedule: scheduledTaskSchema.optional(),
});
export type RemoteSchedulesResponse = z.infer<typeof remoteSchedulesResponseSchema>;

export const remoteScheduleRunsQuerySchema = scheduledTaskIdPayloadSchema;
export const remoteScheduleRunsResponseSchema = z.object({
  runs: z.array(scheduledTaskRunSchema),
});
export type RemoteScheduleRunsResponse = z.infer<typeof remoteScheduleRunsResponseSchema>;

/** Broadcast on the WS event stream after a project change so clients refresh
 * the shell snapshot. Rides the same stream as supervisor/git events. */
export const remoteProjectsChangedEventSchema = z.object({
  type: z.literal("remote-projects-changed"),
  projects: z.array(remoteProjectSchema),
});
export type RemoteProjectsChangedEvent = z.infer<typeof remoteProjectsChangedEventSchema>;

/** Broadcast after durable thread metadata changes so remote clients refresh
 * the shell snapshot. `viewedThreadIds` is the explicit-read signal: unlike a
 * normal persisted `idle` status, it authorizes clients to clear a locally
 * derived `finished` badge. */
export const remoteThreadsChangedEventSchema = z.object({
  type: z.literal("remote-threads-changed"),
  threadIds: z.array(z.string().min(1)),
  viewedThreadIds: z.array(z.string().min(1)).optional(),
});
export type RemoteThreadsChangedEvent = z.infer<typeof remoteThreadsChangedEventSchema>;

/** Host-owned notification. Clients display it; they do not re-classify thread-state. */
export const remoteUserNotificationEventSchema = userNotificationSchema.extend({
  type: z.literal("remote-user-notification"),
});
export type RemoteUserNotificationEvent = z.infer<typeof remoteUserNotificationEventSchema>;

/**
 * Port forwarding. Lets a paired client discover dev servers listening on the
 * desktop's localhost (Vite, Next.js, …) and open a raw TCP proxy from the
 * desktop's LAN-reachable interface to `127.0.0.1:<targetPort>`, so a phone
 * browser can reach it directly at `http://<advertisedHost>:<listenPort>/`.
 * Raw TCP piping (not an HTTP proxy) means WebSocket upgrades (Vite HMR) pass
 * through unmodified. All routes require `ports:forward`. The framework-guess
 * label map for well-known ports lives in the gateway
 * (`RemotePortForwardGateway`), not here.
 */
export const detectedPortSchema = z.object({
  port: z.number().int().min(1).max(65535),
  protocol: z.enum(["http", "unknown"]),
  label: z.string().min(1).optional(),
});
export type DetectedPort = z.infer<typeof detectedPortSchema>;

export const activePortForwardSchema = z.object({
  id: z.string().min(1),
  targetPort: z.number().int().min(1).max(65535),
  listenPort: z.number().int().min(1).max(65535),
  createdAt: z.number().int().nonnegative(),
});
export type ActivePortForward = z.infer<typeof activePortForwardSchema>;

/** Response for `GET /api/ports`: a fresh scan plus currently-open forwards. */
export const remotePortsStateSchema = z.object({
  detected: z.array(detectedPortSchema),
  forwards: z.array(activePortForwardSchema),
});
export type RemotePortsState = z.infer<typeof remotePortsStateSchema>;

/** Request body for `POST /api/ports/forward`. */
export const remotePortForwardRequestSchema = z.object({
  targetPort: z.number().int().min(1).max(65535),
});
export type RemotePortForwardRequest = z.infer<typeof remotePortForwardRequestSchema>;

/** Response for `POST /api/ports/forward`. The client reaches the raw
 * `listenPort` on the same host it already talks to the desktop on (which it
 * derives from its own endpoint), so no host is echoed here. `enterPath` is the
 * authenticated HTTP/WS reverse-proxy entry point (absent on a host that has a
 * port-forward gateway but no `PortProxy` wired up): a path-only URL —
 * `/forward/<id>/enter?fwt=<token>` — that a browser navigation resolves
 * against the desktop's advertised origin. Unlike `listenPort` (raw TCP, LAN
 * only), this works in every connectivity mode (LAN, tailscale-serve HTTPS,
 * the self-hosted relay) because it rides the remote-access server's own
 * authenticated HTTP endpoint. */
export const remotePortForwardResultSchema = z.object({
  forward: activePortForwardSchema,
  enterPath: z.string().min(1).optional(),
});
export type RemotePortForwardResult = z.infer<typeof remotePortForwardResultSchema>;

/** Request body for `POST /api/ports/unforward`. */
export const remotePortUnforwardRequestSchema = z.object({
  id: z.string().min(1),
});
export type RemotePortUnforwardRequest = z.infer<typeof remotePortUnforwardRequestSchema>;

export const remotePortUnforwardResultSchema = z.object({ ok: z.literal(true) });
export type RemotePortUnforwardResult = z.infer<typeof remotePortUnforwardResultSchema>;

/** Request body for `POST /api/ports/enter`: mints a fresh enter token for an
 * already-open forward. The browser client calls this right before opening the
 * forwarded tab so the token in `enterPath` is always fresh, rather than
 * reusing the (possibly stale) one returned by the original `forward` call. */
export const remotePortEnterRequestSchema = z.object({
  id: z.string().min(1),
});
export type RemotePortEnterRequest = z.infer<typeof remotePortEnterRequestSchema>;

/** Response for `POST /api/ports/enter`. See {@link remotePortForwardResultSchema}
 * for what `enterPath` resolves to. */
export const remotePortEnterResultSchema = z.object({
  enterPath: z.string().min(1),
});
export type RemotePortEnterResult = z.infer<typeof remotePortEnterResultSchema>;

/**
 * Push notifications, iOS Live Activities & Android live-update notifications.
 * A paired mobile device registers its push tokens against the desktop; the
 * desktop's `PushCoordinator` maps supervisor `thread-state` transitions to
 * Live Activity / alert pushes routed through the hosted push gateway.
 * Registration is gated on `session:operate` (no new scope), so already-paired
 * devices register without re-pairing.
 *
 * Platform tokens: iOS carries an APNs `deviceToken` (alerts) plus optional
 * `pushToStartToken` / `activityTokens` (Live Activities). Android carries its
 * FCM registration token in the same `deviceToken` field. An installed web app
 * carries the browser's Push API subscription plus the app base path used for
 * notification-click routing. Platform-specific fields are rejected when they
 * appear on the wrong registration type.
 *
 * Upsert semantics: any token field **present** in a registration replaces the
 * stored value for that field; **absent** fields are preserved. This lets the
 * app re-register a single rotated token without clobbering the others.
 */
export const remoteWebPushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .url()
    .refine((value) => value.startsWith("https://"), "endpoint must use https"),
  expirationTime: z.number().int().nonnegative().nullable(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});
export type RemoteWebPushSubscription = z.infer<typeof remoteWebPushSubscriptionSchema>;

function containsAsciiControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit < 0x20 || codeUnit === 0x7f) return true;
  }
  return false;
}

const remotePushRouteIdentifierSchema = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => !containsAsciiControl(value), "identifier contains control characters");

/**
 * Client-to-host binding for multihost native push. This object is optional so
 * registrations from released single-host clients keep their original shape.
 * A client that sends it must provide the complete v1 identity.
 */
export const remotePushRegistrationRoutingSchema = z.object({
  version: z.literal(REMOTE_PUSH_ROUTING_VERSION),
  clientConnectionId: z
    .string()
    .uuid()
    .transform((value) => value.toLowerCase()),
  desktopId: remotePushRouteIdentifierSchema,
});
export type RemotePushRegistrationRouting = z.infer<typeof remotePushRegistrationRoutingSchema>;

/** Custom routing data delivered with a native notification. */
export const remotePushPayloadRoutingSchema = remotePushRegistrationRoutingSchema.extend({
  threadId: remotePushRouteIdentifierSchema,
});
export type RemotePushPayloadRouting = z.infer<typeof remotePushPayloadRoutingSchema>;

/** Per-install alert choices supplied by native clients. Missing preferences
 * preserve the released behavior: every alert category, with sound. */
export const remotePushAlertPreferencesSchema = z.object({
  sound: z.boolean(),
  statuses: z.object({
    done: z.boolean(),
    needsAttention: z.boolean(),
    error: z.boolean(),
  }),
});
export type RemotePushAlertPreferences = z.infer<typeof remotePushAlertPreferencesSchema>;

export const remotePushRegistrationSchema = z
  .object({
    /** Stable per-device identity (survives token rotation); the upsert key. */
    deviceId: z.string().min(8),
    platform: z.enum(["ios", "android", "web"]),
    /** APNs device token (iOS alerts) or FCM registration token (Android). */
    deviceToken: z.string().min(1).optional(),
    /** iOS 17.2+ push-to-start token for the desktop-session Live Activity. iOS only. */
    pushToStartToken: z.string().min(1).optional(),
    /** Per-activity update tokens, keyed by ActivityKit activity id. iOS only. */
    activityTokens: z.record(z.string().min(1), z.string().min(1)).optional(),
    /** Standards-based Push API subscription. Installed web apps only. */
    webPushSubscription: remoteWebPushSubscriptionSchema.optional(),
    /** Root-scoped browser-history base path for notification click routing. */
    webAppBasePath: z
      .string()
      .regex(/^\/(?!\/)(?:[^?#]*)$/)
      .optional(),
    appVersion: z.string().min(1).optional(),
    /** Present only for native clients that negotiated push-routing v1. */
    routing: remotePushRegistrationRoutingSchema.optional(),
    /** Device-owned alert sound and outcome filters. Native clients only. */
    alertPreferences: remotePushAlertPreferencesSchema.optional(),
  })
  .superRefine((registration, ctx) => {
    if (registration.platform === "android") {
      if (registration.pushToStartToken !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["pushToStartToken"],
          message: "pushToStartToken is iOS-only",
        });
      }
      if (registration.activityTokens !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["activityTokens"],
          message: "activityTokens is iOS-only",
        });
      }
    }
    if (registration.platform !== "web") {
      if (registration.webPushSubscription !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["webPushSubscription"],
          message: "webPushSubscription is web-only",
        });
      }
      if (registration.webAppBasePath !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["webAppBasePath"],
          message: "webAppBasePath is web-only",
        });
      }
      return;
    }
    if (registration.routing !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["routing"],
        message: "routing is native-only",
      });
    }
    if (registration.alertPreferences !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["alertPreferences"],
        message: "alertPreferences is native-only",
      });
    }
    if (!registration.webPushSubscription) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["webPushSubscription"],
        message: "webPushSubscription is required on web",
      });
    }
    if (!registration.webAppBasePath) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["webAppBasePath"],
        message: "webAppBasePath is required on web",
      });
    }
    for (const field of ["deviceToken", "pushToStartToken", "activityTokens"] as const) {
      if (registration[field] !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} is native-only`,
        });
      }
    }
  });
export type RemotePushRegistration = z.infer<typeof remotePushRegistrationSchema>;

export const remotePushUnregisterSchema = z.object({
  deviceId: z.string().min(1),
  /** Exact registry entry to remove. Omitted by legacy clients. */
  routing: remotePushRegistrationRoutingSchema.optional(),
});
export type RemotePushUnregister = z.infer<typeof remotePushUnregisterSchema>;

export const remotePushRegistrationResultSchema = z.object({
  ok: z.literal(true),
  /** Echoed only when the server accepted and bound versioned routing. */
  routing: z
    .object({
      version: z.literal(REMOTE_PUSH_ROUTING_VERSION),
    })
    .optional(),
});
export type RemotePushRegistrationResult = z.infer<typeof remotePushRegistrationResultSchema>;

export const remoteWebPushConfigResultSchema = z.object({
  publicKey: z.string().min(1),
});
export type RemoteWebPushConfigResult = z.infer<typeof remoteWebPushConfigResultSchema>;

/**
 * A single row in the Live Activity content-state, mirroring the Swift
 * `DesktopSessionAttributes.ContentState.ThreadRow`. `startedAt` is epoch-ms
 * (drives the elapsed timer on-device). `status` is a `ThreadStatus` string,
 * kept as a plain string here so the shape stays JSON-serializable and
 * provider-agnostic.
 */
export const remoteLiveActivityThreadRowSchema = z.object({
  threadId: z.string().min(1),
  title: z.string(),
  project: z.string(),
  status: z.string().min(1),
  startedAt: z.number().int().nonnegative(),
});
export type RemoteLiveActivityThreadRow = z.infer<typeof remoteLiveActivityThreadRowSchema>;

/** Live Activity content-state (APNs payload cap is 4 KB): a running count plus
 * up to 3 thread rows, most-recently-active first. */
export const remoteLiveActivityContentStateSchema = z.object({
  runningCount: z.number().int().nonnegative(),
  threads: z.array(remoteLiveActivityThreadRowSchema).max(3),
});
export type RemoteLiveActivityContentState = z.infer<typeof remoteLiveActivityContentStateSchema>;

export const remoteShellSnapshotSchema = z.object({
  snapshotSeq: z.number().int().nonnegative(),
  projects: z.array(remoteProjectSchema),
  threads: z.array(threadSchema),
  runtimeSummariesByThread: z.record(z.string(), remoteRuntimeSummarySchema),
  /** Absent on desktops that predate git summaries. */
  gitSummariesByThread: remoteGitSummariesSchema.optional(),
  /** Normalized host-owned Git/PR state. Absent on legacy hosts. */
  gitState: gitStateSnapshotSchema.optional(),
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
  /** Cursor for older runtime items when the server returned a tail page. */
  runtimeNextCursor: z.number().int().nonnegative().nullable().optional(),
  completedTurns: z.array(persistedCompletedTurnSchema),
  contextUsage: threadContextUsageSchema.nullable(),
  terminalScrollback: z.string().optional(),
  terminalSize: terminalSizeSchema.optional(),
  updatedAt: z.string().min(1),
});
export type RemoteThreadSnapshot = z.infer<typeof remoteThreadSnapshotSchema>;

export const remoteTimelineEntryCountSchema = z.number().int().min(1).max(100);

export const remoteRuntimeItemsPageRequestSchema = z.object({
  threadId: z.string().min(1),
  beforePosition: z.number().int().nonnegative().optional(),
  limit: z.number().int().min(1).max(500),
  targetTimelineEntryCount: remoteTimelineEntryCountSchema.optional(),
});
export type RemoteRuntimeItemsPageRequest = z.infer<typeof remoteRuntimeItemsPageRequestSchema>;

export const remoteRuntimeItemsPageSchema = z.object({
  items: z.array(persistedRuntimeItemSchema),
  nextCursor: z.number().int().nonnegative().nullable(),
});
export type RemoteRuntimeItemsPage = z.infer<typeof remoteRuntimeItemsPageSchema>;

/**
 * Desktop settings editable from a remote client ("Remote settings" in the
 * PWA, as opposed to its device-local settings). Only settings the desktop
 * itself acts on belong here — the AI helpers (title/commit generation,
 * conflict resolver), agent/model configuration (each desktop has its own set
 * of agents and models), worktree placement, and persistent composer MCP
 * enablement. Deliberately excludes secrets (providerConfigs and custom MCP
 * definitions) and device-local preferences (theme, fonts, audio, …).
 */
/** Exported solely so the remote-v3 generator can bind this security transform
 * to its portable native implementation. */
export const remoteAgentSettingsSchema = sharedSettingsSchema.shape.agentSettings.transform(
  (settings) =>
    Object.fromEntries(
      Object.entries(settings).map(([agentKind, values]) => {
        const next = { ...values };
        for (const key of sensitiveAgentSettingKeys(agentKind)) delete next[key];
        return [agentKind, next];
      }),
    ),
);

export const remoteSettingsSchema = sharedSettingsSchema
  .pick({
    agentSettings: true,
    hiddenModels: true,
    disabledAgents: true,
    providerOrder: true,
    usage: true,
    enabledMcpServers: true,
    disabledBuiltInMcpServers: true,
    titleGenProvider: true,
    titleGenModel: true,
    titleGenEffort: true,
    titleGenFast: true,
    commitGenProvider: true,
    commitGenModel: true,
    commitGenEffort: true,
    commitGenFast: true,
    conflictResolverProvider: true,
    conflictResolverModel: true,
    conflictResolverEffort: true,
    conflictResolverFast: true,
    conflictResolverPresentationMode: true,
    wslTitleGenProvider: true,
    wslTitleGenModel: true,
    wslTitleGenEffort: true,
    wslTitleGenFast: true,
    wslCommitGenProvider: true,
    wslCommitGenModel: true,
    wslCommitGenEffort: true,
    wslCommitGenFast: true,
    wslConflictResolverProvider: true,
    wslConflictResolverModel: true,
    wslConflictResolverEffort: true,
    wslConflictResolverFast: true,
    wslConflictResolverPresentationMode: true,
    worktreeStorageMode: true,
    worktreeBasePath: true,
    wslWorktreeBasePath: true,
    searchUseIgnoreFiles: true,
    searchExclude: true,
    prAutomationDefault: true,
    prMergeMethod: true,
  })
  .extend({
    agentSettings: remoteAgentSettingsSchema,
    // Optional for backward-compatible reads from remote-v3 hosts released
    // before native clients could edit usage card ordering and collapse state.
    usage: sharedSettingsSchema.shape.usage.optional(),
    // Optional on the wire for remote-v3 hosts released before native project
    // Search could display the inherited desktop defaults.
    searchUseIgnoreFiles: sharedSettingsSchema.shape.searchUseIgnoreFiles.optional(),
    searchExclude: sharedSettingsSchema.shape.searchExclude.optional(),
  });
export type RemoteSettings = z.infer<typeof remoteSettingsSchema>;

export const REMOTE_SETTINGS_KEYS = Object.keys(
  remoteSettingsSchema.shape,
) as readonly (keyof RemoteSettings)[];

export const remoteSettingsPatchSchema = remoteSettingsSchema
  .omit({ enabledMcpServers: true, disabledBuiltInMcpServers: true })
  .partial()
  .extend({
    // These full-settings fields have `{}` defaults. Remove them for the patch
    // shape so an unrelated remote edit cannot silently clear desktop MCP state.
    enabledMcpServers: sharedSettingsSchema.shape.enabledMcpServers.removeDefault().optional(),
    disabledBuiltInMcpServers: sharedSettingsSchema.shape.disabledBuiltInMcpServers
      .removeDefault()
      .optional(),
  });
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
    localHttpBaseUrl: z.string().url(),
    tailscaleHttpBaseUrl: z.string().url().optional(),
    wsBaseUrl: z.string().url(),
    pairingUrl: z.string().url(),
    /** When the credential inside `pairingUrl` stops being redeemable. */
    pairingExpiresAt: z.string().datetime(),
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

export const remoteThreadItemInterestsSchema = z.array(z.string().min(1)).max(200);

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
  //
  // Legacy clients send `{type:"terminal-watch",id}` only. Opt-in cursor-sync
  // clients may add `cursorSync` when the environment advertises the capability;
  // the server then replies with `terminal-watch-result` and tags subsequent
  // `terminal-output` frames for that watch. Request `version` is any positive
  // integer; unsupported versions get an explicit non-retryable error and no watch.
  z.object({
    type: z.literal("terminal-watch"),
    id: z.string().min(1),
    cursorSync: remoteTerminalCursorSyncRequestSchema.optional(),
  }),
  z.object({ type: z.literal("terminal-unwatch"), id: z.string().min(1) }),
  z.object({
    type: z.literal("git-state-interests"),
    interests: z.array(gitStateInterestSchema).max(500),
  }),
  /**
   * Threads this client wants live transcript *content* for. Runtime item and
   * text-delta events for any other thread are withheld — a phone viewing one
   * thread otherwise downloads every other thread's tool payloads too.
   *
   * Scoped to bulk content ONLY. Lifecycle and interaction events
   * (`request.opened`/`request.resolved`, `turn.*`, `session.*`, warnings,
   * errors, context/usage) always reach every client regardless of this list:
   * a permission prompt on a thread the user is not looking at must still
   * surface, and `RemoteThreadSnapshot` carries no open-requests field to
   * recover it from later.
   *
   * A client that never sends this message keeps receiving everything, so older
   * clients are unaffected.
   */
  z.object({
    type: z.literal("thread-item-interests"),
    threadIds: remoteThreadItemInterestsSchema,
  }),
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
  //
  // Legacy watchers receive the exact three-field frame. Opt-in cursor-sync
  // watches receive the same envelope plus `cursorSync` metadata.
  // When cursorSync is present: toCursor - fromCursor === data.length (UTF-16 units).
  z
    .object({
      type: z.literal("terminal-output"),
      id: z.string().min(1),
      data: z.string(),
      cursorSync: remoteTerminalOutputCursorSyncV1Schema.optional(),
    })
    .superRefine((value, ctx) => {
      const cursorSync = value.cursorSync;
      if (!cursorSync) return;
      if (cursorSync.toCursor - cursorSync.fromCursor !== value.data.length) {
        ctx.addIssue({
          code: "custom",
          message: "toCursor - fromCursor must equal data.length (JS UTF-16 code units)",
          path: ["data"],
        });
      }
    }),
  // Authoritative snapshot/error for an opt-in `terminal-watch` with cursorSync.
  // Not sent for legacy watches. Clients buffer live output until this arrives
  // and reconcile by cursor ranges.
  z.object({
    type: z.literal("terminal-watch-result"),
    id: z.string().min(1),
    cursorSync: z.object({
      version: z.literal(TERMINAL_CURSOR_SYNC_VERSION),
      watchId: z.string().min(1),
      result: remoteTerminalWatchResultSchema,
    }),
  }),
]);
export type RemoteWebSocketServerMessage = z.infer<typeof remoteWebSocketServerMessageSchema>;
