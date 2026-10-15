import { expect, it } from "vitest";
import type { ElicitationRequest } from "@anthropic-ai/claude-agent-sdk";
import { normalizeClaudeElicitationResponse } from "./sdkElicitation";

it.each(["number", "integer", "boolean", "array", "string"])(
  "omits empty optional %s values rather than forwarding an invalid type",
  (type) => {
    const request: ElicitationRequest = {
      serverName: "fixture",
      message: "Optional field",
      requestedSchema: { type: "object", properties: { field: { type } } },
    };
    for (const field of ["", []]) {
      expect(
        normalizeClaudeElicitationResponse(request, { action: "accept", content: { field } }),
      ).toEqual({
        action: "accept",
        content: {},
      });
      expect(() =>
        normalizeClaudeElicitationResponse(
          {
            ...request,
            requestedSchema: { ...request.requestedSchema, required: ["field"] },
          },
          { action: "accept", content: { field } },
        ),
      ).toThrow("invalid value");
    }
  },
);

it("preserves valid false and zero values and strips undeclared fields", () => {
  const request: ElicitationRequest = {
    serverName: "fixture",
    message: "Typed fields",
    requestedSchema: {
      type: "object",
      properties: { enabled: { type: "boolean" }, count: { type: "integer" } },
    },
  };
  expect(
    normalizeClaudeElicitationResponse(request, {
      action: "accept",
      content: { enabled: false, count: 0, extra: "ignore" },
    }),
  ).toEqual({ action: "accept", content: { enabled: false, count: 0 } });
});
