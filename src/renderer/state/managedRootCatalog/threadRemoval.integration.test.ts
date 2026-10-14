import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getSqlite } from "@/host/db/connection";
import { deleteThreadsAndOwnedWorktrees, openThread } from "@/renderer/actions/threadActions";
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

beforeEach(setupManagedRootFixture);
afterEach(teardownManagedRootFixture);

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
