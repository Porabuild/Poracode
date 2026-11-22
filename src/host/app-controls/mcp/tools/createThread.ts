import { z } from "zod";
import {
  agentInstanceIdSchema,
  agentKindSchema,
  promptSegmentSchema,
  terminalSizeSchema,
  threadComposerConfigSchema,
  threadPresentationModeSchema,
} from "@/shared/contracts";
import { isHomeProjectId } from "@/shared/homeScope";
import { hasSendablePromptContent } from "@/shared/promptContent";
import { threadWorktreeDraftFieldsSchema } from "@/shared/threadWorktreeLaunch";
import { defineAppControlTool } from "../defineTools";
import { inheritCallerWorkspaceId, requireWorkspace } from "./workspaceLookup";

const createThreadInput = threadWorktreeDraftFieldsSchema.extend({
  projectId: z.string().min(1),
  prompt: z.string().trim().max(50_000),
  title: z.string().trim().min(1).max(200).optional(),
  agentKind: agentKindSchema.optional(),
  agentInstanceId: agentInstanceIdSchema.optional(),
  config: threadComposerConfigSchema
    .optional()
    .describe("Composer launch config (model, effort, MCP/plugin overrides, etc.)."),
  presentationMode: threadPresentationModeSchema.optional(),
  initialSize: terminalSizeSchema.optional(),
  segments: z.array(promptSegmentSchema).optional(),
  workspaceId: z.string().trim().min(1).optional(),
  prNumber: z.number().int().min(1).optional(),
});

export const createThreadTool = defineAppControlTool({
  name: "create_thread",
  description:
    "Create and launch a Poracode thread. Pass config and presentationMode (gui or terminal), optional worktree fields (worktreeIsNewBranch or existingWorktreePath from list_worktrees), and segments for attachments/mentions. Inherits caller agent/model when omitted.",
  input: createThreadInput,
  run: async (input, ctx) => {
    const {
      config,
      segments,
      agentInstanceId,
      title,
      workspaceId,
      prNumber,
      presentationMode,
      initialSize,
      existingWorktreePath,
      worktreeBranch,
      worktreeBaseBranch,
      worktreeIsNewBranch,
      worktreeTransferUncommitted,
    } = input;
    if (!hasSendablePromptContent(input.prompt, segments))
      throw new Error("Provide a prompt or sendable content in segments.");

    const newCheckout = worktreeBranch !== undefined || worktreeIsNewBranch === true;
    const checkoutOptions =
      worktreeBaseBranch !== undefined ||
      worktreeIsNewBranch !== undefined ||
      worktreeTransferUncommitted !== undefined;
    if (existingWorktreePath && checkoutOptions) {
      throw new Error(
        "Choose one checkout mode. Existing worktrees accept only a path and optional branch.",
      );
    }
    if (!existingWorktreePath && !newCheckout && checkoutOptions)
      throw new Error("Worktree options need worktreeBranch or worktreeIsNewBranch: true.");
    if (!existingWorktreePath && worktreeIsNewBranch !== true && worktreeBaseBranch)
      throw new Error("worktreeBaseBranch applies when creating a new branch.");

    const home = isHomeProjectId(input.projectId);
    if (home && (existingWorktreePath || newCheckout))
      throw new Error("The Home project has no worktrees. Choose a Git project.");
    if (!home && workspaceId)
      throw new Error("workspaceId applies to Home threads. File a project with update_project.");
    const resolvedWorkspace = home
      ? workspaceId
        ? requireWorkspace(ctx, workspaceId).id
        : inheritCallerWorkspaceId(ctx)
      : undefined;

    const caller = ctx.identity.threadId ? ctx.getThread(ctx.identity.threadId) : null;
    const agentKind = input.agentKind ?? caller?.agentKind;
    const effectiveModel = config?.model ?? caller?.config.model;
    if (!agentKind || !effectiveModel)
      throw new Error(
        "Provide agentKind and config.model when they cannot be inherited from the calling thread.",
      );

    return ctx.createThread({
      projectId: input.projectId,
      prompt: input.prompt,
      agentKind,
      model: effectiveModel,
      ...(agentInstanceId !== undefined ? { agentInstanceId } : {}),
      ...(config ? { config } : {}),
      ...(!config && caller?.config.effort !== undefined ? { effort: caller.config.effort } : {}),
      ...(!config && caller?.config.fast !== undefined ? { fast: caller.config.fast } : {}),
      ...(presentationMode !== undefined ? { presentationMode } : {}),
      ...(initialSize !== undefined ? { initialSize } : {}),
      ...(segments ? { segments } : {}),
      ...(title ? { title } : {}),
      ...(prNumber !== undefined ? { prNumber } : {}),
      ...(resolvedWorkspace ? { workspaceId: resolvedWorkspace } : {}),
      ...(existingWorktreePath
        ? {
            existingWorktreePath,
            ...(worktreeBranch ? { expectedWorktreeBranch: worktreeBranch } : {}),
          }
        : newCheckout
          ? {
              worktree: {
                ...(worktreeBranch ? { branch: worktreeBranch } : {}),
                createBranch: worktreeIsNewBranch ?? false,
                ...(worktreeBaseBranch ? { startPoint: worktreeBaseBranch } : {}),
                ...(worktreeTransferUncommitted !== undefined
                  ? { transferUncommitted: worktreeTransferUncommitted }
                  : {}),
              },
            }
          : {}),
    });
  },
});
