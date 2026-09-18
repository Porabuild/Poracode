import {
  BACKEND_RENDERER_STREAM_VERSION,
  type BackendRendererReply,
  type RendererStreamOwnershipClaim,
} from "@/shared/backendHostProtocol";
import type { SupervisorEvent } from "@/shared/ipc";
import { tryParseSocketMessage } from "@/shared/remote/parseSocketMessage";

export type DecodeFrameResult = { ok: true; message: unknown } | { ok: false; error: "invalid" };

export type JsonParseResult = { ok: true; value: unknown } | { ok: false; error: "invalid" };
export type JsonStringifyResult = { ok: true; json: string } | { ok: false; error: "invalid" };

export type BackendRendererMessage =
  | BackendRendererReply
  | {
      version: typeof BACKEND_RENDERER_STREAM_VERSION;
      type: "hello";
      latestSeq: number;
    }
  | {
      version: typeof BACKEND_RENDERER_STREAM_VERSION;
      type: "interests-ack";
      latestSeq: number;
      /** Present exactly when the backend activated the ownership handoff. */
      ownership?: RendererStreamOwnershipClaim;
    }
  | {
      version: typeof BACKEND_RENDERER_STREAM_VERSION;
      type: "resync-required";
      latestSeq: number;
      /**
       * Loss scope hint from the host (WS6 P1-10): threads whose events are
       * unrecoverable by replay. Absent or empty keeps the legacy meaning —
       * rebuild every subscribed thread; the host cannot always attribute a
       * gap to specific threads. A present list narrows the rebuild to the
       * intersection with this window's subscriptions only.
       */
      threadIds?: string[];
    }
  | {
      version: typeof BACKEND_RENDERER_STREAM_VERSION;
      type: "event";
      seq: number;
      event: SupervisorEvent;
    };

const LARGE_REPLY_FRAME_TYPES = new Set(["reply-start", "reply-chunk", "reply-end", "reply-abort"]);

export function decodeBackendRendererFrame(raw: string): DecodeFrameResult {
  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return { ok: false, error: "invalid" };
  }
  if (isBackendRendererTopLevelFrame(message)) return { ok: true, message };
  return { ok: false, error: "invalid" };
}

export function decodeRemoteSocketFrame(raw: string): DecodeFrameResult {
  const message = tryParseSocketMessage(raw);
  if (!message) return { ok: false, error: "invalid" };
  return { ok: true, message };
}

export function parseJsonValue(raw: string): JsonParseResult {
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false, error: "invalid" };
  }
}

export function stringifyJsonValue(value: unknown): JsonStringifyResult {
  try {
    const json = JSON.stringify(value);
    if (typeof json !== "string") return { ok: false, error: "invalid" };
    return { ok: true, json };
  } catch {
    return { ok: false, error: "invalid" };
  }
}

export function isBackendRendererMessage(value: unknown): value is BackendRendererMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  if (message.version !== BACKEND_RENDERER_STREAM_VERSION || typeof message.type !== "string") {
    return false;
  }
  if (message.type === "reply") {
    return (
      typeof message.id === "string" &&
      typeof message.ok === "boolean" &&
      (message.ok || typeof message.error === "string")
    );
  }
  if (message.type === "event") {
    return (
      typeof message.seq === "number" &&
      typeof message.event === "object" &&
      message.event !== null &&
      typeof (message.event as { type?: unknown }).type === "string"
    );
  }
  if (message.type === "resync-required") {
    if (typeof message.latestSeq !== "number") return false;
    return (
      message.threadIds === undefined ||
      (Array.isArray(message.threadIds) &&
        message.threadIds.every((threadId) => typeof threadId === "string"))
    );
  }
  if (message.type === "hello") {
    return typeof message.latestSeq === "number";
  }
  return (
    message.type === "interests-ack" &&
    typeof message.latestSeq === "number" &&
    (message.ownership === undefined || isOwnershipClaim(message.ownership))
  );
}

function isBackendRendererTopLevelFrame(value: unknown): boolean {
  if (isBackendRendererMessage(value)) return true;
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  return (
    message.version === BACKEND_RENDERER_STREAM_VERSION &&
    typeof message.type === "string" &&
    LARGE_REPLY_FRAME_TYPES.has(message.type)
  );
}

function isOwnershipClaim(value: unknown): value is RendererStreamOwnershipClaim {
  if (typeof value !== "object" || value === null) return false;
  const claim = value as Record<string, unknown>;
  return (
    typeof claim.windowId === "number" &&
    Number.isSafeInteger(claim.windowId) &&
    claim.windowId > 0 &&
    typeof claim.generation === "number" &&
    Number.isSafeInteger(claim.generation) &&
    claim.generation > 0
  );
}
