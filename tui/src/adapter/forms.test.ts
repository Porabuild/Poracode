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
    expect(form?.fields.map((field) => field.key)).toEqual(["colors", "reason"]);
    expect(form?.fields[0]).toMatchObject({ type: "multiselect", custom: true });
    expect(form?.fields[1]).toMatchObject({ type: "string", required: true });
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
