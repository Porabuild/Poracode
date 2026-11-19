import { randomUUID } from "node:crypto";
import { z } from "zod";
import { deleteWorktreeGroupCommandSchema, forkThreadCommandSchema } from "@/shared/contracts";
import { moveThreadToWorktreeInputSchema } from "@/shared/contracts/threadWorktreeMove";
import { threadHandoffInputSchema } from "@/shared/contracts/threadHandoff";
import { appThreadTransferInputSchema } from "@/shared/contracts/appThreadTransfer";
import { normalizeWorktreePathForComparison } from "@/shared/worktree";
import { defineAppControlTool } from "../defineTools";
import { assertNotSelf, requireThread, type AppControlsToolContext } from "./types";

function requireLifecycle(ctx: AppControlsToolContext) {
  if (!ctx.applyThreadLifecycle)
    throw new Error("The host is not ready to apply thread lifecycle actions.");
  return ctx.applyThreadLifecycle;
}

export const forkThreadTool = defineAppControlTool({
  name: "fork_thread",
  description:
    "Fork an inactive or settled Chat thread into a new independent conversation in the same checkout. Use throughItemId to copy through a completed turn anchor from read_thread; omit it to fork at the latest completed turn. The fork starts inactive and keeps its transcript.",
  input: forkThreadCommandSchema
    .omit({ kind: true, threadId: true })
    .extend({
      title: z.string().trim().min(1).max(200),
    })
    .strict(),
  run: async ({ sourceThreadId, title, throughItemId }, ctx) => {
    requireThread(ctx, sourceThreadId);
    const threadId = randomUUID();
    await requireLifecycle(ctx)({
      kind: "fork",
      threadId,
      sourceThreadId,
      title,
      ...(throughItemId !== undefined ? { throughItemId } : {}),
    });
    return { threadId, title, sourceThreadId };
  },
});

export const deleteThreadTool = defineAppControlTool({
  name: "delete_thread",
  description:
    "Delete a thread and its saved transcript. Like the sidebar action, it also removes a linked worktree only when this is its last thread. Pass removeOwnedWorktree:false to keep the checkout. Requires explicit user authorization. You cannot delete the calling thread.",
  input: z.strictObject({
    threadId: z.string().min(1),
    removeOwnedWorktree: z.boolean().default(true),
  }),
  run: async ({ threadId, removeOwnedWorktree }, ctx) => {
    assertNotSelf(ctx, threadId, "delete");
    const thread = requireThread(ctx, threadId);
    const path = thread.worktreePath;
    const project = ctx.getProject(thread.projectId);
    const normalize = (value: string) =>
      normalizeWorktreePathForComparison(value, project?.location.kind === "windows");
    const removeWorktree =
      removeOwnedWorktree &&
      path &&
      project &&
      !ctx
        .getThreads()
        .some(
          (other) =>
            other.id !== threadId &&
            other.projectId === thread.projectId &&
            other.worktreePath &&
            normalize(other.worktreePath) === normalize(path),
        );
    await requireLifecycle(ctx)(
      removeWorktree
        ? {
            kind: "delete-worktree-group",
            threadId,
            projectId: thread.projectId,
            worktreePath: path,
            threadIds: [threadId],
          }
        : { kind: "delete", threadId },
    );
    return { threadId, deleted: true, removedOwnedWorktree: Boolean(removeWorktree) };
  },
});

export const deleteWorktreeGroupTool = defineAppControlTool({
  name: "delete_worktree_group",
  description:
    "Remove a registered worktree and delete every linked thread and transcript using the Worktree group's Delete action. Cleanup scripts run and the host applies the same branch cleanup policy as the app. Use list_threads with projectId and include every thread on the worktree, including archived threads. The host refuses if membership has changed. Requires explicit user authorization for the exact checkout and threads. The calling thread cannot be in the group.",
  input: deleteWorktreeGroupCommandSchema.omit({ kind: true, threadId: true }).strict(),
  run: async (input, ctx) => {
    for (const threadId of input.threadIds) assertNotSelf(ctx, threadId, "delete");
    await requireLifecycle(ctx)({
      kind: "delete-worktree-group",
      threadId: input.threadIds[0]!,
      ...input,
    });
    return { ...input, deleted: true };
  },
});

export const moveThreadToWorktreeTool = defineAppControlTool({
  name: "move_thread_to_worktree",
  description:
    "Move a saved thread in a Git project's main checkout to a new worktree and branch. Set withChanges:true to move uncommitted changes out of the source checkout. The default creates a clean checkout. The host confirms runtime retirement and tries to reopen a previously active thread in the new worktree. Requires user authorization, including approval to move uncommitted changes. Pass a unique operationKey for this move and reuse it to check the outcome after a lost response.",
  input: moveThreadToWorktreeInputSchema,
  run: (input, ctx) => {
    assertNotSelf(ctx, input.threadId, "move");
    if (!ctx.moveThreadToWorktree) throw new Error("The owning host is not ready to move threads.");
    return ctx.moveThreadToWorktree(input);
  },
});

export const handoffThreadTool = defineAppControlTool({
  name: "handoff_thread",
  description:
    "Continue in another provider using the target composer config, presentation, prompt and segments. Switch changes a Chat thread in place when the target also uses Chat; otherwise it starts a replacement and marks the source done after a confirmed launch and retirement. Fork opens a separate thread in the same checkout and keeps the source open. The host chooses transcript access or carries conversation context. Set withoutContext:true only when the user wants to proceed without context. Select the source model and effort for terminal context extraction with extractionSelection. Use a unique operationKey and reuse it after a lost response. Switching needs user authorization and cannot target the calling thread.",
  input: threadHandoffInputSchema,
  run: (input, ctx) => {
    if (input.intent === "switch")
      assertNotSelf(ctx, input.sourceThreadId, "switch the provider of");
    if (!ctx.handoffThread) throw new Error("The owning host is not ready to hand off threads.");
    return ctx.handoffThread(input);
  },
});

export const threadTransferTool = defineAppControlTool({
  name: "thread_transfer",
  description:
    "Move a Chat thread and its checkout to another paired machine through the desktop client. Call destinations to list paired project IDs, then preview the selected destination and available Chat providers. Move uses the app's target agent/config, optional continuePrompt and stopFirst choices. Confirm the destination and any interruption with the user before moving a thread. Use a unique operationKey and reuse it after a lost response. The calling thread cannot move itself. Requires the source desktop's connected main client and an authorized online destination.",
  input: appThreadTransferInputSchema,
  run: (input, ctx) => {
    if (input.action === "move") assertNotSelf(ctx, input.threadId, "transfer");
    if (!ctx.transferThread) {
      throw new Error(
        "Thread transfer requires the owning desktop client and its paired connections.",
      );
    }
    return ctx.transferThread(input);
  },
});
