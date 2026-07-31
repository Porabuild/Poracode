// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import type { ChatTimelineEntry } from "@/renderer/components/thread/ChatPane/chatPaneSelectors";
import { countOccurrences } from "./findText";
import { collectChatMatches, getChatItemSearchText } from "./chatFindMatches";

describe("countOccurrences", () => {
  it("counts case-insensitively by default", () => {
    expect(countOccurrences("foo Foo FOO", "foo", false)).toBe(3);
  });

  it("respects case sensitivity", () => {
    expect(countOccurrences("foo Foo FOO", "foo", true)).toBe(1);
  });

  it("counts non-overlapping occurrences", () => {
    expect(countOccurrences("aaaa", "aa", false)).toBe(2);
  });

  it("returns 0 for an empty needle", () => {
    expect(countOccurrences("anything", "", false)).toBe(0);
  });
});

function assistant(id: string, text: string): RuntimeChatItem {
  return { id, type: "assistant_message", state: "completed", streams: { assistant_text: text } };
}

function user(id: string, text: string): RuntimeChatItem {
  return {
    id,
    type: "user_message",
    state: "completed",
    streams: {},
    payload: { content: [{ kind: "text", text }] },
  };
}

describe("getChatItemSearchText", () => {
  it("reads assistant text from streams", () => {
    expect(getChatItemSearchText(assistant("a", "hello"))).toBe("hello");
  });

  it("reads user text from payload content blocks", () => {
    expect(getChatItemSearchText(user("u", "a prompt"))).toBe("a prompt");
  });

  it("makes an MCP mention badge findable by its @name directive", () => {
    const item: RuntimeChatItem = {
      id: "u",
      type: "user_message",
      state: "completed",
      streams: {},
      payload: {
        content: [
          { kind: "mcp", name: "Browser" },
          { kind: "text", text: " open" },
        ],
      },
    };
    expect(getChatItemSearchText(item)).toBe("@Browser open");
  });
});

describe("collectChatMatches", () => {
  const itemsById: Record<string, RuntimeChatItem> = {
    a: assistant("a", "hello world hello"),
    u: user("u", "world"),
  };
  const entries: ChatTimelineEntry[] = [
    { kind: "item", id: "a" },
    { kind: "item", id: "u" },
    { kind: "tool_call_group", id: "g", itemIds: ["x"] },
  ];

  it("emits one match per occurrence with item index and occurrence", () => {
    const matches = collectChatMatches(itemsById, entries, "hello", false);
    expect(matches).toEqual([
      { itemId: "a", itemIndex: 0, occurrence: 0 },
      { itemId: "a", itemIndex: 0, occurrence: 1 },
    ]);
  });

  it("matches across multiple items", () => {
    const matches = collectChatMatches(itemsById, entries, "world", false);
    expect(matches).toEqual([
      { itemId: "a", itemIndex: 0, occurrence: 0 },
      { itemId: "u", itemIndex: 1, occurrence: 0 },
    ]);
  });

  it("skips tool-call groups and returns nothing for an empty query", () => {
    expect(collectChatMatches(itemsById, entries, "", false)).toEqual([]);
  });
});
