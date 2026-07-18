import {
  discoverExternalMcpServersPayloadSchema,
  type DiscoverExternalMcpServersPayload,
  type DiscoverExternalMcpServersResult,
  mcpOauthBeginPayloadSchema,
  type McpOauthBeginPayload,
  type McpOauthBeginResult,
  mcpOauthClearPayloadSchema,
  type McpOauthClearPayload,
  mcpOauthWaitPayloadSchema,
  type McpOauthWaitPayload,
  type McpOauthWaitResult,
  type McpOauthStatusResult,
  mcpProbePayloadSchema,
  type McpProbePayload,
  type McpProbeResult,
  reloadAgentMcpServersPayloadSchema,
  type ReloadAgentMcpServersPayload,
} from "../../contracts";
import { defineNoArgProcedure, definePayloadProcedure } from "../core";

export const mcpProcedures = {
  discoverExternalMcpServers: definePayloadProcedure<
    DiscoverExternalMcpServersPayload,
    DiscoverExternalMcpServersResult,
    "supervisor"
  >("discoverExternalMcpServers", "supervisor", discoverExternalMcpServersPayloadSchema),
  probeMcpServer: definePayloadProcedure<McpProbePayload, McpProbeResult, "supervisor">(
    "probeMcpServer",
    "supervisor",
    mcpProbePayloadSchema,
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
  >("beginMcpServerOauth", "supervisor", mcpOauthBeginPayloadSchema),
  waitMcpServerOauth: definePayloadProcedure<McpOauthWaitPayload, McpOauthWaitResult, "supervisor">(
    "waitMcpServerOauth",
    "supervisor",
    mcpOauthWaitPayloadSchema,
  ),
  clearMcpServerOauth: definePayloadProcedure<McpOauthClearPayload, void, "supervisor">(
    "clearMcpServerOauth",
    "supervisor",
    mcpOauthClearPayloadSchema,
  ),
  getMcpOauthStatus: defineNoArgProcedure<McpOauthStatusResult, "supervisor">(
    "getMcpOauthStatus",
    "supervisor",
  ),
} as const;
