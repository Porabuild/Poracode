import { z } from "zod";
import { remoteRuntimeItemsPageSchema, remoteThreadSnapshotSchema } from "./protocol";
import { CATALOG_READS_CAPABILITY } from "./catalogReadContract";

/**
 * Shared B4 bounded-history response schemas (strict declared-client shapes).
 *
 * Moved from the host binder so the shared contract owner keeps one definition
 * and the generated contract never imports host code. Additive to the canonical
 * wire schemas: a legacy response still parses through the registry route
 * schemas.
 */
export const boundedThreadSnapshotSchema = remoteThreadSnapshotSchema.extend({
  reads: z.literal(CATALOG_READS_CAPABILITY),
  completedTurnsNextCursor: z.string().min(1).nullable(),
});

export const boundedRuntimeItemsPageSchema = remoteRuntimeItemsPageSchema.extend({
  reads: z.literal(CATALOG_READS_CAPABILITY),
});

/** Only durable history is reusable; controls, notices and sequence proofs are always fresh. */
export const cachedThreadHistorySchema = boundedThreadSnapshotSchema
  .pick({
    runtimeItems: true,
    runtimeNextCursor: true,
    completedTurns: true,
    completedTurnsNextCursor: true,
    contextUsage: true,
    historyProjection: true,
  })
  .extend({ revision: z.string().min(1).max(160) });
export type CachedThreadHistory = z.infer<typeof cachedThreadHistorySchema>;
