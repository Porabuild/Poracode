import { expect, it } from "vitest";
import type { OpenRuntimeRequestPreview } from "@/shared/runtimeRequestPreview";
import { describeThreadRequest } from "./threadRequestPreview";

const base = {
  requestId: "request-1",
  requestType: "tool_user_input",
  receivedAt: "2026-01-01T00:00:00.000Z",
} as const satisfies Omit<OpenRuntimeRequestPreview, "payload">;

it("uses the app's approval option IDs when the provider supplies none", () => {
  expect(
    describeThreadRequest(
      {
        ...base,
        requestType: "tool_call_approval",
        payload: { summary: "Confirm the change" },
      },
      false,
    ),
  ).toMatchObject({
    responseMode: "options",
    options: [{ optionId: "allow" }, { optionId: "deny" }],
  });
});

it("projects valid structured form constraints without private metadata or default values", () => {
  const result = describeThreadRequest(
    {
      ...base,
      payload: {
        summary: "Choose a color",
        details: {
          structuredElicitation: {
            mode: "form",
            message: "Choose a color",
            sourceText: "Fixture server",
            _meta: { token: "private" },
            requestedSchema: {
              type: "object",
              required: ["color"],
              properties: {
                color: { type: "string", enum: ["blue"], enumNames: ["Blue"], default: "private" },
                count: { type: "integer", minimum: 1 },
                broken: { type: "string", enum: "invalid" },
              },
            },
          },
        },
      },
    },
    true,
  );
  expect(result).toMatchObject({
    responseMode: "structured_form",
    details: {
      fields: [
        { id: "color", required: true, options: [{ id: "blue", label: "Blue" }] },
        { id: "count", type: "integer", minimum: 1, required: false },
        { id: "broken", unsupported: true },
      ],
    },
  });
  expect(JSON.stringify(result)).not.toContain("private");
});

it("identifies browser completion without copying the session URL", () => {
  const result = describeThreadRequest(
    {
      ...base,
      payload: {
        summary: "Sign in",
        details: {
          structuredElicitation: {
            mode: "url",
            message: "Follow the link in Poracode",
            sourceText: "Fixture server",
            url: "https://fixture.test/session?token=private",
            elicitationId: "private",
          },
        },
      },
    },
    true,
  );
  expect(result).toMatchObject({
    responseMode: "browser",
    details: { message: "Follow the link in Poracode", source: "Fixture server" },
  });
  expect(JSON.stringify(result)).not.toContain("private");
});
