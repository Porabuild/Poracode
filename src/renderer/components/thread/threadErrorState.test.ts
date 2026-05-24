import { describe, expect, it } from "vitest";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { getThreadErrorDockStateForItem, isAuthErrorMessage } from "./threadErrorState";

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

describe("isAuthErrorMessage", () => {
  it.each([
    "Failed to authenticate. API Error: 401 Invalid authentication credentials",
    "Not logged in · Please run /login",
    "Session expired. Please run /login to sign in again.",
    "authentication_failed",
    "API Error: 401",
    "oauth_org_not_allowed",
  ])("recognizes %q as an auth error", (msg) => {
    expect(isAuthErrorMessage(msg)).toBe(true);
  });

  it.each([
    "Network error: request failed",
    "Rate limit exceeded",
    "Internal server error",
    "Claude turn failed.",
  ])("does not flag %q as an auth error", (msg) => {
    expect(isAuthErrorMessage(msg)).toBe(false);
  });
});
