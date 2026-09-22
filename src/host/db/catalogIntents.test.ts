import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import {
  dbReadProjectOrderRows,
  dbReadThreadOrderRowsByProject,
  dbReorderProjectRelative,
  dbReorderThreadBlockRelative,
  dbSetProjectLastDraftConfig,
  dbSetProjectWorkspace,
  dbSetThreadWorkspace,
} from "./catalogIntents";
import { dbGetProjects, dbGetThread, dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import { onProjectThreadDataChanged } from "./projectThreadChanges";
import { nativeBindingEnv, sqliteAvailable } from "./runtimeItems.testFixtures";

function testProject(id: string, name = id): Project {
  return {
    id,
    name,
    location: { kind: "posix", path: `/tmp/${id}` },
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function testThread(id: string, projectId: string, overrides: Partial<Thread> = {}): Thread {
  return {
    id,
    projectId,
    title: id,
    agentKind: "claude",
    config: { model: "sonnet" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function orderedIds(ids: readonly string[], values: ReadonlyMap<string, number>): string[] {
  return [...ids].sort((left, right) => {
    const order = (values.get(left) ?? 0) - (values.get(right) ?? 0);
    return order !== 0 ? order : left.localeCompare(right);
  });
}

function threadSortOrders(): Map<string, number> {
  const rows = getSqlite().prepare("SELECT id, sort_order FROM threads").all() as {
    id: string;
    sort_order: number;
  }[];
  return new Map(rows.map((row) => [row.id, row.sort_order]));
}

/** The complete persisted row, for "unrelated fields survive" assertions. */
function threadRowSnapshot(threadId: string): string {
  return JSON.stringify(getSqlite().prepare("SELECT * FROM threads WHERE id = ?").get(threadId));
}

function projectRowSnapshot(projectId: string): string {
  return JSON.stringify(getSqlite().prepare("SELECT * FROM projects WHERE id = ?").get(projectId));
}

describe.skipIf(!sqliteAvailable)("catalogIntents (real sqlite)", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-catalog-intents-"));
    initDatabase(join(dir, "state.sqlite"));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  describe("dbReorderProjectRelative", () => {
    beforeEach(() => {
      ["p1", "p2", "p3", "p4"].forEach((id, index) => dbUpsertProject(testProject(id), index));
    });

    it("moves only the named project and preserves every other slot value", () => {
      const changes = vi.fn<() => void>();
      const unsubscribe = onProjectThreadDataChanged(changes);
      try {
        expect(
          dbReorderProjectRelative({
            projectId: "p4",
            targetProjectId: "p1",
            placement: "before",
          }),
        ).toEqual({ status: "applied", changed: 4 });
      } finally {
        unsubscribe();
      }

      const values = new Map(
        dbReadProjectOrderRows().map((row) => [row.id, row.sortOrder] as const),
      );
      expect(orderedIds(["p1", "p2", "p3", "p4"], values)).toEqual(["p4", "p1", "p2", "p3"]);
      // Slot-preserving: p2/p3 keep their exact sort_order (no global reindex).
      expect([values.get("p4"), values.get("p1"), values.get("p2"), values.get("p3")]).toEqual([
        0, 1, 2, 3,
      ]);
      expect(changes).toHaveBeenCalledTimes(1);
    });

    it("treats an adjacent move as a zero-write no-op", () => {
      const before = JSON.stringify(dbReadProjectOrderRows());
      expect(
        dbReorderProjectRelative({
          projectId: "p1",
          targetProjectId: "p2",
          placement: "before",
        }),
      ).toEqual({ status: "noop" });
      expect(JSON.stringify(dbReadProjectOrderRows())).toBe(before);
    });

    it("refuses missing source and target without touching any row", () => {
      const before = JSON.stringify(dbGetProjects());
      expect(
        dbReorderProjectRelative({
          projectId: "missing",
          targetProjectId: "p1",
          placement: "before",
        }),
      ).toEqual({ status: "project_missing" });
      expect(
        dbReorderProjectRelative({
          projectId: "p1",
          targetProjectId: "missing",
          placement: "after",
        }),
      ).toEqual({ status: "target_missing" });
      expect(JSON.stringify(dbGetProjects())).toBe(before);
    });

    it("renumbers deterministically when slot values collide", () => {
      getSqlite().prepare("UPDATE projects SET sort_order = 0").run();
      expect(
        dbReorderProjectRelative({
          projectId: "p4",
          targetProjectId: "p1",
          placement: "before",
        }),
      ).toMatchObject({ status: "applied" });
      const rows = dbReadProjectOrderRows();
      expect(rows.map((row) => row.id)).toEqual(["p4", "p1", "p2", "p3"]);
      expect(rows.map((row) => row.sortOrder)).toEqual([0, 1, 2, 3]);
    });
  });

  describe("dbReorderThreadBlockRelative", () => {
    beforeEach(() => {
      dbUpsertProject(testProject("p1"), 0);
      dbUpsertProject(testProject("p2"), 1);
      ["t1", "t2", "t3", "t4", "t5"].forEach((id, index) =>
        dbUpsertThread(
          testThread(id, "p1", {
            status: "working",
            sessionRef: {
              providerSessionId: `session-${id}`,
              discoveredAt: "2026-01-01T00:00:00.000Z",
            },
            groupId: "group-1",
            groupName: "Group 1",
          }),
          index,
        ),
      );
      dbUpsertThread(testThread("q1", "p2"), 0);
    });

    it("moves a block over the host's complete order and leaves unrelated rows untouched", () => {
      const untouched = ["t5", "q1"].map((id) => threadRowSnapshot(id));
      const outcome = dbReorderThreadBlockRelative({
        projectId: "p1",
        anchorThreadId: "t4",
        threadIds: ["t4"],
        targetThreadId: "t1",
        placement: "before",
      });
      // Every row between the old and new position moves one slot; the block
      // target's other neighbours keep their relative order.
      expect(outcome).toEqual({ status: "applied", changed: 4 });

      const values = threadSortOrders();
      expect(orderedIds(["t1", "t2", "t3", "t4", "t5"], values)).toEqual([
        "t4",
        "t1",
        "t2",
        "t3",
        "t5",
      ]);
      expect([
        values.get("t4"),
        values.get("t1"),
        values.get("t2"),
        values.get("t3"),
        values.get("t5"),
      ]).toEqual([0, 1, 2, 3, 4]);
      // Rows outside the moved range are byte-identical, including q1 in p2.
      ["t5", "q1"].forEach((id, index) => {
        expect(threadRowSnapshot(id)).toBe(untouched[index]);
      });
    });

    it("moves a multi-entry block and preserves its authoritative internal order", () => {
      expect(
        dbReorderThreadBlockRelative({
          projectId: "p1",
          anchorThreadId: "t2",
          threadIds: ["t2", "t3"],
          targetThreadId: "t5",
          placement: "after",
        }),
      ).toMatchObject({ status: "applied" });
      const values = threadSortOrders();
      expect(orderedIds(["t1", "t2", "t3", "t4", "t5"], values)).toEqual([
        "t1",
        "t4",
        "t5",
        "t2",
        "t3",
      ]);
    });

    it("refuses duplicates, anchor mismatch, cross-project and missing ids before any effect", () => {
      const before = JSON.stringify(threadSortOrders());
      expect(
        dbReorderThreadBlockRelative({
          projectId: "p1",
          anchorThreadId: "t2",
          threadIds: ["t2", "t2"],
          targetThreadId: "t1",
          placement: "before",
        }),
      ).toEqual({ status: "block_duplicate" });
      expect(
        dbReorderThreadBlockRelative({
          projectId: "p1",
          anchorThreadId: "t3",
          threadIds: ["t2", "t3"],
          targetThreadId: "t1",
          placement: "before",
        }),
      ).toEqual({ status: "anchor_mismatch" });
      expect(
        dbReorderThreadBlockRelative({
          projectId: "p1",
          anchorThreadId: "q1",
          threadIds: ["q1"],
          targetThreadId: "t1",
          placement: "before",
        }),
      ).toEqual({ status: "project_mismatch", threadIds: ["q1"] });
      expect(
        dbReorderThreadBlockRelative({
          projectId: "p1",
          anchorThreadId: "missing",
          threadIds: ["missing"],
          targetThreadId: "t1",
          placement: "before",
        }),
      ).toEqual({ status: "thread_missing", threadIds: ["missing"] });
      expect(
        dbReorderThreadBlockRelative({
          projectId: "p1",
          anchorThreadId: "t2",
          threadIds: ["t2"],
          targetThreadId: "missing",
          placement: "before",
        }),
      ).toEqual({ status: "thread_missing", threadIds: ["missing"] });
      expect(
        dbReorderThreadBlockRelative({
          projectId: "missing",
          anchorThreadId: "t2",
          threadIds: ["t2"],
          targetThreadId: "t1",
          placement: "before",
        }),
      ).toEqual({ status: "project_missing" });
      expect(JSON.stringify(threadSortOrders())).toBe(before);
    });

    it("treats a target inside the block and an adjacent placement as no-ops", () => {
      const before = JSON.stringify(threadSortOrders());
      expect(
        dbReorderThreadBlockRelative({
          projectId: "p1",
          anchorThreadId: "t2",
          threadIds: ["t2", "t3"],
          targetThreadId: "t3",
          placement: "before",
        }),
      ).toEqual({ status: "noop" });
      expect(
        dbReorderThreadBlockRelative({
          projectId: "p1",
          anchorThreadId: "t2",
          threadIds: ["t2"],
          targetThreadId: "t1",
          placement: "after",
        }),
      ).toEqual({ status: "noop" });
      expect(JSON.stringify(threadSortOrders())).toBe(before);
    });

    it("renumbers the complete thread order when project slot values collide", () => {
      getSqlite().prepare("UPDATE threads SET sort_order = 10 WHERE id = 'q1'").run();
      getSqlite().prepare("UPDATE threads SET sort_order = 0 WHERE project_id = 'p1'").run();
      expect(
        dbReorderThreadBlockRelative({
          projectId: "p1",
          anchorThreadId: "t3",
          threadIds: ["t3"],
          targetThreadId: "t1",
          placement: "before",
        }),
      ).toMatchObject({ status: "applied" });
      const p1 = dbReadThreadOrderRowsByProject("p1");
      expect(p1.map((row) => row.id)).toEqual(["t3", "t1", "t2", "t4", "t5"]);
      expect(p1.map((row) => row.sortOrder)).toEqual([0, 1, 2, 3, 4]);
      // The other project keeps its relative order after the global renumber.
      expect(dbReadThreadOrderRowsByProject("p2").map((row) => row.id)).toEqual(["q1"]);
      expect(dbReadThreadOrderRowsByProject("p2")[0]?.sortOrder).toBe(5);
    });
  });

  describe("narrow setters", () => {
    beforeEach(() => {
      dbUpsertProject(testProject("p1", "Original"), 0);
      dbUpsertThread(
        testThread("t1", "p1", {
          status: "working",
          sessionRef: { providerSessionId: "session-1", discoveredAt: "2026-01-01T00:00:00.000Z" },
          groupId: "group-1",
          groupName: "Group 1",
        }),
        0,
      );
    });

    it("sets and clears only the project workspace column", () => {
      const before = projectRowSnapshot("p1");
      expect(dbSetProjectWorkspace("p1", "workspace-9")).toBe(true);
      const afterSet = getSqlite()
        .prepare("SELECT * FROM projects WHERE id = ?")
        .get("p1") as Record<string, unknown>;
      expect(afterSet.workspace_id).toBe("workspace-9");
      const beforeRow = JSON.parse(before) as Record<string, unknown>;
      for (const key of Object.keys(beforeRow)) {
        if (key === "workspace_id") continue;
        expect(afterSet[key]).toEqual(beforeRow[key]);
      }
      expect(dbSetProjectWorkspace("p1", null)).toBe(true);
      expect(
        (
          getSqlite().prepare("SELECT workspace_id FROM projects WHERE id = ?").get("p1") as {
            workspace_id: string | null;
          }
        ).workspace_id,
      ).toBeNull();
      expect(dbSetProjectWorkspace("missing", "workspace-9")).toBe(false);
    });

    it("sets and clears only the thread workspace column", () => {
      const before = threadRowSnapshot("t1");
      expect(dbSetThreadWorkspace("t1", "workspace-9")).toBe(true);
      const afterSet = getSqlite()
        .prepare("SELECT * FROM threads WHERE id = ?")
        .get("t1") as Record<string, unknown>;
      expect(afterSet.workspace_id).toBe("workspace-9");
      const beforeRow = JSON.parse(before) as Record<string, unknown>;
      for (const key of Object.keys(beforeRow)) {
        if (key === "workspace_id") continue;
        expect(afterSet[key]).toEqual(beforeRow[key]);
      }
      expect(dbSetThreadWorkspace("t1", null)).toBe(true);
      expect(
        (
          getSqlite().prepare("SELECT workspace_id FROM threads WHERE id = ?").get("t1") as {
            workspace_id: string | null;
          }
        ).workspace_id,
      ).toBeNull();
      expect(dbSetThreadWorkspace("missing", "workspace-9")).toBe(false);
    });

    it("sets and clears only the project draft-config column", () => {
      const draft = { agentKind: "claude", model: "sonnet", effort: "high" } as const;
      const before = projectRowSnapshot("p1");
      expect(dbSetProjectLastDraftConfig("p1", draft)).toBe(true);
      const afterSet = getSqlite()
        .prepare("SELECT * FROM projects WHERE id = ?")
        .get("p1") as Record<string, unknown>;
      expect(JSON.parse(String(afterSet.last_draft_config))).toEqual(draft);
      const beforeRow = JSON.parse(before) as Record<string, unknown>;
      for (const key of Object.keys(beforeRow)) {
        if (key === "last_draft_config") continue;
        expect(afterSet[key]).toEqual(beforeRow[key]);
      }
      expect(dbSetProjectLastDraftConfig("p1", null)).toBe(true);
      expect(
        (
          getSqlite().prepare("SELECT last_draft_config FROM projects WHERE id = ?").get("p1") as {
            last_draft_config: string | null;
          }
        ).last_draft_config,
      ).toBeNull();
      expect(dbSetProjectLastDraftConfig("missing", draft)).toBe(false);
      // The draft write never touches the thread row.
      expect(dbGetThread("t1")?.status).toBe("working");
    });
  });

  describe("commit signal (true effect boundary)", () => {
    beforeEach(() => {
      ["p1", "p2", "p3", "p4"].forEach((id, index) => dbUpsertProject(testProject(id), index));
      ["t1", "t2", "t3"].forEach((id, index) => dbUpsertThread(testThread(id, "p1"), index));
    });

    it("signals after the write and before a throwing listener for every intent", () => {
      const cases: Array<{ name: string; run: (signal: () => void) => void }> = [
        {
          name: "project reorder",
          run: (signal) =>
            expect(
              dbReorderProjectRelative(
                { projectId: "p4", targetProjectId: "p1", placement: "before" },
                signal,
              ),
            ).toMatchObject({ status: "applied" }),
        },
        {
          name: "thread reorder",
          run: (signal) =>
            expect(
              dbReorderThreadBlockRelative(
                {
                  projectId: "p1",
                  anchorThreadId: "t3",
                  threadIds: ["t3"],
                  targetThreadId: "t1",
                  placement: "before",
                },
                signal,
              ),
            ).toMatchObject({ status: "applied" }),
        },
        {
          name: "project workspace",
          run: (signal) => expect(dbSetProjectWorkspace("p1", "w", signal)).toBe(true),
        },
        {
          name: "thread workspace",
          run: (signal) => expect(dbSetThreadWorkspace("t1", "w", signal)).toBe(true),
        },
        {
          name: "project draft config",
          run: (signal) =>
            expect(
              dbSetProjectLastDraftConfig("p1", { agentKind: "claude", model: "sonnet" }, signal),
            ).toBe(true),
        },
      ];

      for (const testCase of cases) {
        const order: string[] = [];
        const unsubscribe = onProjectThreadDataChanged(() => {
          order.push("listener");
          throw new Error("post-commit listener failure");
        });
        try {
          expect(() => testCase.run(() => order.push("committed"))).toThrow(
            "post-commit listener failure",
          );
        } finally {
          unsubscribe();
        }
        // The signal fired on the committed side of the atomic write, before
        // the throwing listener propagated.
        expect({ case: testCase.name, order }).toEqual({
          case: testCase.name,
          order: ["committed", "listener"],
        });
      }
    });

    it("never signals for a refusal or a no-op", () => {
      const signal = vi.fn<() => void>();
      expect(
        dbReorderProjectRelative(
          { projectId: "missing", targetProjectId: "p1", placement: "before" },
          signal,
        ),
      ).toEqual({ status: "project_missing" });
      expect(
        dbReorderProjectRelative(
          { projectId: "p1", targetProjectId: "p2", placement: "before" },
          signal,
        ),
      ).toEqual({ status: "noop" });
      expect(dbSetProjectWorkspace("missing", "w", signal)).toBe(false);
      expect(dbSetThreadWorkspace("missing", "w", signal)).toBe(false);
      expect(dbSetProjectLastDraftConfig("missing", null, signal)).toBe(false);
      expect(signal).not.toHaveBeenCalled();
    });
  });
});
