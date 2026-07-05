import type { CanonicalRequestType, RequestPayload, RuntimeEvent } from "@/shared/contracts";
import {
  canonicalRequestTypeSchema,
  requestPayloadSchema,
  runtimeEventSchema,
} from "@/shared/contracts";
import type { PersistedRuntimeItem } from "@/shared/ipc/schemas";

export interface OpenRuntimeRequestPreview {
  readonly requestId: string;
  readonly requestType: CanonicalRequestType;
  readonly payload: RequestPayload;
  readonly receivedAt: string;
}

function normalizeRequestType(raw: unknown): CanonicalRequestType {
  const parsed = canonicalRequestTypeSchema.safeParse(raw);
  return parsed.success ? parsed.data : "tool_call_approval";
}

function requestFromLegacyItem(item: PersistedRuntimeItem): OpenRuntimeRequestPreview | null {
  if (!item.type.includes("request") || item.state === "completed") return null;
  const payload = item.payload;
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const requestId = record.requestId;
  const requestPayload = record.payload;
  if (
    (typeof requestId !== "string" && typeof requestId !== "number") ||
    requestPayload === undefined
  ) {
    return null;
  }
  const parsedPayload = requestPayloadSchema.safeParse(requestPayload);
  if (!parsedPayload.success) return null;
  return {
    requestId: String(requestId),
    requestType: normalizeRequestType(record.requestType),
    payload: parsedPayload.data,
    receivedAt: new Date().toISOString(),
  };
}

export function requestsFromRuntimeItems(
  items: readonly PersistedRuntimeItem[],
): OpenRuntimeRequestPreview[] {
  const requests = items
    .map((item) => requestFromLegacyItem(item))
    .filter((request): request is OpenRuntimeRequestPreview => request !== null);
  const ordered = new Map<string, OpenRuntimeRequestPreview>();
  for (const request of requests) {
    ordered.set(request.requestId, request);
  }
  return [...ordered.values()];
}

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
