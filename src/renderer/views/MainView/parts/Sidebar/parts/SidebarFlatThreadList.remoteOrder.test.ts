import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import type { DragSourceData } from "@/renderer/dnd";
import { resolveThreadReorder } from "@/renderer/hooks/useDndHandlers";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useAppStore } from "@/renderer/state/appStore";
import { removeRemoteAppRows, syncRemoteAppRows } from "@/renderer/state/remoteServers/appRows";
import { remoteThreadId } from "@/renderer/state/remoteProjection";
import {
  buildSidebarProjectRows,
  canReorderInFlatList,
  FLAT_THREAD_LIST_ID,
  type SidebarRow,
} from "./sidebarProjectRows";

vi.mock("@/renderer/bridge", () => ({ readBridge: () => ({}) }));

function makeProject(id: string): Project {
  return {
    id,
    name: id,
    location: { kind: "posix", path: `/repo/${id}` },
    createdAt: "2026-08-01T00:00:00.000Z",
  };
}

function makeThread(id: string, projectId: string): Thread {
  return {
    id,
    projectId,
    title: id,
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
  };
}

// The host's own snapshot, before projection into the app store.
const hostProjects = [makeProject("host-project")];
const hostThreads = [makeThread("h1", "host-project"), makeThread("h2", "host-project")];
const r1 = remoteThreadId("d1", "h1");
const r2 = remoteThreadId("d1", "h2");

type ThreadRow = Extract<SidebarRow, { kind: "thread" }>;

/** The flat list's Manual rows for the whole store, as the sidebar builds them. */
function flatRows(): ThreadRow[] {
  return buildSidebarProjectRows({
    projectId: FLAT_THREAD_LIST_ID,
    projectThreads: useAppStore.getState().threads,
    sortMode: "manual",
    collapsedWorktrees: {},
    visibleLimit: 20,
    canReorderThread: canReorderInFlatList,
  }).filter((row): row is ThreadRow => row.kind === "thread");
}

const flatOrder = () => flatRows().map((row) => row.thread.id);

/** The drag data `SortableThreadItem` attaches to a row. */
function dragData(threadId: string): Extract<DragSourceData, { type: "thread" }> {
  const row = flatRows().find((candidate) => candidate.thread.id === threadId);
  if (!row) throw new Error(`no row for ${threadId}`);
  return {
    type: "thread",
    threadId,
    projectId: row.thread.projectId,
    sortGroup: row.group,
    sortIndex: row.threadIndex,
    ...(row.sortDisabled ? { sortDisabled: true } : {}),
  };
}

/** Drags one row onto another and applies the result the way `useDndHandlers` does. */
function drop(sourceId: string, targetId: string): boolean {
  const source = dragData(sourceId);
  const target = dragData(targetId);
  const reorder = resolveThreadReorder({
    threads: useAppStore.getState().threads,
    source,
    target,
    initialIndex: source.sortIndex ?? 0,
    finalIndex: target.sortIndex ?? 0,
  });
  if (!reorder) return false;
  useAppStore
    .getState()
    .reorderThreadsAcrossProjects(sourceId, reorder.targetId, reorder.placement);
  return true;
}

describe("flat Manual order with remote mirrors", () => {
  beforeEach(() => {
    useRemoteServersStore.setState({
      runtime: {},
      excludedProjectIds: {},
      projectWorkspaceIds: {},
      projectNameOverrides: {},
    });
    useAppStore.setState({
      projects: [makeProject("alpha"), makeProject("beta")],
      threads: [makeThread("a1", "alpha"), makeThread("b1", "beta")],
      provisioningWorktreeThreadIds: {},
    });
    syncRemoteAppRows("d1", hostProjects, hostThreads);
  });

  it("locks remote rows so their placement can't be changed and then lost", () => {
    expect(flatRows().map((row) => [row.thread.id, row.sortDisabled === true])).toEqual([
      ["a1", false],
      ["b1", false],
      [r1, true],
      [r2, true],
    ]);

    expect(drop(r2, "a1")).toBe(false);
    expect(drop("a1", r1)).toBe(false);
    expect(flatOrder()).toEqual(["a1", "b1", r1, r2]);
  });

  it("keeps a local move across an unchanged remote snapshot and reconnect", () => {
    expect(drop("b1", "a1")).toBe(true);
    const moved = ["b1", "a1", r1, r2];
    expect(flatOrder()).toEqual(moved);

    syncRemoteAppRows("d1", hostProjects, hostThreads);
    expect(flatOrder()).toEqual(moved);

    removeRemoteAppRows("d1");
    syncRemoteAppRows("d1", hostProjects, hostThreads);
    expect(flatOrder()).toEqual(moved);

    const partialize = useAppStore.persist.getOptions().partialize!;
    // Desktop reloads the catalog from the host. SQLite/HTTP regressions own
    // durable reload proof; this renderer payload contains preferences only.
    const persisted = partialize(useAppStore.getState());
    expect(persisted).not.toHaveProperty("projects");
    expect(persisted).not.toHaveProperty("threads");
  });
});
