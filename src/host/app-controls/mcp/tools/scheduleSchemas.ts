import { z } from "zod";
import { scheduledTaskInputSchema, scheduleRunInboxQuerySchema } from "@/shared/contracts";

export const createScheduleArgsSchema = scheduledTaskInputSchema
  .extend({
    enabled: scheduledTaskInputSchema.shape.enabled.default(true),
    agentKind: scheduledTaskInputSchema.shape.agentKind.optional(),
    config: scheduledTaskInputSchema.shape.config.optional(),
  })
  .strict();

export const updateScheduleArgsSchema = scheduledTaskInputSchema
  .partial()
  .extend({
    id: z.string().uuid(),
  })
  .strict();

export const idArgsSchema = z.object({ id: z.string().uuid() });
export const scheduleRunsArgsSchema = z.object({ scheduleId: z.string().uuid() });
export const scheduleRunInboxArgsSchema = scheduleRunInboxQuerySchema.extend({
  filter: scheduleRunInboxQuerySchema.shape.filter.default("unread"),
});

export function idJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id"],
    properties: { id: { type: "string", format: "uuid" } },
  };
}
