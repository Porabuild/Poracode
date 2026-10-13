import { HISTORY_DETAILS_PROJECTION } from "./historyPresentation";
import { z } from "zod";
import { runtimeEventSchema } from "../contracts";
import { remoteThreadSnapshotSchema } from "./protocol/resources";
import { boundedThreadSnapshotSchema } from "./historyReadSchemas";
import { CATALOG_READS_CAPABILITY } from "./catalogReadContract";

export const THREAD_HISTORY_RESUME_VERSION = 1 as const;
export const historyResumeQuerySchema = z.object({
  reads: z.literal(CATALOG_READS_CAPABILITY),
  notices: z.literal("v1"),
  cursor: z.string().min(1).max(4096),
  afterSeq: z.number().int().nonnegative().optional(),
  projection: z.literal(HISTORY_DETAILS_PROJECTION).optional(),
  maxBytes: z.number().int().positive().optional(),
  maxDecodeBytes: z.number().int().positive().optional(),
});
export const historyResumeResponseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("snapshot"), snapshot: boundedThreadSnapshotSchema }),
  remoteThreadSnapshotSchema
    .pick({
      snapshotSeq: true,
      thread: true,
      runtimeStateCurrent: true,
      completedTurns: true,
      completedTurnsNextCursor: true,
      contextUsage: true,
      backgroundTasks: true,
      followUpQueue: true,
      runtimeNotice: true,
    })
    .extend({
      kind: z.literal("events"),
      runtimeResumeCursor: z.string().min(1),
      batches: z.array(
        z.object({ seq: z.number().int().nonnegative(), events: z.array(runtimeEventSchema) }),
      ),
    }),
]);
export type HistoryResumeResponse = z.infer<typeof historyResumeResponseSchema>;
