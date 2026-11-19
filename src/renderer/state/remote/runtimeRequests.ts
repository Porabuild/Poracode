import { runtimeEventSchema } from "@/shared/contracts";
import type { RuntimeEvent } from "@/shared/contracts";

export {
  requestsFromRuntimeItems,
  type OpenRuntimeRequestPreview,
} from "@/shared/runtimeRequestPreview";

export function collectRuntimeEventsFromSupervisoryMessage(value: unknown): Array<{
  readonly threadId: string;
  readonly events: readonly RuntimeEvent[];
}> {
  if (!value || typeof value !== "object") {
    return [];
  }
  const event = value as Record<string, unknown>;
  const threadId = (candidate: unknown) => (typeof candidate === "string" ? candidate : undefined);

  if (event.type === "thread-runtime-event") {
    const parsedThreadId = threadId(event.threadId);
    const parsed = runtimeEventSchema.safeParse(event.event);
    if (!parsedThreadId || !parsed.success) return [];
    return [{ threadId: parsedThreadId, events: [parsed.data] }];
  }

  if (event.type === "thread-runtime-events") {
    const parsedThreadId = threadId(event.threadId);
    if (!Array.isArray(event.events) || !parsedThreadId) return [];
    const parsedEvents = event.events
      .map((candidate) => runtimeEventSchema.safeParse(candidate))
      .flatMap((candidate) => (candidate.success ? [candidate.data] : []));
    return parsedEvents.length === 0 ? [] : [{ threadId: parsedThreadId, events: parsedEvents }];
  }

  if (event.type === "thread-runtime-events-multi") {
    const batches = Array.isArray(event.batches) ? event.batches : [];
    const results: Array<{ readonly threadId: string; readonly events: readonly RuntimeEvent[] }> =
      [];
    for (const batch of batches) {
      if (!batch || typeof batch !== "object") continue;
      const batchRecord = batch as Record<string, unknown>;
      const parsedThreadId = threadId(batchRecord.threadId);
      const rawEvents = Array.isArray(batchRecord.events) ? batchRecord.events : [];
      if (!parsedThreadId || rawEvents.length === 0) continue;
      const parsedEvents = rawEvents
        .map((candidate) => runtimeEventSchema.safeParse(candidate))
        .flatMap((candidate) => (candidate.success ? [candidate.data] : []));
      if (parsedEvents.length > 0) {
        results.push({ threadId: parsedThreadId, events: parsedEvents });
      }
    }
    return results;
  }

  return [];
}
