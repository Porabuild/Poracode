import type { RuntimeEvent } from "@/shared/contracts";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { ALL_TAXONOMY_CASES } from "./catalog";
import { CROSSAGENT_STATE_CASES } from "./delegation";
import { REQUEST_CASES } from "./requests";

export function createToolTaxonomyReplay(
  threadId = "taxonomy-thread",
  repetition = 0,
): RuntimeEvent[] {
  if (!Number.isSafeInteger(repetition) || repetition < 0)
    throw new Error("Invalid taxonomy repetition");
  const prefix = `taxonomy:${repetition}:`;
  const events: RuntimeEvent[] = [{ type: "turn.started", threadId, turnId: `${prefix}turn` }];
  for (const { item } of [...ALL_TAXONOMY_CASES, ...CROSSAGENT_STATE_CASES]) {
    const itemId = prefix + item.id;
    events.push({
      type: "item.started",
      threadId,
      itemId,
      itemType: item.type,
      payload: structuredClone(item.payload),
      ...(item.parentItemId ? { parentItemId: prefix + item.parentItemId } : {}),
    });
    for (const [stream, delta] of Object.entries(item.streams))
      events.push({
        type: "content.delta",
        threadId,
        itemId,
        stream: stream as keyof RuntimeChatItem["streams"],
        delta,
      });
    if (item.state === "completed") events.push({ type: "item.completed", threadId, itemId });
  }
  for (const request of REQUEST_CASES) {
    const requestId = prefix + request.id;
    events.push(
      {
        type: "request.opened",
        threadId,
        requestId,
        requestType: request.requestType,
        payload: structuredClone(request.payload),
      },
      {
        type: "request.resolved",
        threadId,
        requestId,
        outcome: request.requestType === "tool_user_input" ? "answered" : "declined",
      },
    );
  }
  events.push(
    {
      type: "background_tasks.changed",
      threadId,
      tasks: [
        { taskId: `${prefix}bg-command`, kind: "command", description: "fixture watcher" },
        { taskId: `${prefix}bg-other`, kind: "other", description: "fixture detached job" },
      ],
    },
    { type: "background_tasks.changed", threadId, tasks: [] },
    { type: "turn.completed", threadId, turnId: `${prefix}turn`, state: "completed" },
  );
  return events;
}
