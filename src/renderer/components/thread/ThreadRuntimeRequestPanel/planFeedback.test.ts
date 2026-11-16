import { describe, expect, it } from "vitest";
import { formatPlanFeedbackMessage, normalizePlanRange } from "./planFeedback";

const PLAN = "# Plan\n\n1. Add the flag\n2. Wire it up\n3. Ship";

describe("formatPlanFeedbackMessage", () => {
  it("quotes the reviewed lines with their line numbers, ordered by position", () => {
    const message = formatPlanFeedbackMessage(PLAN, [
      { id: "b", startLine: 3, endLine: 4, text: " split this step " },
      { id: "a", startLine: 1, endLine: 1, text: "rename" },
    ]);
    expect(message).toBe(
      [
        "Please revise the plan you proposed. My line feedback is anchored to line numbers of that exact plan text, quoted below.",
        "Line 1:\n```\n# Plan\n```\nFeedback: rename",
        "Lines 3-4:\n```\n1. Add the flag\n2. Wire it up\n```\nFeedback: split this step",
        "Respond with a complete revised plan.",
      ].join("\n\n"),
    );
  });

  it("summarizes the rest of a long range instead of quoting it whole", () => {
    const plan = Array.from({ length: 12 }, (_, i) => `step ${i + 1}`).join("\n");
    const message = formatPlanFeedbackMessage(plan, [
      { id: "a", startLine: 1, endLine: 12, text: "too long" },
    ]);
    expect(message).toContain("step 8\n… (4 more lines)\n```\nFeedback: too long");
    expect(message).not.toContain("step 9");
  });

  it("counts CRLF plans by logical line", () => {
    const message = formatPlanFeedbackMessage("a\r\nb\r\nc", [
      { id: "a", startLine: 2, endLine: 2, text: "x" },
    ]);
    expect(message).toContain("Line 2:\n```\nb\n```\nFeedback: x");
  });

  it("lengthens the fence when a quoted line contains backticks", () => {
    const message = formatPlanFeedbackMessage("run ```sh```", [
      { id: "a", startLine: 1, endLine: 1, text: "x" },
    ]);
    expect(message).toContain("Line 1:\n````\nrun ```sh```\n````\nFeedback: x");
  });
});

describe("normalizePlanRange", () => {
  it("orders a backwards selection", () => {
    expect(normalizePlanRange(5, 2)).toEqual({ startLine: 2, endLine: 5 });
  });
});
