import {
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

export const confirmCrossagentRoutingOverridePayloadSchema = z.object({
  requestId: z.string().uuid(),
  ok: z.boolean(),
  error: z.string().optional(),
});
export type ConfirmCrossagentRoutingOverridePayload = z.infer<
  typeof confirmCrossagentRoutingOverridePayloadSchema
>;

export const mcpProcedures = {
  confirmCrossagentRoutingOverride: definePayloadProcedure<
    ConfirmCrossagentRoutingOverridePayload,
    void,
    "supervisor"
  >(
    "confirmCrossagentRoutingOverride",
    "supervisor",
    confirmCrossagentRoutingOverridePayloadSchema,
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
