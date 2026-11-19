import { z } from "zod";
import { desktopActionReplySchema } from "./appDesktopAction";
export {
  appDesktopActionNotStartedSchema as appThreadTransferNotStartedSchema,
  type AppDesktopActionNotStarted as AppThreadTransferNotStarted,
} from "./appDesktopAction";
import { agentStatusSchema } from "./agent";
import { threadComposerConfigSchema } from "./config";
import { threadSchema } from "./thread";
import {
  threadTransferPlanProjectSchema,
  threadTransferSourceSchema,
  threadTransferIdSchema,
} from "../threadTransfer";

const source = {
  threadId: threadSchema.shape.id,
};
const destination = { destinationProjectId: z.string().min(1) };

export const appThreadTransferInputSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("destinations"), ...source }),
  z.strictObject({ action: z.literal("preview"), ...source, ...destination }),
  z.strictObject({
    action: z.literal("move"),
    ...source,
    ...destination,
    operationKey: z.string().min(8).max(128),
    continuePrompt: z.string().max(50_000).optional(),
    stopFirst: z.boolean().default(false),
    agent: z
      .strictObject({
        kind: agentStatusSchema.shape.kind,
        config: threadComposerConfigSchema,
      })
      .optional(),
  }),
]);
export type AppThreadTransferInput = z.infer<typeof appThreadTransferInputSchema>;

export const appThreadTransferResultSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("destinations"),
    destinations: z.array(
      z.object({
        destinationProjectId: destination.destinationProjectId,
        projectName: z.string(),
        hostLabel: z.string(),
        online: z.boolean(),
      }),
    ),
  }),
  z.object({
    action: z.literal("preview"),
    source: threadTransferSourceSchema,
    project: threadTransferPlanProjectSchema.optional(),
    agents: z.array(agentStatusSchema.pick({ kind: true, label: true, capabilities: true })),
    sourceAgentReady: z.boolean(),
  }),
  z.object({
    action: z.literal("move"),
    threadId: z.string().min(1),
    destinationProjectId: destination.destinationProjectId,
    targetLabel: z.string(),
    branch: z.string().optional(),
    branchRenamed: z.boolean().optional(),
    sourceArchived: z.boolean(),
    continueFailed: z.boolean().optional(),
    recovered: z.literal(true).optional(),
  }),
]);
export type AppThreadTransferResult = z.infer<typeof appThreadTransferResultSchema>;

/** One versioned link between the backend and the paired desktop client. */
export const appThreadTransferRequestSchema = z.strictObject({
  version: z.literal(1),
  input: appThreadTransferInputSchema,
  reconcile: z.literal(true).optional(),
  ids: z
    .strictObject({
      transferId: threadTransferIdSchema,
      targetThreadId: z.string().min(1),
      sourceHostId: z.string().min(1),
    })
    .optional(),
});
export type AppThreadTransferRequest = z.infer<typeof appThreadTransferRequestSchema>;

export const appThreadTransferReplySchema = desktopActionReplySchema(appThreadTransferResultSchema);

/** The receiver closes its transport first, then the backend times out its IPC. */
export const APP_THREAD_TRANSFER_CLIENT_TIMEOUT_MS = 20 * 60_000;
