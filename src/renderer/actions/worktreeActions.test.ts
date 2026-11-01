import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import { RemoteClientError } from "@/shared/remote/client";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { resetDevTerminalStore, useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { deleteWorktreeGroup, dismissWorktreeUi } from "./worktreeActions";

const toastDanger = vi.hoisted(() => vi.fn<(message: string) => void>());
vi.mock("@heroui/react", () => ({ toast: { danger: toastDanger } }));

vi.mock("@/renderer/utils/shellUtils", () => ({
  closeThreads: vi.fn<(ids: readonly string[]) => Promise<void>>().mockResolvedValue(undefined),
  runShellScriptToCompletion: vi.fn<() => Promise<void>>(),
}));

beforeEach(() => {
  toastDanger.mockClear();
  useAppStore.setState({ projects: [], threads: [] });
  resetDevTerminalStore();
  usePanelStore.setState({ gitReviewContext: null, filesPanelContext: null });
});
afterEach(() => vi.restoreAllMocks());

it.each([
  { status: 409, code: "worktree_threads_changed", fallback: true },
  { status: 500, code: "worktree_remove_failed", fallback: false },
  { status: 0, code: "network_error", fallback: false },
  { status: 409, code: "command_outcome_uncertain", fallback: false },
])("handles paired-host removal error $code safely", async ({ status, code, fallback }) => {
  const project = {
    ...useAppStore.getState().addProject({ kind: "posix", path: "/repo" }),
    remoteServerId: "host",
    remoteId: "host-project",
  };
  const thread: Thread = {
    id: "projected-thread",
    remoteServerId: "host",
    remoteId: "host-thread",
    projectId: project.id,
    title: "Selected",
    agentKind: "codex",
    config: { model: "default" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    worktreePath: "/repo/worktree",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  useAppStore.setState({ projects: [project], threads: [thread] });
  const send = vi
    .spyOn(useRemoteServersStore.getState(), "sendThreadCommand")
    .mockRejectedValue(new RemoteClientError("Removal refused", status, code));
  const onThreadsChanged = vi.fn<() => void>();

  deleteWorktreeGroup(project.id, thread.worktreePath!, [thread.id], onThreadsChanged);

  await vi.waitFor(() =>
    expect(send).toHaveBeenCalledExactlyOnceWith("host", {
      kind: "delete-worktree-group",
      threadId: "host-thread",
      projectId: "host-project",
      worktreePath: thread.worktreePath,
      threadIds: ["host-thread"],
    }),
  );
  await vi.waitFor(() => expect(useAppStore.getState().threads[0]?.archived).toBe(false));
  await vi.waitFor(() => {
    expect(onThreadsChanged).toHaveBeenCalledTimes(fallback ? 1 : 0);
    expect(toastDanger).toHaveBeenCalledTimes(fallback ? 0 : 1);
  });
});

it("keeps the global terminal open when a saved worktree scope is removed", () => {
  const worktreePath = "C:/repo/worktree";
  const store = useDevTerminalStore.getState();
  store.openWorktreePanel("project", worktreePath);
  store.addTab("project", "Worktree", worktreePath);
  store.openGlobalPanel();

  dismissWorktreeUi(worktreePath);

  expect(useDevTerminalStore.getState()).toMatchObject({
    isOpen: true,
    source: "global",
    tabs: [],
  });
});

it("closes a project terminal when its worktree scope is removed", () => {
  const worktreePath = "C:/repo/worktree";
  useDevTerminalStore.getState().openWorktreePanel("project", worktreePath);

  dismissWorktreeUi(worktreePath);

  expect(useDevTerminalStore.getState().isOpen).toBe(false);
});
