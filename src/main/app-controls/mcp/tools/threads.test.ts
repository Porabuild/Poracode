// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import type { PersistedRuntimePage } from "@/shared/ipc/schemas";
import type { AppControlsToolContext } from "./types";

const { getConversationPage } = vi.hoisted(() => ({
  getConversationPage:
    vi.fn<(threadId: string, before: number | undefined, limit: number) => PersistedRuntimePage>(),
}));

vi.mock("../../../db", () => ({
  dbGetThreadConversationItemsPage: getConversationPage,
}));

import { threadTools } from "./threads";

describe("read_thread", () => {
  it("returns canonical user prompt content and bounded assistant text", async () => {
    getConversationPage.mockReturnValue({
      nextCursor: 12,
      items: [
        {
          id: "user-1",
          type: "user_message",
          state: "completed",
          payload: {
            content: [
              { kind: "text", text: "Compare " },
              { kind: "thread", threadId: "source", title: "Source" },
            ],
          },
          streams: {},
        },
        {
          id: "assistant-1",
          type: "assistant_message",
          state: "completed",
          streams: { text: "x".repeat(2_001) },
        },
      ],
    });
    const ctx = {
      getThread: (threadId: string) =>
        threadId === "source" ? ({ id: threadId } as Thread) : null,
    } as AppControlsToolContext;

    expect(threadTools.handlers.read_thread!({ threadId: "source", limit: 2 }, ctx)).toEqual({
      threadId: "source",
      messageCount: 2,
      nextCursor: 12,
      items: [
        {
          role: "user",
          type: "user_message",
          state: "completed",
          text: "Compare @Source",
        },
        {
          role: "assistant",
          type: "assistant_message",
          state: "completed",
          text: `${"x".repeat(2_000)}…`,
          truncated: true,
        },
      ],
    });
    expect(getConversationPage).toHaveBeenCalledWith("source", undefined, 2);
  });

  it("allows a caller to opt into a larger per-message result", () => {
    getConversationPage.mockReturnValue({
      nextCursor: null,
      items: [
        {
          id: "assistant-1",
          type: "assistant_message",
          state: "completed",
          streams: { text: "x".repeat(3_000) },
        },
      ],
    });
    const ctx = {
      getThread: () => ({ id: "source" }) as Thread,
    } as unknown as AppControlsToolContext;

    const result = threadTools.handlers.read_thread!(
      { threadId: "source", maxChars: 4_000 },
      ctx,
    ) as { items: Array<{ text: string; truncated?: true }> };
    expect(result.items[0]).toEqual({
      role: "assistant",
      type: "assistant_message",
      state: "completed",
      text: "x".repeat(3_000),
    });
  });
});
