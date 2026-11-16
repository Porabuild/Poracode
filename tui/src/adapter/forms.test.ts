import { describe, expect, it } from "bun:test";
import type { RuntimeEvent } from "@/shared/contracts";
import { formDismissalForRequest, formInfoForRequest, formResponseForRequest } from "./forms";

type OpenRequest = Extract<RuntimeEvent, { type: "request.opened" }>;

const openRequest = (payload: OpenRequest["payload"]): OpenRequest => ({
  type: "request.opened",
  threadId: "thread-1",
  requestId: "request-1",
  requestType: "tool_user_input",
  payload,
});

describe("OpenCode request forms", () => {
  it("maps plain option requests to a choice field and preserves their response shape", () => {
    const request = openRequest({
      summary: "Choose a color",
      options: [
        { optionId: "blue", label: "Blue", description: "Cool" },
        { optionId: "red", label: "Red" },
      ],
    });
    const form = formInfoForRequest(request);
    expect(form?.id).toMatch(/^frm_/u);
    expect(form?.fields[0]).toMatchObject({
      key: "answer",
      type: "string",
      required: true,
      options: [
        { value: "blue", label: "Blue", description: "Cool" },
        { value: "red", label: "Red" },
      ],
    });
    expect(form?.fields[0]).not.toHaveProperty("custom");
    expect(formResponseForRequest(request, { answer: "blue" }).response).toEqual({
      optionId: "blue",
    });
  });

  it("maps multi-select and explicit custom-answer capability", () => {
    const request = openRequest({
      summary: "Choose colors",
      details: { allowCustom: true },
      options: [
        { optionId: "blue", label: "Blue" },
        { optionId: "red", label: "Red" },
      ],
      multiSelect: true,
    });
    const form = formInfoForRequest(request);
    expect(form?.fields[0]).toMatchObject({ type: "multiselect", custom: true });
    expect(formResponseForRequest(request, { answer: ["blue", "red"] }).response).toEqual({
      optionId: "blue",
      optionIds: ["blue", "red"],
    });
  });

  it("maps multi-question details to keyed fields and uses the shared answer builder", () => {
    const request = openRequest({
      summary: "Questions",
      details: {
        userInputForm: {
          questions: [
            {
              id: "colors",
              header: "Colors",
              question: "Which colors?",
              multiSelect: true,
              allowCustom: true,
              options: [{ optionId: "blue", label: "Blue" }],
            },
            { id: "reason", header: "Reason", question: "Why?" },
          ],
        },
      },
    });
    const form = formInfoForRequest(request);
    expect(form?.title).toBe("Questions");
    // The question text lives in the field description — never repeated as a
    // form-level message the vendored UI would render a second time.
    expect(form?.metadata?.message).toBeUndefined();
    expect(form?.fields.map((field) => field.key)).toEqual(["colors", "reason"]);
    expect(form?.fields[0]).toMatchObject({
      type: "multiselect",
      custom: true,
      description: "Which colors?",
    });
    expect(form?.fields[1]).toMatchObject({ type: "string", required: true, description: "Why?" });
    expect(form?.fields[1]).not.toHaveProperty("custom");
    expect(
      formResponseForRequest(request, { colors: ["blue"], reason: "Because" }).response,
    ).toEqual({
      answers: { colors: ["blue"], reason: "Because" },
    });
    expect(formDismissalForRequest(request)).toEqual({
      response: { action: "cancel" },
      outcome: "cancelled",
    });
  });

  it("titles a single userInputForm question by its distinct header and offers custom answers", () => {
    const request = openRequest({
      summary: "Which port should the dev server use?",
      details: {
        userInputForm: {
          questions: [
            {
              id: "port",
              header: "Default port",
              question: "Which port should the dev server use?",
              options: [
                { optionId: "3000", label: "3000" },
                { optionId: "8080", label: "8080" },
              ],
            },
          ],
        },
      },
    });
    const form = formInfoForRequest(request);
    expect(form?.title).toBe("Default port");
    expect(form?.metadata?.message).toBeUndefined();
    expect(form?.fields[0]).toMatchObject({
      title: "Default port",
      description: "Which port should the dev server use?",
      custom: true,
    });
    // A free-text answer the vendored form folds into the field value routes
    // to customAnswers, matching what desktop sends for "Something else…".
    expect(formResponseForRequest(request, { port: "4000" }).response).toEqual({
      answers: { port: "4000" },
    });
    expect(formResponseForRequest(request, { port: "3000" }).response).toEqual({
      answers: { port: "3000" },
    });
  });

  it("titles a single userInputForm question 'Question' when the header repeats it", () => {
    const request = openRequest({
      summary: "Pick one",
      details: {
        userInputForm: {
          // Providers without a distinct header (Kimi) repeat the question.
          questions: [{ id: "q1", header: "Pick one?", question: "Pick one?" }],
        },
      },
    });
    const form = formInfoForRequest(request);
    expect(form?.title).toBe("Question");
    expect(form?.fields[0]).toMatchObject({ description: "Pick one?" });
  });

  it("routes free-text answers to customAnswers for the codex request shape", () => {
    const request = openRequest({
      summary: "Input requested",
      details: {
        codexUserInput: {
          questions: [
            {
              id: "q0",
              question: "Which option?",
              options: [
                { optionId: "continue", label: "Continue" },
                { optionId: "stop", label: "Stop" },
              ],
            },
          ],
        },
      },
    });
    const form = formInfoForRequest(request);
    expect(form?.title).toBe("Question");
    expect(form?.fields[0]).toMatchObject({ description: "Which option?", custom: true });
    expect(formResponseForRequest(request, { q0: "continue" }).response).toEqual({
      answers: { q0: { answers: ["continue"] } },
    });
    expect(formResponseForRequest(request, { q0: "something else entirely" }).response).toEqual({
      answers: { q0: { answers: ["something else entirely"] } },
    });
  });

  it("keeps the declared request-user-input answer shape data-driven", () => {
    const request = openRequest({
      summary: "Input requested",
      details: {
        codexUserInput: {
          questions: [
            {
              id: "q0",
              question: "Which option?",
              options: [{ optionId: "continue", label: "Continue" }],
            },
          ],
        },
      },
    });
    expect(formResponseForRequest(request, { q0: "continue" }).response).toEqual({
      answers: { q0: { answers: ["continue"] } },
    });
  });

  it("marks secret questions as display-masked via form metadata", () => {
    const request = openRequest({
      summary: "Credentials",
      details: {
        userInputForm: {
          questions: [
            { id: "secret", question: "Password", isSecret: true },
            { id: "user", question: "Username" },
          ],
        },
      },
    });
    const info = formInfoForRequest(request);
    expect(info?.metadata?.["poracode"]).toEqual({ maskedKeys: ["secret"] });
    expect(info?.fields.map((field) => field.key)).toEqual(["secret", "user"]);
  });

  it("maps structured schemas and uses their accepted and declined response shapes", () => {
    const request = openRequest({
      summary: "Configure",
      details: {
        structuredElicitation: {
          mode: "form",
          message: "Configure",
          sourceText: "Agent",
          requestedSchema: {
            type: "object",
            properties: {
              choice: { type: "string", enum: ["one", "two"] },
              count: { type: "integer", minimum: 1 },
              tags: { type: "array", items: { enum: ["a", "b"] } },
              enabled: { type: "boolean" },
            },
            required: ["choice"],
          },
        },
      },
    });
    const form = formInfoForRequest(request);
    expect(form?.fields.map((field) => field.type)).toEqual([
      "string",
      "integer",
      "multiselect",
      "boolean",
    ]);
    expect(form?.fields[0]).toMatchObject({
      required: true,
      options: [{ value: "one" }, { value: "two" }],
    });
    expect(
      formResponseForRequest(request, { choice: "one", count: 2, tags: ["a"], enabled: true })
        .response,
    ).toEqual({
      action: "accept",
      content: { choice: "one", count: 2, tags: ["a"], enabled: true },
    });
    expect(formDismissalForRequest(request)).toEqual({
      response: { action: "decline" },
      outcome: "declined",
    });
  });
});
