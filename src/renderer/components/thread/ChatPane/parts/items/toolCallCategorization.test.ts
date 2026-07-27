import { describe, expect, it } from "vitest";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import {
  categorizeItem,
  categorizeToolName,
  categorizeVerbPrefix,
  categoryFromSummaryLabel,
  isEditOnlyToolGroup,
  isToolGroupItem,
  segmentToolGroupRows,
  summarizeSameFileEditGroup,
} from "./toolCallCategorization";

describe("categorizeItem", () => {
  it("maps reasoning items to the thought category and keeps them groupable", () => {
    const item = {
      id: "reasoning-1",
      type: "reasoning",
      state: "completed",
      streams: { reasoning_text: "planning" },
    } as unknown as RuntimeChatItem;

    expect(categorizeItem(item)).toBe("thought");
    // Thoughts are group members like any other tool row.
    expect(isToolGroupItem(item)).toBe(true);
  });

  it("maps MCP tool calls to their own category", () => {
    const encodedName = makeTool("mcp-encoded", "mcp__crossagents__wait_for_agent");
    const explicitServer = {
      ...makeTool("mcp-server", "wait_for_agent"),
      payload: { name: "wait_for_agent", serverId: "crossagents", status: "success" },
    } as RuntimeChatItem;

    expect(categorizeItem(encodedName)).toBe("mcp");
    expect(categorizeItem(explicitServer)).toBe("mcp");
  });
});

describe("segmentToolGroupRows", () => {
  it("merges strictly consecutive same-file edits into one run segment", () => {
    const view = makeTool("t1", "Read");
    const items = [
      view,
      makeFileChange("a", "src/foo.ts", { added: 4, removed: 1 }),
      makeFileChange("b", "src/foo.ts", { added: 2, removed: 3 }),
    ];
    expect(segmentToolGroupRows(items)).toEqual([
      { kind: "item", item: view },
      {
        kind: "same-file-edits",
        items: [items[1], items[2]],
        summary: { count: 2, path: "src/foo.ts", diffSummary: { added: 6, removed: 4 } },
      },
    ]);
  });

  it("absorbs thoughts between same-file edits but not trailing ones", () => {
    const thoughtBetween = makeReasoning("r1", "next patch");
    const thoughtAfter = makeReasoning("r2", "done");
    const items = [
      makeFileChange("a", "src/foo.ts", { added: 1, removed: 0 }),
      thoughtBetween,
      makeFileChange("b", "src/foo.ts", { added: 1, removed: 0 }),
      thoughtAfter,
    ];
    expect(segmentToolGroupRows(items)).toEqual([
      {
        kind: "same-file-edits",
        items: [items[0], thoughtBetween, items[2]],
        summary: { count: 2, path: "src/foo.ts", diffSummary: { added: 2, removed: 0 } },
      },
      { kind: "item", item: thoughtAfter },
    ]);
  });

  it("keeps same-file edits separate when another tool call sits between them", () => {
    const items = [
      makeFileChange("a", "src/foo.ts"),
      makeTool("t1", "Read"),
      makeFileChange("b", "src/foo.ts"),
    ];
    expect(segmentToolGroupRows(items)).toEqual([
      { kind: "item", item: items[0] },
      { kind: "item", item: items[1] },
      { kind: "item", item: items[2] },
    ]);
  });

  it("starts a new run when the edited path changes", () => {
    const items = [
      makeFileChange("a", "src/foo.ts", { added: 1, removed: 0 }),
      makeFileChange("b", "src/foo.ts", { added: 1, removed: 0 }),
      makeFileChange("c", "src/bar.ts", { added: 1, removed: 0 }),
      makeFileChange("d", "src/bar.ts", { added: 2, removed: 0 }),
    ];
    expect(segmentToolGroupRows(items)).toEqual([
      {
        kind: "same-file-edits",
        items: [items[0], items[1]],
        summary: { count: 2, path: "src/foo.ts", diffSummary: { added: 2, removed: 0 } },
      },
      {
        kind: "same-file-edits",
        items: [items[2], items[3]],
        summary: { count: 2, path: "src/bar.ts", diffSummary: { added: 3, removed: 0 } },
      },
    ]);
  });
});

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
    expect(categoryFromSummaryLabel("MCP")).toBe("mcp");
    expect(categoryFromSummaryLabel("MCPs")).toBe("mcp");
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

