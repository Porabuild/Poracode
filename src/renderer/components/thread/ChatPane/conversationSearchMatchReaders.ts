import { z } from "zod";
import type { PersistedRuntimeItem } from "@/shared/ipc/schemas";
import { historyRuntimeItemSchema } from "@/shared/remote/historyPresentation";
import { useAppStore } from "@/renderer/state/appStore";
import { getThreadMap } from "@/renderer/state/useThread";
import { entityHost } from "@/renderer/state/entityHost";
import { invokeRecordedRuntimeItemsPage } from "@/renderer/state/remoteServers/catalog/boundedHistoryRegistry";
import {
  CONVERSATION_MATCH_WINDOW_LIMIT,
  type ConversationMatchReaders,
} from "./loadRuntimeItemThroughHistory";

/**
 * Builds the two authorized read legs for a deep conversation match, on the
 * owning host (managed loopback or paired), whichever it is.
 *
 * - The exact item + `position` come from the same authenticated, byte-bounded,
 *   fenced `thread-history-item` route that deferred bodies use.
 * - The item-centered window comes from the existing fenced `beforePosition`
 *   bounded-items route (`invokeRecordedRuntimeItemsPage`), fenced against a
 *   replaced tail (host/session/scope switch). No tail => no neighbors.
 *
 * These modules are loaded lazily by `locateConversationSearchMatch` so the
 * pure location logic and its unit tests stay free of host/store wiring.
 */
export function createConversationSearchMatchReaders(
  threadId: string,
  itemId: string,
): ConversationMatchReaders {
  const owner = entityHost(getThreadMap(useAppStore.getState().threads).get(threadId));
  return {
    async readLocatedItem(signal) {
      if (!owner) throw new Error("Conversation match host is unavailable.");
      const host = owner;
      const detail = await host.withClient((client) =>
        client.threadHistoryLocatedItem(host.hostId, itemId, {
          ...(signal ? { signal } : {}),
        }),
      );
      if (!host.isCurrent()) throw new Error("Conversation match host changed.");
      return {
        item: detail.item,
        ...(detail.position !== undefined ? { position: detail.position } : {}),
      };
    },
    async readWindow(beforePosition, signal) {
      if (!owner || !owner.isCurrent()) return undefined;
      const page = await invokeRecordedRuntimeItemsPage({
        threadId,
        beforePosition,
        limit: CONVERSATION_MATCH_WINDOW_LIMIT,
        ...(signal ? { signal } : {}),
      });
      if (!page || !owner.isCurrent()) return undefined;
      const parsed = z.array(historyRuntimeItemSchema).safeParse(page.items);
      return parsed.success ? (parsed.data as PersistedRuntimeItem[]) : undefined;
    },
  };
}
