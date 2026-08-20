import { z } from "zod";
import { projectLocationSchema, type ProjectLocation } from "../../contracts";
import {
  type KeybindingsConfig,
  type KeybindingsFile,
  keybindingsFileSchema,
} from "../../keybindings";
import { remoteGitSummariesSchema, type RemoteAccessPairingInfo } from "../../remote";
import { defineIpcProcedure, defineNoArgProcedure, definePayloadProcedure } from "../core";
import {
  copyImageToClipboardPayloadSchema,
  createProjectDirectoryPayloadSchema,
  openExternalPayloadSchema,
  pickFilesOptionsSchema,
  readLocalImageFilePayloadSchema,
  saveClipboardImagePayloadSchema,
  saveHandoffContextPayloadSchema,
  saveImageFilePayloadSchema,
  showNotificationPayloadSchema,
  type CreateProjectDirectoryResult,
} from "../schemas";

export const publishRemoteGitSummariesPayloadSchema = z.object({
  summaries: remoteGitSummariesSchema,
});

/**
 * Payload for the two folder probes: `detectProjectIcon` resolves a project's
 * `icon: "auto"` to the best image, and `listProjectIconFiles` returns every
 * match so the picker can offer them. The main process probes well-known
 * favicon/logo paths and returns paths relative to the project root
 * (forward slashes).
 */
export const detectProjectIconPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
});

export const revokeRemoteAccessSessionPayloadSchema = z.object({
  sessionId: z.string().min(1),
});

export const setRemoteAccessEnabledPayloadSchema = z.object({
  enabled: z.boolean(),
});

export const setRemoteAccessTailscaleHttpsPayloadSchema = z.object({
  enabled: z.boolean(),
});

export const setRemoteAccessAdvertisedUrlPayloadSchema = z.object({
  /** Full origin (http/https). Empty string clears the custom URL (automatic). */
  url: z.string(),
});

export const setGlobalShortcutsSuspendedPayloadSchema = z.object({
  suspended: z.boolean(),
});

/**
 * Live view of the local Tailscale daemon + our `tailscale serve` HTTPS mapping,
 * surfaced in desktop Settings → Remote Access.
 */
export interface RemoteAccessTailscaleStatus {
  /** The persisted `remoteAccessTailscaleHttps` setting. */
  readonly enabled: boolean;
  /** Daemon reachability from the last probe. */
  readonly daemon: "not-installed" | "not-running" | "needs-login" | "running" | "error";
  /** MagicDNS FQDN (no trailing dot) when the daemon is running. */
  readonly dnsName?: string;
  /** Whether HTTPS certs appear provisionable on this tailnet. */
  readonly httpsAvailable?: boolean;
  /** Advertised HTTPS URL when the serve mapping is currently active. */
  readonly httpsUrl?: string;
  /** True when the remote server is currently advertising the Tailscale URL. */
  readonly serveActive: boolean;
  /** Daemon-probe or serve-setup error message, if any. */
  readonly message?: string;
}

/** Result of launching the Tailscale GUI (start daemon / complete login). */
export interface StartTailscaleResult {
  readonly ok: boolean;
  /** Actionable message when the GUI could not be launched. */
  readonly message?: string;
}

export interface LegacyDataMigrationRequestResult {
  readonly status: "scheduled" | "no-legacy-data" | "unavailable";
}

/**
 * Desktop-as-client HTTP proxy. The renderer can't fetch a remote Poracode
 * server directly — the server's CORS allowlist doesn't include the desktop's
 * origin — so remote requests run in the main process, which isn't subject to
 * CORS. See docs/REMOTE_ARCHITECTURE.md, Phase 4.
 */
export const remoteHttpRequestPayloadSchema = z.object({
  url: z.string().url(),
  method: z.enum(["GET", "POST", "DELETE"]).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
  bodyBase64: z.string().optional(),
});
export type RemoteHttpRequestPayload = z.infer<typeof remoteHttpRequestPayloadSchema>;
export interface RemoteHttpRequestResult {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: string;
}

