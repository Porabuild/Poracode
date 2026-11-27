import { z } from "zod";
import { persistedRuntimeItemSchema } from "../ipc/schemas";

/** Opt-in presentation projection. Canonical persisted rows remain complete. */
export const HISTORY_DETAILS_VERSION = 1 as const;
export const HISTORY_DETAILS_PROJECTION = "details-v1" as const;

/**
 * Optional `deferBodies` request value on a `details-v1` history read: the host
 * leaves completed `file_change` rows without their large body fields and marks
 * each such row `detailsDeferred`, so the body loads through the item-detail route.
 *
 * Compatibility: no projection version bump. The parameter is additive and
 * optional; a host that predates it ignores it and returns complete rows, which
 * every reader already renders, and a reader that never sends it (older desktop
 * builds, the native clients) keeps receiving complete rows. Each deferred row
 * is self-describing through `detailsDeferred`, so no capability negotiation or
 * downgrade path is needed.
 */
export const HISTORY_DEFER_FILE_CHANGE_BODIES = "file_change" as const;

export const historyRuntimeItemSchema = persistedRuntimeItemSchema.extend({
  /** The stored item has body content available through the declared detail route. */
  detailsDeferred: z.literal(true).optional(),
});
export type HistoryRuntimeItem = z.infer<typeof historyRuntimeItemSchema>;

/**
 * The item-detail response. `position` is additive and optional: it is the
 * item's canonical transcript position on the owning host, read from
 * `HistoryPageRowMeta.position`. It lives OUTSIDE the stored `item` so the
 * persisted row stays untouched. A host that predates it omits the field, and
 * every existing reader still parses complete rows (no projection version
 * bump, no capability negotiation, no downgrade path: an absent position just
 * means positioned, item-centered reads are unavailable and the reader keeps
 * its bounded paging).
 */
export const historyItemDetailSchema = z.object({
  item: persistedRuntimeItemSchema,
  /** Canonical 0-based transcript position; absent on older hosts. */
  position: z.number().int().nonnegative().optional(),
});
export type HistoryItemDetail = z.infer<typeof historyItemDetailSchema>;

export const historyItemDetailQuerySchema = z.object({
  notices: z.literal("v1"),
  maxBytes: z.number().int().positive().optional(),
  maxDecodeBytes: z.number().int().positive().optional(),
});

export function hasDeferredHistoryStreams(type: string, state: string): boolean {
  return state === "completed" && type === "command_execution";
}
