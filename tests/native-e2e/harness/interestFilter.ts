/**
 * Matches production item-interest filtering: events are emptied, never dropped,
 * so reconnect replay stays contiguous.
 */
export function filterEventForItemInterests(
  event: Record<string, unknown>,
  interests: ReadonlySet<string> | null,
): Record<string, unknown> {
  if (!interests) return event;
  switch (event.type) {
    case "thread-runtime-event": {
      const threadId = String(event.threadId ?? "");
      if (interests.has(threadId) || !isBulkRuntimeContent(event.event)) return event;
      return { type: "thread-runtime-events", threadId, events: [] };
    }
    case "thread-runtime-events": {
      const threadId = String(event.threadId ?? "");
      if (interests.has(threadId)) return event;
      return { ...event, events: [] };
    }
    case "thread-runtime-events-multi": {
      const batches = Array.isArray(event.batches) ? event.batches : [];
      return {
        ...event,
        batches: batches.map((batch) => {
          if (!batch || typeof batch !== "object") return batch;
          const record = batch as Record<string, unknown>;
          const threadId = String(record.threadId ?? "");
          return interests.has(threadId) ? record : { ...record, events: [] };
        }),
      };
    }
    default:
      return event;
  }
}

function isBulkRuntimeContent(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === "item.started" ||
    type === "item.updated" ||
    type === "item.completed" ||
    type === "content.delta"
  );
}

export function recordRuntimeEventTypes(
  event: Record<string, unknown>,
  observe: (type: string) => void,
): void {
  switch (event.type) {
    case "thread-runtime-event": {
      const nested = event.event as { type?: unknown } | undefined;
      if (typeof nested?.type === "string") observe(nested.type);
      return;
    }
    case "thread-runtime-events": {
      const events = Array.isArray(event.events) ? event.events : [];
      for (const nested of events) {
        if (
          nested &&
          typeof nested === "object" &&
          typeof (nested as { type?: unknown }).type === "string"
        ) {
          observe((nested as { type: string }).type);
        }
      }
      return;
    }
    case "thread-runtime-events-multi": {
      const batches = Array.isArray(event.batches) ? event.batches : [];
      for (const batch of batches) {
        if (!batch || typeof batch !== "object") continue;
        const events = Array.isArray((batch as { events?: unknown }).events)
          ? (batch as { events: unknown[] }).events
          : [];
        for (const nested of events) {
          if (
            nested &&
            typeof nested === "object" &&
            typeof (nested as { type?: unknown }).type === "string"
          ) {
            observe((nested as { type: string }).type);
          }
        }
      }
    }
  }
}
