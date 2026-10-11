// @vitest-environment jsdom
// Run with the repository's renderer Lingui/Babel plugins (see the qualification
// report's exact isolated Vitest invocation). No app process or real tools run.
import { describe, expect, it } from "vitest";
import type { FileChangePayload } from "@/shared/contracts";
import {
  selectChildTimelineEntries,
  selectVisibleThreadTimelineEntries,
} from "@/renderer/components/thread/ChatPane/chatPaneSelectors";
import {
  analyzeEditToolGroup,
  normalizeEditGroupPath,
  readEditDiffSummary,
  segmentToolGroupRows,
  summarizeToolCalls,
} from "@/renderer/components/thread/ChatPane/parts/items/toolCallCategorization";
import {
  EDIT_PATH,
  GROUPING_SCENARIOS,
  imageDataUrl,
  taxonomyItem,
} from "../fixtures/tool-taxonomy-workload";
import { selectorState } from "./tool-taxonomy/test-support";

describe("production grouping scenarios", () => {
  for (const scenario of GROUPING_SCENARIOS) {
    it.each(scenario.frames)(`${scenario.id} / $label`, ({ label, items, rows, parentItemId }) => {
      expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
      const threadId = `${scenario.id}:${label}`;
      const state = selectorState(items, threadId);
      const entries = parentItemId
        ? selectChildTimelineEntries(state, threadId, parentItemId)
        : selectVisibleThreadTimelineEntries(state, threadId);
      expect(entries.map((e) => (e.kind === "tool_call_group" ? [...e.itemIds] : e.id))).toEqual(
        rows,
      );
      for (const entry of entries.filter((candidate) => candidate.kind === "tool_call_group")) {
        expect(entry.id).toBe(`tool-call-group:${entry.itemIds[0]}`);
      }
    });
  }

  it("counts seven categories, pluralizes, and sorts by production tie priority", () => {
    const frames = GROUPING_SCENARIOS.find((s) => s.id === "group_all_categories")!.frames;
    for (const [index, f] of frames.entries()) {
      const summary = summarizeToolCalls(f.items);
      expect(summary.map((s) => s.category)).toEqual([
        "viewed",
        "searched",
        "edited",
        "executed",
        "mcp",
        "other",
        "thought",
      ]);
      expect(summary.map((s) => s.count)).toEqual(Array(7).fill(index + 1));
      expect(summary.map((s) => s.label)).toEqual(
        index === 0
          ? ["view", "search", "edit", "command", "MCP", "tool", "thought"]
          : ["views", "searches", "edits", "commands", "MCPs", "tools", "thoughts"],
      );
      expect(summary.find((s) => s.category === "edited")?.diffSummary).toEqual({
        added: index + 1,
        removed: index + 1,
      });
    }
  });

  it("merges same-file edits with intervening thoughts and leaves trailing thoughts separate", () => {
    const f = GROUPING_SCENARIOS.find((s) => s.id === "group_same_file")!.frames.at(-1)!;
    expect(analyzeEditToolGroup(f.items)).toEqual({
      editOnly: true,
      sameFile: { count: 2, path: EDIT_PATH, diffSummary: { added: 2, removed: 2 } },
    });
    const segments = segmentToolGroupRows(f.items);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({
      kind: "same-file-edits",
      summary: { count: 2, path: EDIT_PATH, diffSummary: { added: 2, removed: 2 } },
    });
    expect(segments[0]!.kind === "same-file-edits" && segments[0]!.items.map((i) => i.id)).toEqual([
      "edit_unified",
      "reasoning",
      "edit_replacement",
    ]);
    expect(segments[1]).toMatchObject({ kind: "item", item: { id: "reasoning:tail" } });
    const paths = [EDIT_PATH, `./${EDIT_PATH}`, "src//fixture.ts", "src\\fixture.ts"];
    expect(paths.map(normalizeEditGroupPath)).toEqual(Array(4).fill(EDIT_PATH));
    const normalized = paths.map((path, i) => ({
      ...taxonomyItem("edit_unified", `:${i}`),
      payload: { ...(taxonomyItem("edit_unified").payload as FileChangePayload), path },
    }));
    expect(analyzeEditToolGroup(normalized).sameFile?.count).toBe(4);
    expect(segmentToolGroupRows(normalized)).toHaveLength(1);
  });

  it("keeps mixed runs separate, distinguishes edit-only, and never totals missing stats", () => {
    const mixed = ["read_full", "edit_unified", "edit_replacement", "command_command"].map((id) =>
      taxonomyItem(id),
    );
    expect(analyzeEditToolGroup(mixed)).toEqual({ editOnly: false, sameFile: null });
    expect(segmentToolGroupRows(mixed).map((s) => s.kind)).toEqual([
      "item",
      "same-file-edits",
      "item",
    ]);
    const readBreak = ["edit_unified", "read_full", "edit_replacement"].map((id) =>
      taxonomyItem(id),
    );
    expect(segmentToolGroupRows(readBreak).every((s) => s.kind === "item")).toBe(true);
    expect(analyzeEditToolGroup([taxonomyItem("reasoning")]).editOnly).toBe(false);
    const differentFiles = [
      taxonomyItem("edit_unified"),
      taxonomyItem("reasoning"),
      taxonomyItem("create_content"),
    ];
    expect(analyzeEditToolGroup(differentFiles)).toEqual({ editOnly: true, sameFile: null });
    const missing = GROUPING_SCENARIOS.find((s) => s.id === "group_missing_stats")!.frames[0]!
      .items;
    expect(analyzeEditToolGroup(missing).sameFile).toEqual({ count: 2, path: EDIT_PATH });
    expect(summarizeToolCalls(missing)[0]).not.toHaveProperty("diffSummary");
    expect(segmentToolGroupRows(missing)[0]).toMatchObject({
      summary: { count: 2, path: EDIT_PATH },
    });
    expect(readEditDiffSummary(missing[1]!)).toBeUndefined();
    const completed = [...missing.slice(0, 1), taxonomyItem("edit_replacement")];
    expect(summarizeToolCalls(completed)[0]?.diffSummary).toEqual({ added: 2, removed: 2 });
  });

  it("retains running category state after a foreground turn and clears it on settlement", () => {
    const frames = GROUPING_SCENARIOS.find((s) => s.id === "group_background_running")!.frames;
    expect(
      summarizeToolCalls(frames[0]!.items).find((s) => s.category === "executed")?.hasRunning,
    ).toBe(true);
    expect(
      summarizeToolCalls(frames[1]!.items).find((s) => s.category === "executed"),
    ).not.toHaveProperty("hasRunning");
    const started = taxonomyItem("command_stream");
    expect(started.state).toBe("updated");
    expect(started.streams.command_output).toContain("last-marker");
  });

  it("reprojects late names and image bytes with stable IDs on the same selector cache", () => {
    const threadId = "taxonomy-transitions";
    const unnamed = taxonomyItem("tool_unnamed_late");
    const before = [taxonomyItem("read_full"), unnamed];
    const state = selectorState(before, threadId);
    expect(selectVisibleThreadTimelineEntries(state, threadId).map((e) => e.id)).toEqual([
      "read_full",
    ]);
    state.runtimeItemsByIdByThread[threadId]![unnamed.id] = {
      ...unnamed,
      state: "updated",
      payload: { name: "FixtureImage", status: "running" },
    };
    state.runtimeStructuralVersionByThread[threadId] = 2;
    expect(selectVisibleThreadTimelineEntries(state, threadId)).toEqual([
      {
        kind: "tool_call_group",
        id: "tool-call-group:read_full",
        itemIds: ["read_full", unnamed.id],
      },
    ]);
    state.runtimeItemsByIdByThread[threadId]![unnamed.id] = {
      ...unnamed,
      state: "completed",
      payload: { name: "FixtureImage", status: "success", images: [imageDataUrl("png")] },
    };
    state.runtimeStructuralVersionByThread[threadId] = 3;
    expect(selectVisibleThreadTimelineEntries(state, threadId)).toEqual([
      { kind: "item", id: "read_full" },
      { kind: "item", id: unnamed.id },
    ]);
  });
});
