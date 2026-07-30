import { z } from "zod";
import {
  agentKindSchema,
  scheduleAutomationSchema,
  scheduleRecurrenceSchema,
  scheduleRunInboxQuerySchema,
} from "@/shared/contracts";

export const createScheduleArgsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(1).max(50_000),
  recurrence: scheduleRecurrenceSchema,
  enabled: z.boolean().optional().default(true),
  agentKind: agentKindSchema.optional(),
  model: z.string().min(1).optional(),
  effort: z.string().min(1).optional(),
  automation: scheduleAutomationSchema.optional(),
});

export const updateScheduleArgsSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  prompt: z.string().trim().min(1).max(50_000).optional(),
  recurrence: scheduleRecurrenceSchema.optional(),
  enabled: z.boolean().optional(),
  agentKind: agentKindSchema.optional(),
  model: z.string().min(1).optional(),
  effort: z.string().min(1).nullable().optional(),
  automation: scheduleAutomationSchema.optional(),
});

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

export function recurrenceJsonSchema(): Record<string, unknown> {
  return {
    oneOf: [
      {
        type: "object",
        additionalProperties: false,
        required: ["kind", "minute"],
        properties: {
          kind: { const: "hourly" },
          minute: { type: "integer", minimum: 0, maximum: 59 },
        },
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["kind", "days", "time"],
        properties: {
          kind: { const: "weekly" },
          days: {
            type: "array",
            minItems: 1,
            items: { type: "integer", minimum: 0, maximum: 6 },
          },
          time: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
          timeZone: { type: "string", minLength: 1, maxLength: 128 },
        },
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["kind", "runAt"],
        properties: {
          kind: { const: "once" },
          runAt: { type: "string", format: "date-time" },
        },
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["kind", "every", "unit"],
        properties: {
          kind: { const: "interval" },
          every: { type: "integer", minimum: 1, maximum: 999 },
          unit: { enum: ["minutes", "hours", "days"] },
        },
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["kind", "expression", "timeZone"],
        properties: {
          kind: { const: "cron" },
          expression: {
            type: "string",
            minLength: 1,
            maxLength: 120,
            pattern: "^\\s*[0-9*,/-]+(?:\\s+[0-9*,/-]+){4}\\s*$",
            description: "Five numeric cron fields: minute, hour, day, month, and weekday.",
          },
          timeZone: { type: "string", minLength: 1, maxLength: 128 },
        },
      },
    ],
  };
}

export function automationJsonSchema(): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(scheduleAutomationSchema);
  delete jsonSchema.$schema;
  return {
    ...jsonSchema,
    description:
      "Complete automation policy. AI-evaluated completion conditions are valid only in heartbeat mode.",
  };
}
