import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabase, initDatabase } from "./connection";
import { dbReadThreadHistoryPagePhase1, dbReadThreadHistoryPhase2 } from "./historyReads";
import { dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import { dbGetThreadRuntimeItemsPage, dbReplaceThreadRuntimeItems } from "./runtimeItems";
import { classifyRuntimeTimelineEntry, selectRuntimePageRows } from "./runtimeTimelineReads";
import { nativeBindingEnv, sqliteAvailable, testThread } from "./runtimeItems.testFixtures";

/**
 * Equivalence of the shared runtime-timeline helpers: the bounded history
 * reader and the legacy page reader must select and materialize identical
 * pages for the same fixtures and window parameters, including grouping,
 * hidden rows, sub-agents, inline images and target-entry windows.
 */

interface ItemFixture {
  id: string;
  type: string;
  state: "started" | "updated" | "completed";
  payload?: unknown;
  streams: Record<string, string>;
  parentItemId?: string;
}

function fixtureItems(): ItemFixture[] {
  const items: ItemFixture[] = [];
  for (let index = 0; index < 40; index += 1) {
    items.push({
      id: `assistant-${index}`,
      type: "assistant_message",
      state: "completed",
      streams: { assistant_text: `reply ${index}` },
    });
    if (index % 7 === 3) {
      items.push({
        id: `hidden-${index}`,
        type: index % 2 === 0 ? "plan" : "goal",
        state: "completed",
        streams: {},
      });
    }
    if (index % 5 === 2) {
      for (let group = 0; group < 6; group += 1) {
        items.push({
          id: `group-${index}-${group}`,
          type: group % 2 === 0 ? "command_execution" : "tool_call",
          state: "completed",
          ...(group % 2 === 0 ? { streams: {} } : { payload: { name: "read_file" }, streams: {} }),
        });
      }
    }
    if (index === 10) {
      items.push({
        id: "subagent",
        type: "tool_call",
        state: "completed",
        payload: { name: "spawnAgent", isSubAgent: true },
        streams: {},
      });
      items.push({
        id: "subagent-child",
        type: "assistant_message",
        state: "completed",
        streams: {},
        parentItemId: "subagent",
      });
    }
    if (index === 20) {
      items.push({
        id: "image",
        type: "image_view",
        state: "completed",
        payload: { name: "imageView", images: ["data:image/png;base64,iVBORw0KGgo="] },
        streams: {},
      });
    }
    if (index === 30) {
      items.push({
        id: "reasoning-empty",
        type: "reasoning",
        state: "completed",
        streams: {},
      });
      items.push({
        id: "reasoning-filled",
        type: "reasoning",
        state: "completed",
        streams: { reasoning_text: "thinking" },
      });
    }
  }
  return items;
}

describe.skipIf(!sqliteAvailable)("runtimeTimelineReads equivalence", () => {
  let dir: string;

  beforeEach(async () => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-runtime-timeline-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Test project",
        location: { kind: "posix", path: "/tmp/project" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
    dbUpsertThread(testThread(), 0);
    await dbReplaceThreadRuntimeItems("thread-1", fixtureItems());
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("selects and materializes identical pages across window parameters", async () => {
    const windows: Array<{ beforePosition?: number; limit: number; target?: number }> = [
      { limit: 500 },
      { limit: 10 },
      { limit: 7 },
      { limit: 3 },
      { limit: 10, target: 4 },
      { limit: 25, target: 10 },
      { limit: 5, target: 40 },
      { beforePosition: 100, limit: 12 },
      { beforePosition: 40, limit: 8, target: 3 },
      { beforePosition: 250, limit: 6, target: 6 },
    ];
    for (const window of windows) {
      const legacy = await dbGetThreadRuntimeItemsPage(
        "thread-1",
        window.beforePosition,
        window.limit,
        window.target,
      );
      const phase1 = dbReadThreadHistoryPagePhase1("thread-1", {
        limit: window.limit,
        ...(window.beforePosition !== undefined ? { beforePosition: window.beforePosition } : {}),
        ...(window.target !== undefined ? { targetTimelineEntryCount: window.target } : {}),
      });
      expect(phase1.rows.map((row) => row.itemId)).toEqual(
        [...legacy.items].reverse().map((entry) => entry.id),
      );
      expect(phase1.moreBeyondWindow).toBe(legacy.nextCursor !== null);
      expect(legacy.nextCursor === null ? null : phase1.rows.at(-1)!.position).toBe(
        legacy.nextCursor,
      );
      const materialized = dbReadThreadHistoryPhase2(
        "thread-1",
        phase1.rows.map((row) => row.itemId),
      );
      expect([...materialized].reverse()).toEqual(legacy.items);
    }
  });

  it("keeps the shared classification probes lazy and type-scoped", () => {
    const payloadProbe = vi.fn<() => undefined>(() => undefined);
    const reasoningProbe = vi.fn<() => boolean>(() => true);
    const base = {
      itemId: "item",
      state: "completed",
      parentItemId: null,
      childParentIds: new Set<string>(),
    } as const;

    expect(
      classifyRuntimeTimelineEntry({
        ...base,
        type: "assistant_message",
        payload: payloadProbe,
        reasoningHasContent: reasoningProbe,
      }),
    ).toBe("item");
    expect(payloadProbe).not.toHaveBeenCalled();
    expect(reasoningProbe).not.toHaveBeenCalled();

    expect(
      classifyRuntimeTimelineEntry({
        ...base,
        type: "tool_call",
        payload: payloadProbe,
        reasoningHasContent: reasoningProbe,
      }),
    ).toBe("hidden");
    expect(payloadProbe).toHaveBeenCalledTimes(1);
    expect(reasoningProbe).not.toHaveBeenCalled();

    payloadProbe.mockClear();
    expect(
      classifyRuntimeTimelineEntry({
        ...base,
        type: "reasoning",
        payload: payloadProbe,
        reasoningHasContent: reasoningProbe,
      }),
    ).toBe("group");
    expect(reasoningProbe).toHaveBeenCalledTimes(1);
    expect(payloadProbe).not.toHaveBeenCalled();
  });

  it("extends a trailing group run into the lookahead and counts target entries", () => {
    // positions 0..: item, group, group, group, item, item
    const kinds: Array<"item" | "group"> = ["item", "group", "group", "group", "item", "item"];
    const rows = kinds.map((kind, position) => ({ position, kind }));
    const readRows = (cursor: number | undefined, rowLimit: number) => {
      const start = cursor === undefined ? 0 : cursor + 1;
      return rows.slice(start, start + rowLimit);
    };
    const classify = (row: { kind: "item" | "group" }) => row.kind;
    const selected = selectRuntimePageRows({
      readRows,
      isTimelineGroup: (row) => row.kind !== "item",
      classify,
      limit: 2,
    });
    // The run at 1..3 is never split: positions 0..3 are returned.
    expect(selected.rows.map((row) => row.position)).toEqual([0, 1, 2, 3]);
    expect(selected.hasMore).toBe(true);

    const targeted = selectRuntimePageRows({
      readRows,
      isTimelineGroup: (row) => row.kind !== "item",
      classify,
      limit: 2,
      targetTimelineEntryCount: 2,
    });
    // Two entries: the item at 0 and the group run (one entry) through 3.
    expect(targeted.rows.map((row) => row.position)).toEqual([0, 1, 2, 3]);
    expect(targeted.hasMore).toBe(true);
  });
});
