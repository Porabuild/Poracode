import { describe, expect, it, vi } from "vitest";
import type { AcpExtensionNotificationHandler } from "../base/types";
import { AcpStructuredSession } from "./session";

/** Exercise notification admission without starting an agent process. */
function notificationSession() {
  const handler = vi.fn<AcpExtensionNotificationHandler>(() => []);
  const session = Object.assign(Object.create(AcpStructuredSession.prototype), {
    threadId: "thread-a",
    sessionId: "native-a",
    currentTurnId: "turn-a",
    isDisposed: false,
    transportClosed: false,
    isReplayingHistory: false,
    replayHistoryUntil: 0,
    acpToolCallIdToItemId: new Map<string, string>([["tool-a", "item-a"]]),
    extensionNotificationHandler: handler,
  }) as {
    handleExtNotification(method: string, params: Record<string, unknown>): void;
    sessionId: string | undefined;
    currentTurnId: string | undefined;
    isDisposed: boolean;
    transportClosed: boolean;
    isReplayingHistory: boolean;
  };
  return { session, handler };
}

describe("ACP extension notification ownership", () => {
  it("reports the current native and canonical owners, including a replacement session", () => {
    const { session, handler } = notificationSession();
    session.handleExtNotification("_fixture/stats", { sample: "first" });
    const first = handler.mock.calls[0]?.[2];
    expect(first).toMatchObject({ threadId: "thread-a", sessionId: "native-a", turnId: "turn-a" });
    expect(first?.resolveToolCallItemId("tool-a")).toBe("item-a");
    session.sessionId = "native-b";
    session.currentTurnId = undefined;
    session.handleExtNotification("_fixture/stats", { sample: "second" });
    const second = handler.mock.calls[1]?.[2];
    expect(second?.sessionId).toBe("native-b");
    expect(second).not.toHaveProperty("turnId");
    expect(first?.sessionId).toBe("native-a");
  });

  it.each(["isDisposed", "transportClosed", "isReplayingHistory"] as const)(
    "does not deliver notifications from a %s owner",
    (field) => {
      const { session, handler } = notificationSession();
      session[field] = true;
      session.handleExtNotification("_fixture/stats", { sample: "retired" });
      expect(handler).not.toHaveBeenCalled();
    },
  );
});
