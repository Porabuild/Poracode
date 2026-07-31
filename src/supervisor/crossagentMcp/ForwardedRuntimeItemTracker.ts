import type { RuntimeEvent } from "@/shared/contracts";

type ItemStartedEvent = Extract<RuntimeEvent, { type: "item.started" }>;
type ItemUpdatedEvent = Extract<RuntimeEvent, { type: "item.updated" }>;
type ItemCompletedEvent = Extract<RuntimeEvent, { type: "item.completed" }>;

interface OpenForwardedItem {
  itemId: string;
  itemType: ItemStartedEvent["itemType"];
  parentItemId: string | undefined;
  payload: unknown;
}

const STATUS_BEARING_ITEM_TYPES = new Set<ItemStartedEvent["itemType"]>([
  "command_execution",
  "file_change",
  "tool_call",
  "mcp_tool_call",
  "dynamic_tool_call",
]);

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergePayload(current: unknown, update: unknown): unknown {
  return isObjectRecord(current) && isObjectRecord(update) ? { ...current, ...update } : update;
}

function terminalPayload(item: OpenForwardedItem): unknown {
  if (!STATUS_BEARING_ITEM_TYPES.has(item.itemType) || !isObjectRecord(item.payload)) {
    return undefined;
  }
  return { ...item.payload, status: "error" };
}

/**
 * Tracks re-tagged child items that have started but not completed. Some
 * providers can settle an outer turn while provider-native delegated work is
 * still open; draining the tracker terminalizes those rows before the child
 * session is disposed.
 */
export class ForwardedRuntimeItemTracker {
  private readonly open = new Map<string, OpenForwardedItem>();

  start(event: ItemStartedEvent): void {
    this.open.set(event.itemId, {
      itemId: event.itemId,
      itemType: event.itemType,
      parentItemId: event.parentItemId,
      payload: event.payload,
    });
  }

  update(event: ItemUpdatedEvent): void {
    const item = this.open.get(event.itemId);
    if (item) item.payload = mergePayload(item.payload, event.payload);
  }

  complete(itemId: string): void {
    this.open.delete(itemId);
  }

  /**
   * Drain descendants before ancestors, matching normal nested-tool teardown
   * and avoiding an open child stranded under a closed Agent row.
   */
  drainTerminalEvents(threadId: string): ItemCompletedEvent[] {
    if (this.open.size === 0) return [];

    const depth = (item: OpenForwardedItem): number => {
      let value = 0;
      let parentId = item.parentItemId;
      const seen = new Set<string>();
      while (parentId && this.open.has(parentId) && !seen.has(parentId)) {
        seen.add(parentId);
        value += 1;
        parentId = this.open.get(parentId)?.parentItemId;
      }
      return value;
    };
    const items = [...this.open.values()].sort((left, right) => depth(right) - depth(left));
    this.open.clear();

    return items.map((item) => {
      const payload = terminalPayload(item);
      return {
        type: "item.completed",
        threadId,
        itemId: item.itemId,
        ...(payload === undefined ? {} : { payload }),
      };
    });
  }
}
