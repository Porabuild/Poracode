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
      // Non-status items need only identity/ancestry for synthetic completion.
      // Their payload was already forwarded; terminalPayload never reads it.
      payload: STATUS_BEARING_ITEM_TYPES.has(event.itemType) ? event.payload : undefined,
    });
  }

  update(event: ItemUpdatedEvent): void {
    const item = this.open.get(event.itemId);
    if (item && STATUS_BEARING_ITEM_TYPES.has(item.itemType)) {
      item.payload = mergePayload(item.payload, event.payload);
    }
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

    const depths = itemDepths(this.open);
    const items = [...this.open.values()].sort(
      (left, right) => depths.get(right.itemId)! - depths.get(left.itemId)!,
    );
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

/** Resolve the parent graph once, retaining the released cycle-depth semantics. */
function itemDepths(open: ReadonlyMap<string, OpenForwardedItem>): Map<string, number> {
  const depths = new Map<string, number>();
  const cycleNodes = new Set<string>();
  for (const item of open.values()) {
    if (depths.has(item.itemId)) continue;
    const path: string[] = [];
    const positions = new Map<string, number>();
    let id: string | undefined = item.itemId;
    while (
      id !== undefined &&
      (path.length === 0 || id !== "") &&
      open.has(id) &&
      !depths.has(id) &&
      !positions.has(id)
    ) {
      positions.set(id, path.length);
      path.push(id);
      id = open.get(id)!.parentItemId;
    }
    const cycleStart = id ? positions.get(id) : undefined;
    let base: number;
    if (cycleStart !== undefined) {
      // The old parent walk counts each cycle node once, including self loops.
      base = path.length - cycleStart;
      for (let index = cycleStart; index < path.length; index += 1) {
        depths.set(path[index]!, base);
        cycleNodes.add(path[index]!);
      }
      path.length = cycleStart;
      base -= 1;
    } else {
      // A missing/closed parent leaves its immediate child at depth zero.
      base = id && depths.has(id) ? depths.get(id)! - (cycleNodes.has(id) ? 1 : 0) : -1;
    }
    for (let index = path.length - 1; index >= 0; index -= 1) {
      depths.set(path[index]!, ++base);
    }
  }
  return depths;
}
