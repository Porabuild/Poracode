import { afterEach, describe, expect, it, vi } from "vitest";
import { makeConfigSyncSession } from "./sessionTestFixture";
import { PORACODE_ACP_TEXT_STREAM_META_KEY } from "./canonicalMapping/textStreamSnapshots";
import type { RuntimeEvent } from "@/shared/contracts";

/**
 * Turn ownership for annotated text-stream snapshots.
 *
 * A provider boundary transform may re-send a full-text snapshot of text it
 * already streamed (the neutral `_meta` seam below). When such a replacement
 * lands after `session/prompt` has settled, its canonical effects are a single
 * `content.delta` `replace: true` on an already-completed item — history
 * revision, not new work — so it must not open (or hold open) an orphan turn.
 * Genuine appends and first-seen snapshots that allocate an item keep the
 * ordinary orphan behaviour.
 */

type SnapshotMode = "append" | "replace";

const ORPHAN_TURN_IDLE_MS = 20_000;

const BASE_CONFIG = {
  model: "model-a",
  effort: "low",
  mode: "agent",
  approvalPolicy: "default",
} as const;

function snapshotChunk(
  kind: "agent_message_chunk" | "agent_thought_chunk",
  text: string,
  streamId: string,
  mode: SnapshotMode,
): { update: unknown } {
  return {
    update: {
      sessionUpdate: kind,
      content: { type: "text", text },
      _meta: { [PORACODE_ACP_TEXT_STREAM_META_KEY]: { id: streamId, mode } },
    },
  };
}

function messageSnapshot(text: string, streamId: string, mode: SnapshotMode) {
  return snapshotChunk("agent_message_chunk", text, streamId, mode);
}

function thoughtSnapshot(text: string, streamId: string, mode: SnapshotMode) {
  return snapshotChunk("agent_thought_chunk", text, streamId, mode);
}

type RecordingListener = {
  onUpdate: { mock: { calls: unknown[][] } };
  onRuntimeEvent: { mock: { calls: unknown[][] } };
};

function runtimeEvents(listener: RecordingListener): RuntimeEvent[] {
  return listener.onRuntimeEvent.mock.calls.map(([event]) => event as RuntimeEvent);
}

function statusUpdates(listener: RecordingListener): string[] {
  return listener.onUpdate.mock.calls.map((call) => (call[0] as { status: string }).status);
}

