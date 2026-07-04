import type { ApnsConfig } from "./config";
import type { PushRequest } from "./validate";

/**
 * Build the APNs request headers for a push. Pure — no auth token here; the
 * transport adds `authorization` so the signed JWT stays out of this seam.
 */
export function buildApnsHeaders(config: ApnsConfig, req: PushRequest): Record<string, string> {
  const topic =
    req.pushType === "liveactivity" ? `${config.topic}.push-type.liveactivity` : config.topic;

  const headers: Record<string, string> = {
    "apns-topic": topic,
    "apns-push-type": req.pushType,
    "apns-priority": String(req.priority ?? (req.pushType === "liveactivity" ? 5 : 10)),
  };

  if (req.expiration !== undefined) headers["apns-expiration"] = String(req.expiration);
  if (req.collapseId !== undefined) headers["apns-collapse-id"] = req.collapseId;

  return headers;
}

/** Parse the `reason` field APNs returns in its JSON error body, if any. */
export function parseApnsReason(body: string): string | undefined {
  if (!body) return undefined;
  try {
    const parsed = JSON.parse(body) as { reason?: unknown };
    return typeof parsed.reason === "string" ? parsed.reason : undefined;
  } catch {
    return undefined;
  }
}
