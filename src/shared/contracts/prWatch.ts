import { z } from "zod";
import { scheduledTaskConfigSchema } from "./schedule";

export const prWatchKeySchema = z.object({
  projectId: z.string().min(1),
  prNumber: z.number().int().min(1),
});
export type PrWatchKey = z.infer<typeof prWatchKeySchema>;

export const prAutomationModeSchema = z.enum(["off", "fix", "merge"]);
export type PrAutomationMode = z.infer<typeof prAutomationModeSchema>;

export const prWatchInputSchema = prWatchKeySchema
  .extend({
    headBranch: z.string().min(1),
    worktreePath: z.string().min(1).optional(),
    watchEnabled: z.boolean(),
    autoMerge: z.boolean(),
    agentKind: z.string().min(1).optional(),
    config: scheduledTaskConfigSchema.optional(),
  })
  .superRefine((input, context) => {
    if (!input.watchEnabled || (input.agentKind && input.config)) return;
    context.addIssue({
      code: "custom",
      message: "Watching a PR requires an agent and model.",
    });
  });
export type PrWatchInput = z.infer<typeof prWatchInputSchema>;

export const prWatchSchema = prWatchInputSchema.extend({
  lastCommentCursor: z.string().nullable(),
  lastReviewCommentCursor: z.string().nullable(),
  lastReviewCursor: z.string().nullable(),
  lastCheckKey: z.string().nullable(),
  activeThreadId: z.string().nullable(),
  lastError: z.string().nullable(),
});
export type PrWatch = z.infer<typeof prWatchSchema>;
