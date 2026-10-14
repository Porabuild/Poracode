import { z } from "zod";

/** Existing composer field represented by a negotiated session control. */
export const sessionConfigControlRoleSchema = z.enum([
  "model",
  "effort",
  "mode",
  "thinking",
  "fast",
  "context",
]);

const optionMetadata = {
  name: z.string().optional(),
  category: z.string().optional(),
  role: sessionConfigControlRoleSchema.optional(),
};

export const sessionConfigSelectValueSchema = z.object({
  value: z.string(),
  name: z.string().optional(),
  group: z.string().optional(),
});
export const sessionConfigSelectGroupSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
});

/** Native value IDs and labels stay exact; unsupported controls remain inventory only. */
export const sessionConfigOptionDescriptorSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("select"),
    id: z.string(),
    ...optionMetadata,
    currentValue: z.string().optional(),
    values: z.array(sessionConfigSelectValueSchema),
    groups: z.array(sessionConfigSelectGroupSchema),
  }),
  z.object({
    type: z.literal("boolean"),
    id: z.string(),
    ...optionMetadata,
    currentValue: z.boolean(),
  }),
  z.object({
    type: z.literal("unsupported"),
    id: z.string().optional(),
    ...optionMetadata,
    controlType: z.string().optional(),
  }),
]);

export type SessionConfigControlRole = z.infer<typeof sessionConfigControlRoleSchema>;
export type AcpSessionConfigSelectValue = z.infer<typeof sessionConfigSelectValueSchema>;
export type AcpSessionConfigSelectGroupInfo = z.infer<typeof sessionConfigSelectGroupSchema>;
export type AcpSessionConfigOptionDescriptor = z.infer<typeof sessionConfigOptionDescriptorSchema>;
export type AcpSessionConfigBooleanOption = Extract<
  AcpSessionConfigOptionDescriptor,
  { type: "boolean" }
>;
export type SessionConfigOptions = AcpSessionConfigOptionDescriptor[];
export const sessionConfigOptionsSchema: z.ZodType<SessionConfigOptions> = z.array(
  sessionConfigOptionDescriptorSchema,
);
