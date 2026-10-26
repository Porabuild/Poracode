import { z } from "zod";
import { threadSchema, promptSegmentSchema, extractContextResultSchema } from "../contracts";

/** Same-build desktop bootstrap. The device ownership ledger separately versions persisted copies. */
const sideChatSelectionSchema = threadSchema.pick({
  agentKind: true,
  agentInstanceId: true,
  config: true,
});
export type SideChatSelection = z.infer<typeof sideChatSelectionSchema>;
export const sideChatBootstrapSchema = z.object({
  id: z.string().optional(),
  source: threadSchema,
  context: extractContextResultSchema.nullable(),
  prompt: z.string(),
  segments: z.array(promptSegmentSchema).optional(),
  title: z.string().min(1),
  existingThreadId: z.string().min(1).optional(),
  autoStart: z.boolean().optional(),
  selection: sideChatSelectionSchema.optional(),
});
export type SideChatBootstrap = z.infer<typeof sideChatBootstrapSchema>;
// Same-build window commands add transient input; persisted bootstrap v1 stays unchanged.
export const sideChatOpenInputSchema = sideChatBootstrapSchema.extend({
  appendText: z.string().optional(),
});
export type SideChatOpenInput = z.infer<typeof sideChatOpenInputSchema>;
export const sideChatThreadBindingSchema = z.object({
  thread: threadSchema.optional(),
  id: z.string().optional(),
  threadId: z.string().min(1).optional(),
  prompt: z.string(),
  segments: z.array(promptSegmentSchema).optional(),
  selection: sideChatSelectionSchema.optional(),
});
export type SideChatThreadBinding = z.infer<typeof sideChatThreadBindingSchema>;
export interface SideChatWindowsChanged {
  threadIds: string[];
  hiddenThreadIds?: string[];
  closedThreadId?: string;
  panel?: SideChatBootstrap | null;
  panels?: SideChatBootstrap[];
  detachedIds?: string[];
  disposing?: z.infer<typeof threadSchema>[];
  composerInput?: { composerId: string; text: string };
}
