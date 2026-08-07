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

  it("recognizes Factory droid's bare AskUser tool call by title and name", () => {
    expect(isAcpAskUserQuestionToolCall({ title: "AskUser" })).toBe(true);
    expect(isAcpAskUserQuestionToolCall({ name: "ask_user" })).toBe(true);
    expect(isAcpAskUserQuestionToolCall({ title: "AskUser", name: "ask_user" })).toBe(true);
    expect(isAcpAskUserQuestionToolCall({ title: "TodoWrite" })).toBe(false);
    expect(isAcpAskUserQuestionToolCall({ title: "Execute" })).toBe(false);
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

/**
 * The exact shape Factory droid 0.189.0 emits over ACP for its AskUser tool:
 * the tool identity is the bare `AskUser` title, the question payload is a
 * single plain-text `rawInput.questionnaire` string in the format from
 * droid's AskUser tool description, and the ACP permission options are plain
 * proceed/cancel choices (the answers are NOT the options).
 */
function droidQuestionnaireRequest(): RequestPermissionRequest {
  return {
    sessionId: "session-1",
    toolCall: {
      toolCallId: "tool-ask-droid",
      title: "AskUser",
      kind: "other",
      rawInput: {
        questionnaire: [
          "1. [question] Which features do you want to enable? (multi)",
          "[topic] Features",
          "[option] Auth handling",
          "[option] Login Page",
          "2. [question] Which library should we use for date formatting?",
          "[topic] Library",
          "[option] Library ABC",
          "[option] Library BlaBla",
        ].join("\n"),
      },
    },
    options: [
      { optionId: "proceed_once", name: "Submit", kind: "allow_once" },
      { optionId: "cancel", name: "Cancel", kind: "reject_once" },
    ],
  };
}

describe("parseAcpPermissionQuestions (droid questionnaire shape)", () => {
  it("parses numbered questions, topics, options, and the (multi) flag", () => {
    expect(parseAcpPermissionQuestions(droidQuestionnaireRequest())).toEqual([
      {
        id: "0",
        header: "Features",
        question: "Which features do you want to enable?",
        options: [
          { optionId: "Auth handling", label: "Auth handling" },
          { optionId: "Login Page", label: "Login Page" },
        ],
        multiSelect: true,
      },
      {
        id: "1",
        header: "Library",
        question: "Which library should we use for date formatting?",
        options: [
          { optionId: "Library ABC", label: "Library ABC" },
          { optionId: "Library BlaBla", label: "Library BlaBla" },
        ],
        multiSelect: false,
      },
    ]);
  });

  it("falls back to the question text as header when no topic line is present", () => {
    const request = droidQuestionnaireRequest();
    (request.toolCall!.rawInput as { questionnaire: string }).questionnaire = [
      "1. [question] Which scope?",
      "[option] Focused",
      "[option] Broad",
    ].join("\n");
    expect(parseAcpPermissionQuestions(request)).toEqual([
      {
        id: "0",
        header: "Which scope?",
        question: "Which scope?",
        options: [
          { optionId: "Focused", label: "Focused" },
          { optionId: "Broad", label: "Broad" },
        ],
        multiSelect: false,
      },
    ]);
  });

  it("ignores notes and trailing prose lines outside the format", () => {
    const request = droidQuestionnaireRequest();
    (request.toolCall!.rawInput as { questionnaire: string }).questionnaire = [
      "1. [question] Confirm the plan?",
      "[topic] Plan",
      "[option] Approve",
      "[option] Adjust",
      "Notes:",
      "- Keep it short",
    ].join("\n");
    expect(parseAcpPermissionQuestions(request).map((q) => q.question)).toEqual([
      "Confirm the plan?",
    ]);
  });
});

describe("normalizeAcpQuestionPermissionResponse (droid questionnaire ids)", () => {
  it("answers through the allow_once fallback since droid options are not the choices", () => {
    const request = droidQuestionnaireRequest();
    expect(
      normalizeAcpQuestionPermissionResponse(request, {
        answers: { "0": "Auth handling", "1": "Library ABC" },
      }),
    ).toEqual({
      outcome: { outcome: "selected", optionId: "proceed_once" },
      answers: { "0": "Auth handling", "1": "Library ABC" },
    });
  });

  it("joins multiple picked choices and keeps free-text custom answers verbatim", () => {
    const request = droidQuestionnaireRequest();
    expect(
      normalizeAcpQuestionPermissionResponse(request, {
        answers: { "0": ["Auth handling", "Login Page"], "1": "a bespoke library" },
      }),
    ).toEqual({
      outcome: { outcome: "selected", optionId: "proceed_once" },
      answers: { "0": "Auth handling, Login Page", "1": "a bespoke library" },
    });
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
