import type { CanonicalRequestType, RequestPayload } from "@/shared/contracts";
import { EDIT_PATH } from "./core";

export interface RequestCase {
  id: string;
  requestType: CanonicalRequestType;
  payload: RequestPayload;
  inventoryIds: readonly string[];
}
export const REQUEST_CASES: readonly RequestCase[] = [
  ...(
    [
      "command_execution_approval",
      "file_read_approval",
      "file_change_approval",
      "apply_patch_approval",
      "tool_call_approval",
      "tool_user_input",
      "auth_refresh",
    ] as const
  ).map((requestType) => ({
    id: `request_${requestType}`,
    requestType,
    inventoryIds: [`request_${requestType}`],
    payload: {
      summary: `Fixture ${requestType}`,
      details: {
        toolName: "FixtureTool",
        input: { path: EDIT_PATH, command: "fixture-command" },
        blockedPath: EDIT_PATH,
        decisionReason: "Fixture permission",
      },
      options: [
        { optionId: "allow_once", label: "Allow once" },
        { optionId: "deny", label: "Deny" },
      ],
    },
  })),
  {
    id: "request_user_input_form",
    requestType: "tool_user_input",
    inventoryIds: ["request_user_input_form"],
    payload: {
      summary: "Fixture questions",
      details: {
        userInputForm: {
          questions: [
            {
              id: "q1",
              header: "Pick",
              question: "Choose one fixture",
              multiSelect: false,
              options: [
                { optionId: "a", label: "A" },
                { optionId: "b", label: "B" },
              ],
            },
            {
              id: "q2",
              header: "Multiple",
              question: "Choose fixture set",
              multiSelect: true,
              options: [
                { optionId: "c", label: "C" },
                { optionId: "d", label: "D" },
              ],
            },
            { id: "q3", header: "Text", question: "Enter fixture text", isSecret: false },
          ],
        },
      },
    },
  },
  {
    id: "request_structured_form",
    requestType: "tool_user_input",
    inventoryIds: ["request_structured_form"],
    payload: {
      summary: "Fixture elicitation",
      details: {
        structuredElicitation: {
          mode: "form",
          sourceText: "Fixture tool",
          message: "Fixture elicitation",
          requestedSchema: {
            type: "object",
            required: ["label", "count"],
            properties: {
              label: { type: "string", minLength: 1 },
              count: { type: "integer", minimum: 1, maximum: 4 },
              ratio: { type: "number", default: 0.5 },
              enabled: { type: "boolean", default: true },
              choice: {
                type: "string",
                oneOf: [
                  { const: "a", title: "A" },
                  { const: "b", title: "B" },
                ],
                allowCustom: true,
              },
              many: { type: "array", items: { enum: ["a", "b"] }, minItems: 1, maxItems: 2 },
              conditional: { type: "string", visibleWhen: [{ field: "enabled", equals: true }] },
            },
          },
        },
      },
    },
  },
  {
    id: "request_url_elicitation",
    requestType: "tool_user_input",
    inventoryIds: ["request_url_elicitation"],
    payload: {
      summary: "Fixture link",
      details: {
        structuredElicitation: {
          mode: "url",
          sourceText: "Fixture tool",
          message: "Fixture authorization",
          url: "https://fixture.invalid/authorization",
          elicitationId: "fixture-elicit",
        },
      },
    },
  },
];
