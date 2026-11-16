import { describe, expect, it } from "vitest";
import { describePlanLines, tokenizePlanInline } from "./planLineDisplay";

describe("describePlanLines", () => {
  it("styles common Markdown lines one row per source line", () => {
    const views = describePlanLines([
      "# Title",
      "",
      "1. First step",
      "  - nested bullet",
      "> a quote",
      "---",
      "plain text",
    ]);
    expect(views).toEqual([
      { kind: "heading", level: 1, text: "Title" },
      { kind: "blank" },
      { kind: "list", marker: "1.", indent: 0, text: "First step" },
      { kind: "list", marker: "•", indent: 1, text: "nested bullet" },
      { kind: "quote", text: "a quote" },
      { kind: "rule" },
      { kind: "text", text: "plain text" },
    ]);
  });

  it("keeps fenced lines verbatim until the matching fence closes", () => {
    const views = describePlanLines([
      "```ts",
      "# not a heading",
      "- not a list",
      "```",
      "# Heading",
    ]);
    expect(views).toEqual([
      { kind: "fence", text: "```ts" },
      { kind: "code", text: "# not a heading" },
      { kind: "code", text: "- not a list" },
      { kind: "fence", text: "```" },
      { kind: "heading", level: 1, text: "Heading" },
    ]);
  });

  it("strips a closing # run only after whitespace", () => {
    expect(describePlanLines(["## Port to C#", "## Title ##"])).toEqual([
      { kind: "heading", level: 2, text: "Port to C#" },
      { kind: "heading", level: 2, text: "Title" },
    ]);
  });

  it("does not close a backtick fence with a shorter or tilde fence", () => {
    const views = describePlanLines(["````", "```", "~~~", "````"]);
    expect(views.map((view) => view.kind)).toEqual(["fence", "code", "code", "fence"]);
  });
});

describe("tokenizePlanInline", () => {
  it("splits inline code and bold from plain text", () => {
    expect(tokenizePlanInline("Add `exportRows()` and **test** it")).toEqual([
      { kind: "text", text: "Add " },
      { kind: "code", text: "exportRows()" },
      { kind: "text", text: " and " },
      { kind: "strong", text: "test" },
      { kind: "text", text: " it" },
    ]);
  });

  it("leaves an unmatched backtick as text", () => {
    expect(tokenizePlanInline("a ` b")).toEqual([{ kind: "text", text: "a ` b" }]);
  });
});
