import { z } from "zod";
import { terminalSizeSchema, threadContextUsageSchema } from "../../contracts";
import { gitStatePatchSchema } from "../../gitState";

// v11 adds the daily usage window. Older native bindings reject unknown
// window enum values, so exact-match pairing must prevent mixed generations.
// v12 combines that contract with authoritative content.delta.replace recovery.
// Previous V2 clients append replacement snapshots and must not pair with this host.
export const PORACODE_REMOTE_PROTOCOL_VERSION = 12;
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

/**
 * Gate 6 item 4.3 (S2): named pairing-scope presets.
 *
 * `operator` is the pairing default and is exactly the historical full scope
 * set — every pre-existing pairing flow keeps granting what it granted before.
 * `viewer` is the read-only split, designed against the contract registry's
 * per-route scopes: it carries only the scopes whose routes are read-only
 * (`session:read` reads plus the POST read endpoints that only mint read-side
 * artifacts, and `terminal:read` for read-only WS terminal watches). Every
 * route whose registry scopes include `session:operate`, `terminal:operate`,
 * `requests:resolve`, `projects:manage`, or `ports:forward` denies a viewer
 * token at the dispatcher's central scope gate.
 */
export const REMOTE_OPERATOR_SCOPES: readonly RemoteAccessScope[] = REMOTE_STANDARD_SCOPES;
export const REMOTE_VIEWER_SCOPES: readonly RemoteAccessScope[] = ["session:read", "terminal:read"];

export const REMOTE_ACCESS_SCOPE_PRESETS = {
  operator: REMOTE_OPERATOR_SCOPES,
  viewer: REMOTE_VIEWER_SCOPES,
} as const satisfies Record<string, readonly RemoteAccessScope[]>;

export type RemoteAccessScopePreset = keyof typeof REMOTE_ACCESS_SCOPE_PRESETS;

const REMOTE_ACCESS_SCOPE_PRESET_NAMES: readonly RemoteAccessScopePreset[] = Object.keys(
  REMOTE_ACCESS_SCOPE_PRESETS,
) as RemoteAccessScopePreset[];

/** Narrow an arbitrary value to a preset name if it is one we know. */
export function isRemoteAccessScopePreset(value: string): value is RemoteAccessScopePreset {
  return (REMOTE_ACCESS_SCOPE_PRESET_NAMES as readonly string[]).includes(value);
}

export function remoteAccessScopesForPreset(
  preset: RemoteAccessScopePreset,
): readonly RemoteAccessScope[] {
  return REMOTE_ACCESS_SCOPE_PRESETS[preset];
}

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
/**
 * Cursor-sync v2: byte-budgeted chunked baseline delivery with resume and ACK
 * credit windows (see `terminalBaselineStream.ts` / `terminalFeedWatchV2.ts`).
 * Additive only — the per-watch `version` in `terminal-watch` is the framing
 * contract, so version-1 watches never receive v2 frames.
 */
export const TERMINAL_CURSOR_SYNC_V2_VERSION = 2 as const;

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

/** Origin-bound browser entry support, independent of raw TCP forwarding.
 * A supported host may still report that its DNS/TLS deployment is unconfigured. */
export const REMOTE_BROWSER_FORWARD_VERSION = 1 as const;
export const remoteBrowserForwardCapabilitySchema = z.object({
  versions: remoteCapabilityVersionsSchema,
});
export type RemoteBrowserForwardCapability = z.infer<typeof remoteBrowserForwardCapabilitySchema>;

