import { tryParseSocketMessage } from "@/shared/remote/parseSocketMessage";
import {
  parseDesktopLoopbackFrame,
  type DesktopLoopbackFrame,
} from "@/renderer/state/remoteServers/desktopLoopbackFrames";

export type DecodeFrameResult = { ok: true; message: unknown } | { ok: false; error: "invalid" };

export type DesktopFrameDecodeResult =
  | { ok: true; frame: DesktopLoopbackFrame }
  | { ok: false; error: "invalid" };

export type JsonParseResult = { ok: true; value: unknown } | { ok: false; error: "invalid" };
export type JsonStringifyResult = { ok: true; json: string } | { ok: false; error: "invalid" };

export function decodeRemoteSocketFrame(raw: string): DecodeFrameResult {
  const message = tryParseSocketMessage(raw);
  if (!message) return { ok: false, error: "invalid" };
  return { ok: true, message };
}

/**
 * A3: decode one private managed-loopback frame with the loopback-only
 * validator (`parseDesktopLoopbackFrame`). This is the worker half of the
 * managed leg; the public remote wire schema is deliberately not involved, so
 * a private vocabulary change can never widen or weaken what paired clients
 * accept.
 */
export function decodeDesktopFrame(raw: string): DesktopFrameDecodeResult {
  const frame = parseDesktopLoopbackFrame(raw);
  return frame.kind === "invalid" ? { ok: false, error: "invalid" } : { ok: true, frame };
}

/**
 * A3 byte accounting: the measured size of a raw frame, carried alongside the
 * decode instead of re-serializing the decoded event. `String#length` counts
 * UTF-16 code units, so `× 2` is a conservative uppercase bound of the UTF-8
 * bytes the frame can occupy; budgets only need a bound, not an exact size.
 */
export function measuredRawBytes(charLength: number): number {
  return charLength * 2;
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
