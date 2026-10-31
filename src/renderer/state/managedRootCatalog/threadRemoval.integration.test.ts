import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getSqlite } from "@/host/db/connection";
import {
  deleteThread,
  deleteThreadsAndOwnedWorktrees,
  openThread,
} from "@/renderer/actions/threadActions";
import { deleteWorktreeGroup } from "@/renderer/actions/worktreeActions";
import { useAppStore } from "@/renderer/state/appStore";
import { invalidateThreadRuntimeHydration } from "@/renderer/state/chatRuntimePersister";
import {
  activate,
  rootThreads,
  seedRuntimeItems,
  seedThread,
  setupManagedRootFixture,
  teardownManagedRootFixture,
  threadRow,
} from "./managedRootFixture";

const toastDanger = vi.hoisted(() => vi.fn<(message: string) => void>());
vi.mock("@heroui/react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, toast: { ...(actual.toast as object), danger: toastDanger } };
});

beforeEach(async () => {
  toastDanger.mockClear();
  await setupManagedRootFixture();
});
afterEach(teardownManagedRootFixture);

it.each(["single", "bulk"] as const)(
  "deletes %s selected threads while preserving a worktree with an unloaded archived sibling",
  async (mode) => {
    const worktreePath = "/tmp/shared-worktree";
    getSqlite().prepare("UPDATE threads SET worktree_path = ? WHERE id = 't-1'").run(worktreePath);
    if (mode === "bulk") seedThread("selected", "p-1", worktreePath);
    const supervisorCalls: string[] = [];
    await activate({
      preloadProcedures: { dbSetState: () => undefined },
      supervisorObserver: (procedure) => {
        supervisorCalls.push(procedure);
      },
    });
    await vi.waitFor(() => expect(rootThreads()).toHaveLength(mode === "bulk" ? 2 : 1));
    seedThread("unloaded", "p-1", worktreePath);
    getSqlite().prepare("UPDATE threads SET archived = 1 WHERE id = 'unloaded'").run();
    expect(threadRow("unloaded")).toBeUndefined();
    if (mode === "bulk") {
      deleteThreadsAndOwnedWorktrees(rootThreads());
    } else {
      deleteThread("t-1", worktreePath, "p-1");
    }
    await vi.waitFor(() => {
      expect(getSqlite().prepare("SELECT id FROM threads ORDER BY id").all()).toEqual([
        { id: "unloaded" },
      ]);
    });
    await vi.waitFor(() => {
      expect(threadRow("t-1")).toBeUndefined();
      expect(threadRow("selected")).toBeUndefined();
    });
    expect(toastDanger).not.toHaveBeenCalled();
    expect(supervisorCalls).not.toContain("gitRemoveWorktree");
    expect(supervisorCalls).not.toContain("gitDeleteBranch");
  },
);

it("still rejects explicit worktree deletion when an unloaded sibling remains", async () => {
  const worktreePath = "/tmp/shared-worktree";
  getSqlite().prepare("UPDATE threads SET worktree_path = ? WHERE id = 't-1'").run(worktreePath);
  const supervisorCalls: string[] = [];
  await activate({
    preloadProcedures: { dbSetState: () => undefined },
    supervisorObserver: (procedure) => {
      supervisorCalls.push(procedure);
    },
  });
  await vi.waitFor(() => expect(threadRow("t-1")).toBeDefined());
  seedThread("unloaded", "p-1", worktreePath);
  getSqlite().prepare("UPDATE threads SET archived = 1 WHERE id = 'unloaded'").run();

  deleteWorktreeGroup("p-1", worktreePath, ["t-1"]);

  await vi.waitFor(() =>
    expect(toastDanger).toHaveBeenCalledWith(
      "The threads linked to this worktree changed. Refresh and try again.",
    ),
  );
  expect(getSqlite().prepare("SELECT id FROM threads ORDER BY id").all()).toEqual([
    { id: "t-1" },
    { id: "unloaded" },
  ]);
  expect(threadRow("t-1")?.archived).toBe(false);
  expect(supervisorCalls).not.toContain("gitRemoveWorktree");
});

