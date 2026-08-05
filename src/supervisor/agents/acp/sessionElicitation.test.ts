import type { CreateElicitationRequest } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import {
  buildAcpElicitationAnswerEvents,
  normalizeAcpElicitationResponse,
} from "./sessionElicitation";

/**
 * The exact form-mode request Kimi Code v2's acp-server builds for an
 * AskUserQuestion with one single-select and one multi-select question
 * (`questionRequestToElicitationParams`): single-select becomes
 * `type: "string"` + `oneOf`, multi-select `type: "array"` + `items.anyOf`,
 * properties keyed `q<i>`, every key required.
 */
function kimiFormElicitation(): CreateElicitationRequest {
  return {
    mode: "form",
    sessionId: "session-1",
    toolCallId: "3:tool-ask",
    message: "Which authentication method?\nWhich checks should run?",
    requestedSchema: {
      type: "object",
      properties: {
        q0: {
          type: "string",
          title: "Auth",
          description: "Choose how to authenticate.",
          oneOf: [
            {
              const: "Paste a token",
              title: "Paste a token",
              description: "Use a precreated token.",
            },
            { const: "Log in via browser", title: "Log in via browser" },
          ],
        },
        q1: {
          type: "array",
          title: "Checks",
          description: "Select the checks to run.",
          minItems: 1,
          items: {
            anyOf: [
              { const: "Tests", title: "Tests", description: "Run focused tests." },
              { const: "Lint", title: "Lint" },
            ],
          },
        },
      },
      required: ["q0", "q1"],
    },
  };
}

describe("normalizeAcpElicitationResponse", () => {
  it("round-trips Kimi's single-select and multi-select answers", () => {
    const response = normalizeAcpElicitationResponse(
      {
        action: "accept",
        content: { q0: "Log in via browser", q1: ["Tests", "Lint"] },
      },
      kimiFormElicitation(),
    );
    expect(response).toEqual({
      action: "accept",
      content: { q0: "Log in via browser", q1: ["Tests", "Lint"] },
    });
  });

  it("drops content keys and values outside the requested schema", () => {
    const response = normalizeAcpElicitationResponse(
      {
        action: "accept",
        content: {
          q0: "Paste a token",
          q1: "Tests", // not an array — schema says array
          q2: ["unknown question"],
        },
      },
      kimiFormElicitation(),
    );
    expect(response).toEqual({ action: "accept", content: { q0: "Paste a token" } });
  });

  it("maps decline, cancel, and unrecognizable responses to terminal actions", () => {
    const request = kimiFormElicitation();
    expect(normalizeAcpElicitationResponse({ action: "decline" }, request)).toEqual({
      action: "decline",
    });
    expect(normalizeAcpElicitationResponse({ action: "cancel" }, request)).toEqual({
      action: "cancel",
    });
    expect(normalizeAcpElicitationResponse({ action: "something" }, request)).toEqual({
      action: "cancel",
    });
    expect(normalizeAcpElicitationResponse(undefined, request)).toEqual({ action: "cancel" });
  });

  it("preserves response _meta when present", () => {
    const response = normalizeAcpElicitationResponse(
      { action: "accept", content: { q0: "Paste a token", q1: ["Lint"] }, _meta: { via: "test" } },
      kimiFormElicitation(),
    );
    expect(response).toMatchObject({ action: "accept", _meta: { via: "test" } });
  });
});

describe("buildAcpElicitationAnswerEvents", () => {
  it("maps Kimi's form answers — including anyOf multi-select — to a question_answer item", () => {
    const events = buildAcpElicitationAnswerEvents({
      threadId: "thread-1",
      itemId: "acp-question-answer-acp-elicit-0",
      request: kimiFormElicitation(),
      response: {
        action: "accept",
        content: { q0: "Log in via browser", q1: ["Tests", "Lint"] },
      },
    });
    expect(events).toEqual([
      {
        type: "item.started",
        threadId: "thread-1",
        itemId: "acp-question-answer-acp-elicit-0",
        itemType: "question_answer",
        payload: {
          questions: [
            {
              header: "Auth",
              question: "Choose how to authenticate.",
              selected: [{ label: "Log in via browser" }],
            },
            {
              header: "Checks",
              question: "Select the checks to run.",
              selected: [{ label: "Tests", description: "Run focused tests." }, { label: "Lint" }],
            },
          ],
        },
      },
      {
        type: "item.completed",
        threadId: "thread-1",
        itemId: "acp-question-answer-acp-elicit-0",
      },
    ]);
  });

  it("emits nothing for cancelled or declined responses", () => {
    for (const response of [{ action: "cancel" }, { action: "decline" }]) {
      expect(
        buildAcpElicitationAnswerEvents({
          threadId: "thread-1",
          itemId: "item-1",
          request: kimiFormElicitation(),
          response,
        }),
      ).toEqual([]);
    }
  });
});
