import { z } from "zod";
import { agentKindSchema } from "./common";
import { agentEnvSchema } from "../machines";

export const nativeMcpSetupPayloadSchema = z.object({
  agentKind: agentKindSchema,
  env: agentEnvSchema,
});
export type NativeMcpSetupPayload = z.infer<typeof nativeMcpSetupPayloadSchema>;
export const applyNativeMcpSetupPayloadSchema = nativeMcpSetupPayloadSchema.extend({
  revision: z.string().min(1),
  installIds: z.array(z.string().min(1)).max(200),
  removeNames: z.array(z.string().min(1)).max(200),
});
export type ApplyNativeMcpSetupPayload = z.infer<typeof applyNativeMcpSetupPayloadSchema>;

export const nativeMcpSetupCandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  target: z.string(),
  eligible: z.boolean(),
  conflict: z.boolean(),
  installed: z.boolean(),
});

export const nativeMcpSetupStatusSchema = z.object({
  supported: z.boolean(),
  configPath: z.string().optional(),
  revision: z.string().optional(),
  issue: z.literal("invalid-config").optional(),
  candidates: z.array(nativeMcpSetupCandidateSchema),
  installedNames: z.array(z.string()),
  modifiedNames: z.array(z.string()),
});
export type NativeMcpSetupStatus = z.infer<typeof nativeMcpSetupStatusSchema>;
