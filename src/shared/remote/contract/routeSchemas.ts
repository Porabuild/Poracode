import { z } from "zod";
import {
  profileIdentitySchema,
  profileStatsRequestSchema,
  projectNotesSchema,
  prWatchInputSchema,
  prWatchKeySchema,
  prWatchSchema,
  startThreadPayloadSchema,
  startThreadResultSchema,
  startShellPayloadSchema,
  providerUsageResponseSchema,
  remoteThreadCommandSchema,
} from "../../contracts";
import { dbTruncateRuntimeItemsPayloadSchema } from "../../ipc/schemas";
import {
  profileCoreStatsSchema,
  profileDevicesResponseSchema,
  profileIdentityResponseSchema,
  profileTokenStatsSchema,
} from "../../contracts/profileResults";
import { sharedSettingsSchema } from "../../settings";
import { gitStateSnapshotWireSchema } from "./gitStateWire";
import {
  remoteAgentStatusesSchema,
  remoteBrowserCommandSchema,
  remoteBrowserStateSchema,
  remoteEnvironmentDescriptorSchema,
  remoteGitCallPayloadSchema,
  remoteHostUpdateStateSchema,
  remotePortEnterRequestSchema,
  remotePortEnterResultSchema,
  remotePortForwardRequestSchema,
  remotePortForwardResultSchema,
  remotePortUnforwardRequestSchema,
  remotePortsStateSchema,
  remoteProjectCommandResultSchema,
  remoteProjectCommandSchema,
  remoteProjectSettingsSchema,
  remotePushRegistrationResultSchema,
  remotePushRegistrationSchema,
  remotePushUnregisterSchema,
  remoteRuntimeItemsPageRequestSchema,
  remoteRuntimeItemsPageSchema,
  remoteScheduleCommandSchema,
  remoteSchedulesResponseSchema,
  remoteSettingsPatchSchema,
  remoteSettingsSchema,
  remoteShellSnapshotSchema,
  remoteThreadSnapshotSchema,
  remoteTokenExchangePayloadSchema,
  remoteAccessTokenResultSchema,
  remoteWebPushConfigResultSchema,
  remoteWebSocketTicketResultSchema,
} from "../protocol";
import { emptyJsonObjectSchema, remoteOkResponseSchema } from "./helpers";
import {
  decodedAttachmentUploadQuerySchema,
  decodedForwardEnterQuerySchema,
  decodedLocalImageQuerySchema,
  decodedPrWatchReadQuerySchema,
  decodedRuntimeImageQuerySchema,
  decodedThreadHistoryItemsQuerySchema,
  decodedThreadHistoryQuerySchema,
} from "./queryCodecs";
import { projectNotesReadResultSchema, projectNotesWriteBodySchema } from "./routeBodies";

export const remoteEnvironmentQuerySchema = z.object({});

export const forwardEnterQuerySchema = decodedForwardEnterQuerySchema;
export const localImageQuerySchema = decodedLocalImageQuerySchema;
export const runtimeImageQuerySchema = decodedRuntimeImageQuerySchema;
export const attachmentUploadQuerySchema = decodedAttachmentUploadQuerySchema;

export const attachmentUploadResultSchema = z.object({
  path: z.string().min(1),
});

export { projectNotesReadResultSchema, projectNotesWriteBodySchema };

export const settingsReadResultSchema = z.object({
  settings: remoteSettingsSchema,
});

export const settingsWriteResultSchema = z.object({
  settings: remoteSettingsSchema,
});

export const prWatchReadQuerySchema = decodedPrWatchReadQuerySchema;

export const prWatchReadResultSchema = z.object({
  watch: prWatchSchema.nullable(),
});

export const prWatchUpsertResultSchema = z.object({
  watch: prWatchSchema,
});

export const browserStateResultSchema = z.object({
  state: remoteBrowserStateSchema,
});

export const threadHistoryQuerySchema = decodedThreadHistoryQuerySchema;
export const threadHistoryItemsQuerySchema = decodedThreadHistoryItemsQuerySchema;

