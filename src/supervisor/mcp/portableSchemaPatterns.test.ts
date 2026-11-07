import { describe, expect, it } from "vitest";
import { omitInvalidSchemaPatterns } from "./portableSchemaPatterns";

// Actual double-escaped MCP email pattern rejected by the model API in native
// Muse 1.4.7 child runs, before their first model reply.
const rejectedPattern =
  '^(([^<>()\\[\\]\\\\.,;:\\s@"]+(\\.[^<>()\\[\\]\\\\.,;:\\s@"]+)*)|(".+"))@((\\[[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}])|(([a-zA-Z\\-0-9]+\\.)+[a-zA-Z]{2,}))$';

describe("portable MCP schema patterns", () => {
  it("omits the rejected pattern through nested schemas without mutating the upstream contract", () => {
    const schema = {
      type: "object",
      properties: {
        email: { type: "string", format: "email", pattern: rejectedPattern },
        pattern: { type: "string", pattern: "^[a-z]+$" },
        contacts: {
          type: "array",
          items: { anyOf: [{ $ref: "#/$defs/email" }, { type: "string", pattern: "[" }] },
        },
      },
      $defs: { email: { type: "string", pattern: rejectedPattern } },
      required: ["email"],
      additionalProperties: false,
      default: { pattern: "[" },
      examples: [{ pattern: "[" }],
    };
    const before = structuredClone(schema);
    const result = omitInvalidSchemaPatterns(schema);
    expect(result.properties.email).toEqual({ type: "string", format: "email" });
    expect(result.$defs.email).toEqual({ type: "string" });
    expect(result.properties.contacts.items.anyOf[1]).toEqual({ type: "string" });
    expect(result.properties.pattern).toEqual(schema.properties.pattern);
    expect(result.required).toEqual(["email"]);
    expect(result.additionalProperties).toBe(false);
    expect(result.default).toEqual({ pattern: "[" });
    expect(result.examples).toEqual([{ pattern: "[" }]);
    expect(schema).toEqual(before);
  });

  it("retains valid Unicode patterns, boolean schemas, and tuple items", () => {
    expect(
      omitInvalidSchemaPatterns({
        items: [false, { pattern: "[" }],
        not: true,
        if: { pattern: "[" },
        then: { pattern: "^\\p{L}+$" },
      }),
    ).toEqual({
      items: [false, {}],
      not: true,
      if: {},
      then: { pattern: "^\\p{L}+$" },
    });
  });
});
