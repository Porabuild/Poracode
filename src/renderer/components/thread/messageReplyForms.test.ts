import { describe, expect, it } from "vitest";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { selectMessageReplyAnswer, selectPendingMessageReplyIds } from "./messageReplyForms";

const question: RuntimeChatItem = {
  id: "question",
  type: "assistant_message",
  state: "completed",
  payload: {
    content: [],
    replyForm: {
      questions: [
        { id: "scope", question: "Which scope?", options: [{ optionId: "A", label: "A" }] },
      ],
    },
  },
  streams: {},
};
const reply: RuntimeChatItem = {
  id: "reply",
  type: "user_message",
  state: "completed",
  payload: { content: [{ kind: "text", text: "Which scope?\nA" }] },
  streams: {},
};
function state(items: RuntimeChatItem[]): Parameters<typeof selectMessageReplyAnswer>[0] {
  return {
    runtimeItemIdsByThread: { thread: items.map((item) => item.id) },
    runtimeItemsByIdByThread: { thread: Object.fromEntries(items.map((item) => [item.id, item])) },
    runtimeStructuralVersionByThread: { thread: 1 },
  };
}

describe("message reply projections", () => {
  it("renders durable answers without the original question in the history window", () => {
    const questionAnswer = {
      questions: [{ header: "", question: "Which scope?", selected: [{ label: "A" }] }],
    };
    const current = state([
      { ...reply, payload: { ...(reply.payload as object), questionAnswer } },
    ]);
    expect(selectMessageReplyAnswer(current, "thread", reply.id)).toBe(questionAnswer);
    expect(selectPendingMessageReplyIds(current, "thread")).toEqual([]);
  });

  it("recovers old plain-text replies without changing their persisted shape", () => {
    const current = state([question, reply]);
    expect(selectMessageReplyAnswer(current, "thread", reply.id)).toEqual({
      questions: [{ header: "", question: "Which scope?", selected: [{ label: "A" }] }],
    });
    expect(reply.payload).not.toHaveProperty("questionAnswer");
  });

  it.each([
    { name: "text", content: [{ kind: "text", text: "Keep working while I decide." }] },
    {
      name: "image",
      content: [{ kind: "image", mimeType: "image/png", dataUrl: "data:image/png;base64,aA==" }],
    },
    { name: "file", content: [{ kind: "file", path: "/project/notes.txt" }] },
  ])("retires a question after an ordinary accepted $name reply", ({ content }) => {
    const current = state([question, { ...reply, payload: { content } }]);
    expect(selectPendingMessageReplyIds(current, "thread")).toEqual([]);
    expect(selectMessageReplyAnswer(current, "thread", reply.id)).toBeUndefined();
  });

  it("preserves a reply's attachments instead of replacing it with an answer card", () => {
    const current = state([
      question,
      {
        ...reply,
        payload: {
          content: [
            { kind: "text", text: "Which scope?\nA" },
            { kind: "image", mimeType: "image/png", dataUrl: "data:image/png;base64,aA==" },
          ],
          questionAnswer: {
            questions: [{ header: "", question: "Which scope?", selected: [{ label: "A" }] }],
          },
        },
      },
    ]);
    expect(selectPendingMessageReplyIds(current, "thread")).toEqual([]);
    expect(selectMessageReplyAnswer(current, "thread", reply.id)).toBeUndefined();
  });

  it("reuses projections through content deltas and unrelated state updates", () => {
    const current = state([question, reply]);
    const answer = selectMessageReplyAnswer(current, "thread", reply.id);
    const pending = selectPendingMessageReplyIds(current, "thread");
    const next = {
      ...current,
      runtimeItemsByIdByThread: {
        ...current.runtimeItemsByIdByThread,
        other: { progress: { ...question, streams: { assistant_text: "Progress" } } },
      },
    };
    expect(selectMessageReplyAnswer(next, "thread", reply.id)).toBe(answer);
    expect(selectPendingMessageReplyIds(next, "thread")).toBe(pending);
  });

  it("keeps pending and failed delivery retryable, then retires the form after acceptance", () => {
    const current = state([
      question,
      { ...reply, payload: { ...(reply.payload as object), clientInputDelivery: "pending" } },
    ]);
    expect(selectPendingMessageReplyIds(current, "thread")).toEqual([question.id]);
    expect(selectMessageReplyAnswer(current, "thread", reply.id)).toBeUndefined();
    for (const [version, delivery] of [
      [2, "failed"],
      [3, "accepted"],
    ] as const) {
      current.runtimeItemsByIdByThread.thread![reply.id] = {
        ...reply,
        payload: { ...(reply.payload as object), clientInputDelivery: delivery },
      };
      current.runtimeStructuralVersionByThread.thread = version;
      expect(selectPendingMessageReplyIds(current, "thread")).toEqual(
        delivery === "failed" ? [question.id] : [],
      );
    }
    expect(selectMessageReplyAnswer(current, "thread", reply.id)?.questions[0]?.selected).toEqual([
      { label: "A" },
    ]);
  });
});