export const remoteShellSnapshotWireSchema = remoteShellSnapshotSchema
  .omit({ gitState: true })
  .extend({
    gitState: gitStateSnapshotWireSchema.optional(),
  });

const remoteSettingsKeys = [
  "agentSettings",
  "hiddenModels",
  "disabledAgents",
  "providerOrder",
  "enabledMcpServers",
  "disabledBuiltInMcpServers",
  "titleGenProvider",
  "titleGenModel",
  "titleGenEffort",
  "titleGenFast",
  "commitGenProvider",
  "commitGenModel",
  "commitGenEffort",
  "commitGenFast",
  "conflictResolverProvider",
  "conflictResolverModel",
  "conflictResolverEffort",
  "conflictResolverFast",
  "conflictResolverPresentationMode",
  "wslTitleGenProvider",
  "wslTitleGenModel",
  "wslTitleGenEffort",
  "wslTitleGenFast",
  "wslCommitGenProvider",
  "wslCommitGenModel",
  "wslCommitGenEffort",
  "wslCommitGenFast",
  "wslConflictResolverProvider",
  "wslConflictResolverModel",
  "wslConflictResolverEffort",
  "wslConflictResolverFast",
  "wslConflictResolverPresentationMode",
  "worktreeStorageMode",
  "worktreeBasePath",
  "wslWorktreeBasePath",
  "prAutomationDefault",
  "prMergeMethod",
] as const;

export const remoteSettingsWireSchema = sharedSettingsSchema.pick(
  Object.fromEntries(remoteSettingsKeys.map((key) => [key, true])) as {
    [K in (typeof remoteSettingsKeys)[number]]: true;
  },
);

export const settingsReadResultWireSchema = z.object({
  settings: remoteSettingsWireSchema,
});

export const settingsWriteResultWireSchema = z.object({
  settings: remoteSettingsWireSchema,
});

export const remoteSettingsPatchWireSchema = remoteSettingsWireSchema
  .omit({ enabledMcpServers: true, disabledBuiltInMcpServers: true })
  .partial()
  .extend({
    enabledMcpServers: sharedSettingsSchema.shape.enabledMcpServers.removeDefault().optional(),
    disabledBuiltInMcpServers: sharedSettingsSchema.shape.disabledBuiltInMcpServers
      .removeDefault()
      .optional(),
  });

export {
  dbTruncateRuntimeItemsPayloadSchema,
  emptyJsonObjectSchema,
  profileCoreStatsSchema,
  profileDevicesResponseSchema,
  profileIdentityResponseSchema,
  profileIdentitySchema,
  profileStatsRequestSchema,
  profileTokenStatsSchema,
  projectNotesSchema,
  providerUsageResponseSchema,
  prWatchInputSchema,
  prWatchKeySchema,
  remoteAccessTokenResultSchema,
  remoteAgentStatusesSchema,
  remoteBrowserCommandSchema,
  remoteEnvironmentDescriptorSchema,
  remoteGitCallPayloadSchema,
  remoteHostUpdateStateSchema,
  remoteOkResponseSchema,
  remotePortEnterRequestSchema,
  remotePortEnterResultSchema,
  remotePortForwardRequestSchema,
  remotePortForwardResultSchema,
  remotePortUnforwardRequestSchema,
  remotePortsStateSchema,
  remoteProjectCommandResultSchema,
  remoteProjectCommandSchema,
  remoteProjectSettingsSchema,
  remotePushRegistrationResultSchema,
  remotePushRegistrationSchema,
  remotePushUnregisterSchema,
  remoteRuntimeItemsPageRequestSchema,
  remoteRuntimeItemsPageSchema,
  remoteScheduleCommandSchema,
  remoteSchedulesResponseSchema,
  remoteSettingsPatchSchema,
  remoteShellSnapshotSchema,
  remoteThreadCommandSchema,
  remoteThreadSnapshotSchema,
  remoteTokenExchangePayloadSchema,
  remoteWebPushConfigResultSchema,
  remoteWebSocketTicketResultSchema,
  startShellPayloadSchema,
  startThreadPayloadSchema,
  startThreadResultSchema,
};
