import { z } from "zod";
import { getRuntimeThreadGapNotice } from "@/host/db";
import { remoteRuntimeItemsPageRequestSchema, remoteRuntimeItemsPageSchema } from "@/shared/remote";
import { decodedThreadTurnsQuerySchema } from "@/shared/remote/contract/queryCodecs";
import {
  decodeCompletedTurnCursor,
  historyTurnPageSchema,
  HISTORY_COMPLETED_TURNS_DEFAULT_LIMIT,
  HISTORY_CURSOR_MAX_LENGTH,
  HISTORY_ITEMS_DEFAULT_LIMIT,
} from "@/shared/remote/historyReadContract";
import {
  historyItemDetailQuerySchema,
  historyItemDetailSchema,
} from "@/shared/remote/historyPresentation";
import { resolveCatalogEffectiveCaps } from "@/host/remote/server/catalogPageBudget";
import { readHistoryItemDetails } from "@/host/remote/server/historyItemDetails";
import {
  buildBoundedThreadHistoryItems,
  readCompletedTurnHistory,
} from "@/host/remote/server/historyReadBuilders";
import { mapHistoryPersistenceRefusal } from "@/host/remote/server/historyReadFence";
import { toRemoteRuntimeHistoryNotice } from "@/host/remote/server/runtimeHistoryNoticeGate";
import { defineAppControlTool } from "../defineTools";
import { requireThread } from "./types";

const byteCaps = historyItemDetailQuerySchema.omit({ notices: true }).shape;
const threadIdField = remoteRuntimeItemsPageRequestSchema.pick({ threadId: true }).shape;

export const readThreadHistoryTool = defineAppControlTool({
  name: "read_thread_history",
  description:
    "Read structured history from this host's saved thread. Use items for transcript rows including tool activity and message anchors. Pass nextCursor back as beforePosition to read older items. Use turns for completed turn timings and anchors, passing completedTurnsNextCursor back as cursor. Use detail with an itemId for the stored body and streams. Pages use the app's byte-bounded readers. Defaults are 64 KiB serialized and 128 KiB decoded. Increase maxBytes or maxDecodeBytes if a specific item is reported too large. Check runtimeNotice for incomplete history.",
  input: z.discriminatedUnion("action", [
    remoteRuntimeItemsPageRequestSchema
      .partial({ limit: true })
      .extend({ action: z.literal("items"), ...byteCaps })
      .strict(),
    decodedThreadTurnsQuerySchema
      .pick({ cursor: true, limit: true })
      .extend({
        action: z.literal("turns"),
        ...threadIdField,
        ...byteCaps,
        cursor: z.string().min(1).max(HISTORY_CURSOR_MAX_LENGTH).optional(),
      })
      .strict(),
    z.strictObject({
      action: z.literal("detail"),
      ...threadIdField,
      itemId: z.string().min(1),
      ...byteCaps,
    }),
  ]),
  run: async (args, ctx) => {
    const { threadId, action } = args;
    requireThread(ctx, threadId);
    const caps = resolveCatalogEffectiveCaps({
      maxBytes: args.maxBytes ?? 64 * 1024,
      maxDecodeBytes: args.maxDecodeBytes ?? 128 * 1024,
    });
    const readNotice = () => {
      const notice = getRuntimeThreadGapNotice(threadId);
      return notice ? toRemoteRuntimeHistoryNotice(notice) : undefined;
    };
    try {
      switch (action) {
        case "items": {
          const { beforePosition, targetTimelineEntryCount, limit } = args;
          const body = await buildBoundedThreadHistoryItems(
            {
              threadId,
              limit: limit ?? HISTORY_ITEMS_DEFAULT_LIMIT,
              ...(beforePosition === undefined ? {} : { beforePosition }),
              ...(targetTimelineEntryCount === undefined ? {} : { targetTimelineEntryCount }),
            },
            caps,
            readNotice(),
            true,
            true,
          );
          return { threadId, action, ...remoteRuntimeItemsPageSchema.parse(JSON.parse(body)) };
        }
        case "turns": {
          const { cursor, limit } = args;
          const { body, runtimeNotice } = await readCompletedTurnHistory(
            {
              threadId,
              caps,
              limit: limit ?? HISTORY_COMPLETED_TURNS_DEFAULT_LIMIT,
              ...(cursor === undefined ? {} : { cursorIdx: decodeCompletedTurnCursor(cursor) }),
            },
            readNotice,
          );
          return {
            threadId,
            action,
            ...historyTurnPageSchema.parse(JSON.parse(body)),
            runtimeNotice,
          };
        }
        case "detail": {
          const { body, runtimeNotice } = await readHistoryItemDetails(
            { threadId, itemId: args.itemId, caps },
            readNotice,
          );
          return {
            threadId,
            action,
            ...historyItemDetailSchema.parse(JSON.parse(body)),
            runtimeNotice,
          };
        }
      }
    } catch (error) {
      throw mapHistoryPersistenceRefusal(error);
    }
  },
});
