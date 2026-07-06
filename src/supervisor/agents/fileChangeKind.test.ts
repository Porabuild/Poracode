import { describe, expect, it } from "vitest";
import {
  classifyFileChangeKind,
  inferFileChangeKindFromSource,
  normalizeDiffSummaryForKind,
} from "./fileChangeKind";

describe("inferFileChangeKindFromSource", () => {
  it("reads apply_patch markers from patch text", () => {
    expect(inferFileChangeKindFromSource("*** Add File: a.ts\n+x")).toBe("create");
    expect(inferFileChangeKindFromSource("*** Delete File: a.ts")).toBe("delete");
    expect(inferFileChangeKindFromSource("*** Update File: a.ts\n@@")).toBe("edit");
  });

  it("reads git-diff markers and unified hunks", () => {
    expect(inferFileChangeKindFromSource("new file mode 100644\n+++ b/a.ts")).toBe("create");
    expect(inferFileChangeKindFromSource("deleted file mode 100644")).toBe("delete");
    expect(inferFileChangeKindFromSource("@@ -1,2 +1,3 @@\n+x")).toBe("edit");
  });

  it("honors direct changeKind/change_kind/type fields", () => {
    expect(inferFileChangeKindFromSource({ changeKind: "add" })).toBe("create");
    expect(inferFileChangeKindFromSource({ change_kind: "remove" })).toBe("delete");
    expect(inferFileChangeKindFromSource({ type: "update" })).toBe("edit");
    expect(inferFileChangeKindFromSource({ type: "modify" })).toBe("edit");
    expect(inferFileChangeKindFromSource({ type: "move" })).toBe("edit");
  });

  it("classifies uniform structured changes by their common type", () => {
    expect(
      inferFileChangeKindFromSource({
        changes: [{ kind: { type: "add" } }, { kind: { type: "create" } }],
      }),
    ).toBe("create");
    expect(
      inferFileChangeKindFromSource({
        changes: [{ kind: { type: "delete" } }, { kind: { type: "remove" } }],
      }),
    ).toBe("delete");
  });

  it("classifies MIXED structured changes as edit (codex semantic, now unified — previously acp/opencode fell through to weaker heuristics)", () => {
    expect(
      inferFileChangeKindFromSource({
        changes: [{ kind: { type: "add" } }, { kind: { type: "delete" } }],
      }),
    ).toBe("edit");
  });

  it("derives create/delete from oldText/newText emptiness", () => {
    expect(inferFileChangeKindFromSource({ oldText: "", newText: "content" })).toBe("create");
    expect(inferFileChangeKindFromSource({ oldText: "content", newText: "" })).toBe("delete");
  });

  it("follows nested args/input records (opencode payload shape)", () => {
    expect(inferFileChangeKindFromSource({ args: { changeKind: "add" } })).toBe("create");
    expect(inferFileChangeKindFromSource({ input: { patch: "*** Delete File: a.ts" } })).toBe(
      "delete",
    );
  });

  it("returns undefined when nothing is conclusive", () => {
    expect(inferFileChangeKindFromSource({ path: "a.ts" })).toBeUndefined();
    expect(inferFileChangeKindFromSource("plain text")).toBeUndefined();
    expect(inferFileChangeKindFromSource(undefined)).toBeUndefined();
  });
});

describe("classifyFileChangeKind", () => {
  it("prefers concrete source evidence over the kind/title heuristics", () => {
    // Mixed structured changes now beat an explicit delete kind — the
    // divergence deliberately unified on the codex mixed→edit rule.
    expect(
      classifyFileChangeKind("delete", "Delete files", {
        changes: [{ kind: { type: "add" } }, { kind: { type: "delete" } }],
      }),
    ).toBe("edit");
  });

  it("falls back to kind/title heuristics when sources are inconclusive", () => {
    expect(classifyFileChangeKind("delete", undefined, {})).toBe("delete");
    expect(classifyFileChangeKind(undefined, "Create component", {})).toBe("create");
    expect(classifyFileChangeKind(undefined, "Edit file", {})).toBe("edit");
  });

  it("treats a write with inline file content as a create", () => {
    expect(
      classifyFileChangeKind("write", undefined, { path: "a.ts", content: "export {};" }),
    ).toBe("create");
  });
});

describe("normalizeDiffSummaryForKind", () => {
  it("zeroes the impossible side for create/delete and passes edits through", () => {
    expect(normalizeDiffSummaryForKind("create", { added: 5, removed: 2 })).toEqual({
      added: 5,
      removed: 0,
    });
    expect(normalizeDiffSummaryForKind("delete", { added: 5, removed: 2 })).toEqual({
      added: 0,
      removed: 2,
    });
    expect(normalizeDiffSummaryForKind("edit", { added: 5, removed: 2 })).toEqual({
      added: 5,
      removed: 2,
    });
  });
});
