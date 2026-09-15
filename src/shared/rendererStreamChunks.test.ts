import { describe, expect, it } from "vitest";
import { BACKEND_RENDERER_STREAM_VERSION } from "./backendHostProtocol";
import {
  LARGE_REPLY_MAX_ENCODED_FRAME_BYTES,
  LARGE_REPLY_MAX_LOGICAL_BYTES,
  encodedFrameByteLength,
  isReplyAbortFrame,
  isReplyAckFrame,
  isReplyChunkFrame,
  isReplyEndFrame,
  isReplyStartFrame,
  isRequestCancelFrame,
  sliceChunkForFrame,
  utf8ByteLength,
} from "./rendererStreamChunks";

describe("rendererStreamChunks framing", () => {
  it("validates v6 frame shapes and rejects stale versions", () => {
    expect(
      isReplyStartFrame({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "reply-start",
        id: "a",
        totalBytes: 10,
      }),
    ).toBe(true);
    expect(isReplyStartFrame({ version: 5, type: "reply-start", id: "a", totalBytes: 10 })).toBe(
      false,
    );
    expect(
      isReplyChunkFrame({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "reply-chunk",
        id: "a",
        seq: 0,
        data: "x",
      }),
    ).toBe(true);
    expect(
      isReplyEndFrame({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "reply-end",
        id: "a",
        totalBytes: 10,
      }),
    ).toBe(true);
    expect(
      isReplyAbortFrame({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "reply-abort",
        id: "a",
        error: "boom",
      }),
    ).toBe(true);
    expect(
      isReplyAckFrame({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "reply-ack",
        id: "a",
        seq: 0,
      }),
    ).toBe(true);
    expect(
      isRequestCancelFrame({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "request-cancel",
        id: "a",
      }),
    ).toBe(true);
    expect(isReplyAckFrame({ version: 5, type: "reply-ack", id: "a", seq: 0 })).toBe(false);
  });

  it("keeps every sliced chunk frame within the 64KiB encoded bound", () => {
    const serialized = JSON.stringify({ text: "a".repeat(200_000) });
    let offset = 0;
    let seq = 0;
    let frames = 0;
    let wireBytes = 0;
    while (offset < serialized.length) {
      const { endIndex, frame } = sliceChunkForFrame(serialized, offset, "id-1", seq);
      expect(endIndex).toBeGreaterThan(offset);
      const bytes = encodedFrameByteLength(frame);
      expect(bytes).toBeLessThanOrEqual(LARGE_REPLY_MAX_ENCODED_FRAME_BYTES);
      wireBytes += bytes;
      offset = endIndex;
      seq += 1;
      frames += 1;
    }
    expect(frames).toBeGreaterThan(1);
    expect(offset).toBe(serialized.length);
    // Raw substrings, not base64: wire stays near logical plus envelope/escape.
    expect(wireBytes).toBeGreaterThan(utf8ByteLength(serialized));
    expect(wireBytes).toBeLessThan(utf8ByteLength(serialized) * 2 + frames * 1024);
  });

  it("proves Unicode, escaping, and surrogate-pair safety with measured overhead", () => {
    const data = {
      emoji: "😀".repeat(5_000),
      quotes: '"'.repeat(5_000),
      backslash: "\\".repeat(5_000),
      cjk: "漢".repeat(5_000),
      control: "\u0001".repeat(1_000),
    };
    const serialized = JSON.stringify(data);
    const parts: string[] = [];
    let offset = 0;
    let seq = 0;
    let wireBytes = 0;
    let maxFrame = 0;
    while (offset < serialized.length) {
      const { endIndex, frame } = sliceChunkForFrame(serialized, offset, "unicode-1", seq);
      const bytes = encodedFrameByteLength(frame);
      expect(bytes).toBeLessThanOrEqual(LARGE_REPLY_MAX_ENCODED_FRAME_BYTES);
      maxFrame = Math.max(maxFrame, bytes);
      wireBytes += bytes;
      parts.push(frame.data);
      offset = endIndex;
      seq += 1;
      // No chunk owns the whole backing: each part is strictly smaller.
      expect(frame.data.length).toBeLessThan(serialized.length);
    }
    expect(parts.join("")).toBe(serialized);
    expect(JSON.parse(parts.join(""))).toEqual(data);
    expect(maxFrame).toBeLessThanOrEqual(LARGE_REPLY_MAX_ENCODED_FRAME_BYTES);
    // Honest overhead: escaping doubles quotes/backslashes, emoji stay UTF-8.
    expect(wireBytes).toBeGreaterThan(utf8ByteLength(serialized));
  });

  it("never splits a surrogate pair across chunks", () => {
    const serialized = JSON.stringify({ emoji: "😀".repeat(20_000) });
    let offset = 0;
    let seq = 0;
    while (offset < serialized.length) {
      const { endIndex, frame } = sliceChunkForFrame(serialized, offset, "pair-1", seq);
      const last = frame.data.charCodeAt(frame.data.length - 1);
      const next = serialized.charCodeAt(endIndex);
      const splitPair = last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff;
      expect(splitPair).toBe(false);
      offset = endIndex;
      seq += 1;
    }
  });

  it("documents the logical 64MiB bound for callers", () => {
    expect(LARGE_REPLY_MAX_LOGICAL_BYTES).toBe(64 * 1024 * 1024);
    expect(LARGE_REPLY_MAX_ENCODED_FRAME_BYTES).toBe(64 * 1024);
    // Oversized totals pass the shape gate so the state machines can bound-reject
    // them (cancel + bounded error, socket alive) instead of hanging.
    expect(
      isReplyStartFrame({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "reply-start",
        id: "big",
        totalBytes: LARGE_REPLY_MAX_LOGICAL_BYTES + 1,
      }),
    ).toBe(true);
  });
});
