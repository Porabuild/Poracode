import { BACKEND_RENDERER_STREAM_VERSION } from "./backendHostProtocol";

/**
 * Bounded large-reply transfer for the direct renderer stream (Phase 3 item 6,
 * stream 6). Portable framing only: TextEncoder + string ops, no Node-only
 * imports, so a future client worker can reuse it unchanged.
 *
 * Accounting note: the delivery account counts retained *serialized* UTF-8
 * bytes (the full JSON.stringify(data) kept during transfer). Transient
 * encoded frame copies, JS object representation overhead, and process RSS are
 * separately bounded/documented, not part of this account.
 */

export const LARGE_REPLY_MAX_LOGICAL_BYTES = 64 * 1024 * 1024;
export const LARGE_REPLY_MAX_ENCODED_FRAME_BYTES = 64 * 1024;
export const LARGE_REPLY_MAX_UNACKED_CHUNKS = 2;
export const LARGE_REPLY_MAX_UNACKED_BYTES = 128 * 1024;
export const LARGE_REPLY_MAX_PER_CLIENT = 2;
export const LARGE_REPLY_MAX_BYTES_PER_CLIENT = 64 * 1024 * 1024;
export const LARGE_REPLY_MAX_GLOBAL = 4;
export const LARGE_REPLY_MAX_BYTES_GLOBAL = 128 * 1024 * 1024;
/** Global outstanding direct handlers, including cancelled-but-unsettled and
 * orphaned work after socket loss. Separate from delivery accounts. */
export const DIRECT_HANDLER_MAX_GLOBAL = 128;
/** Receiver stops crediting -> bounded abort, socket survives, ownership kept. */
export const LARGE_REPLY_CREDIT_TIMEOUT_MS = 30_000;
/** Whole-transfer deadline mirrors the 10-minute request timeout. */
export const LARGE_REPLY_TRANSFER_TIMEOUT_MS = 10 * 60 * 1000;

export type ReplyStartFrame = {
  version: typeof BACKEND_RENDERER_STREAM_VERSION;
  type: "reply-start";
  id: string;
  totalBytes: number;
};

export type ReplyChunkFrame = {
  version: typeof BACKEND_RENDERER_STREAM_VERSION;
  type: "reply-chunk";
  id: string;
  seq: number;
  data: string;
};

export type ReplyEndFrame = {
  version: typeof BACKEND_RENDERER_STREAM_VERSION;
  type: "reply-end";
  id: string;
  totalBytes: number;
};

export type ReplyAbortFrame = {
  version: typeof BACKEND_RENDERER_STREAM_VERSION;
  type: "reply-abort";
  id: string;
  error: string;
};

export type ReplyAckFrame = {
  version: typeof BACKEND_RENDERER_STREAM_VERSION;
  type: "reply-ack";
  id: string;
  seq: number;
};

export type RequestCancelFrame = {
  version: typeof BACKEND_RENDERER_STREAM_VERSION;
  type: "request-cancel";
  id: string;
};

export type LargeReplyBackendFrame =
  | ReplyStartFrame
  | ReplyChunkFrame
  | ReplyEndFrame
  | ReplyAbortFrame;

export type LargeReplyClientFrame = ReplyAckFrame | RequestCancelFrame;

const encoder = new TextEncoder();

/** UTF-8 bytes of a JS string. Portable (no Buffer). */
export function utf8ByteLength(value: string): number {
  return encoder.encode(value).length;
}

/** Complete encoded wire bytes of a frame object. */
export function encodedFrameByteLength(frame: unknown): number {
  return encoder.encode(JSON.stringify(frame)).length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFrameId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512;
}

