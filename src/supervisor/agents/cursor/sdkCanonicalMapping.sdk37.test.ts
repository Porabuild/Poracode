import { describe, expect, it } from "vitest";
import {
  createCursorSdkMapperState,
  mapCursorSdkInteractionUpdate,
  mapCursorSdkMessage,
  startCursorSdkTurn,
} from "./sdkCanonicalMapping";
import type { CursorSdkInteractionUpdate, CursorSdkMessage } from "./sdkProtocol";

describe("Cursor SDK 1.0.32–1.0.37 stream compatibility", () => {
  it("keeps a tool running after enumeration completes", () => {
    const state = createCursorSdkMapperState("thread");
    startCursorSdkTurn(state, "turn");
    const started = mapCursorSdkInteractionUpdate(
      {
        type: "tool-call-started",
        callId: "read-1",
        modelCallId: "model-read",
        toolCall: { type: "read", args: { path: "file" } },
      },
      state,
    );
    const item = started.find((event) => event.type === "item.started");
    expect(item).toBeDefined();
    expect(
      mapCursorSdkInteractionUpdate({ type: "tool-requests-listed", callCount: 1 }, state),
    ).toEqual([]);
    expect(state.toolItems.size).toBe(1);
    const completed = mapCursorSdkInteractionUpdate(
      {
        type: "tool-call-completed",
        callId: "read-1",
        modelCallId: "model-read",
        toolCall: { type: "read", result: { success: { content: "done" } } },
      },
      state,
    );
    expect(completed).toContainEqual(
      expect.objectContaining({ type: "item.completed", threadId: "thread", itemId: item?.itemId }),
    );
  });

  it("does not synthesize a parent task for a nested enumeration notification", () => {
    const state = createCursorSdkMapperState("thread");
    expect(
      mapCursorSdkInteractionUpdate(
        {
          type: "tool-call-delta",
          callId: "task-1",
          modelCallId: "model-1",
          taskUpdate: { type: "tool-requests-listed", callCount: 2 },
        },
        state,
      ),
    ).toEqual([]);
    expect(state.toolItems.size).toBe(0);
  });

  it("tolerates future informational message types without breaking the stream", () => {
    const state = createCursorSdkMapperState("thread");
    expect(
      mapCursorSdkInteractionUpdate(
        { type: "future-update" } as unknown as CursorSdkInteractionUpdate,
        state,
      ),
    ).toEqual([]);
    expect(
      mapCursorSdkMessage(
        { type: "future-message", agent_id: "agent", run_id: "run" } as unknown as CursorSdkMessage,
        state,
      ),
    ).toEqual([]);
    expect(
      mapCursorSdkInteractionUpdate({ type: "text-delta", text: "still works" }, state),
    ).toContainEqual(expect.objectContaining({ type: "content.delta", delta: "still works" }));
  });
});
