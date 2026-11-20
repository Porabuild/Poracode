import { expect, it } from "vitest";
import { buildAppThreadReply } from "./appThreadReply";

it("uses the app's provider-specific question envelope", () => {
  expect(
    buildAppThreadReply(
      {
        requestType: "tool_user_input",
        payload: {
          summary: "Choose a branch",
          details: {
            codexUserInput: {
              questions: [
                {
                  id: "branch",
                  question: "Branch?",
                  options: [{ optionId: "main", label: "Main" }],
                },
              ],
            },
          },
        },
      },
      { kind: "questions", answers: { branch: "main" } },
    ),
  ).toEqual({
    answers: { branch: { answers: ["main"] } },
  });
});

it("validates structured field constraints and correlates provider metadata internally", () => {
  const request = {
    requestType: "tool_user_input" as const,
    payload: {
      summary: "Prepare",
      details: {
        structuredElicitation: {
          mode: "form",
          sourceText: "Fixture",
          message: "Enter the count",
          _meta: { internal: "fixture" },
          requestedSchema: {
            required: ["count"],
            properties: { count: { type: "integer", minimum: 1 } },
          },
        },
      },
    },
  };
  expect(() => buildAppThreadReply(request, { kind: "form", values: { count: 0 } })).toThrow(
    /valid/u,
  );
  expect(buildAppThreadReply(request, { kind: "form", values: { count: 2 } })).toEqual({
    action: "accept",
    content: { count: 2 },
    _meta: { internal: "fixture" },
  });
});

it("keeps credentials in the app", () => {
  expect(() =>
    buildAppThreadReply(
      {
        requestType: "tool_user_input",
        payload: {
          summary: "Credentials",
          details: {
            userInputForm: { questions: [{ id: "token", question: "Token?", isSecret: true }] },
          },
        },
      },
      { kind: "questions", answers: { token: "placeholder" } },
    ),
  ).toThrow(/secret-bearing/u);
});

it("rejects a write-only structured form field", () => {
  expect(() =>
    buildAppThreadReply(
      {
        requestType: "tool_user_input",
        payload: {
          summary: "Credentials",
          details: {
            structuredElicitation: {
              mode: "form",
              sourceText: "Fixture",
              message: "Authenticate",
              requestedSchema: { properties: { key: { type: "string", writeOnly: true } } },
            },
          },
        },
      },
      { kind: "form", values: { key: "placeholder" } },
    ),
  ).toThrow(/secret-bearing/u);
});
