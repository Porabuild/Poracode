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
          streams: { assistant_text: "x".repeat(2_001) },
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
          streams: { assistant_text: "x".repeat(3_000) },
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

  it("returns display text, not streamed text a display hook replaced or suppressed", () => {
    getConversationPage.mockReturnValue({
      nextCursor: null,
      items: [
        {
          id: "rewritten",
          type: "assistant_message",
          state: "completed",
          payload: {
            content: [{ kind: "text", text: "Rewritten for display" }],
            displayAuthoritative: true,
          },
          streams: { assistant_text: "Original streamed text" },
        },
        {
          id: "suppressed",
          type: "assistant_message",
          state: "completed",
          payload: { content: [{ kind: "text", text: "" }], displayAuthoritative: true },
          streams: { assistant_text: "Suppressed secret" },
        },
      ],
    });
    const ctx = {
      getThread: () => ({ id: "source" }) as Thread,
    } as unknown as AppControlsToolContext;

    const result = threadTools.handlers.read_thread!({ threadId: "source" }, ctx) as {
      items: Array<{ text?: string }>;
    };
    expect(result.items[0]!.text).toBe("Rewritten for display");
    expect(result.items[1]!.text).toBeUndefined();
  });

  it("keeps assistant image markers when display text is rewritten or suppressed", () => {
    getConversationPage.mockReturnValue({
      nextCursor: null,
      items: [
        {
          id: "rewritten",
          type: "assistant_message",
          state: "completed",
          payload: {
            content: [
              { kind: "text", text: "Rewritten" },
              {
                kind: "image",
                mimeType: "image/png",
                dataUrl: "data:image/png;base64,eA==",
                name: "result.png",
              },
            ],
            displayAuthoritative: true,
          },
          streams: { assistant_text: "Original" },
        },
        {
          id: "suppressed",
          type: "assistant_message",
          state: "completed",
          payload: {
            content: [
              { kind: "text", text: "" },
              {
                kind: "image",
                mimeType: "image/png",
                dataUrl: "data:image/png;base64,eA==",
                name: "kept.png",
              },
            ],
            displayAuthoritative: true,
          },
          streams: { assistant_text: "Suppressed secret" },
        },
      ],
    });
    const ctx = {
      getThread: () => ({ id: "source" }) as Thread,
    } as unknown as AppControlsToolContext;

    const result = threadTools.handlers.read_thread!({ threadId: "source" }, ctx) as {
      items: Array<{ text?: string }>;
    };
    expect(result.items[0]!.text).toBe("Rewritten\n[image: result.png]");
    expect(result.items[1]!.text).toBe("[image: kept.png]");
  });
});
