import { z } from "zod";
import { scheduledTaskConfigSchema } from "./schedule";

export const prWatchKeySchema = z.object({
  projectId: z.string().min(1),
  prNumber: z.number().int().min(1),
});
export type PrWatchKey = z.infer<typeof prWatchKeySchema>;

export const prAutomationModeSchema = z.enum(["off", "fix", "merge"]);
export type PrAutomationMode = z.infer<typeof prAutomationModeSchema>;

/**
 * Why an enabled watch is not launching a fix right now.
 *
 * A watch outlives the thread and worktree the PR was authored in, so by the
 * time a blocker appears its helper agent may be uninstalled and its branch may
 * have no checkout left. Recording the reason is strictly better than spawning
 * anyway: a fix thread with no PR checkout runs the agent against the main
 * checkout's branch, which cannot repair the PR and can touch unrelated work.
 * Any watch update clears the reason and re-arms the attempt.
 */
export const prWatchBlockedReasonSchema = z.enum(["agent-unavailable", "worktree-unavailable"]);
export type PrWatchBlockedReason = z.infer<typeof prWatchBlockedReasonSchema>;

export const prWatchInputSchema = prWatchKeySchema
  .extend({
    headBranch: z.string().min(1),
    worktreePath: z.string().min(1).optional(),
    watchEnabled: z.boolean(),
    autoMerge: z.boolean(),
    /**
     * The helper agent this watch launches fixes with. This is a *cache* of the
     * app's current conflict-resolver resolution, not a per-PR choice the user
     * made: `syncAgent` refreshes it whenever the resolution changes, so a
     * watch created months ago does not keep calling a provider the user has
     * since switched away from.
     */
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

/** One project's current helper-agent resolution, pushed in by the app. */
export const prWatchAgentSyncSchema = z.object({
  projectId: z.string().min(1),
  agentKind: z.string().min(1),
  config: scheduledTaskConfigSchema,
});
export type PrWatchAgentSync = z.infer<typeof prWatchAgentSyncSchema>;

export const prWatchSchema = prWatchInputSchema.extend({
  lastCommentCursor: z.string().nullable(),
  lastReviewCommentCursor: z.string().nullable(),
  lastReviewCursor: z.string().nullable(),
  lastCheckKey: z.string().nullable(),
  activeThreadId: z.string().nullable(),
  lastError: z.string().nullable(),
  // Tolerant of unknown values so a row written by a newer build (or a hand-
  // edited one) degrades to "not blocked" instead of failing the whole read.
  blockedReason: prWatchBlockedReasonSchema.nullable().catch(null),
});
export type PrWatch = z.infer<typeof prWatchSchema>;
