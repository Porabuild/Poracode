import { describe, expect, it, vi } from "vitest";
import { CodexVoiceTranscript } from "./liveVoiceTranscript";
import type { RuntimeEvent } from "@/shared/contracts";
import type { LiveVoiceEvent } from "@/shared/contracts/liveVoice";

describe("Codex voice transcript normalization", () => {
  it("keeps flat transcripts when the only canonical item is session lifecycle", () => {
    const runtime = vi.fn<(events: RuntimeEvent[]) => void>();
    const transcript = new CodexVoiceTranscript("local", "connection", () => {}, runtime);
    transcript.handle("thread/realtime/item/started", {
      item: { id: "session", type: "realtimeSessionStarted", realtimeSessionId: "connection" },
    });
    transcript.handle("thread/realtime/transcript/done", { role: "user", text: "Keep this" });
    expect(runtime).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ itemType: "user_message" })]),
    );
  });

  it("keeps canonical deltas when final text is empty and updates the live preview", () => {
    const runtime = vi.fn<(events: RuntimeEvent[]) => void>(),
      emit = vi.fn<(event: LiveVoiceEvent) => void>();
    const transcript = new CodexVoiceTranscript("local", "connection", emit, runtime);
    const item = {
      id: "segment",
      type: "transcriptSegment",
      realtimeSessionId: "connection",
      role: "assistant",
      text: "",
    };
    transcript.handle("thread/realtime/item/started", { item });
    transcript.handle("thread/realtime/item/transcript/delta", {
      itemId: "segment",
      delta: "Hello",
    });
    expect(emit).toHaveBeenLastCalledWith({
      connectionId: "connection",
      type: "transcript",
      role: "assistant",
      text: "Hello",
      final: false,
    });
    transcript.handle("thread/realtime/item/completed", { item });
    expect(runtime).toHaveBeenLastCalledWith([
      expect.objectContaining({
        type: "item.completed",
        payload: expect.objectContaining({ content: [{ kind: "text", text: "Hello" }] }),
      }),
    ]);
  });

  it("settles a partial canonical segment once when the media session closes", () => {
    const runtime = vi.fn<(events: RuntimeEvent[]) => void>();
    const transcript = new CodexVoiceTranscript("local", "connection", () => {}, runtime);
    transcript.handle("thread/realtime/item/started", {
      item: {
        id: "cut-short",
        realtimeSessionId: "connection",
        type: "transcriptSegment",
        role: "assistant",
        text: "Hello",
      },
    });
    transcript.handle("thread/realtime/item/transcript/delta", {
      itemId: "cut-short",
      delta: " there",
    });
    transcript.finish();
    transcript.finish();
    const completions = runtime.mock.calls
      .flatMap((call) => call[0])
      .filter((event) => event.type === "item.completed");
    expect(completions).toEqual([
      {
        type: "item.completed",
        threadId: "local",
        itemId: "voice-cut-short",
        payload: {
          content: [{ kind: "text", text: "Hello there" }],
          displayAuthoritative: true,
          turnIndependent: true,
        },
      },
    ]);
  });

  it("ignores canonical items from a previous connection", () => {
    const runtime = vi.fn<(events: RuntimeEvent[]) => void>();
    const transcript = new CodexVoiceTranscript("local", "current", () => {}, runtime);
    transcript.handle("thread/realtime/item/started", {
      item: {
        id: "stale",
        realtimeSessionId: "old",
        type: "transcriptSegment",
        role: "user",
        text: "Old",
      },
    });
    transcript.handle("thread/realtime/item/transcript/delta", { itemId: "stale", delta: " text" });
    transcript.finish();
    expect(runtime).not.toHaveBeenCalled();
  });

  it("keeps speculative flat deltas ephemeral and persists complete legacy segments", () => {
    const emit = vi.fn<(event: LiveVoiceEvent) => void>();
    const runtime = vi.fn<(events: RuntimeEvent[]) => void>();
    const transcript = new CodexVoiceTranscript("local", "connection", emit, runtime);
    transcript.handle("thread/realtime/transcript/delta", { role: "user", delta: "Hello" });
    expect(runtime).not.toHaveBeenCalled();
    transcript.handle("thread/realtime/transcript/done", { role: "user", text: "Hello there." });
    expect(emit).toHaveBeenLastCalledWith({
      connectionId: "connection",
      type: "transcript",
      role: "user",
      text: "Hello there.",
      final: true,
    });
    expect(runtime).toHaveBeenCalledWith([
      expect.objectContaining({
        type: "item.started",
        threadId: "local",
        itemId: "voice-connection-1",
        itemType: "user_message",
        payload: {
          content: [{ kind: "text", text: "Hello there." }],
          displayAuthoritative: true,
          turnIndependent: true,
        },
      }),
      { type: "item.completed", threadId: "local", itemId: "voice-connection-1" },
    ]);
  });

  it("uses canonical timeline identities and ignores duplicate flat transcript persistence", () => {
    const runtime = vi.fn<(events: RuntimeEvent[]) => void>();
    const transcript = new CodexVoiceTranscript(
      "local",
      "connection",
      vi.fn<(event: LiveVoiceEvent) => void>(),
      runtime,
    );
    const item = {
      id: "segment",
      realtimeSessionId: "connection",
      type: "transcriptSegment",
      role: "assistant",
      text: "",
    };
    transcript.handle("thread/realtime/item/started", { item });
    transcript.handle("thread/realtime/transcript/done", { role: "assistant", text: "Hi." });
    transcript.handle("thread/realtime/item/transcript/delta", { itemId: "segment", delta: "Hi." });
    transcript.handle("thread/realtime/item/completed", { item: { ...item, text: "Hi." } });
    const events = runtime.mock.calls.flatMap((call) => call[0]);
    expect(events.filter((event) => event.type === "item.started")).toHaveLength(1);
    expect(events.every((event) => "itemId" in event && event.itemId === "voice-segment")).toBe(
      true,
    );
    expect(events.at(-1)).toMatchObject({
      type: "item.completed",
      payload: { content: [{ kind: "text", text: "Hi." }] },
    });
  });
});
