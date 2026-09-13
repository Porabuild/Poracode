import { describe, expect, it } from "vitest";
import { openCode2FormPayload } from "./forms";

describe("OpenCode 2 typed forms", () => {
  it("preserves typed defaults, validation, optional fields, conditions and external links", () => {
    const payload = openCode2FormPayload({
      title: "Setup",
      fields: [
        { key: "enabled", type: "boolean", default: true },
        {
          key: "count",
          type: "integer",
          required: false,
          minimum: 1,
          maximum: 5,
          default: 2,
          when: [{ key: "enabled", op: "eq", value: true }],
        },
        {
          key: "name",
          type: "string",
          minLength: 2,
          maxLength: 20,
          pattern: "^[a-z]+$",
          custom: true,
          options: [{ value: "foo", label: "Foo" }],
        },
        {
          key: "tags",
          type: "multiselect",
          minItems: 1,
          maxItems: 2,
          custom: true,
          default: ["x"],
          options: [{ value: "x", label: "Ex" }],
        },
        {
          key: "external",
          type: "external",
          url: "https://example.com/authorize",
          title: "Authorize",
        },
      ],
    });
    const form = payload.details.structuredElicitation;
    expect(form.requestedSchema).toEqual({
      type: "object",
      required: ["enabled", "name", "tags"],
      properties: {
        enabled: { type: "boolean", default: true },
        count: {
          type: "integer",
          minimum: 1,
          maximum: 5,
          default: 2,
          visibleWhen: [{ field: "enabled", equals: true }],
        },
        name: {
          type: "string",
          minLength: 2,
          maxLength: 20,
          pattern: "^[a-z]+$",
          allowCustom: true,
          oneOf: [{ const: "foo", title: "Foo" }],
        },
        tags: {
          type: "array",
          minItems: 1,
          maxItems: 2,
          allowCustom: true,
          default: ["x"],
          items: { oneOf: [{ const: "x", title: "Ex" }] },
        },
      },
    });
    expect(form.links).toEqual([{ url: "https://example.com/authorize", title: "Authorize" }]);
  });

  it("drops unknown visibility operators instead of inverting them", () => {
    const payload = openCode2FormPayload({
      title: "Setup",
      fields: [
        {
          key: "name",
          type: "string",
          when: [
            { key: "enabled", op: "eq", value: true },
            // Future protocol operator — bypasses the public union on purpose.
            { key: "level", op: "gt", value: 3 } as unknown as {
              key: string;
              op: "eq";
              value: string | number | boolean;
            },
          ],
        },
      ],
    });
    const properties = payload.details.structuredElicitation.requestedSchema.properties;
    expect(properties.name?.visibleWhen).toEqual([{ field: "enabled", equals: true }]);
  });

  it("maps neq to notEquals", () => {
    const payload = openCode2FormPayload({
      title: "Setup",
      fields: [{ key: "name", type: "string", when: [{ key: "enabled", op: "neq", value: true }] }],
    });
    const properties = payload.details.structuredElicitation.requestedSchema.properties;
    expect(properties.name?.visibleWhen).toEqual([{ field: "enabled", notEquals: true }]);
  });
});
