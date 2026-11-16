import { describe, expect, it } from "vitest";
import { limitToolSchemaDepth, omitInvalidSchemaPatterns } from "./portableSchemaPatterns";

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

describe("MCP tool schema nesting", () => {
  function nested(levels: number, kind: "object" | "array" = "object"): unknown {
    let schema: unknown = { type: "string" };
    for (let i = 0; i < levels; i += 1) {
      schema =
        kind === "object"
          ? { type: "object", properties: { x: schema }, required: ["x"] }
          : { type: "array", items: schema };
    }
    return schema;
  }

  it.each(["object", "array"] as const)(
    "keeps ten nested %s schemas and limits the eleventh without mutating the source",
    (kind) => {
      const valid = { inputSchema: nested(10, kind), description: "fixture" };
      expect(limitToolSchemaDepth(valid, 10)).toBe(valid);

      const tool = { inputSchema: nested(11, kind), description: "fixture" };
      const before = structuredClone(tool);
      const result = limitToolSchemaDepth(tool, 10);
      let child = result.inputSchema as Record<string, unknown>;
      for (let i = 0; i < 10; i += 1) {
        child =
          kind === "object"
            ? (child["properties"] as Record<string, Record<string, unknown>>)["x"]!
            : (child["items"] as Record<string, unknown>);
      }
      expect(child).toEqual({
        description: "See the original input schema in the tool description.",
      });
      expect(result.description).toContain(JSON.stringify(tool.inputSchema));
      expect(tool).toEqual(before);
    },
  );

  it("follows references at their use site and preserves unrelated schema data", () => {
    const schema = {
      type: "object",
      properties: {
        deep: { $ref: "#/$defs/deep" },
        shallow: { $ref: "#/$defs/shallow" },
      },
      required: ["deep"],
      $defs: { deep: nested(10), shallow: nested(2) },
      examples: [{ properties: { x: nested(12) } }],
    };
    const result = limitToolSchemaDepth({ inputSchema: schema, description: "fixture" }, 10);
    expect(result.inputSchema.properties.deep).toEqual({
      description: "See the original input schema in the tool description.",
    });
    expect(result.inputSchema.properties.shallow).toEqual(schema.properties.shallow);
    expect(result.inputSchema.$defs).toEqual(schema.$defs);
    expect(result.inputSchema.examples).toEqual(schema.examples);
    expect(result.inputSchema.required).toEqual(["deep"]);
    expect(result.description).toContain(JSON.stringify(schema));
  });

  it("does not count unions as containers and bounds recursive references", () => {
    let union: unknown = { type: "string" };
    for (let i = 0; i < 12; i += 1) union = { anyOf: [union, { type: "null" }] };
    const tool = { inputSchema: { type: "object", properties: { union } } };
    expect(limitToolSchemaDepth(tool, 10)).toBe(tool);

    const recursive = { inputSchema: { type: "object", properties: { next: { $ref: "#" } } } };
    expect(limitToolSchemaDepth(recursive, 10).inputSchema.properties.next).toEqual({
      description: "See the original input schema in the tool description.",
    });
  });

  it("handles reused references without expanding each occurrence", () => {
    const definitions: Record<string, unknown> = { d0: { type: "string" } };
    for (let i = 1; i <= 30; i += 1) {
      const ref = `#/$defs/d${i - 1}`;
      definitions[`d${i}`] = { anyOf: [{ $ref: ref }, { $ref: ref }] };
    }
    const tool = {
      inputSchema: {
        type: "object",
        properties: { value: { $ref: "#/$defs/d30" } },
        $defs: definitions,
      },
    };
    expect(limitToolSchemaDepth(tool, 10)).toBe(tool);
  });

  it.each(["#Deep", "#/$defs/deep%20schema", "#/$defs/missing", "https://example.test/schema"])(
    "does not send an unsupported or unresolved reference to the gateway: %s",
    (ref) => {
      const tool = {
        inputSchema: {
          type: "object",
          properties: { value: { $ref: ref } },
          $defs: { "deep schema": nested(10) },
        },
        description: "fixture",
      };
      const result = limitToolSchemaDepth(tool, 10);
      expect(result.inputSchema.properties.value).toEqual({
        description: "See the original input schema in the tool description.",
      });
      expect(result.description).toContain(JSON.stringify(tool.inputSchema));
    },
  );

  it("keeps a root schema an object when its reference cannot be resolved", () => {
    const result = limitToolSchemaDepth({ inputSchema: { type: "object", $ref: "#missing" } }, 10);
    expect(result.inputSchema).toEqual({
      type: "object",
      description: "See the original input schema in the tool description.",
    });
  });

  it.each(["$dynamicRef", "$recursiveRef"])("bounds %s references", (key) => {
    const tool = { inputSchema: { type: "object", properties: { value: { [key]: "#node" } } } };
    expect(limitToolSchemaDepth(tool, 10).inputSchema.properties.value).toEqual({
      description: "See the original input schema in the tool description.",
    });
  });
});
