import { beforeEach, expect, it, vi } from "vitest";
import { resetDevTerminalStore, useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { dismissWorktreeUi } from "./worktreeActions";

vi.mock("@/renderer/utils/shellUtils", () => ({
  closeThreads: vi.fn<(ids: readonly string[]) => Promise<void>>().mockResolvedValue(undefined),
  runShellScriptToCompletion: vi.fn<() => Promise<void>>(),
}));

beforeEach(() => {
  resetDevTerminalStore();
  usePanelStore.setState({ gitReviewContext: null, filesPanelContext: null });
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
