import { describe, expect, it } from "vitest";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { getThreadErrorDockStateForItem } from "./threadErrorState";

function errorItem(message: string): RuntimeChatItem {
  return {
    id: "err-1",
    type: "error",
    state: "completed",
    payload: { message },
    streams: {},
  };
}

describe("threadErrorState", () => {
  it("suppresses abort-only composer errors", () => {
    expect(getThreadErrorDockStateForItem(errorItem("Aborted"))).toBeNull();
    expect(getThreadErrorDockStateForItem(errorItem("AbortError: aborted"))).toBeNull();
  });

  it("keeps non-abort composer errors", () => {
    expect(getThreadErrorDockStateForItem(errorItem("Network error: request failed"))).toEqual({
      sourceItemId: "err-1",
      message: "Network error: request failed",
    });
  });
});
