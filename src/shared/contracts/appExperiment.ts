import { z } from "zod";
import {
  experimentJudgeModeSchema,
  experimentSchema,
  MAX_EXPERIMENT_CANDIDATES,
  remoteExperimentCommandResultSchema,
} from "./experiment";
import { agentKindSchema, threadPresentationModeSchema } from "./common";
import { agentInstanceIdSchema } from "./agentInstance";
import { threadComposerConfigSchema } from "./config";
import { desktopActionReplySchema } from "./appDesktopAction";

const target = z.strictObject({
  experimentId: experimentSchema.shape.id,
  revision: remoteExperimentCommandResultSchema.shape.revision,
});

export const appExperimentEditSchema = z.discriminatedUnion("action", [
  target.extend({ action: z.literal("rename"), title: experimentSchema.shape.title.trim().min(1) }),
  target.extend({ action: z.literal("select_winner"), threadId: z.string().min(1) }),
]);
export type AppExperimentEdit = z.infer<typeof appExperimentEditSchema>;

export const experimentJudgeSelectionSchema = z.strictObject({
  agentKind: agentKindSchema,
  model: z.string(),
  effort: z.string().optional(),
  fast: z.boolean(),
  mode: experimentJudgeModeSchema.optional(),
});
export type ExperimentJudgeSelection = z.infer<typeof experimentJudgeSelectionSchema>;

const candidate = z.strictObject({
  agentKind: agentKindSchema,
  agentInstanceId: agentInstanceIdSchema.optional(),
  agentLabel: experimentSchema.shape.candidates.element.shape.agentLabel,
  config: threadComposerConfigSchema,
  presentationMode: threadPresentationModeSchema,
});

const operationKey = z.string().min(8).max(128);
const workflowTarget = target.extend({ operationKey });
export const appExperimentWorkflowSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("launch"),
    projectId: experimentSchema.shape.projectId,
    prompt: experimentSchema.shape.prompt,
    segments: experimentSchema.shape.segments,
    baseBranch: experimentSchema.shape.baseBranch,
    candidates: z.array(candidate).min(2).max(MAX_EXPERIMENT_CANDIDATES),
    operationKey,
  }),
  workflowTarget.extend({
    action: z.literal("judge"),
    selection: experimentJudgeSelectionSchema.optional(),
  }),
  workflowTarget.extend({ action: z.literal("merge_winner") }),
  workflowTarget.extend({ action: z.literal("create_pr"), threadId: z.string().min(1) }),
  workflowTarget.extend({ action: z.literal("retry_cleanup") }),
  workflowTarget.extend({ action: z.literal("discard") }),
]);
export type AppExperimentWorkflow = z.infer<typeof appExperimentWorkflowSchema>;

export const appExperimentRequestSchema = z.strictObject({
  version: z.literal(1),
  input: appExperimentWorkflowSchema,
  experimentId: experimentSchema.shape.id,
});
export type AppExperimentRequest = z.infer<typeof appExperimentRequestSchema>;
export const appExperimentResultSchema = z.strictObject({
  ok: z.boolean(),
  experimentId: experimentSchema.shape.id,
});
export type AppExperimentResult = z.infer<typeof appExperimentResultSchema>;
export const appExperimentReplySchema = desktopActionReplySchema(appExperimentResultSchema);
export const APP_EXPERIMENT_CLIENT_TIMEOUT_MS = 20 * 60_000;
