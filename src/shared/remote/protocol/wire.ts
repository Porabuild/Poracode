import { z } from "zod";
import { sensitiveAgentSettingKeys } from "../../agentSecrets";
import { CATALOG_READS_CAPABILITY } from "../catalogReadContract";
import { persistedRuntimeItemSchema } from "../../ipc/schemas";
import { gitStateInterestSchema } from "../../gitState";
import { sharedSettingsSchema } from "../../settings";
import { EVENT_SEQUENCE_SPACES } from "../../eventSequenceSpace";
import {
  TERMINAL_CURSOR_SYNC_VERSION,
  TERMINAL_CURSOR_SYNC_V2_VERSION,
  remoteTerminalCursorSchema,
  remoteTerminalCursorSyncRequestSchema,
  remoteTerminalWatchResultSchema,
  remoteTerminalOutputCursorSyncV1Schema,
  remoteTerminalWatchBaselineChunkSchema,
  remoteAccessSessionSchema,
} from "./core";
import { remoteRuntimeHistoryNoticeSchema } from "./runtimeHistoryNotice";

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
  /**
   * B4 bounded-reads echo (`reads=bounded-v1`). Absent on legacy hosts and on
   * undeclared responses, so an old reader ignores it and a declared client
   * uses its absence as the only "genuine older host" downgrade signal.
   */
  reads: z.literal(CATALOG_READS_CAPABILITY).optional(),
  /**
   * B1 durable history-incomplete notice (see `remoteThreadSnapshotSchema`).
   * Managed GUI hydration reads item pages, so the notice rides this shape too
   * and cannot be missed by a client that never fetches the snapshot route.
   */
  runtimeNotice: remoteRuntimeHistoryNoticeSchema.optional(),
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
    // Optional input keeps settings responses from older v9 hosts readable;
    // the default preserves the normalized shared-settings contract.
    followUpBehavior: true,
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
    followUpBehavior: sharedSettingsSchema.shape.followUpBehavior.optional().default("steer"),
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
    // Unlike the full response schema, patches must remain sparse; in
    // particular, an unrelated edit must not inject the legacy default.
    followUpBehavior: sharedSettingsSchema.shape.followUpBehavior.optional(),
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
  // Cursor-sync v2 only: per-chunk client ACK releasing baseline credit.
  // Never sent for version-1 watches, so old servers never see it (and an
  // unknown client message type is already safely ignored server-side).
  z.object({
    type: z.literal("terminal-watch-baseline-ack"),
    id: z.string().min(1),
    cursorSync: z.object({
      version: z.literal(TERMINAL_CURSOR_SYNC_V2_VERSION),
      watchId: z.string().min(1),
      throughCursor: remoteTerminalCursorSchema,
    }),
  }),
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
    space: z.enum(EVENT_SEQUENCE_SPACES).optional(),
    event: z.unknown(),
  }),
  z.object({
    type: z.literal("resync-required"),
    seq: z.number().int().nonnegative(),
    space: z.enum(EVENT_SEQUENCE_SPACES).optional(),
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
  // and reconcile by cursor ranges. For a version-2 watch the baseline travels
  // as `terminal-watch-baseline-chunk` messages instead; this frame remains the
  // pre-stream error channel (and the v1 single-shot baseline).
  z.object({
    type: z.literal("terminal-watch-result"),
    id: z.string().min(1),
    cursorSync: z.object({
      version: z.literal(TERMINAL_CURSOR_SYNC_VERSION),
      watchId: z.string().min(1),
      result: remoteTerminalWatchResultSchema,
    }),
  }),
  // Cursor-sync v2 chunked baseline. Sent only for watches whose request
  // declared version 2, so version-1 clients never observe this message type.
  z.object({
    type: z.literal("terminal-watch-baseline-chunk"),
    id: z.string().min(1),
    cursorSync: remoteTerminalWatchBaselineChunkSchema,
  }),
  // DESKTOP-INTERNAL sessions only — the server never sends this frame to an
  // external or native client (gated on a loopback-origin upgrade opt-in; see
  // `wsConnections.ts` and `REMOTE_DESKTOP_INTERNAL_WS_PARAM`). It carries the
  // desktop-only supervisor event families the co-located desktop renderer
  // consumes (provider usage, LSP, OSC, crossagent, experiment judging, …) on
  // its own contiguous replayable sequence: `seq` is the desktop-stream cursor
  // (resume via the `lastDesktopSeq` query parameter), fully independent of the
  // shared `event` stream's sequence. The payload is the desktop SupervisorEvent
  // union, which deliberately does NOT ride the shared replayable stream —
  // external clients validate against the remote runtime-event union and must
  // never observe these types in any frame.
  z.object({
    type: z.literal("desktop-event"),
    seq: z.number().int().positive(),
    space: z.enum(EVENT_SEQUENCE_SPACES).optional(),
    event: z.unknown(),
  }),
]);
export type RemoteWebSocketServerMessage = z.infer<typeof remoteWebSocketServerMessageSchema>;
