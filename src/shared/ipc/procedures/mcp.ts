import {
  nativeMcpSetupPayloadSchema,
  applyNativeMcpSetupPayloadSchema,
  type NativeMcpSetupPayload,
  type ApplyNativeMcpSetupPayload,
  type NativeMcpSetupStatus,
  discoverExternalMcpServersPayloadSchema,
  type DiscoverExternalMcpServersPayload,
  type DiscoverExternalMcpServersResult,
  mcpOauthBeginPayloadSchema,
  type McpOauthBeginPayload,
  type McpOauthBeginResult,
  mcpOauthClearPayloadSchema,
  type McpOauthClearPayload,
  mcpOauthStatusPayloadSchema,
  type McpOauthStatusPayload,
  mcpOauthWaitPayloadSchema,
  type McpOauthWaitPayload,
  type McpOauthWaitResult,
  type McpOauthStatusResult,
  mcpProbePayloadSchema,
  type McpProbePayload,
  type McpProbeResult,
  reloadAgentMcpServersPayloadSchema,
  type ReloadAgentMcpServersPayload,
  discoverExternalMcpServersResultSchema,
  mcpOauthBeginResultSchema,
  mcpOauthStatusResultSchema,
  mcpOauthWaitResultSchema,
  mcpProbeResultSchema,
} from "../../contracts";
import { z } from "zod";
import { definePayloadProcedure, omittedResultSchema } from "../core";
import {
  controlMcpAuthenticationPayloadSchema,
  controlMcpAuthenticationResultSchema,
  type ControlMcpAuthenticationPayload,
  type ControlMcpAuthenticationResult,
} from "../../contracts/mcpAuthentication";
import {
  controlMcpAppPayloadSchema,
  controlMcpAppResultSchema,
  type ControlMcpAppPayload,
  type ControlMcpAppResult,
} from "../../contracts/mcpApps";

export const confirmCrossagentRoutingOverridePayloadSchema = z.object({
  requestId: z.string().uuid(),
  ok: z.boolean(),
  error: z.string().optional(),
});
export type ConfirmCrossagentRoutingOverridePayload = z.infer<
  typeof confirmCrossagentRoutingOverridePayloadSchema
>;

export const resolveMcpSessionIdentityPayloadSchema = z.object({
  metadata: z.record(z.string(), z.unknown()),
  serverId: z.string().optional(),
});
export type ResolveMcpSessionIdentityPayload = z.infer<
  typeof resolveMcpSessionIdentityPayloadSchema
>;

export const resolveMcpSessionIdentityResultSchema = z
  .object({
    threadId: z.string(),
    title: z.string().optional(),
    disabledTools: z.array(z.string()).optional(),
  })
  .nullable();
export type ResolveMcpSessionIdentityResult = z.infer<typeof resolveMcpSessionIdentityResultSchema>;

export const mcpProcedures = {
  controlMcpApp: definePayloadProcedure<ControlMcpAppPayload, ControlMcpAppResult, "supervisor">(
    "controlMcpApp",
    "supervisor",
    controlMcpAppPayloadSchema,
    controlMcpAppResultSchema,
  ),
  controlMcpAuthentication: definePayloadProcedure<
    ControlMcpAuthenticationPayload,
    ControlMcpAuthenticationResult,
    "supervisor"
  >(
    "controlMcpAuthentication",
    "supervisor",
    controlMcpAuthenticationPayloadSchema,
    controlMcpAuthenticationResultSchema,
  ),
  getNativeMcpSetup: definePayloadProcedure<
    NativeMcpSetupPayload,
    NativeMcpSetupStatus,
    "supervisor"
  >("getNativeMcpSetup", "supervisor", nativeMcpSetupPayloadSchema),
  applyNativeMcpSetup: definePayloadProcedure<
    ApplyNativeMcpSetupPayload,
    NativeMcpSetupStatus,
    "supervisor"
  >("applyNativeMcpSetup", "supervisor", applyNativeMcpSetupPayloadSchema),
  confirmCrossagentRoutingOverride: definePayloadProcedure<
    ConfirmCrossagentRoutingOverridePayload,
    void,
    "supervisor"
  >(
    "confirmCrossagentRoutingOverride",
    "supervisor",
    confirmCrossagentRoutingOverridePayloadSchema,
  ),
  resolveMcpSessionIdentity: definePayloadProcedure<
    ResolveMcpSessionIdentityPayload,
    ResolveMcpSessionIdentityResult,
    "supervisor"
  >(
    "resolveMcpSessionIdentity",
    "supervisor",
    resolveMcpSessionIdentityPayloadSchema,
    resolveMcpSessionIdentityResultSchema,
  ),
  discoverExternalMcpServers: definePayloadProcedure<
    DiscoverExternalMcpServersPayload,
    DiscoverExternalMcpServersResult,
    "supervisor"
  >(
    "discoverExternalMcpServers",
    "supervisor",
    discoverExternalMcpServersPayloadSchema,
    discoverExternalMcpServersResultSchema,
  ),
  probeMcpServer: definePayloadProcedure<McpProbePayload, McpProbeResult, "supervisor">(
    "probeMcpServer",
    "supervisor",
    mcpProbePayloadSchema,
    mcpProbeResultSchema,
  ),
  reloadAgentMcpServers: definePayloadProcedure<ReloadAgentMcpServersPayload, void, "supervisor">(
    "reloadAgentMcpServers",
    "supervisor",
    reloadAgentMcpServersPayloadSchema,
  ),
  beginMcpServerOauth: definePayloadProcedure<
    McpOauthBeginPayload,
    McpOauthBeginResult,
    "supervisor"
  >("beginMcpServerOauth", "supervisor", mcpOauthBeginPayloadSchema, mcpOauthBeginResultSchema),
  waitMcpServerOauth: definePayloadProcedure<McpOauthWaitPayload, McpOauthWaitResult, "supervisor">(
    "waitMcpServerOauth",
    "supervisor",
    mcpOauthWaitPayloadSchema,
    mcpOauthWaitResultSchema,
  ),
  clearMcpServerOauth: definePayloadProcedure<McpOauthClearPayload, void, "supervisor">(
    "clearMcpServerOauth",
    "supervisor",
    mcpOauthClearPayloadSchema,
    omittedResultSchema,
  ),
  getMcpOauthStatus: definePayloadProcedure<
    McpOauthStatusPayload,
    McpOauthStatusResult,
    "supervisor"
  >("getMcpOauthStatus", "supervisor", mcpOauthStatusPayloadSchema, mcpOauthStatusResultSchema),
} as const;
