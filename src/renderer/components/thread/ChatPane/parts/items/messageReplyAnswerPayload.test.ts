import { describe, expect, it } from "vitest";
import type { MessageReplyForm } from "@/shared/contracts";
import { buildMessageReplyAnswer, readMessageReplyAnswer } from "./messageReplyAnswerPayload";

const form: MessageReplyForm = {
  questions: [
    {
      id: "scope",
      question: "Which scope?",
      options: [
        { optionId: "focused", label: "Focused" },
        { optionId: "full", label: "Full" },
      ],
    },
    { id: "detail", question: "Any details?", options: null },
  ],
};

describe("readMessageReplyAnswer", () => {
  it("recovers selected choices and multiline custom answers from the existing prompt format", () => {
    expect(
      readMessageReplyAnswer(
        form,
        "Which scope?\nfocused\n\nAny details?\nFirst line.\n\nSecond paragraph.",
      ),
    ).toEqual({
      questions: [
        { header: "", question: "Which scope?", selected: [{ label: "Focused" }] },
        {
          header: "",
          question: "Any details?",
          selected: [],
          customAnswer: "First line.\n\nSecond paragraph.",
        },
      ],
    });
  });

  it("recognizes a custom answer to a question with suggested choices", () => {
    expect(
      readMessageReplyAnswer({ questions: [form.questions[0]!] }, "Which scope?\nAnother scope"),
    ).toEqual({
      questions: [
        { header: "", question: "Which scope?", selected: [], customAnswer: "Another scope" },
      ],
    });
  });

  it("preserves ambiguous legacy text while structured submissions keep both answers intact", () => {
    const first = "Please reuse this prompt:\n\nAny details?\nWrite a summary.";
    const second = "No further details.";
    expect(
      readMessageReplyAnswer(form, `Which scope?\n${first}\n\nAny details?\n${second}`),
    ).toBeUndefined();
    expect(
      buildMessageReplyAnswer(form, [first, second]).questions.map((entry) => entry.customAnswer),
    ).toEqual([first, second]);
  });

  it.each([
    "focused",
    "Unrelated context\nWhich scope?\nfocused\n\nAny details?\nNone",
    "Which scope?\nfocused",
    "Which scope?\nfocused\n\nAny details?\n",
    "Which scope?\nfocused\n\nAny details?\n   ",
  ])("leaves unrelated or incomplete replies as ordinary messages: %s", (prompt) => {
    expect(readMessageReplyAnswer(form, prompt)).toBeUndefined();
  });
});
