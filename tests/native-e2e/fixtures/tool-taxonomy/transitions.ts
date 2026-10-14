import type { RuntimeEvent } from "@/shared/contracts";
import { imageDataUrl } from "./media-assets";

const png = imageDataUrl("png");

/** Ordered canonical updates for a consumer to replay one event at a time. */
export const NORMALIZED_TRANSITIONS: readonly { id: string; events: readonly RuntimeEvent[] }[] = [
  ...(["tool_call", "mcp_tool_call", "dynamic_tool_call", "image_view"] as const).map(
    (itemType) => ({
      id: `media-transition:${itemType}`,
      events: [
        {
          type: "item.started" as const,
          threadId: "transition-thread",
          itemId: "neighbor",
          itemType: "tool_call" as const,
          payload: { name: "Read", status: "success", kind: "read" },
        },
        { type: "item.completed" as const, threadId: "transition-thread", itemId: "neighbor" },
        {
          type: "item.started" as const,
          threadId: "transition-thread",
          itemId: "image",
          itemType,
          payload: { name: "FixtureImage", status: "running" },
        },
        {
          type: "item.updated" as const,
          threadId: "transition-thread",
          itemId: "image",
          payload: { images: [png], status: "success" },
        },
        { type: "item.completed" as const, threadId: "transition-thread", itemId: "image" },
      ],
    }),
  ),
  {
    id: "late-question-name",
    events: [
      {
        type: "item.started",
        threadId: "transition-thread",
        itemId: "late",
        itemType: "tool_call",
        payload: { name: "", status: "running" },
      },
      {
        type: "item.updated",
        threadId: "transition-thread",
        itemId: "late",
        payload: { name: "AskUser", title: "Choose fixture option" },
      },
      {
        type: "item.completed",
        threadId: "transition-thread",
        itemId: "late",
        payload: { status: "success" },
      },
    ],
  },
  ...(["accepted", "declined", "answered", "cancelled"] as const).map((outcome) => ({
    id: `request-outcome:${outcome}`,
    events: [
      {
        type: "request.opened" as const,
        threadId: "transition-thread",
        requestId: `request-${outcome}`,
        requestType:
          outcome === "answered" ? ("tool_user_input" as const) : ("tool_call_approval" as const),
        payload: {
          summary: "Synthetic request; no execution",
          options: [
            { optionId: "allow_once", label: "Allow once" },
            { optionId: "deny", label: "Deny" },
          ],
        },
      },
      {
        type: "request.resolved" as const,
        threadId: "transition-thread",
        requestId: `request-${outcome}`,
        outcome,
      },
    ],
  })),
  {
    id: "background-replacement",
    events: [
      {
        type: "background_tasks.changed",
        threadId: "transition-thread",
        tasks: [
          { taskId: "bg-command", kind: "command", description: "fixture watcher" },
          { taskId: "bg-other", kind: "other", description: "fixture job" },
        ],
      },
      {
        type: "background_tasks.changed",
        threadId: "transition-thread",
        tasks: [{ taskId: "bg-other", kind: "other", description: "fixture job update" }],
      },
      { type: "background_tasks.changed", threadId: "transition-thread", tasks: [] },
    ],
  },
];
