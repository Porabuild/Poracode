import { z } from "zod";
import { threadComposerConfigSchema } from "./config";
import { extractContextPayloadSchema } from "./git";
import { startThreadPayloadSchema } from "./thread";

export const threadHandoffInputSchema = z.strictObject({
  agentKind: startThreadPayloadSchema.shape.agentKind,
  agentInstanceId: startThreadPayloadSchema.shape.agentInstanceId,
  segments: startThreadPayloadSchema.shape.segments,
  presentationMode: startThreadPayloadSchema.shape.presentationMode.unwrap(),
  initialSize: startThreadPayloadSchema.shape.initialSize.optional(),
  sourceThreadId: z.string().min(1),
  intent: z.enum(["switch", "fork"]),
  config: threadComposerConfigSchema,
  prompt: z.string().max(50_000).optional(),
  withoutContext: z.boolean().default(false),
  extractionSelection: extractContextPayloadSchema.shape.selection,
  operationKey: z.string().min(8).max(128),
});

export type ThreadHandoffInput = z.infer<typeof threadHandoffInputSchema>;

export interface ThreadHandoffResult {
  threadId: string;
  sourceThreadId: string;
  mode: "in_place" | "replacement" | "fork";
  context: "thread-transcript" | "context-file" | "none";
  sourceDisposition: "continued" | "open" | "done";
}
