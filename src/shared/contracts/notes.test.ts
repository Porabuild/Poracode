import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { notesTodoItemSchema, projectNotesSchema } from "./notes";

describe("projectNotesSchema", () => {
  it("parses a full payload", () => {
    const parsed = projectNotesSchema.parse({
      projectId: "p1",
      doc: { type: "doc", content: [] },
      todos: [{ id: "t1", text: "ship it", done: false, createdAt: "2026-01-01T00:00:00.000Z" }],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(parsed.todos).toHaveLength(1);
    expect(parsed.todos[0]?.text).toBe("ship it");
  });

  it("allows a null doc and empty todos", () => {
    const parsed = projectNotesSchema.parse({
      projectId: "p1",
      doc: null,
      todos: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(parsed.doc).toBeNull();
    expect(parsed.todos).toEqual([]);
  });

  it("rejects an empty projectId", () => {
    expect(() =>
      projectNotesSchema.parse({ projectId: "", doc: null, todos: [], updatedAt: "t" }),
    ).toThrow(ZodError);
  });
});

describe("notesTodoItemSchema", () => {
  it("rejects a todo missing its id", () => {
    expect(() => notesTodoItemSchema.parse({ text: "x", done: false, createdAt: "t" })).toThrow(
      ZodError,
    );
  });
});
