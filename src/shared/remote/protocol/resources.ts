import { z } from "zod";
import {
  agentSlashCommandSchema,
  agentStatusSchema,
  backgroundTaskSchema,
  cloneRepoSourceSchema,
  projectSchema,
  scheduledTaskIdPayloadSchema,
  scheduledTaskInputSchema,
  scheduledTaskRunSchema,
  scheduledTaskSchema,
  terminalSizeSchema,
  threadContextUsageSchema,
  threadFollowUpQueueStateSchema,
  threadSchema,
} from "../../contracts";
import { persistedCompletedTurnSchema, persistedRuntimeItemSchema } from "../../ipc/schemas";
import { gitStateSnapshotSchema } from "../../gitState";
import { userNotificationSchema } from "../../threadNotification";
import {
  REMOTE_PUSH_ROUTING_VERSION,
  remoteRuntimeSummarySchema,
  remoteGitSummariesSchema,
} from "./core";

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
  /**
   * Credential a raw-TCP client must present as the first LF-terminated line
   * on any direct connection to the forward's `listenPort` (Gate 6: forwarded
   * listeners never accept unauthenticated connects). Browser-origin entry
   * keeps using `enterPath` with its own session auth.
   */
  connectTicket: z.string().min(1),
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
  /**
   * Gate 4 hazard #3 pagination: present only when this request bounded the
   * thread list (`threadLimit` query) and higher sort_order threads remain;
   * page the remainder from the thread-list route until null. Absent means the
   * thread list is complete (legacy hosts, unbounded requests, exhausted
   * list), so clients that never opt in never see this field.
   */
  threadsNextCursor: z.string().nullable().optional(),
  runtimeSummariesByThread: z.record(z.string(), remoteRuntimeSummarySchema),
  /** Absent on desktops that predate git summaries. */
  gitSummariesByThread: remoteGitSummariesSchema.optional(),
  /** Normalized host-owned Git/PR state. Absent on legacy hosts. */
  gitState: gitStateSnapshotSchema.optional(),
  updatedAt: z.string().min(1),
});
export type RemoteShellSnapshot = z.infer<typeof remoteShellSnapshotSchema>;

/**
 * One page of the bounded shell thread list (Gate 4 hazard #3). Serves the
 * continuation of a `threadLimit`-bounded shell snapshot: the thread rows plus
 * the per-thread summary slices for exactly this page's threads, so no
 * thread-keyed map grows with the whole host.
 */
export const remoteThreadListPageSchema = z.object({
  threads: z.array(threadSchema),
  runtimeSummariesByThread: z.record(z.string(), remoteRuntimeSummarySchema),
  /** Absent on desktops that predate git summaries (mirrors the shell snapshot). */
  gitSummariesByThread: remoteGitSummariesSchema.optional(),
  /** Cursor for the next page; null after the final page. */
  nextCursor: z.string().nullable(),
});
export type RemoteThreadListPage = z.infer<typeof remoteThreadListPageSchema>;

export const remoteAgentStatusesSchema = z.object({
  windows: z.array(agentStatusSchema),
  wsl: z.array(agentStatusSchema),
  updatedAt: z.string().min(1),
});
export type RemoteAgentStatuses = z.infer<typeof remoteAgentStatusesSchema>;

/** Per-agent slash-command catalog for the WS3-A payload split: clients that
 * request `slashCommands=omit` on agent-statuses fetch one agent's catalog
 * lazily from this route instead of every agent's on every cold start. */
export const remoteAgentSlashCommandsSchema = z.object({
  kind: z.string().min(1),
  commands: z.array(agentSlashCommandSchema),
});
export type RemoteAgentSlashCommands = z.infer<typeof remoteAgentSlashCommandsSchema>;

export const remoteThreadSnapshotSchema = z.object({
  snapshotSeq: z.number().int().nonnegative(),
  thread: threadSchema,
  runtimeItems: z.array(persistedRuntimeItemSchema),
  /** Cursor for older runtime items when the server returned a tail page. */
  runtimeNextCursor: z.number().int().nonnegative().nullable().optional(),
  completedTurns: z.array(persistedCompletedTurnSchema),
  contextUsage: threadContextUsageSchema.nullable(),
  /** Authoritative live background work. Absent on legacy hosts. */
  backgroundTasks: z.array(backgroundTaskSchema).optional(),
  terminalScrollback: z.string().optional(),
  terminalSize: terminalSizeSchema.optional(),
  /** Absent when the host predates queued follow-up snapshots. */
  followUpQueue: threadFollowUpQueueStateSchema.nullable().optional(),
  updatedAt: z.string().min(1),
});
export type RemoteThreadSnapshot = z.infer<typeof remoteThreadSnapshotSchema>;
