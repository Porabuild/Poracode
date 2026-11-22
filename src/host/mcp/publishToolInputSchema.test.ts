import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ALL_OPERATIONS, TOOLS } from "@/host/app-controls/mcp/toolRegistry";
import { publishToolInputSchema } from "./publishToolInputSchema";

function advertised(schema: z.ZodType): Record<string, unknown> {
  return publishToolInputSchema({
    ...z.toJSONSchema(schema, { io: "input", target: "draft-07" }),
    type: "object",
  });
}

const REJECTED_KEYS = [
  "$schema",
  "$ref",
  "$defs",
  "oneOf",
  "anyOf",
  "allOf",
  "const",
  "additionalProperties",
  "propertyNames",
  "exclusiveMinimum",
  "exclusiveMaximum",
];

function rejectedKeywords(value: unknown, path: string, hits: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectedKeywords(item, `${path}[${index}]`, hits));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (REJECTED_KEYS.includes(key)) hits.push(`${path}.${key}`);
    rejectedKeywords(child, `${path}.${key}`, hits);
  }
}

describe("publishToolInputSchema", () => {
  it("flattens a discriminated union into one object with an action enum", () => {
    const source = z.discriminatedUnion("action", [
      z.strictObject({
        action: z.literal("items"),
        threadId: z.string().min(1),
        limit: z.number().int().min(1).max(500).optional(),
      }),
      z.strictObject({
        action: z.literal("detail"),
        threadId: z.string().min(1),
        itemId: z.string().min(1),
      }),
    ]);
    const raw = { ...z.toJSONSchema(source, { io: "input", target: "draft-07" }), type: "object" };

    const schema = advertised(source);

    expect(raw).toHaveProperty("oneOf");
    expect(schema).toEqual({
      type: "object",
      required: ["action", "threadId"],
      properties: {
        action: { type: "string", enum: ["items", "detail"] },
        threadId: { type: "string", minLength: 1 },
        limit: { type: "integer", minimum: 1, maximum: 500 },
        itemId: { type: "string", minLength: 1 },
      },
    });
  });

  it("uses kind when that is the shared discriminator", () => {
    const schema = advertised(
      z.discriminatedUnion("kind", [
        z.strictObject({ kind: z.literal("tap"), x: z.number() }),
        z.strictObject({ kind: z.literal("key"), key: z.enum(["home", "back"]) }),
      ]),
    );

    expect(schema).toMatchObject({
      type: "object",
      required: ["kind"],
      properties: {
        kind: { type: "string", enum: ["tap", "key"] },
        x: { type: "number" },
        key: { type: "string", enum: ["home", "back"] },
      },
    });
    expect(schema.required).toEqual(["kind"]);
  });

  it("rewrites integer exclusive bounds and nullable unions", () => {
    const schema = advertised(
      z.strictObject({
        bytes: z.number().int().gt(0),
        flag: z.boolean().nullable(),
      }),
    );

    expect(schema).toEqual({
      type: "object",
      required: ["bytes", "flag"],
      properties: {
        bytes: { type: "integer", minimum: 1, maximum: 9007199254740991 },
        flag: { type: "boolean", nullable: true },
      },
    });
  });

  it("keeps bounds when a nullable union is collapsed", () => {
    const schema = advertised(
      z.strictObject({
        maxIterations: z.number().int().min(1).max(100).nullable(),
        worktreePath: z.string().min(1).nullable().optional(),
      }),
    );

    expect(schema).toMatchObject({
      required: ["maxIterations"],
      properties: {
        maxIterations: { type: "integer", minimum: 1, maximum: 100, nullable: true },
        worktreePath: { type: "string", minLength: 1, nullable: true },
      },
    });
  });

  it("publishes literals without const", () => {
    const schema = advertised(
      z.strictObject({
        version: z.literal(1),
        mode: z.literal("heartbeat"),
      }),
    );

    expect(schema).toMatchObject({
      properties: {
        version: { type: "integer", minimum: 1, maximum: 1 },
        mode: { type: "string", enum: ["heartbeat"] },
      },
    });
    expect(JSON.stringify(schema)).not.toContain('"const"');
  });

  it("drops map keywords Gemini's function schema cannot carry", () => {
    const schema = advertised(
      z.strictObject({ plugins: z.record(z.string().min(1), z.boolean()) }),
    );

    expect(schema).toEqual({
      type: "object",
      required: ["plugins"],
      properties: { plugins: { type: "object" } },
    });
  });

  it("advertises every app-controls tool without a provider-rejected keyword", () => {
    const hits: string[] = [];
    const history = publishToolInputSchema(
      ALL_OPERATIONS.find((tool) => tool.name === "read_thread_history")!.inputSchema,
    );
    expect(history).toMatchObject({
      type: "object",
      properties: {
        action: { type: "string", enum: ["items", "turns", "detail"] },
        threadId: { type: "string" },
        itemId: { type: "string" },
      },
    });
    expect(history.required).toEqual(expect.arrayContaining(["action", "threadId"]));
    expect(history.required).not.toContain("itemId");

    for (const tool of [...TOOLS, ...ALL_OPERATIONS]) {
      rejectedKeywords(publishToolInputSchema(tool.inputSchema), tool.name, hits);
    }
    expect(hits).toEqual([]);
  });
});
