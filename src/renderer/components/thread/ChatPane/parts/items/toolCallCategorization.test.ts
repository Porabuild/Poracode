import { describe, expect, it } from "vitest";
import {
  categorizeToolName,
  categorizeVerbPrefix,
  categoryFromSummaryLabel,
} from "./toolCallCategorization";

describe("categorizeToolName", () => {
  it("maps read tools to viewed", () => {
    expect(categorizeToolName("Read")).toBe("viewed");
    expect(categorizeToolName("NotebookRead")).toBe("viewed");
  });

  it("maps search and fetch tools to searched", () => {
    expect(categorizeToolName("Grep")).toBe("searched");
    expect(categorizeToolName("Glob")).toBe("searched");
    expect(categorizeToolName("WebSearch")).toBe("searched");
    expect(categorizeToolName("ToolSearch")).toBe("searched");
  });

  it("maps edit tools (including patch variants) to edited", () => {
    expect(categorizeToolName("Edit")).toBe("edited");
    expect(categorizeToolName("Write")).toBe("edited");
    expect(categorizeToolName("MultiEdit")).toBe("edited");
    expect(categorizeToolName("ApplyPatch")).toBe("edited");
    expect(categorizeToolName("apply_patch")).toBe("edited");
  });

  it("maps shell tools to executed", () => {
    expect(categorizeToolName("Bash")).toBe("executed");
    expect(categorizeToolName("KillShell")).toBe("executed");
  });

  it("falls back to other for unknown names", () => {
    expect(categorizeToolName("UnknownTool")).toBe("other");
    expect(categorizeToolName("")).toBe("other");
  });
});

describe("categoryFromSummaryLabel", () => {
  it("resolves singular and plural labels to their category", () => {
    expect(categoryFromSummaryLabel("view")).toBe("viewed");
    expect(categoryFromSummaryLabel("views")).toBe("viewed");
    expect(categoryFromSummaryLabel("search")).toBe("searched");
    expect(categoryFromSummaryLabel("searches")).toBe("searched");
    expect(categoryFromSummaryLabel("edit")).toBe("edited");
    expect(categoryFromSummaryLabel("edits")).toBe("edited");
    expect(categoryFromSummaryLabel("command")).toBe("executed");
    expect(categoryFromSummaryLabel("commands")).toBe("executed");
    expect(categoryFromSummaryLabel("tool")).toBe("other");
    expect(categoryFromSummaryLabel("tools")).toBe("other");
  });

  it("matches case-insensitively", () => {
    expect(categoryFromSummaryLabel("Edits")).toBe("edited");
    expect(categoryFromSummaryLabel("COMMAND")).toBe("executed");
  });

  it("returns null for unknown labels", () => {
    expect(categoryFromSummaryLabel("unknown")).toBeNull();
    expect(categoryFromSummaryLabel("")).toBeNull();
  });
});

describe("categorizeVerbPrefix", () => {
  it("maps reading/viewing prefixes to viewed", () => {
    expect(categorizeVerbPrefix("Reading src/foo.ts")).toBe("viewed");
    expect(categorizeVerbPrefix("viewing image")).toBe("viewed");
    expect(categorizeVerbPrefix("Read /etc/hosts")).toBe("viewed");
  });

  it("maps editing/writing prefixes to edited", () => {
    expect(categorizeVerbPrefix("Editing src/foo.ts")).toBe("edited");
    expect(categorizeVerbPrefix("writing config")).toBe("edited");
    expect(categorizeVerbPrefix("Creating snapshot")).toBe("edited");
  });

  it("maps running/shell prefixes to executed", () => {
    expect(categorizeVerbPrefix("Running tests")).toBe("executed");
    expect(categorizeVerbPrefix("shell command")).toBe("executed");
  });

  it("falls back to other when no prefix matches", () => {
    expect(categorizeVerbPrefix("Unknown action")).toBe("other");
  });
});
