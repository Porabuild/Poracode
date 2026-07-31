import webPush, { WebPushError, type PushSubscription } from "web-push";
import type { WebPushConfig } from "./config";
import type { WebPushRequest } from "./validate";

export interface WebPushResult {
  status: number;
  reason?: string;
}

/**
 * Encrypt and send one standards-based Web Push message. VAPID details are
 * passed per request rather than installed as mutable process-global state.
 */
export async function sendToWebPush(
  config: WebPushConfig,
  request: WebPushRequest,
): Promise<WebPushResult> {
  try {
    const response = await webPush.sendNotification(
      request.subscription as PushSubscription,
      JSON.stringify(request.payload),
      {
        vapidDetails: {
          subject: config.subject,
          publicKey: config.publicKey,
          privateKey: config.privateKey,
        },
        TTL:
          request.expiration === undefined
            ? 60 * 60
            : Math.max(0, request.expiration - Math.floor(Date.now() / 1000)),
        urgency: request.priority === 5 ? "low" : "high",
        ...(request.collapseId ? { topic: request.collapseId } : {}),
      },
    );
    return { status: response.statusCode || 201 };
  } catch (error) {
    if (error instanceof WebPushError) {
      return {
        status: error.statusCode || 502,
        ...(error.body ? { reason: String(error.body).slice(0, 256) } : {}),
      };
    }
    throw error;
  }
}
