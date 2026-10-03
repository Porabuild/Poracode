// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { nextRecallMove, threadPromptHistory } from "./promptHistory";

function user(id: string, text: string, extra: Partial<RuntimeChatItem> = {}): RuntimeChatItem {
  return {
    id,
    type: "user_message",
    state: "completed",
    streams: {},
    payload: { content: [{ kind: "text", text }] },
    ...extra,
  };
}

function assistant(id: string, text: string): RuntimeChatItem {
  return { id, type: "assistant_message", state: "completed", streams: { assistant_text: text } };
}

function byId(items: RuntimeChatItem[]) {
  return {
    ids: items.map((item) => item.id),
    itemsById: Object.fromEntries(items.map((item) => [item.id, item])),
  };
}

function texts(history: ReturnType<typeof threadPromptHistory>) {
  return history.map((entry) =>
    entry.content.map((block) => (block.kind === "text" ? block.text : "")),
  );
}

describe("threadPromptHistory", () => {
  it("lists the thread's prompts newest first", () => {
    const { ids, itemsById } = byId([
      user("u1", "first"),
      assistant("a1", "reply"),
      user("u2", "second"),
      assistant("a2", "reply"),
    ]);
    expect(texts(threadPromptHistory(ids, itemsById))).toEqual([["second"], ["first"]]);
  });

  it("leaves out sub-agent messages and live voice transcripts", () => {
    const { ids, itemsById } = byId([
      user("u1", "prompt"),
      user("child", "sub-agent task", { parentItemId: "tool-1" }),
      user("voice", "spoken words", {
        payload: { content: [{ kind: "text", text: "spoken words" }], turnIndependent: true },
      }),
    ]);
    expect(texts(threadPromptHistory(ids, itemsById))).toEqual([["prompt"]]);
  });

  it("collapses consecutive identical prompts but keeps repeats further apart", () => {
    const { ids, itemsById } = byId([
      user("u1", "continue"),
      user("u2", "fix it"),
      user("u3", "continue"),
      user("u4", "continue"),
    ]);
    expect(texts(threadPromptHistory(ids, itemsById))).toEqual([
      ["continue"],
      ["fix it"],
      ["continue"],
    ]);
  });

  it("names each entry after the newest prompt it stands for", () => {
    const { ids, itemsById } = byId([
      user("u1", "continue"),
      user("u2", "fix it"),
      user("u3", "continue"),
      user("u4", "continue"),
    ]);
    expect(threadPromptHistory(ids, itemsById).map((entry) => entry.itemId)).toEqual([
      "u4",
      "u2",
      "u1",
    ]);
  });

  it("is empty for a thread with no loaded items", () => {
    expect(threadPromptHistory(undefined, undefined)).toEqual([]);
  });
});

describe("nextRecallMove", () => {
  const idle = { historyLength: 3, composerEmpty: true, caretAtEdge: true };

  it("recalls the newest prompt on Up from an empty composer", () => {
    expect(nextRecallMove(null, { ...idle, direction: "older" })).toEqual({
      kind: "show",
      index: 0,
    });
  });

  it("leaves Up alone when the composer has a draft", () => {
    expect(nextRecallMove(null, { ...idle, direction: "older", composerEmpty: false })).toEqual({
      kind: "none",
    });
  });

  it("leaves Up alone when the thread has no prompts", () => {
    expect(nextRecallMove(null, { ...idle, direction: "older", historyLength: 0 })).toEqual({
      kind: "none",
    });
  });

  it("leaves Down alone until browsing starts", () => {
    expect(nextRecallMove(null, { ...idle, direction: "newer" })).toEqual({ kind: "none" });
  });

  it("steps older and newer while browsing", () => {
    expect(nextRecallMove(0, { ...idle, direction: "older", composerEmpty: false })).toEqual({
      kind: "show",
      index: 1,
    });
    expect(nextRecallMove(2, { ...idle, direction: "newer", composerEmpty: false })).toEqual({
      kind: "show",
      index: 1,
    });
  });

  it("lets the caret move when it is not on the edge line", () => {
    const browsing = { ...idle, composerEmpty: false, caretAtEdge: false };
    expect(nextRecallMove(1, { ...browsing, direction: "older" })).toEqual({ kind: "none" });
    expect(nextRecallMove(1, { ...browsing, direction: "newer" })).toEqual({ kind: "none" });
  });

  it("stays on the oldest prompt", () => {
    expect(nextRecallMove(2, { ...idle, direction: "older", composerEmpty: false })).toEqual({
      kind: "none",
    });
  });

  it("returns to an empty composer on Down from the newest prompt", () => {
    expect(nextRecallMove(0, { ...idle, direction: "newer", composerEmpty: false })).toEqual({
      kind: "clear",
    });
  });
});