it("preserves both worktrees when the selected thread moved after the catalog read", async () => {
  const oldPath = "/tmp/old-worktree";
  const newPath = "/tmp/new-worktree";
  getSqlite().prepare("UPDATE threads SET worktree_path = ? WHERE id = 't-1'").run(oldPath);
  const supervisorCalls: string[] = [];
  await activate({
    preloadProcedures: { dbSetState: () => undefined },
    supervisorObserver: (procedure) => {
      supervisorCalls.push(procedure);
    },
  });
  await vi.waitFor(() => expect(threadRow("t-1")?.worktreePath).toBe(oldPath));
  getSqlite().prepare("UPDATE threads SET worktree_path = ? WHERE id = 't-1'").run(newPath);
  seedThread("old-sibling", "p-1", oldPath);
  seedThread("new-sibling", "p-1", newPath);

  deleteThread("t-1", oldPath, "p-1");

  await vi.waitFor(() => {
    expect(getSqlite().prepare("SELECT id, worktree_path FROM threads ORDER BY id").all()).toEqual([
      { id: "new-sibling", worktree_path: newPath },
      { id: "old-sibling", worktree_path: oldPath },
    ]);
  });
  expect(toastDanger).not.toHaveBeenCalled();
  expect(supervisorCalls).not.toContain("gitRemoveWorktree");
  expect(supervisorCalls).not.toContain("gitDeleteBranch");
});

it("opens a cold GUI thread while done worktrees are being removed, even when one removal fails", async () => {
  getSqlite().prepare("UPDATE threads SET presentation_mode = 'gui' WHERE id = 't-1'").run();
  seedRuntimeItems("t-1", 3);
  invalidateThreadRuntimeHydration("t-1");
  const doneIds = Array.from({ length: 8 }, (_, index) => `done-${index}`);
  for (const threadId of doneIds) {
    seedThread(threadId, "p-1", `/tmp/${threadId}`);
    getSqlite().prepare("UPDATE threads SET done = 1 WHERE id = ?").run(threadId);
  }
  const failure = "Expected worktree branch saved-branch, but found changed-branch";
  await activate({
    preloadProcedures: { dbSetState: () => undefined },
    supervisorObserver: (procedure, payload) => {
      if (procedure === "gitRemoveWorktree" && payload.path === "/tmp/done-0") {
        throw new Error(failure);
      }
    },
  });
  await vi.waitFor(() => expect(rootThreads()).toHaveLength(9));
  useAppStore.getState().openHome();

  const cleanup = Promise.withResolvers<void>();
  const fetchImpl = globalThis.fetch;
  const removals: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path.startsWith("/api/threads/done-") && path.endsWith("/command")) {
      removals.push(path);
      await cleanup.promise;
    }
    return fetchImpl(url, init);
  });

  try {
    deleteThreadsAndOwnedWorktrees(rootThreads().filter((thread) => thread.done));
    expect(doneIds.every((threadId) => threadRow(threadId)?.archived)).toBe(true);
    await vi.waitFor(() => expect(removals).toHaveLength(1));

    openThread("t-1");
    await vi.waitFor(() => {
      expect(useAppStore.getState().view).toEqual({ kind: "thread", panes: ["t-1"] });
      expect(useAppStore.getState().runtimeItemIdsByThread["t-1"]).toHaveLength(3);
    });
    expect(removals).toHaveLength(1);
    expect(toastDanger).not.toHaveBeenCalled();
  } finally {
    cleanup.resolve();
    await vi.waitFor(() => expect(removals).toHaveLength(8));
    await vi.waitFor(() => expect(rootThreads()).toHaveLength(1));
    await vi.waitFor(() => expect(toastDanger).toHaveBeenCalledWith(failure));
  }
  expect(threadRow("done-0")).toBeUndefined();
  expect(useAppStore.getState().view).toEqual({ kind: "thread", panes: ["t-1"] });
});
