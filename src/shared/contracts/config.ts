import { z } from "zod";
import { agentKindSchema, threadModeSchema } from "./common";

const threadConfigShape = {
  model: z.string().min(1),
  effort: z.string().optional(),
  contextSize: z.string().optional(),
  fast: z.boolean().optional(),
  thinking: z.boolean().optional(),
  mode: threadModeSchema.optional(),
  approvalPolicy: z.string().optional(),
  approvalsReviewer: z.string().optional(),
  sandboxMode: z.string().optional(),
  browserMcp: z.boolean().optional(),
  subagentMcp: z.boolean().optional(),
  computerUse: z.boolean().optional(),
  chromeMcp: z.boolean().optional(),
} as const;

export const threadConfigBaseSchema = z.object(threadConfigShape);

export const threadConfigSchema = threadConfigBaseSchema;
export type ThreadConfig = z.infer<typeof threadConfigSchema>;

export const providerDraftConfigSchema = threadConfigBaseSchema;
export type ProviderDraftConfig = z.infer<typeof providerDraftConfigSchema>;

/** Saved draft state may not have a chosen model yet. */
export const projectDraftConfigSchema = threadConfigBaseSchema
  .extend({
    agentKind: agentKindSchema,
    worktreeMode: z.boolean().optional(),
  })
  .extend({
    model: z.string(),
  });
export type ProjectDraftConfig = z.infer<typeof projectDraftConfigSchema>;

export function isThreadConfigEqual(
  left: ThreadConfig | undefined,
  right: ThreadConfig | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.model === right.model &&
    left.effort === right.effort &&
    left.contextSize === right.contextSize &&
    left.fast === right.fast &&
    left.thinking === right.thinking &&
    left.mode === right.mode &&
    left.approvalPolicy === right.approvalPolicy &&
    left.approvalsReviewer === right.approvalsReviewer &&
    left.sandboxMode === right.sandboxMode &&
    left.browserMcp === right.browserMcp &&
    left.subagentMcp === right.subagentMcp &&
    left.computerUse === right.computerUse &&
    left.chromeMcp === right.chromeMcp
  );
}