export const appProcedures = {
  remoteHttpRequest: definePayloadProcedure<
    RemoteHttpRequestPayload,
    RemoteHttpRequestResult,
    "main-local"
  >("remoteHttpRequest", "main-local", remoteHttpRequestPayloadSchema),
  pickFolder: defineIpcProcedure<[string?], string | undefined, string | null, "main-local">(
    "pickFolder",
    "main-local",
    z.string().optional(),
    (defaultPath) => (defaultPath ? z.string().parse(defaultPath) : undefined),
  ),
  pickFiles: defineIpcProcedure<
    [z.infer<typeof pickFilesOptionsSchema>?],
    z.infer<typeof pickFilesOptionsSchema>,
    string[] | null,
    "main-local"
  >("pickFiles", "main-local", pickFilesOptionsSchema, (options) =>
    pickFilesOptionsSchema.parse(options),
  ),
  detectProjectIcon: definePayloadProcedure<
    z.infer<typeof detectProjectIconPayloadSchema>,
    string | null,
    "main-local"
  >("detectProjectIcon", "main-local", detectProjectIconPayloadSchema),
  listProjectIconFiles: definePayloadProcedure<
    z.infer<typeof detectProjectIconPayloadSchema>,
    string[],
    "main-local"
  >("listProjectIconFiles", "main-local", detectProjectIconPayloadSchema),
  saveClipboardImage: definePayloadProcedure<
    z.infer<typeof saveClipboardImagePayloadSchema>,
    string,
    "main-local"
  >("saveClipboardImage", "main-local", saveClipboardImagePayloadSchema),
  saveHandoffContext: definePayloadProcedure<
    z.infer<typeof saveHandoffContextPayloadSchema>,
    string,
    "main-local"
  >("saveHandoffContext", "main-local", saveHandoffContextPayloadSchema),
  saveImageFile: definePayloadProcedure<
    z.infer<typeof saveImageFilePayloadSchema>,
    string | null,
    "main-local"
  >("saveImageFile", "main-local", saveImageFilePayloadSchema),
  copyImageToClipboard: definePayloadProcedure<
    z.infer<typeof copyImageToClipboardPayloadSchema>,
    boolean,
    "main-local"
  >("copyImageToClipboard", "main-local", copyImageToClipboardPayloadSchema),
  readLocalImageFile: definePayloadProcedure<
    z.infer<typeof readLocalImageFilePayloadSchema>,
    Uint8Array,
    "main-local"
  >("readLocalImageFile", "main-local", readLocalImageFilePayloadSchema),
  createProjectDirectory: definePayloadProcedure<
    z.infer<typeof createProjectDirectoryPayloadSchema>,
    CreateProjectDirectoryResult,
    "main-local"
  >("createProjectDirectory", "main-local", createProjectDirectoryPayloadSchema),
  listWslDistros: defineNoArgProcedure<string[], "supervisor">("listWslDistros", "supervisor"),
  openExternal: defineIpcProcedure<[string], string, void, "main-local">(
    "openExternal",
    "main-local",
    openExternalPayloadSchema,
    (url) => openExternalPayloadSchema.parse(url),
  ),
  openExternalNative: defineIpcProcedure<[string], string, void, "main-local">(
    "openExternalNative",
    "main-local",
    openExternalPayloadSchema,
    (url) => openExternalPayloadSchema.parse(url),
  ),
  openMicrophoneSettings: defineNoArgProcedure<void, "main-local">(
    "openMicrophoneSettings",
    "main-local",
  ),
  focusWindow: defineNoArgProcedure<void, "main-local">("focusWindow", "main-local"),
  showNotification: definePayloadProcedure<
    z.infer<typeof showNotificationPayloadSchema>,
    boolean,
    "main-local"
  >("showNotification", "main-local", showNotificationPayloadSchema),
  requestLegacyDataMigration: defineNoArgProcedure<LegacyDataMigrationRequestResult, "main-local">(
    "requestLegacyDataMigration",
    "main-local",
  ),
  relaunchApp: defineNoArgProcedure<void, "main-local">("relaunchApp", "main-local"),
  getHomeScopeLocation: defineNoArgProcedure<ProjectLocation, "main-local">(
    "getHomeScopeLocation",
    "main-local",
  ),
  getKeybindings: defineNoArgProcedure<KeybindingsConfig, "main-local">(
    "getKeybindings",
    "main-local",
  ),
  setKeybindings: definePayloadProcedure<KeybindingsFile, KeybindingsConfig, "main-local">(
    "setKeybindings",
    "main-local",
    keybindingsFileSchema,
  ),
  setGlobalShortcutsSuspended: definePayloadProcedure<
    z.infer<typeof setGlobalShortcutsSuspendedPayloadSchema>,
    void,
    "main-local"
  >("setGlobalShortcutsSuspended", "main-local", setGlobalShortcutsSuspendedPayloadSchema),
  getRemoteAccessPairing: defineNoArgProcedure<RemoteAccessPairingInfo, "main-local">(
    "getRemoteAccessPairing",
    "main-local",
  ),
  refreshRemoteAccessPairing: defineNoArgProcedure<RemoteAccessPairingInfo, "main-local">(
    "refreshRemoteAccessPairing",
    "main-local",
  ),
  setRemoteAccessEnabled: definePayloadProcedure<
    z.infer<typeof setRemoteAccessEnabledPayloadSchema>,
    RemoteAccessPairingInfo,
    "main-local"
  >("setRemoteAccessEnabled", "main-local", setRemoteAccessEnabledPayloadSchema),
  revokeRemoteAccessSession: definePayloadProcedure<
    z.infer<typeof revokeRemoteAccessSessionPayloadSchema>,
    { revoked: boolean },
    "main-local"
  >("revokeRemoteAccessSession", "main-local", revokeRemoteAccessSessionPayloadSchema),
  getRemoteAccessTailscaleStatus: defineNoArgProcedure<RemoteAccessTailscaleStatus, "main-local">(
    "getRemoteAccessTailscaleStatus",
    "main-local",
  ),
  setRemoteAccessTailscaleHttps: definePayloadProcedure<
    z.infer<typeof setRemoteAccessTailscaleHttpsPayloadSchema>,
    RemoteAccessPairingInfo,
    "main-local"
  >("setRemoteAccessTailscaleHttps", "main-local", setRemoteAccessTailscaleHttpsPayloadSchema),
  startTailscale: defineNoArgProcedure<StartTailscaleResult, "main-local">(
    "startTailscale",
    "main-local",
  ),
  setRemoteAccessAdvertisedUrl: definePayloadProcedure<
    z.infer<typeof setRemoteAccessAdvertisedUrlPayloadSchema>,
    RemoteAccessPairingInfo,
    "main-local"
  >("setRemoteAccessAdvertisedUrl", "main-local", setRemoteAccessAdvertisedUrlPayloadSchema),
  // The renderer owns live git state; it mirrors compact per-thread summaries
  // to main so the remote access server can serve them to paired clients.
  publishRemoteGitSummaries: definePayloadProcedure<
    z.infer<typeof publishRemoteGitSummariesPayloadSchema>,
    void,
    "main-local"
  >("publishRemoteGitSummaries", "main-local", publishRemoteGitSummariesPayloadSchema),
} as const;
