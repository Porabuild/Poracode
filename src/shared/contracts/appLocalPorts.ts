import { z } from "zod";

export const localPortInfoSchema = z.object({
  port: z.number().int().min(1).max(65535),
  address: z.string().min(1),
  url: z.string().url().nullable(),
  pid: z.number().int().positive().nullable(),
  processName: z.string().min(1).nullable(),
  processStartedAt: z.string().min(1).nullable(),
  canClose: z.boolean(),
});
export type LocalPortInfo = z.infer<typeof localPortInfoSchema>;

export const listLocalPortsResultSchema = z.object({
  ports: z.array(localPortInfoSchema),
});
export type ListLocalPortsResult = z.infer<typeof listLocalPortsResultSchema>;

export const closeLocalPortPayloadSchema = z
  .object({
    port: z.number().int().min(1).max(65535),
    address: z.string().min(1),
    pid: z.number().int().min(5),
    processStartedAt: z.string().min(1),
  })
  .strict();
export type CloseLocalPortPayload = z.infer<typeof closeLocalPortPayloadSchema>;

export const closeLocalPortResultSchema = z.object({
  closed: z.boolean(),
});
export type CloseLocalPortResult = z.infer<typeof closeLocalPortResultSchema>;

export const appLocalPortsListSchema = z.strictObject({ action: z.literal("list") });
export const appLocalPortsCloseSchema = closeLocalPortPayloadSchema.extend({
  action: z.literal("close"),
});
export const appLocalPortsOpenSchema = closeLocalPortPayloadSchema
  .pick({ port: true, address: true })
  .extend({ action: z.literal("open"), target: z.enum(["app", "system"]).default("app") });

export const appLocalPortsCommandSchema = z.discriminatedUnion("action", [
  appLocalPortsListSchema,
  appLocalPortsCloseSchema,
  appLocalPortsOpenSchema,
]);
export type AppLocalPortsCommand = z.infer<typeof appLocalPortsCommandSchema>;

export const appLocalPortsRequestSchema = z.strictObject({
  version: z.literal(1),
  command: appLocalPortsCommandSchema,
});
export type AppLocalPortsRequest = z.infer<typeof appLocalPortsRequestSchema>;

export const appLocalPortsResultSchema = z.discriminatedUnion("action", [
  listLocalPortsResultSchema.extend({ action: z.literal("list") }),
  closeLocalPortResultSchema.extend({ action: z.literal("close") }),
  z.object({
    action: z.literal("open"),
    opened: z.boolean(),
    url: z.string().url().optional(),
    target: appLocalPortsOpenSchema.shape.target.removeDefault().optional(),
  }),
]);
export type AppLocalPortsResult = z.infer<typeof appLocalPortsResultSchema>;
