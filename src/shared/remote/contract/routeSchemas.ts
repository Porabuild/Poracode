import { z } from "zod";
import {
  profileIdentitySchema,
  profileStatsRequestSchema,
  mcpOauthBeginResultSchema,
  mcpOauthWaitResultSchema,
  mcpProbeResultSchema,
  mcpServerSchema,
  projectNotesSchema,
  prWatchInputSchema,
  prWatchAgentSyncSchema,
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
  remoteScheduleRunsQuerySchema,
  remoteScheduleRunsResponseSchema,
  remoteSchedulesResponseSchema,
  remoteSettingsPatchSchema,
  remoteSettingsSchema,
  remoteShellSnapshotSchema,
  remoteThreadListPageSchema,
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

/** Body of `POST /api/files/image-ticket` (B5b ticket flow). */
export const imageTicketRequestBodySchema = z.object({
  path: z.string().min(1).max(4096),
});

/**
 * Response of `POST /api/files/image-ticket`: the one-time path-bound ticket.
 * The field is `expiresAt`, matching the host's `ImageTicketStore.issue` mint
 * and the TS client's parser (the schema previously said `expires`, which no
 * producer ever wrote).
 */
export const imageTicketResponseSchema = z.object({
  ticket: z.string().min(1),
  /** ISO expiry so the client knows when to re-mint. */
  expiresAt: z.string().min(1),
});

/**
 * Operability routes (V5 plan item 4.9 rider): `/healthz` answers a fixed
 * literal so the unauthenticated probe discloses nothing, and `/metrics`
 * carries the minimal host snapshot. Kept deliberately tiny — richer
 * operability surfaces belong to the 4.9 owner.
 */
export const healthzResponseSchema = z.object({
  ok: z.literal(true),
});

export const metricsResponseSchema = z.object({
  process: z.object({
    /** Processor uptime in whole seconds. */
    uptimeSeconds: z.number().int().nonnegative(),
    rssBytes: z.number().int().nonnegative(),
    heapUsedBytes: z.number().int().nonnegative(),
  }),
  remote: z.object({
    /** Currently authenticated WebSocket clients. */
    activeWebSocketClients: z.number().int().nonnegative(),
    /** Entries in the replayable event buffer. */
    eventBufferEntries: z.number().int().nonnegative(),
    /** Sequence of the last published replayable event (0 = none yet). */
    lastEventSeq: z.number().int().nonnegative(),
  }),
});

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

export const remoteMcpSettingsScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("global") }),
  z.object({ kind: z.literal("project"), projectId: z.string().min(1) }),
]);

export const remoteMcpSettingsReadResultSchema = z.object({
  servers: z.array(mcpServerSchema),
});

export const remoteMcpSettingsCommandSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("upsert"),
    scope: remoteMcpSettingsScopeSchema,
    server: mcpServerSchema,
  }),
  z.object({
    kind: z.literal("remove"),
    scope: remoteMcpSettingsScopeSchema,
    serverId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("move"),
    source: remoteMcpSettingsScopeSchema,
    destination: remoteMcpSettingsScopeSchema,
    serverId: z.string().min(1),
  }),
]);

export const remoteMcpSettingsOperationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("probe"),
    scope: remoteMcpSettingsScopeSchema,
    serverId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("oauth-status"),
    scope: remoteMcpSettingsScopeSchema,
  }),
  z.object({
    kind: z.literal("oauth-begin"),
    scope: remoteMcpSettingsScopeSchema,
    serverId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("oauth-wait"),
    scope: remoteMcpSettingsScopeSchema,
    flowId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("oauth-clear"),
    scope: remoteMcpSettingsScopeSchema,
    serverId: z.string().min(1),
  }),
]);

export const remoteMcpSettingsOperationResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("probe"), result: mcpProbeResultSchema }),
  z.object({
    kind: z.literal("oauth-status"),
    authenticatedServerIds: z.array(z.string().min(1)),
  }),
  z.object({ kind: z.literal("oauth-begin"), result: mcpOauthBeginResultSchema }),
  z.object({ kind: z.literal("oauth-wait"), result: mcpOauthWaitResultSchema }),
  z.object({ kind: z.literal("oauth-clear") }),
]);

export type RemoteMcpSettingsScope = z.infer<typeof remoteMcpSettingsScopeSchema>;
export type RemoteMcpSettingsCommand = z.infer<typeof remoteMcpSettingsCommandSchema>;
export type RemoteMcpSettingsOperation = z.infer<typeof remoteMcpSettingsOperationSchema>;

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
export { decodedAgentStatusesQuerySchema as agentStatusesQuerySchema } from "./queryCodecs";
export { decodedShellSnapshotQuerySchema as shellSnapshotQuerySchema } from "./queryCodecs";
export { decodedThreadListQuerySchema as threadListQuerySchema } from "./queryCodecs";
export { remoteAgentSlashCommandsSchema } from "../protocol";
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
  "usage",
  "followUpBehavior",
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
  "searchUseIgnoreFiles",
  "searchExclude",
  "prAutomationDefault",
  "prMergeMethod",
] as const;

const remoteSettingsWireBaseSchema = sharedSettingsSchema.pick(
  Object.fromEntries(remoteSettingsKeys.map((key) => [key, true])) as {
    [K in (typeof remoteSettingsKeys)[number]]: true;
  },
);

// These preferences were added to remote-v3 after the original settings route.
// Keep reads from older v3 hosts valid while new hosts include the complete object.
export const remoteSettingsWireSchema = remoteSettingsWireBaseSchema.extend({
  usage: sharedSettingsSchema.shape.usage.optional(),
  followUpBehavior: sharedSettingsSchema.shape.followUpBehavior.optional().default("steer"),
  searchUseIgnoreFiles: sharedSettingsSchema.shape.searchUseIgnoreFiles.optional(),
  searchExclude: sharedSettingsSchema.shape.searchExclude.optional(),
});

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
    followUpBehavior: sharedSettingsSchema.shape.followUpBehavior.optional(),
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
  prWatchAgentSyncSchema,
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
  remoteScheduleRunsQuerySchema,
  remoteScheduleRunsResponseSchema,
  remoteSchedulesResponseSchema,
  remoteSettingsPatchSchema,
  remoteShellSnapshotSchema,
  remoteThreadCommandSchema,
  remoteThreadListPageSchema,
  remoteThreadSnapshotSchema,
  remoteTokenExchangePayloadSchema,
  remoteWebPushConfigResultSchema,
  remoteWebSocketTicketResultSchema,
  startShellPayloadSchema,
  startThreadPayloadSchema,
  startThreadResultSchema,
};
