import type { RequestPermissionRequest } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import {
  buildAcpQuestionPermissionAnswerEvents,
  isAcpAskUserQuestionToolCall,
  normalizeAcpQuestionPermissionResponse,
  parseAcpPermissionQuestions,
} from "./acpQuestionPermissions";

/**
 * The exact v2 fallback shape (`AcpInteractionBridge.handleQuestion` when
 * `elicitation/create` is unavailable or fails): no rawInput, the question
 * text in `toolCall.content`, `q0_opt_<i>` allow_once options carrying the
 * answer labels, and one trailing `q0_skip` reject_once option. Only those
 * ids are valid back — legacy `approve`/`approve_for_session` are not.
 */
function kimiV2QuestionRequest(): RequestPermissionRequest {
  return {
    sessionId: "session-1",
    toolCall: {
      toolCallId: "7:tool-ask",
      title: "AskUserQuestion",
      content: [
        { type: "content", content: { type: "text", text: "Which authentication method?" } },
      ],
    },
    options: [
      { optionId: "q0_opt_0", name: "Paste a token", kind: "allow_once" },
      { optionId: "q0_opt_1", name: "Log in via browser", kind: "allow_once" },
      { optionId: "q0_skip", name: "Skip", kind: "reject_once" },
    ],
  };
}

describe("parseAcpPermissionQuestions (Kimi v2 content shape)", () => {
  it("parses the question text and answer options, dropping the skip option", () => {
    expect(parseAcpPermissionQuestions(kimiV2QuestionRequest())).toEqual([
      {
        id: "0",
        header: "Which authentication method?",
        question: "Which authentication method?",
        options: [
          { optionId: "q0_opt_0", label: "Paste a token" },
          { optionId: "q0_opt_1", label: "Log in via browser" },
        ],
        multiSelect: false,
        // The ACP options are the answer choices in this shape.
        optionsAreAnswers: true,
      },
    ]);
  });

  it("recognizes the AskUserQuestion tool call by title without rawInput", () => {
    expect(isAcpAskUserQuestionToolCall({ title: "AskUserQuestion" })).toBe(true);
    expect(isAcpAskUserQuestionToolCall({ title: "Ask user 2 questions" })).toBe(true);
    expect(isAcpAskUserQuestionToolCall({ title: "Bash" })).toBe(false);
  });

  it("does not reinterpret ordinary approvals as questions", () => {
    const approval: RequestPermissionRequest = {
      sessionId: "session-1",
      toolCall: {
        toolCallId: "7:tool-bash",
        title: "Run tests",
        kind: "execute",
        content: [{ type: "content", content: { type: "text", text: "pnpm test" } }],
      },
      options: [{ optionId: "approve_once", name: "Approve once", kind: "allow_once" }],
    };
    expect(parseAcpPermissionQuestions(approval)).toEqual([]);
  });
});

describe("normalizeAcpQuestionPermissionResponse (Kimi v2 ids)", () => {
  it("promotes the picked answer to the server-provided option id", () => {
    const request = kimiV2QuestionRequest();
    expect(
      normalizeAcpQuestionPermissionResponse(request, { answers: { "0": "q0_opt_1" } }),
    ).toEqual({
      outcome: { outcome: "selected", optionId: "q0_opt_1" },
      answers: { "0": "Log in via browser" },
    });
  });

  it("echoes a directly resolved server option id", () => {
    const request = kimiV2QuestionRequest();
    expect(normalizeAcpQuestionPermissionResponse(request, { optionId: "q0_opt_0" })).toEqual({
      outcome: { outcome: "selected", optionId: "q0_opt_0" },
    });
  });

  it("round-trips the explicit skip option as a selection the server dismisses", () => {
    const request = kimiV2QuestionRequest();
    expect(normalizeAcpQuestionPermissionResponse(request, { optionId: "q0_skip" })).toEqual({
      outcome: { outcome: "selected", optionId: "q0_skip" },
    });
  });

  it("cancels on explicit cancel/decline actions", () => {
    const request = kimiV2QuestionRequest();
    expect(normalizeAcpQuestionPermissionResponse(request, { action: "cancel" })).toEqual({
      outcome: { outcome: "cancelled" },
    });
    expect(normalizeAcpQuestionPermissionResponse(request, { action: "decline" })).toEqual({
      outcome: { outcome: "cancelled" },
    });
  });

  it("routes unmatched free text to the skip option instead of fabricating the first answer", () => {
    const request = kimiV2QuestionRequest();
    expect(
      normalizeAcpQuestionPermissionResponse(request, { answers: { "0": "use OAuth instead" } }),
    ).toEqual({
      outcome: { outcome: "selected", optionId: "q0_skip" },
      answers: { "0": "use OAuth instead" },
    });
  });

  it("keeps the Qwen rawInput shape answering through the allow_once fallback", () => {
    const request: RequestPermissionRequest = {
      sessionId: "session-1",
      toolCall: {
        toolCallId: "tool-q",
        title: "Ask user 1 question",
        kind: "other",
        rawInput: {
          questions: [
            {
              header: "Scope",
              question: "Which scope?",
              options: [{ label: "Focused" }, { label: "Broad" }],
            },
          ],
        },
      },
      options: [
        { optionId: "proceed_once", name: "Submit", kind: "allow_once" },
        { optionId: "cancel", name: "Cancel", kind: "reject_once" },
      ],
    };
    expect(
      normalizeAcpQuestionPermissionResponse(request, { answers: { "0": "Focused" } }),
    ).toEqual({
      outcome: { outcome: "selected", optionId: "proceed_once" },
      answers: { "0": "Focused" },
    });
  });
});

describe("buildAcpQuestionPermissionAnswerEvents (Kimi v2 ids)", () => {
  it("records the picked answer label as a question_answer item", () => {
    const events = buildAcpQuestionPermissionAnswerEvents({
      threadId: "thread-1",
      itemId: "acp-question-answer-acp-perm-0",
      request: kimiV2QuestionRequest(),
      response: { answers: { "0": "q0_opt_1" } },
    });
    expect(events).toEqual([
      {
        type: "item.started",
        threadId: "thread-1",
        itemId: "acp-question-answer-acp-perm-0",
        itemType: "question_answer",
        payload: {
          questions: [
            {
              header: "Which authentication method?",
              question: "Which authentication method?",
              selected: [{ label: "Log in via browser" }],
            },
          ],
        },
      },
      {
        type: "item.completed",
        threadId: "thread-1",
        itemId: "acp-question-answer-acp-perm-0",
      },
    ]);
  });

  it("emits nothing for skipped or cancelled replies", () => {
    for (const response of [{ optionId: "q0_skip" }, { action: "cancel" }]) {
      expect(
        buildAcpQuestionPermissionAnswerEvents({
          threadId: "thread-1",
          itemId: "item-1",
          request: kimiV2QuestionRequest(),
          response,
        }),
      ).toEqual([]);
    }
  });
});
