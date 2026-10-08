import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DragDropManager } from "@dnd-kit/dom";
import { Sortable } from "@dnd-kit/dom/sortable";
import type { Thread } from "@/shared/contracts";
import {
  buildSidebarProjectRows,
  FLAT_THREAD_LIST_ID,
  SIDEBAR_FLAT_THREAD_LIST_PAGE_SIZE,
  type SidebarRow,
} from "./sidebarProjectRows";

function makeThread(overrides: Partial<Thread> & { id: string }): Thread {
  return {
    projectId: "project-1",
    title: overrides.id,
    agentKind: "codex",
    config: { model: "gpt-5.4" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Lets dnd-kit's queued microtasks and render promises settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const managers: DragDropManager[] = [];
const sortables: Sortable[] = [];

/** jsdom has no layout observers. dnd-kit only needs them to exist here. */
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", NoopObserver);
  vi.stubGlobal("ResizeObserver", NoopObserver);
});

afterEach(() => {
  for (const sortable of sortables.splice(0)) sortable.destroy();
  for (const manager of managers.splice(0)) manager.destroy();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

/**
 * Lays the rows out like the flat list, with live rows and the pinned Done rows
 * in separate containers, and registers each thread row as a real dnd-kit
 * sortable with the index and group the builder gave it.
 */
function mountRows(rows: SidebarRow[]) {
  const manager = new DragDropManager({ plugins: [], sensors: [], modifiers: [] });
  managers.push(manager);
  const live = document.createElement("div");
  const done = document.createElement("div");
  document.body.append(live, done);
  let container = live;
  for (const row of rows) {
    if (row.kind === "section-label") container = done;
    if (row.kind !== "thread") continue;
    const element = document.createElement("div");
    element.dataset.threadId = row.thread.id;
    container.append(element);
    const sortable = new Sortable(
      {
        id: row.thread.id,
        index: row.threadIndex,
        group: row.group,
        type: "thread",
        accept: row.sortDisabled ? [] : ["thread"],
        element,
      },
      manager,
    );
    sortables.push(sortable);
  }
  const ids = (parent: HTMLElement) =>
    [...parent.children].map((child) => (child as HTMLElement).dataset.threadId);
  return { manager, liveIds: () => ids(live), doneIds: () => ids(done) };
}

describe("buildSidebarProjectRows with dnd-kit (manual)", () => {
  it("puts a protected live row back in the live list when a drag is canceled", async () => {
    // A working thread past the page limit stays visible, so the live rows'
    // indices skip the hidden threads before it.
    const liveCount = SIDEBAR_FLAT_THREAD_LIST_PAGE_SIZE + 3;
    const working = `live-${liveCount - 1}`;
    const rows = buildSidebarProjectRows({
      projectId: FLAT_THREAD_LIST_ID,
      projectThreads: [
        ...Array.from({ length: liveCount }, (_, i) =>
          makeThread({ id: `live-${i}`, ...(i === liveCount - 1 ? { status: "working" } : {}) }),
        ),
        makeThread({ id: "done-0", done: true }),
        makeThread({ id: "done-1", done: true }),
      ],
      sortMode: "manual",
      collapsedWorktrees: { [`done:${FLAT_THREAD_LIST_ID}`]: false },
      visibleLimit: SIDEBAR_FLAT_THREAD_LIST_PAGE_SIZE,
      doneVisibleLimit: SIDEBAR_FLAT_THREAD_LIST_PAGE_SIZE,
    });
    const { manager, liveIds, doneIds } = mountRows(rows);
    await settle();
    const initialLive = liveIds();
    expect(initialLive.at(-1)).toBe(working);
    expect(doneIds()).toEqual(["done-0", "done-1"]);

    manager.actions.start({ source: working, coordinates: { x: 0, y: 0 } });
    await settle();
    await manager.actions.setDropTarget(initialLive.at(-5));
    await settle();
    // The optimistic move happened, so canceling has something to undo.
    expect(liveIds()).not.toEqual(initialLive);

    manager.actions.stop({ canceled: true });
    await settle();

    expect(liveIds()).toEqual(initialLive);
    expect(doneIds()).toEqual(["done-0", "done-1"]);
  });
});
