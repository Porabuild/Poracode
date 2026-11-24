import type { RuntimeEvent } from "@/shared/contracts";
import { newItemId } from "../contextUsage";
import type { V2Event } from "./clientTypes";

/** Tool name the shared chat pane renders as a context-compaction row. */
const COMPACTION_ROW_NAME = "ContextCompaction";
/**
 * A compaction that did not finish stays an ordinary failed tool row: the
 * compacted row cannot show a failure, and this name is not one it recognizes.
 */
const COMPACTION_FAILED_ROW_NAME = "Compaction failed";

/** Compaction is a session operation, independent of assistant message IDs. */
export class OpenCodeCompaction {
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
            // `trigger` is the metadata key the shared compaction row reads.
            payload: {
              name: COMPACTION_ROW_NAME,
              status: "running",
              args: { trigger: event.data.reason },
            },
          },
        ];
      }
      case "session.compaction.delta":
        return [];
      case "session.compaction.ended":
        return this.finish("success", event.data.reason, event.data.text);
      case "session.compaction.failed":
        return this.finish("error", event.data.reason, event.data.error.message);
      default:
        return undefined;
    }
  }

  close(): RuntimeEvent[] {
    return this.finish("error");
  }

  /** `result` is the summary text of a finished compaction, or why one did not finish. */
  private finish(status: "success" | "error", trigger?: string, result?: string): RuntimeEvent[] {
    const itemId = this.itemId;
    this.itemId = undefined;
    if (!itemId) return [];
    return [
      {
        type: "item.completed",
        threadId: this.threadId,
        itemId,
        payload: {
          name: status === "success" ? COMPACTION_ROW_NAME : COMPACTION_FAILED_ROW_NAME,
          status,
          ...(trigger ? { args: { trigger } } : {}),
          ...(result ? { result } : {}),
        },
      },
    ];
  }
}
