import { describe, expect, it } from "vitest";
import { extractAcpTodoWriteSteps } from "./contentExtraction";

describe("extractAcpTodoWriteSteps", () => {
  it("falls back to description fields when content is omitted", () => {
    expect(
      extractAcpTodoWriteSteps({
        todos: [
          { description: "Audit transport", status: "completed" },
          { description: "Wire plan preview", status: "in_progress" },
          { status: "pending" },
        ],
      }),
    ).toEqual([
      { step: "Audit transport", status: "completed" },
      { step: "Wire plan preview", status: "in_progress" },
      { step: "Task", status: "pending" },
    ]);
  });
});
