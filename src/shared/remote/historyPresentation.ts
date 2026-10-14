import { z } from "zod";
import { persistedRuntimeItemSchema } from "../ipc/schemas";

/** Opt-in presentation projection. Canonical persisted rows remain complete. */
export const HISTORY_DETAILS_VERSION = 1 as const;
export const HISTORY_DETAILS_PROJECTION = "details-v1" as const;

export const historyRuntimeItemSchema = persistedRuntimeItemSchema.extend({
  /** The stored item has body content available through the declared detail route. */
  detailsDeferred: z.literal(true).optional(),
});
export type HistoryRuntimeItem = z.infer<typeof historyRuntimeItemSchema>;

export const historyItemDetailSchema = z.object({
  item: persistedRuntimeItemSchema,
});

export const historyItemDetailQuerySchema = z.object({
  notices: z.literal("v1"),
  maxBytes: z.number().int().positive().optional(),
  maxDecodeBytes: z.number().int().positive().optional(),
});

export function hasDeferredHistoryStreams(type: string, state: string): boolean {
  return state === "completed" && type === "command_execution";
}
