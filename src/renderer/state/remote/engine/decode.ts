import { tryParseSocketMessage } from "@/shared/remote/parseSocketMessage";

export type DecodeFrameResult = { ok: true; message: unknown } | { ok: false; error: "invalid" };

export type JsonParseResult = { ok: true; value: unknown } | { ok: false; error: "invalid" };
export type JsonStringifyResult = { ok: true; json: string } | { ok: false; error: "invalid" };

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