function eventTypes(listener: RecordingListener): string[] {
  return runtimeEvents(listener).map((event) => event.type);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ACP text-snapshot turn ownership — late replacement is not new work", () => {
  it("maps a late correlated replacement onto the completed item without opening an orphan turn", async () => {
    const { connection, listener, session } = makeConfigSyncSession();
    let resolvePrompt!: (result: { stopReason: string }) => void;
    connection.prompt.mockReturnValueOnce(
      new Promise<{ stopReason: string }>((resolve) => {
        resolvePrompt = resolve;
      }),
    );
    const turn = session.startTurn("reply", BASE_CONFIG);
    await vi.waitFor(() => expect(connection.prompt).toHaveBeenCalledOnce());

    session.handleSessionUpdate(messageSnapshot("ANSWER_41", "answer", "append"));
    resolvePrompt({ stopReason: "end_turn" });
    await turn;

    const asstStart = runtimeEvents(listener).find(
      (event) => event.type === "item.started" && event.itemType === "assistant_message",
    );
    expect(asstStart).toBeDefined();
    listener.onRuntimeEvent.mockClear();
    listener.onUpdate.mockClear();

    // The provider re-sends the full text after the prompt settled: the only
    // canonical effect is a replace delta on the already-completed item.
    session.handleSessionUpdate(messageSnapshot("ANSWER_42", "answer", "replace"));

    expect(runtimeEvents(listener)).toEqual([
      {
        type: "content.delta",
        threadId: "thread-1",
        itemId: (asstStart as { itemId: string }).itemId,
        stream: "assistant_text",
        delta: "ANSWER_42",
        replace: true,
      },
    ]);
    expect(statusUpdates(listener)).toEqual([]);
    expect(eventTypes(listener)).not.toContain("turn.started");
  });

  it("replaces reasoning that followed the assistant without reopening a turn", async () => {
    const { connection, listener, session } = makeConfigSyncSession();
    let resolvePrompt!: (result: { stopReason: string }) => void;
    connection.prompt.mockReturnValueOnce(
      new Promise<{ stopReason: string }>((resolve) => {
        resolvePrompt = resolve;
      }),
    );
    const turn = session.startTurn("reply", BASE_CONFIG);
    await vi.waitFor(() => expect(connection.prompt).toHaveBeenCalledOnce());

    session.handleSessionUpdate(messageSnapshot("final answer", "answer", "append"));
    session.handleSessionUpdate(thoughtSnapshot("because the setup says so", "why", "append"));
    resolvePrompt({ stopReason: "end_turn" });
    await turn;

    const reasonStart = runtimeEvents(listener).find(
      (event) => event.type === "item.started" && event.itemType === "reasoning",
    );
    expect(reasonStart).toBeDefined();
    const reasonItemId = (reasonStart as { itemId: string }).itemId;
    listener.onRuntimeEvent.mockClear();
    listener.onUpdate.mockClear();

    session.handleSessionUpdate(
      thoughtSnapshot("because the corrected setup says so", "why", "replace"),
    );

    expect(runtimeEvents(listener)).toEqual([
      {
        type: "content.delta",
        threadId: "thread-1",
        itemId: reasonItemId,
        stream: "reasoning_text",
        delta: "because the corrected setup says so",
        replace: true,
      },
    ]);
    expect(statusUpdates(listener)).toEqual([]);
    expect(eventTypes(listener)).not.toContain("turn.started");
  });

  it("still opens the orphan turn for a fresh autonomous append on a correlated stream", async () => {
    const { connection, listener, session } = makeConfigSyncSession();
    let resolvePrompt!: (result: { stopReason: string }) => void;
    connection.prompt.mockReturnValueOnce(
      new Promise<{ stopReason: string }>((resolve) => {
        resolvePrompt = resolve;
      }),
    );
    const turn = session.startTurn("reply", BASE_CONFIG);
    await vi.waitFor(() => expect(connection.prompt).toHaveBeenCalledOnce());

    session.handleSessionUpdate(messageSnapshot("ANSWER_41", "answer", "append"));
    resolvePrompt({ stopReason: "end_turn" });
    await turn;

    const asstStart = runtimeEvents(listener).find(
      (event) => event.type === "item.started" && event.itemType === "assistant_message",
    );
    listener.onRuntimeEvent.mockClear();
    listener.onUpdate.mockClear();

    // Same stream id, but append mode: new prose after the turn — real work.
    session.handleSessionUpdate(messageSnapshot("and one more note", "answer", "append"));

    expect(runtimeEvents(listener)).toEqual([
      expect.objectContaining({
        type: "content.delta",
        itemId: (asstStart as { itemId: string }).itemId,
        stream: "assistant_text",
        delta: "and one more note",
      }),
      expect.objectContaining({ type: "turn.started" }),
    ]);
    expect(runtimeEvents(listener)[0]).not.toHaveProperty("replace");
    expect(statusUpdates(listener)).toEqual(["working"]);
  });

  it("keeps a first-seen replace snapshot an ordinary orphan turn — it allocates an item", async () => {
    const { connection, listener, session } = makeConfigSyncSession();
    connection.prompt.mockResolvedValueOnce({ stopReason: "end_turn" });
    await session.startTurn("reply", BASE_CONFIG);
    listener.onRuntimeEvent.mockClear();
    listener.onUpdate.mockClear();

    // No correlation exists for this stream id, so replace-mode still has to
    // allocate: item.started plus the delta is new work, and an orphan turn.
    session.handleSessionUpdate(messageSnapshot("whole final answer", "final", "replace"));

    expect(runtimeEvents(listener)).toEqual([
      expect.objectContaining({ type: "item.started", itemType: "assistant_message" }),
      expect.objectContaining({
        type: "content.delta",
        stream: "assistant_text",
        delta: "whole final answer",
        replace: true,
      }),
      expect.objectContaining({ type: "turn.started" }),
    ]);
    expect(statusUpdates(listener)).toEqual(["working"]);
  });

  it("leaves output suppression untouched — a suppressed late snapshot paints nothing", () => {
    const { listener, session } = makeConfigSyncSession();
    (session as unknown as Record<string, unknown>)["suppressAgentOutputUntilNextTurn"] = true;

    session.handleSessionUpdate(messageSnapshot("late replay", "final", "replace"));
    session.handleSessionUpdate({
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "plain" } },
    });

    expect(runtimeEvents(listener)).toEqual([]);
    expect(statusUpdates(listener)).toEqual([]);
    expect(eventTypes(listener)).not.toContain("turn.started");
  });

  it("does not let replacement replays hold an open orphan turn past its idle window", async () => {
    const { connection, listener, session } = makeConfigSyncSession();
    connection.prompt.mockResolvedValueOnce({ stopReason: "end_turn" });
    await session.startTurn("reply", BASE_CONFIG);

    vi.useFakeTimers();
    listener.onUpdate.mockClear();
    listener.onRuntimeEvent.mockClear();
    // A genuine post-turn append opens the orphan turn and seeds correlation.
    session.handleSessionUpdate(messageSnapshot("ANSWER_41", "answer", "append"));
    expect(statusUpdates(listener)).toEqual(["working"]);
    expect(eventTypes(listener)).toContain("turn.started");

    listener.onUpdate.mockClear();
    listener.onRuntimeEvent.mockClear();
    vi.advanceTimersByTime(9_000);
    session.handleSessionUpdate(messageSnapshot("ANSWER_42", "answer", "replace"));
    vi.advanceTimersByTime(9_000);
    session.handleSessionUpdate(messageSnapshot("ANSWER_42", "answer", "replace"));

    // The replays revised history, painted nothing new, and did not re-arm the
    // idle deadline armed by the append.
    expect(statusUpdates(listener)).toEqual([]);

    // The turn still idles out on schedule after the last real activity.
    vi.advanceTimersByTime(ORPHAN_TURN_IDLE_MS);
    expect(statusUpdates(listener)).toEqual(["idle"]);
    expect(eventTypes(listener)).toContain("content.delta");
    expect(eventTypes(listener)).toContain("turn.completed");
    expect(eventTypes(listener)).not.toContain("turn.started");
  });

  it("counts observer events against the strict replacement-only criterion", async () => {
    const { connection, listener, session } = makeConfigSyncSession({
      textStreamExtension: {
        id: "test-observer",
        observeSessionUpdate: ({ update }) =>
          update.sessionUpdate === "agent_message_chunk"
            ? [{ type: "warning", threadId: "thread-1", message: "observed" }]
            : [],
      },
    });
    let resolvePrompt!: (result: { stopReason: string }) => void;
    connection.prompt.mockReturnValueOnce(
      new Promise<{ stopReason: string }>((resolve) => {
        resolvePrompt = resolve;
      }),
    );
    const turn = session.startTurn("reply", BASE_CONFIG);
    await vi.waitFor(() => expect(connection.prompt).toHaveBeenCalledOnce());

    session.handleSessionUpdate(messageSnapshot("ANSWER_41", "answer", "append"));
    resolvePrompt({ stopReason: "end_turn" });
    await turn;
    listener.onRuntimeEvent.mockClear();
    listener.onUpdate.mockClear();

    // The batch carries an observer event alongside the replace delta, so it
    // is not replacement-only — the strict criterion must not widen to cover it.
    session.handleSessionUpdate(messageSnapshot("ANSWER_42", "answer", "replace"));

    expect(eventTypes(listener)).toContain("turn.started");
    expect(statusUpdates(listener)).toEqual(["working"]);
    expect(eventTypes(listener)).toContain("content.delta");
  });
});
