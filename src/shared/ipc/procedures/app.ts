import { z } from "zod";
import type { ProjectLocation } from "../../contracts";
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
  saveClipboardImagePayloadSchema,
  saveHandoffContextPayloadSchema,
  saveImageFilePayloadSchema,
  type CreateProjectDirectoryResult,
} from "../schemas";

export const publishRemoteGitSummariesPayloadSchema = z.object({
  summaries: remoteGitSummariesSchema,
});

export const revokeRemoteAccessSessionPayloadSchema = z.object({
  sessionId: z.string().min(1),
});

export const setRemoteAccessEnabledPayloadSchema = z.object({
  enabled: z.boolean(),
});

export const appProcedures = {
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
  getRemoteAccessPairing: defineNoArgProcedure<RemoteAccessPairingInfo, "main-local">(
    "getRemoteAccessPairing",
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
  // The renderer owns live git state; it mirrors compact per-thread summaries
  // to main so the remote access server can serve them to paired clients.
  publishRemoteGitSummaries: definePayloadProcedure<
    z.infer<typeof publishRemoteGitSummariesPayloadSchema>,
    void,
    "main-local"
  >("publishRemoteGitSummaries", "main-local", publishRemoteGitSummariesPayloadSchema),
} as const;
