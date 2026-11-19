import { canonicalRequestTypeSchema, requestPayloadSchema } from "./contracts";
import type { CanonicalRequestType, RequestPayload } from "./contracts";
import type { PersistedRuntimeItem } from "./ipc/schemas";

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

type RequestItem = Pick<PersistedRuntimeItem, "type" | "state" | "payload">;

function requestFromLegacyItem(item: RequestItem): OpenRuntimeRequestPreview | null {
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
  items: readonly RequestItem[],
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
