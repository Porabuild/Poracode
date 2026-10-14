import type { RuntimeEvent } from "./contracts";

/** High-volume supervisor streams currently needed by local or remote views. */
export interface LiveEventInterests {
  readonly terminalThreadIds: readonly string[];
  readonly runtimeThreadIds: readonly string[];
  readonly allRuntimeEvents: boolean;
}

/** Runtime events whose durable payload can be loaded later instead of streamed live. */
export function isBulkRuntimeContentEvent(event: RuntimeEvent): boolean {
  switch (event.type) {
    case "item.started":
    case "item.updated":
    case "item.completed":
    case "content.delta":
      return true;
    default:
      return false;
  }
}

export function filterRuntimeEventsForLiveInterest(
  events: readonly RuntimeEvent[],
  wanted: boolean,
): readonly RuntimeEvent[] {
  if (wanted) return events;
  const kept = events.filter((event) => !isBulkRuntimeContentEvent(event));
  return kept.length === events.length ? events : kept;
}
