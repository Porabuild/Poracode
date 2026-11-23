import { z } from "zod";
import { agentEnvSchema } from "../machines";

export const modelProviderProtocolSchema = z.enum([
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
]);
export const modelProviderIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[^\p{Cc}]+$/u)
  .refine((id) => !["__proto__", "constructor", "prototype"].includes(id));
export const modelProviderUrlSchema = z
  .url()
  .max(2048)
  .refine((value) => {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  });
export const modelProviderConfigSchema = z.object({
  id: modelProviderIdSchema,
  name: z.string().trim().max(256),
  baseURL: z.union([z.literal(""), modelProviderUrlSchema]),
  protocol: modelProviderProtocolSchema,
  modelIds: z.array(z.string().trim().min(1).max(512)).max(200),
});
export type ModelProviderConfig = z.infer<typeof modelProviderConfigSchema>;
const modelProviderListOperationSchema = z.object({ action: z.literal("list") });
const modelProviderSaveOperationSchema = z.object({
  action: z.literal("save"),
  create: z.boolean(),
  revision: z.string().min(1).max(128),
  provider: modelProviderConfigSchema,
  /** Write-only: omitted or blank preserves the existing credential. */
  apiKey: z.string().trim().max(16384).optional(),
});
const modelProviderRemoveOperationSchema = z.object({
  action: z.literal("remove"),
  revision: z.string().min(1).max(128),
  providerId: z.string().min(1).max(128),
});
export const modelProviderOperationSchema = z.discriminatedUnion("action", [
  modelProviderListOperationSchema,
  modelProviderSaveOperationSchema,
  modelProviderRemoveOperationSchema,
]);
export const modelProviderTargetSchema = z.object({
  agentKind: z.string().min(1).max(128),
  env: agentEnvSchema,
});
export const manageModelProvidersPayloadSchema = z.discriminatedUnion("action", [
  modelProviderListOperationSchema.extend(modelProviderTargetSchema.shape),
  modelProviderSaveOperationSchema.extend(modelProviderTargetSchema.shape),
  modelProviderRemoveOperationSchema.extend(modelProviderTargetSchema.shape),
]);
export type ManageModelProvidersPayload = z.infer<typeof manageModelProvidersPayloadSchema>;
export interface ConfiguredModelProvider extends ModelProviderConfig {
  custom: boolean;
  removable: boolean;
  credentialConfigured: boolean;
}
export const manageModelProvidersResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(false), reason: z.enum(["conflict", "rejected", "credential"]) }),
  z.object({
    ok: z.literal(true),
    revision: z.string().min(1).max(128),
    catalog: z.array(z.object({ id: z.string(), name: z.string(), baseURL: z.string() })),
    providers: z.array(
      modelProviderConfigSchema.extend({
        custom: z.boolean(),
        removable: z.boolean(),
        credentialConfigured: z.boolean(),
      }),
    ),
  }),
]);
export type ManageModelProvidersResult = z.infer<typeof manageModelProvidersResultSchema>;
