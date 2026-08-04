import { NextResponse, type NextRequest } from "next/server";
import { ApnsUnreachableError, sendToApns } from "@/lib/push/apns";
import { getApnsConfig, getFcmConfig, getWebPushConfig } from "@/lib/push/config";
import { FcmUnreachableError, sendToFcm } from "@/lib/push/fcm";
import { ipLimiter, tokenLimiter } from "@/lib/push/rateLimit";
import {
  parsePushRequest,
  type AndroidPushRequest,
  type IosPushRequest,
  type WebPushRequest,
} from "@/lib/push/validate";
import { sendToWebPush } from "@/lib/push/webPush";

// http2 (node:http2) is unavailable on the edge runtime — force Node.js.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hard cap the raw request body before parsing so a giant payload can't burn
// memory. The real payload limit (4 KB) is enforced post-parse in validation.
const MAX_BODY_BYTES = 8 * 1024;

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip")?.trim() ?? "unknown";
}

export async function POST(request: NextRequest) {
  // Per-IP limit first — cheapest gate, protects before we read the body.
  if (!ipLimiter.hit(clientIp(request))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = parsePushRequest(json);
  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid_request", detail: parsed.error }, { status: 400 });
  }

  const deliveryKey =
    parsed.value.platform === "web" ? parsed.value.subscription.endpoint : parsed.value.token;
  if (!tokenLimiter.hit(deliveryKey)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // Config is resolved per-platform so an iOS-only (or Android-only) deployment
  // keeps serving its platform without the other provider's env being present.
  switch (parsed.value.platform) {
    case "android":
      return handleAndroid(parsed.value);
    case "web":
      return handleWeb(parsed.value);
    case "ios":
      return handleIos(parsed.value);
  }
}

async function handleIos(req: IosPushRequest) {
  const config = getApnsConfig();
  if (!config) {
    return NextResponse.json({ error: "gateway_not_configured" }, { status: 503 });
  }

  try {
    const result = await sendToApns(config, req);
    return NextResponse.json(
      {
        status: result.status,
        ...(result.apnsId ? { apnsId: result.apnsId } : {}),
        ...(result.reason ? { reason: result.reason } : {}),
      },
      // Relay APNs' status so the desktop can prune tokens on 410, back off on 429, etc.
      { status: result.status || 502 },
    );
  } catch (err) {
    if (err instanceof ApnsUnreachableError) {
      return NextResponse.json({ error: "apns_unreachable" }, { status: 502 });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

async function handleAndroid(req: AndroidPushRequest) {
  const config = getFcmConfig();
  if (!config) {
    return NextResponse.json({ error: "gateway_not_configured" }, { status: 503 });
  }

  try {
    const result = await sendToFcm(config, req);
    return NextResponse.json(
      {
        status: result.status,
        ...(result.messageId ? { messageId: result.messageId } : {}),
        ...(result.reason ? { reason: result.reason } : {}),
      },
      // Relay FCM's mapped status so the desktop prunes on 410, backs off on 429, etc.
      { status: result.status || 502 },
    );
  } catch (err) {
    if (err instanceof FcmUnreachableError) {
      return NextResponse.json({ error: "fcm_unreachable" }, { status: 502 });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

async function handleWeb(req: WebPushRequest) {
  const config = getWebPushConfig();
  if (!config) {
    return NextResponse.json({ error: "gateway_not_configured" }, { status: 503 });
  }

  try {
    const result = await sendToWebPush(config, req);
    return NextResponse.json(
      { status: result.status, ...(result.reason ? { reason: result.reason } : {}) },
      { status: result.status || 502 },
    );
  } catch {
    return NextResponse.json({ error: "web_push_unreachable" }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  if (!ipLimiter.hit(clientIp(request))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const config = getWebPushConfig();
  if (!config) {
    return NextResponse.json({ error: "gateway_not_configured" }, { status: 503 });
  }
  return NextResponse.json(
    { publicKey: config.publicKey },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}

const methodNotAllowed = () =>
  NextResponse.json(
    { error: "method_not_allowed" },
    { status: 405, headers: { Allow: "GET, POST" } },
  );

export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const HEAD = methodNotAllowed;
