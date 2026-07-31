import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrData, Thread } from "@/shared/contracts";
import type { PrWatchMergedEvent } from "@/shared/ipc";
import { useAppStore } from "./appStore";
import { useGitStore } from "./gitStore";
import { useSharedSettings } from "./sharedSettingsStore";
import { startPrMergeAutoDone } from "./prMergeAutoDone";

const markThreadDoneMock = vi.fn<(threadId: string) => void>();
let prWatchMergedListener: ((event: PrWatchMergedEvent) => void) | undefined;

vi.mock("@/renderer/actions/threadActions", () => ({
  markThreadDone: (threadId: string) => markThreadDoneMock(threadId),
}));

const openPr: PrData = {
  number: 7,
  state: "open",
  title: "Land the thing",
  url: "https://github.com/owner/repo/pull/7",
  baseBranch: "main",
  isDraft: false,
  checksStatus: "SUCCESS",
  updatedAt: "2026-07-20T00:00:00.000Z",
};
const mergedPr: PrData = { ...openPr, state: "merged" };

const thread: Thread = {
  id: "t1",
  projectId: "p1",
  title: "Worktree thread",
  agentKind: "codex",
  config: { model: "gpt-5" },
  status: "idle",
  attention: "none",
  canResumeWithConfig: false,
  worktreePath: "/repo-wt",
  worktreeBranch: "feature/wt",
  archived: false,
  done: false,
  starred: false,
  createdAt: "2026-07-20T00:00:00.000Z",
  updatedAt: "2026-07-20T00:00:00.000Z",
};

let stop: () => void = () => {};

describe("prMergeAutoDone", () => {
  beforeEach(() => {
    markThreadDoneMock.mockReset();
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: {
        platform: "darwin",
        onPrWatchMerged: vi.fn<(listener: (event: PrWatchMergedEvent) => void) => () => void>(
          (listener) => {
            prWatchMergedListener = listener;
            return () => {
              prWatchMergedListener = undefined;
            };
          },
        ),
        dbSetState: vi
          .fn<(key: string, value: string) => Promise<void>>()
          .mockResolvedValue(undefined),
      },
    });
    useGitStore.setState({ prData: {} });
    useAppStore.setState({ threads: [thread], view: { kind: "home" } });
    useSharedSettings.setState({ autoMarkDoneOnPrMerge: true });
    stop = startPrMergeAutoDone();
  });

  afterEach(() => {
    stop();
  });

  it("marks a worktree thread done when its PR turns merged", () => {
    useGitStore.getState().setPrData("/repo-wt", openPr);
    expect(markThreadDoneMock).not.toHaveBeenCalled();

    useGitStore.getState().setPrData("/repo-wt", mergedPr);
    expect(markThreadDoneMock).toHaveBeenCalledExactlyOnceWith("t1");
  });

  it("marks the thread done when the background watcher publishes its merge", () => {
    prWatchMergedListener?.({
      projectId: "p1",
      prNumber: 7,
      worktreePath: "/repo-wt",
    });

    expect(markThreadDoneMock).toHaveBeenCalledExactlyOnceWith("t1");
  });

  it("releases the background merge listener when stopped", () => {
    expect(prWatchMergedListener).toBeDefined();

    stop();
    stop = () => {};

    expect(prWatchMergedListener).toBeUndefined();
  });

  it("ignores a PR that is already merged the first time it is seen", () => {
    useGitStore.getState().setPrData("/repo-wt", mergedPr);
    expect(markThreadDoneMock).not.toHaveBeenCalled();
  });

  it("leaves threads alone while the setting is off", () => {
    useSharedSettings.setState({ autoMarkDoneOnPrMerge: false });
    useGitStore.getState().setPrData("/repo-wt", openPr);
    useGitStore.getState().setPrData("/repo-wt", mergedPr);
    expect(markThreadDoneMock).not.toHaveBeenCalled();
  });

  it("ignores merges on other worktrees and on the project branch", () => {
    useGitStore.getState().setPrData("/other-wt", openPr);
    useGitStore.getState().setPrData("/other-wt", mergedPr);
    useGitStore.getState().setPrData("__branch:p1", openPr);
    useGitStore.getState().setPrData("__branch:p1", mergedPr);
    expect(markThreadDoneMock).not.toHaveBeenCalled();
  });

  it("skips archived and already-done threads", () => {
    useAppStore.setState({
      threads: [
        { ...thread, id: "archived", archived: true },
        { ...thread, id: "done", done: true },
      ],
    });
    useGitStore.getState().setPrData("/repo-wt", openPr);
    useGitStore.getState().setPrData("/repo-wt", mergedPr);
    expect(markThreadDoneMock).not.toHaveBeenCalled();
  });

  it("defers a thread that is mid-turn until the turn settles", () => {
    useAppStore.setState({ threads: [{ ...thread, status: "working" }] });
    useGitStore.getState().setPrData("/repo-wt", openPr);
    useGitStore.getState().setPrData("/repo-wt", mergedPr);
    expect(markThreadDoneMock).not.toHaveBeenCalled();

    useAppStore.setState({ threads: [{ ...thread, status: "needs_reply" }] });
    expect(markThreadDoneMock).not.toHaveBeenCalled();

    useAppStore.setState({ threads: [{ ...thread, status: "idle" }] });
    expect(markThreadDoneMock).toHaveBeenCalledExactlyOnceWith("t1");
  });
});