function isTotalBytes(value: unknown): value is number {
  // Accept any positive safe integer here so oversized totals reach the
  // bounded rejection path (cancel + bounded error, socket alive) instead of
  // hanging the caller until timeout. The 64MiB bound is enforced in the
  // transfer state machines on both ends.
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isSeq(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function isReplyStartFrame(value: unknown): value is ReplyStartFrame {
  if (!isRecord(value)) return false;
  return (
    value.version === BACKEND_RENDERER_STREAM_VERSION &&
    value.type === "reply-start" &&
    isFrameId(value.id) &&
    isTotalBytes(value.totalBytes)
  );
}

export function isReplyChunkFrame(value: unknown): value is ReplyChunkFrame {
  if (!isRecord(value)) return false;
  return (
    value.version === BACKEND_RENDERER_STREAM_VERSION &&
    value.type === "reply-chunk" &&
    isFrameId(value.id) &&
    isSeq(value.seq) &&
    typeof value.data === "string"
  );
}

export function isReplyEndFrame(value: unknown): value is ReplyEndFrame {
  if (!isRecord(value)) return false;
  return (
    value.version === BACKEND_RENDERER_STREAM_VERSION &&
    value.type === "reply-end" &&
    isFrameId(value.id) &&
    isTotalBytes(value.totalBytes)
  );
}

export function isReplyAbortFrame(value: unknown): value is ReplyAbortFrame {
  if (!isRecord(value)) return false;
  return (
    value.version === BACKEND_RENDERER_STREAM_VERSION &&
    value.type === "reply-abort" &&
    isFrameId(value.id) &&
    typeof value.error === "string" &&
    value.error.length > 0 &&
    value.error.length <= 4096
  );
}

export function isReplyAckFrame(value: unknown): value is ReplyAckFrame {
  if (!isRecord(value)) return false;
  return (
    value.version === BACKEND_RENDERER_STREAM_VERSION &&
    value.type === "reply-ack" &&
    isFrameId(value.id) &&
    isSeq(value.seq)
  );
}

export function isRequestCancelFrame(value: unknown): value is RequestCancelFrame {
  if (!isRecord(value)) return false;
  return (
    value.version === BACKEND_RENDERER_STREAM_VERSION &&
    value.type === "request-cancel" &&
    isFrameId(value.id)
  );
}

/** True for any v6 large-reply frame in either direction. */
export function isLargeReplyFrame(
  value: unknown,
): value is LargeReplyBackendFrame | LargeReplyClientFrame {
  return (
    isReplyStartFrame(value) ||
    isReplyChunkFrame(value) ||
    isReplyEndFrame(value) ||
    isReplyAbortFrame(value) ||
    isReplyAckFrame(value) ||
    isRequestCancelFrame(value)
  );
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/**
 * Largest end index > startIndex such that the complete encoded
 * `reply-chunk` frame fits `LARGE_REPLY_MAX_ENCODED_FRAME_BYTES`. The slice
 * owns exactly its logical characters (new string, no backing view) and never
 * splits a surrogate pair. Returns startIndex when even one character cannot
 * fit (unreachable for real frames: one escaped code unit is far below 64KiB).
 */
export function sliceChunkForFrame(
  serialized: string,
  startIndex: number,
  id: string,
  seq: number,
): { endIndex: number; frame: ReplyChunkFrame } {
  const remaining = serialized.length - startIndex;
  if (remaining <= 0) {
    throw new Error("sliceChunkForFrame: startIndex past end.");
  }
  // Upper guess keeps typical JSON (quotes escaped ~2x) near the 64KiB wire
  // bound while staying cheap to measure; worst-case 6x-escaped control runs
  // shrink below. 8K code units always fit (8K*6=48K < 64K).
  let length = Math.min(remaining, 48 * 1024);
  let frame: ReplyChunkFrame = {
    version: BACKEND_RENDERER_STREAM_VERSION,
    type: "reply-chunk",
    id,
    seq,
    data: "",
  };
  while (length > 0) {
    let endIndex = startIndex + length;
    // Never split a surrogate pair: back off one unit when the cut lands
    // between a high and low surrogate. The pair then travels together in the
    // next chunk; concatenation restores the exact original code points.
    if (
      endIndex < serialized.length &&
      isHighSurrogate(serialized.charCodeAt(endIndex - 1)) &&
      isLowSurrogate(serialized.charCodeAt(endIndex))
    ) {
      endIndex -= 1;
      length = endIndex - startIndex;
      if (length <= 0) continue;
    }
    frame = {
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "reply-chunk",
      id,
      seq,
      data: serialized.slice(startIndex, endIndex),
    };
    if (encodedFrameByteLength(frame) <= LARGE_REPLY_MAX_ENCODED_FRAME_BYTES) {
      return { endIndex, frame };
    }
    length = Math.floor(length / 2);
  }
  // Single-character fallback: proves the bound even for pathological input.
  const singleEnd = startIndex + 1;
  frame = {
    version: BACKEND_RENDERER_STREAM_VERSION,
    type: "reply-chunk",
    id,
    seq,
    data: serialized.slice(startIndex, singleEnd),
  };
  if (encodedFrameByteLength(frame) > LARGE_REPLY_MAX_ENCODED_FRAME_BYTES) {
    throw new Error("reply-chunk frame cannot fit a single character.");
  }
  return { endIndex: singleEnd, frame };
}
