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
import { modelSelectionSchema } from "@/shared/selectionBinding.schemas";
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
    .describe("The New Thread composer's exact launch config."),
  presentationMode: threadPresentationModeSchema.optional(),
  initialSize: terminalSizeSchema.optional(),
  segments: z.array(promptSegmentSchema).optional(),
  workspaceId: z.string().trim().min(1).optional(),
  prNumber: z.number().int().min(1).optional(),
  // Keep the previous flat launch controls and checkout request as aliases.
  ...modelSelectionSchema.partial().shape,
  browserMcp: z.boolean().optional(),
  crossagentMcp: z.boolean().optional(),
  chromeMcp: z.boolean().optional(),
  computerUse: z.boolean().optional(),
  mcpServers: z.record(z.string().min(1), z.boolean()).optional(),
  plugins: z.record(z.string().min(1), z.boolean()).optional(),
  attachments: z
    .array(z.strictObject({ path: z.string().min(1), mimeType: z.string().min(1).optional() }))
    .optional(),
  worktree: z
    .strictObject({
      enabled: z.boolean(),
      branch: z.string().trim().min(1).max(255).optional(),
    })
    .optional()
    .describe("Legacy worktree creation request."),
});

export const createThreadTool = defineAppControlTool({
  name: "create_thread",
  description:
    "Create and launch a Poracode thread. Supply the New Thread composer config and presentationMode (gui or terminal), or use the legacy flat model and tool options. For a new worktree set worktreeIsNewBranch and optionally worktreeBranch, worktreeBaseBranch, and worktreeTransferUncommitted (copies changes and keeps the source intact). For an existing checkout, pass existingWorktreePath from list_worktrees and optionally worktreeBranch to verify its identity. With neither, launch in the main checkout. Legacy worktree.enabled is supported. Home threads can take workspaceId. For attachments use absolute host paths in attachments or segments. The host provisions the checkout before the agent starts.",
  input: createThreadInput,
  run: async (input, ctx) => {
    const {
      config,
      model,
      effort,
      fast,
      thinking,
      contextSize,
      selectionBinding,
      attachments,
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
      worktree,
      browserMcp,
      crossagentMcp,
      chromeMcp,
      computerUse,
      mcpServers,
      plugins,
    } = input;
    if (
      config &&
      [
        model,
        effort,
        fast,
        thinking,
        contextSize,
        selectionBinding,
        browserMcp,
        crossagentMcp,
        chromeMcp,
        computerUse,
        mcpServers,
        plugins,
      ].some((value) => value !== undefined)
    ) {
      throw new Error("Use config or the legacy flat launch options. Pass one format per call.");
    }
    if (segments && attachments)
      throw new Error("Use segments or attachments. Pass one format per call.");
    const promptSegments =
      segments ?? attachments?.map((entry) => ({ kind: "attachment" as const, ...entry }));
    if (!hasSendablePromptContent(input.prompt, promptSegments))
      throw new Error("Provide a prompt or sendable content in segments or attachments.");

    const newCheckout = worktreeBranch !== undefined || worktreeIsNewBranch === true;
    const checkoutOptions =
      worktreeBaseBranch !== undefined ||
      worktreeIsNewBranch !== undefined ||
      worktreeTransferUncommitted !== undefined;
    if (
      (existingWorktreePath && checkoutOptions) ||
      (worktree && (existingWorktreePath || newCheckout || checkoutOptions))
    ) {
      throw new Error(
        "Choose one checkout mode. Existing worktrees accept only a path and optional branch.",
      );
    }
    if (!existingWorktreePath && !newCheckout && checkoutOptions)
      throw new Error("Worktree options need worktreeBranch or worktreeIsNewBranch: true.");
    if (!existingWorktreePath && worktreeIsNewBranch !== true && worktreeBaseBranch)
      throw new Error("worktreeBaseBranch applies when creating a new branch.");

    const home = isHomeProjectId(input.projectId);
    if (home && (existingWorktreePath || newCheckout || worktree?.enabled))
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
    const effectiveModel = config?.model ?? model ?? caller?.config.model;
    if (!agentKind || !effectiveModel)
      throw new Error(
        "Provide agentKind and a model when they cannot be inherited from the calling thread.",
      );
    const effectiveEffort = effort ?? caller?.config.effort;
    const effectiveFast = fast ?? caller?.config.fast;

    return ctx.createThread({
      projectId: input.projectId,
      prompt: input.prompt,
      agentKind,
      model: effectiveModel,
      ...(agentInstanceId !== undefined ? { agentInstanceId } : {}),
      ...(config ? { config } : {}),
      ...(effectiveEffort !== undefined && !config ? { effort: effectiveEffort } : {}),
      ...(effectiveFast !== undefined && !config ? { fast: effectiveFast } : {}),
      ...(thinking !== undefined ? { thinking } : {}),
      ...(contextSize !== undefined ? { contextSize } : {}),
      ...(selectionBinding !== undefined ? { selectionBinding } : {}),
      ...(presentationMode !== undefined ? { presentationMode } : {}),
      ...(initialSize !== undefined ? { initialSize } : {}),
      ...(attachments ? { attachments } : {}),
      ...(segments ? { segments } : {}),
      ...(title ? { title } : {}),
      ...(prNumber !== undefined ? { prNumber } : {}),
      ...(resolvedWorkspace ? { workspaceId: resolvedWorkspace } : {}),
      ...(browserMcp !== undefined ? { browserMcp } : {}),
      ...(crossagentMcp !== undefined ? { crossagentMcp } : {}),
      ...(chromeMcp !== undefined ? { chromeMcp } : {}),
      ...(computerUse !== undefined ? { computerUse } : {}),
      ...(mcpServers !== undefined ? { mcpServers } : {}),
      ...(plugins !== undefined ? { plugins } : {}),
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
          : worktree?.enabled
            ? { worktree: worktree.branch ? { branch: worktree.branch } : {} }
            : {}),
    });
  },
});
