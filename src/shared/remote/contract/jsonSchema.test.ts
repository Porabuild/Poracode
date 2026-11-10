import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodToJsonSchema } from "./jsonSchema";

type JsonNode = { format?: string; pattern?: string; properties?: Record<string, JsonNode> };

describe("zodToJsonSchema canonical form", () => {
  it("keeps string checks as patterns without Zod's pseudo-format keywords", () => {
    const schema = zodToJsonSchema(
      z.object({
        starts: z.string().startsWith("ui://"),
        ends: z.string().endsWith(".json"),
        includes: z.string().includes("@"),
      }),
      "output",
    ) as JsonNode;

    expect(schema.properties).toMatchObject({
      starts: { pattern: expect.any(String) },
      ends: { pattern: expect.any(String) },
      includes: { pattern: expect.any(String) },
    });
    expect(schema.properties?.starts).not.toHaveProperty("format");
    expect(schema.properties?.ends).not.toHaveProperty("format");
    expect(schema.properties?.includes).not.toHaveProperty("format");
  });

  it("keeps real formats that native validators enforce", () => {
    const schema = zodToJsonSchema(
      z.object({ id: z.uuid(), at: z.iso.datetime(), link: z.url() }),
      "output",
    ) as JsonNode;

    expect(schema.properties?.id?.format).toBe("uuid");
    expect(schema.properties?.at?.format).toBe("date-time");
    expect(schema.properties?.link?.format).toBe("uri");
  });
});
