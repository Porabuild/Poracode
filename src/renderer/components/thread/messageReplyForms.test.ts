import { describe, expect, it } from "vitest";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import {
  isMessageReplyFormFallback,
  selectMessageReplyAnswer,
  selectMessageReplyState,
  selectPendingMessageReplyIds,
} from "./messageReplyForms";
import { isVisibleRuntimeItem } from "./ChatPane/chatPaneSelectors";

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
  it("keeps generated fallback text hidden and independent assistant prose visible", () => {
    const fallback = "Which scope?\n- A";
    expect(isMessageReplyFormFallback(question, fallback)).toBe(true);
    expect(isMessageReplyFormFallback(question, "")).toBe(true);
    expect(isVisibleRuntimeItem({ ...question, streams: { assistant_text: fallback } })).toBe(
      false,
    );
    expect(isMessageReplyFormFallback(question, "Independent context")).toBe(false);
    expect(
      isVisibleRuntimeItem({ ...question, streams: { assistant_text: "Independent context" } }),
    ).toBe(true);
    expect(isMessageReplyFormFallback({ ...question, parentItemId: "tool" }, fallback)).toBe(false);
    expect(isMessageReplyFormFallback({ ...question, type: "user_message" }, fallback)).toBe(false);
  });

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

  it.each([question.id, "other-question"])(
    "resolves only the submitted source %s even when question text is identical",
    (sourceItemId) => {
      const other = { ...question, id: "other-question" };
      const questionAnswer = {
        sourceItemId,
        questions: [{ header: "", question: "Which scope?", selected: [{ label: "A" }] }],
      };
      const current = state([
        question,
        other,
        { ...reply, payload: { ...(reply.payload as object), questionAnswer } },
      ]);
      const remainingId = sourceItemId === question.id ? other.id : question.id;
      expect(selectPendingMessageReplyIds(current, "thread")).toEqual([remainingId]);
      expect(selectMessageReplyState(current, "thread", sourceItemId)).toBe("answered");
      expect(selectMessageReplyState(current, "thread", remainingId)).toBe("none");
      expect(selectMessageReplyAnswer(current, "thread", reply.id)).toBe(questionAnswer);
    },
  );

  it.each([false, true])(
    "correlates older replies to one form without source metadata (structured: %s)",
    (structured) => {
      const other = {
        ...question,
        id: "other-question",
        payload: {
          content: [],
          replyForm: { questions: [{ id: "detail", question: "Details?", options: null }] },
        },
      };
      const current = state([
        question,
        other,
        {
          ...reply,
          payload: {
            ...(reply.payload as object),
            ...(structured
              ? {
                  questionAnswer: {
                    questions: [
                      { header: "", question: "Which scope?", selected: [{ label: "A" }] },
                    ],
                  },
                }
              : {}),
          },
        },
      ]);
      expect(selectPendingMessageReplyIds(current, "thread")).toEqual([other.id]);
      expect(selectMessageReplyState(current, "thread", question.id)).toBe("answered");
      expect(selectMessageReplyState(current, "thread", other.id)).toBe("none");
      expect(selectMessageReplyAnswer(current, "thread", reply.id)).toBeDefined();
    },
  );

  it.each([false, true])(
    "keeps unrelated forms open when an answer's source is outside the history window (source ID: %s)",
    (identified) => {
      const questionAnswer = {
        ...(identified ? { sourceItemId: "paged-out-question" } : {}),
        questions: [{ header: "", question: "Details?", selected: [], customAnswer: "None" }],
      };
      const current = state([
        question,
        { ...reply, payload: { ...(reply.payload as object), questionAnswer } },
      ]);
      expect(selectPendingMessageReplyIds(current, "thread")).toEqual([question.id]);
      expect(selectMessageReplyState(current, "thread", question.id)).toBe("none");
      expect(selectMessageReplyAnswer(current, "thread", reply.id)).toBe(questionAnswer);
    },
  );

  it("tracks independent in-flight answers through acceptance and failure", () => {
    const secondQuestion = { ...question, id: "second-question" };
    const response = (id: string, sourceItemId: string): RuntimeChatItem => ({
      ...reply,
      id,
      payload: {
        ...(reply.payload as object),
        clientInputDelivery: "pending",
        questionAnswer: {
          sourceItemId,
          questions: [{ header: "", question: "Which scope?", selected: [{ label: "A" }] }],
        },
      },
    });
    const firstReply = response("first-reply", question.id);
    const secondReply = response("second-reply", secondQuestion.id);
    const current = state([question, secondQuestion, firstReply, secondReply]);
    expect(selectMessageReplyState(current, "thread", question.id)).toBe("pending");
    expect(selectMessageReplyState(current, "thread", secondQuestion.id)).toBe("pending");
    current.runtimeItemsByIdByThread.thread![firstReply.id] = {
      ...firstReply,
      payload: { ...(firstReply.payload as object), clientInputDelivery: "accepted" },
    };
    current.runtimeItemsByIdByThread.thread![secondReply.id] = {
      ...secondReply,
      payload: { ...(secondReply.payload as object), clientInputDelivery: "failed" },
    };
    current.runtimeStructuralVersionByThread.thread = 2;
    expect(selectPendingMessageReplyIds(current, "thread")).toEqual([secondQuestion.id]);
    expect(selectMessageReplyState(current, "thread", question.id)).toBe("answered");
    expect(selectMessageReplyState(current, "thread", secondQuestion.id)).toBe("none");
    expect(selectMessageReplyAnswer(current, "thread", secondReply.id)).toBeUndefined();
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
    expect(selectMessageReplyAnswer(current, "thread", reply.id)?.questions[0]?.selected).toEqual([
      { label: "A" },
    ]);
    expect(selectMessageReplyState(current, "thread", question.id)).toBe("pending");
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
      expect(selectMessageReplyState(current, "thread", question.id)).toBe(
        delivery === "failed" ? "none" : "answered",
      );
      expect(selectMessageReplyAnswer(current, "thread", reply.id)?.questions[0]?.selected).toEqual(
        delivery === "failed" ? undefined : [{ label: "A" }],
      );
    }
    expect(selectMessageReplyAnswer(current, "thread", reply.id)?.questions[0]?.selected).toEqual([
      { label: "A" },
    ]);
  });
});
