import type { RuntimeEvent } from "@/shared/contracts";
import { newItemId } from "../contextUsage";
import type { V2Event } from "./clientTypes";

/** Compaction is a session operation, independent of assistant message IDs. */
export class OpenCode2Compaction {
  private itemId: string | undefined;
  constructor(private readonly threadId: string) {}

  map(event: V2Event): RuntimeEvent[] | undefined {
    switch (event.type) {
      case "session.compaction.started": {
        this.itemId = newItemId("compact");
        return [
          {
            type: "item.started",
            threadId: this.threadId,
            itemId: this.itemId,
            itemType: "tool_call",
            payload: { name: "compact", status: "running", args: { reason: event.data.reason } },
          },
        ];
      }
      case "session.compaction.delta":
        return [];
      case "session.compaction.ended":
        return this.finish("success", event.data.text);
      case "session.compaction.failed":
        return this.finish("error", event.data.error.message);
      default:
        return undefined;
    }
  }

  close(): RuntimeEvent[] {
    return this.finish("error");
  }

  private finish(status: "success" | "error", result?: string): RuntimeEvent[] {
    const itemId = this.itemId;
    this.itemId = undefined;
    if (!itemId) return [];
    return [
      {
        type: "item.completed",
        threadId: this.threadId,
        itemId,
        payload: { name: "compact", status, ...(result ? { result } : {}) },
      },
    ];
  }
}