export const remoteEnvironmentCapabilitiesSchema = z.object({
  terminalCursorSync: remoteTerminalCursorSyncCapabilitySchema.optional(),
  pushRouting: remotePushRoutingCapabilitySchema.optional(),
  browserForward: remoteBrowserForwardCapabilitySchema.optional(),
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
 * Servers advertise supported versions via environment capabilities.
 *
 * v2 fields (`maxChunkBytes` / `maxWindowBytes` / `resume`) are ignored by
 * version-1 servers (Zod strips unknown object keys) and read only when
 * `version` is 2. `resume` presents the client's retained cache position so
 * the server can serve the uncovered suffix; absent means a cold baseline.
 */
export const remoteTerminalCursorSyncRequestSchema = z.object({
  version: z.number().int().positive(),
  watchId: z.string().min(1),
  /** Max ENCODED JSON envelope bytes per baseline chunk (v2). */
  maxChunkBytes: z.number().int().min(1).optional(),
  /** Max unacknowledged ENCODED baseline bytes in flight (v2). */
  maxWindowBytes: z.number().int().min(1).optional(),
  resume: z
    .object({
      generation: z.string().min(1),
      cursor: remoteTerminalCursorSchema,
    })
    .optional(),
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
  /** Optional machine-readable cause, e.g. `unsupported-version` — lets a v2
   * client distinguish "downgrade host" from other non-retryable stops. */
  reason: z.string().min(1).optional(),
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

/**
 * One ordered slice of a cursor-sync v2 baseline (see
 * `remoteTerminalCursorSyncRequestSchema` v2 fields). The last chunk
 * (`chunkIndex === chunkCount - 1`) completes the baseline — there is no
 * separate completion frame. Chunk ranges are contiguous and code-point
 * aligned: `chunk k+1.from === chunk k.to`, and a boundary never splits a
 * surrogate pair. A fully up-to-date resume is one chunk with empty `data`
 * and `fromCursor === toCursor === resume.cursor` ("you are current" plus a
 * processState/terminalSize refresh — distinct from v1's empty-terminal
 * baseline at the origin).
 */
export const remoteTerminalWatchBaselineChunkSchema = z
  .object({
    version: z.literal(TERMINAL_CURSOR_SYNC_V2_VERSION),
    watchId: z.string().min(1),
    /** Null = replace-only window (SQLite fallback), still chunked. */
    generation: z.string().min(1).nullable(),
    chunkIndex: z.number().int().nonnegative(),
    chunkCount: z.number().int().positive(),
    fromCursor: remoteTerminalCursorSchema,
    toCursor: remoteTerminalCursorSchema,
    data: z.string(),
    processState: z.enum(["running", "exited"]),
    terminalSize: terminalSizeSchema.nullable(),
    /** True = delta from the client's resume cursor; false = full window. */
    resumeServed: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.chunkIndex >= value.chunkCount) {
      ctx.addIssue({
        code: "custom",
        message: "chunkIndex must be < chunkCount",
        path: ["chunkIndex"],
      });
    }
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
export type RemoteTerminalWatchBaselineChunk = z.infer<
  typeof remoteTerminalWatchBaselineChunkSchema
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
  // Gate 6 item 4.6 (S6): the token endpoint now also serves the refresh
  // grant. `pairing-token` keeps its exact historical shape, so pre-refresh
  // clients and servers stay wire-compatible; the additive `refresh_token`
  // value only ever travels between peers that both understand it.
  //
  // The per-grant field requirements (pairing-token -> `credential`,
  // refresh_token -> `refreshToken`) are enforced by the server's grant
  // dispatch, not here: this schema feeds the generated native bindings,
  // which only accept the registry's portable validators (a `.superRefine`
  // cross-field check would fail `protocol:remote:v3:generate`). The server
  // answers a missing field with the same 401 shape as an unknown credential,
  // so nothing is looser in practice.
  grantType: z.union([z.literal("pairing-token"), z.literal("refresh_token")]),
  credential: z.string().min(1).optional(),
  refreshToken: z.string().min(1).optional(),
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
  // Gate 6 item 4.6 (S6): additive refresh lifecycle. Absent from hosts that
  // predate the 24-hour access-token window (those still mint 30-day
  // non-rotating bearers); older clients ignore both fields.
  refreshToken: z.string().min(1).optional(),
  /** Absolute ISO expiry of `refreshToken` when it is present. */
  refreshTokenExpiresAt: z.string().min(1).optional(),
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
