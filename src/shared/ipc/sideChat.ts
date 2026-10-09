import { z } from "zod";
import { threadSchema, promptSegmentSchema, extractContextResultSchema } from "../contracts";

/** Same-build desktop bootstrap. Volatile; never a persisted or remote-wire format. */
export const sideChatBootstrapSchema = z.object({
  id: z.string().optional(),
  source: threadSchema,
  context: extractContextResultSchema.nullable(),
  prompt: z.string(),
  segments: z.array(promptSegmentSchema).optional(),
  title: z.string().min(1),
  existingThreadId: z.string().min(1).optional(),
  autoStart: z.boolean().optional(),
});
export type SideChatBootstrap = z.infer<typeof sideChatBootstrapSchema>;
export const sideChatThreadBindingSchema = z.object({
  id: z.string().optional(),
  threadId: z.string().min(1).optional(),
  prompt: z.string(),
  segments: z.array(promptSegmentSchema).optional(),
});
export type SideChatThreadBinding = z.infer<typeof sideChatThreadBindingSchema>;
export interface SideChatWindowsChanged {
  threadIds: string[];
  closedThreadId?: string;
  panel?: SideChatBootstrap | null;
}
