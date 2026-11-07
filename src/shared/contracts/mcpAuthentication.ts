import { z } from "zod";
import {
  isValidMcpServerUrl,
  mcpServerSchema,
  mcpHttpTransportSchema,
  mcpSseTransportSchema,
} from "./mcpServer";
import { pluginAccountSchema } from "./pluginCatalog";

export const MCP_AUTHENTICATION_CONTROL_VERSION = 1;
const version = z.literal(MCP_AUTHENTICATION_CONTROL_VERSION);
const operationId = z.uuid();
const pluginTarget = {
  pluginName: pluginAccountSchema.shape.pluginName,
  serverName: pluginAccountSchema.shape.serverName,
  accountId: pluginAccountSchema.shape.id.optional(),
};
export const mcpAuthenticationIdentitySchema = z.discriminatedUnion("scope", [
  z.strictObject({ scope: z.literal("saved-user"), serverId: z.string().min(1) }),
  z.strictObject({ scope: z.literal("plugin-service"), ...pluginTarget }),
]);
export type McpAuthenticationIdentity = z.infer<typeof mcpAuthenticationIdentitySchema>;
export function sameMcpAuthenticationIdentity(
  left: McpAuthenticationIdentity,
  right: McpAuthenticationIdentity,
): boolean {
  return left.scope === "saved-user"
    ? right.scope === "saved-user" && left.serverId === right.serverId
    : right.scope === "plugin-service" &&
        left.pluginName === right.pluginName &&
        left.serverName === right.serverName &&
        left.accountId === right.accountId;
}
export const mcpAuthenticationTargetSchema = z.discriminatedUnion("scope", [
  z.strictObject({
    scope: z.literal("saved-user"),
    server: mcpServerSchema
      .safeExtend({
        transport: z.union([mcpHttpTransportSchema.strict(), mcpSseTransportSchema.strict()]),
      })
      .strict(),
  }),
  z.strictObject({
    scope: z.literal("plugin-service"),
    ...pluginTarget,
    label: pluginAccountSchema.shape.label,
  }),
]);
export const controlMcpAuthenticationPayloadSchema = z.discriminatedUnion("action", [
  z.strictObject({
    version,
    action: z.literal("start"),
    operationId,
    target: mcpAuthenticationTargetSchema,
  }),
  z.strictObject({
    version,
    action: z.literal("wait"),
    operationId,
    target: mcpAuthenticationIdentitySchema,
  }),
  z.strictObject({ version, action: z.literal("cancel"), operationId }),
]);
const error = z.strictObject({ status: z.literal("error"), message: z.string().min(1).max(200) });
const authorized = z.strictObject({ status: z.literal("authorized") });
export const mcpAuthenticationBeginSchema = z.discriminatedUnion("status", [
  authorized,
  error,
  z.strictObject({
    status: z.literal("redirect"),
    flowId: z.uuid(),
    authorizationUrl: z.string().max(65_536).refine(isValidMcpServerUrl),
  }),
]);
export const mcpAuthenticationCompletionSchema = z.discriminatedUnion("status", [
  authorized,
  error,
]);
export const controlMcpAuthenticationResultSchema = z.discriminatedUnion("action", [
  z.strictObject({
    version,
    operationId,
    action: z.literal("start"),
    target: mcpAuthenticationIdentitySchema,
    authorization: mcpAuthenticationBeginSchema,
  }),
  z.strictObject({
    version,
    operationId,
    action: z.literal("wait"),
    target: mcpAuthenticationIdentitySchema,
    authorization: mcpAuthenticationCompletionSchema,
  }),
  z.strictObject({ version, operationId, action: z.literal("cancel"), cancelled: z.literal(true) }),
]);
export type ControlMcpAuthenticationPayload = z.infer<typeof controlMcpAuthenticationPayloadSchema>;
export type ControlMcpAuthenticationResult = z.infer<typeof controlMcpAuthenticationResultSchema>;
