import { z } from "zod";
import { agentEnvSchema } from "../machines";
import { desktopActionReplySchema } from "./appDesktopAction";
import { authenticateAcpAgentPayloadSchema } from "./agent";

export const appProviderAuthTargetSchema = z.strictObject({
  agentKind: authenticateAcpAgentPayloadSchema.shape.agentKind,
  env: agentEnvSchema,
  runtime: z.string().min(1).optional(),
});
export type AppProviderAuthTarget = z.infer<typeof appProviderAuthTargetSchema>;

export const appProviderSignInSchema = appProviderAuthTargetSchema.extend({
  methodId: authenticateAcpAgentPayloadSchema.shape.methodId.optional(),
  terminal: z.boolean().optional(),
});
export type AppProviderSignIn = z.infer<typeof appProviderSignInSchema>;

export const appProviderLoginRequestSchema = z.strictObject({
  version: z.literal(1),
  input: appProviderSignInSchema,
});
export type AppProviderLoginRequest = z.infer<typeof appProviderLoginRequestSchema>;

export const appProviderLoginResultSchema = z.strictObject({ opened: z.boolean() });
export type AppProviderLoginResult = z.infer<typeof appProviderLoginResultSchema>;
export const appProviderLoginReplySchema = desktopActionReplySchema(appProviderLoginResultSchema);