describe("summarizeSameFileEditGroup", () => {
  it("summarizes two same-path file_change edits with total diff", () => {
    const items = [
      makeFileChange("a", "src/foo.ts", { added: 4, removed: 1 }),
      makeFileChange("b", "src/foo.ts", { added: 2, removed: 3 }),
    ];
    expect(summarizeSameFileEditGroup(items)).toEqual({
      count: 2,
      path: "src/foo.ts",
      diffSummary: { added: 6, removed: 4 },
    });
  });

  it("keeps the same-file header when thoughts interleave the edits", () => {
    const items = [
      makeFileChange("a", "src/foo.ts", { added: 4, removed: 1 }),
      makeReasoning("r1", "planning the next patch"),
      makeFileChange("b", "src/foo.ts", { added: 2, removed: 3 }),
      makeReasoning("r2", "done"),
    ];
    expect(summarizeSameFileEditGroup(items)).toEqual({
      count: 2,
      path: "src/foo.ts",
      diffSummary: { added: 6, removed: 4 },
    });
  });

  it("returns null for a single edit even with thoughts", () => {
    const items = [makeFileChange("a", "src/foo.ts"), makeReasoning("r1", "thinking")];
    expect(summarizeSameFileEditGroup(items)).toBeNull();
  });

  it("returns null when edits target different files", () => {
    const items = [makeFileChange("a", "src/foo.ts"), makeFileChange("b", "src/bar.ts")];
    expect(summarizeSameFileEditGroup(items)).toBeNull();
  });

  it("returns null when a non-edit tool breaks the edit run", () => {
    const items = [
      makeFileChange("a", "src/foo.ts"),
      makeTool("t1", "Read"),
      makeFileChange("b", "src/foo.ts"),
    ];
    expect(summarizeSameFileEditGroup(items)).toBeNull();
  });

  it("normalizes path separators when comparing", () => {
    const items = [
      makeFileChange("a", "src\\foo.ts", { added: 1, removed: 0 }),
      makeFileChange("b", "src/foo.ts", { added: 1, removed: 0 }),
    ];
    expect(summarizeSameFileEditGroup(items)).toEqual({
      count: 2,
      path: "src\\foo.ts",
      diffSummary: { added: 2, removed: 0 },
    });
  });
});

describe("isEditOnlyToolGroup", () => {
  it("is true for pure edit groups and edit+thought groups", () => {
    expect(
      isEditOnlyToolGroup([makeFileChange("a", "src/foo.ts"), makeFileChange("b", "src/bar.ts")]),
    ).toBe(true);
    expect(
      isEditOnlyToolGroup([
        makeFileChange("a", "src/foo.ts"),
        makeReasoning("r1", "thinking"),
        makeFileChange("b", "src/foo.ts"),
      ]),
    ).toBe(true);
  });

  it("is false when any non-edit non-thought tool is present", () => {
    expect(isEditOnlyToolGroup([makeTool("t1", "Read"), makeFileChange("a", "src/foo.ts")])).toBe(
      false,
    );
  });

  it("is false for empty or thought-only groups", () => {
    expect(isEditOnlyToolGroup([])).toBe(false);
    expect(isEditOnlyToolGroup([makeReasoning("r1", "only thinking")])).toBe(false);
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

function makeFileChange(
  id: string,
  path: string,
  diffSummary: { added: number; removed: number } = { added: 1, removed: 1 },
): RuntimeChatItem {
  return {
    id,
    type: "file_change",
    state: "completed",
    payload: { path, changeKind: "edit", diffSummary },
    streams: {},
  };
}

function makeReasoning(id: string, text: string): RuntimeChatItem {
  return {
    id,
    type: "reasoning",
    state: "completed",
    streams: { reasoning_text: text },
  };
}

function makeTool(id: string, name: string): RuntimeChatItem {
  return {
    id,
    type: "tool_call",
    state: "completed",
    payload: { name, status: "success" },
    streams: {},
  };
}
// @vitest-environment node
