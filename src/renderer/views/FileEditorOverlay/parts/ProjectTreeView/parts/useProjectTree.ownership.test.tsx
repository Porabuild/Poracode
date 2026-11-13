import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation, ProjectTreeEntry } from "@/shared/contracts";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { useProjectRootNames } from "@/renderer/state/projectRootNamesStore";
import { resetProjectTreeStore, useProjectTreeStore } from "@/renderer/state/projectTreeStore";
import { useProjectTree } from "./useProjectTree";

type TreeResult = { directoryPath: string; entries: ProjectTreeEntry[] };
const bridge = vi.hoisted(() => ({
  listProjectTree:
    vi.fn<
      (args: { projectLocation: ProjectLocation; directoryPath: string }) => Promise<TreeResult>
    >(),
  deleteProjectEntry: vi.fn<() => Promise<void>>(),
  createProjectEntry: vi.fn<() => Promise<void>>(),
  renameProjectEntry: vi.fn<() => Promise<void>>(),
  moveProjectEntry: vi.fn<() => Promise<void>>(),
  searchProjectTree: vi.fn<() => Promise<{ entries: ProjectTreeEntry[] }>>(),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));
const context = (projectId: string) => ({
  projectId,
  projectName: projectId,
  rootLabel: projectId,
  remoteServerId: "paired-host",
  projectLocation: {
    kind: "posix" as const,
    path: `/fixture/${projectId}`,
    remoteServerId: "paired-host",
  },
});
const treeResult = (name: string): TreeResult => ({
  directoryPath: "",
  entries: [{ name, path: name, type: "file" }],
});
const props = (projectId: string) => ({
  rootContext: context(projectId),
  onSelectFile: vi.fn<(path: string) => void>(),
});

describe("project tree directory ownership", () => {
  beforeEach(() => {
    resetProjectTreeStore();
    useFileEditorStore.setState({ refreshToken: 0, buffers: {} });
    bridge.listProjectTree.mockReset();
    bridge.deleteProjectEntry.mockReset().mockResolvedValue(undefined);
    bridge.createProjectEntry.mockReset().mockResolvedValue(undefined);
    bridge.renameProjectEntry.mockReset().mockResolvedValue(undefined);
    bridge.moveProjectEntry.mockReset().mockResolvedValue(undefined);
    bridge.searchProjectTree.mockReset().mockResolvedValue({ entries: [] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("lists the root exactly once on mount and once on a root switch", async () => {
    const first = Promise.withResolvers<TreeResult>();
    bridge.listProjectTree
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(treeResult("B.txt"));
    const hook = renderHook(useProjectTree, { initialProps: props("initial-A") });
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(1);
    hook.rerender(props("initial-B"));
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(2);
    await act(async () => first.resolve(treeResult("A.txt")));
    expect(useProjectTreeStore.getState().directoryEntries[""]).toEqual(
      treeResult("B.txt").entries,
    );
    expect(useProjectTreeStore.getState().loadingPaths).toEqual({});
  });

  it("clears search and draft state immediately when the root changes", async () => {
    vi.useFakeTimers();
    bridge.listProjectTree.mockResolvedValue(treeResult("root.txt"));
    bridge.searchProjectTree.mockResolvedValue({ entries: treeResult("found.txt").entries });
    const hook = renderHook(useProjectTree, { initialProps: props("search-A") });
    act(() => {
      hook.result.current.setDraft({
        mode: "create",
        type: "file",
        parentPath: "",
        value: "draft.txt",
      });
      hook.result.current.setSearchQuery("found");
    });
    expect(hook.result.current.searchLoading).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(120));
    expect(hook.result.current.searchResults).toEqual(treeResult("found.txt").entries);
    hook.rerender(props("search-B"));
    expect(hook.result.current.searchQuery).toBe("");
    expect(hook.result.current.searchResults).toEqual([]);
    expect(hook.result.current.searchLoading).toBe(false);
    expect(hook.result.current.draft).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(120));
    expect(bridge.searchProjectTree).toHaveBeenCalledTimes(1);
  });

  it("shares the initial root request through StrictMode effect replay", async () => {
    const pending = Promise.withResolvers<TreeResult>();
    bridge.listProjectTree.mockReturnValue(pending.promise);
    renderHook(useProjectTree, {
      initialProps: props("strict"),
      wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>,
    });
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(treeResult("current.txt")));
    expect(useProjectTreeStore.getState().directoryEntries[""]).toEqual(
      treeResult("current.txt").entries,
    );
  });

  it.each([false, true])(
    "shares chat and tree root requests and seeds names (chat first=%s)",
    async (chatFirst) => {
      const root = context(`shared-${chatFirst}`);
      const pending = Promise.withResolvers<TreeResult>();
      bridge.listProjectTree.mockReturnValue(pending.promise);
      const mountChat = () => renderHook(() => useProjectRootNames(root.projectLocation));
      const mountTree = () =>
        renderHook(useProjectTree, {
          initialProps: { rootContext: root, onSelectFile: vi.fn<(path: string) => void>() },
        });
      const chat = chatFirst ? mountChat() : undefined;
      mountTree();
      const names = chat ?? mountChat();
      expect(bridge.listProjectTree).toHaveBeenCalledTimes(1);
      await act(async () => pending.resolve(treeResult("shared.txt")));
      expect([...names.result.current]).toEqual(["shared.txt"]);
      names.unmount();
      const cached = mountChat();
      expect([...cached.result.current]).toEqual(["shared.txt"]);
      expect(bridge.listProjectTree).toHaveBeenCalledTimes(1);
    },
  );

  it("loads only an uncached expanded directory and reuses cached ancestors for search", async () => {
    bridge.listProjectTree.mockImplementation(({ directoryPath }) =>
      Promise.resolve({ directoryPath, entries: [] }),
    );
    const hook = renderHook(useProjectTree, { initialProps: props("expansion") });
    await waitFor(() => expect(useProjectTreeStore.getState().loadingPaths).toEqual({}));
    await act(async () => hook.result.current.toggleDirectory("src"));
    expect(bridge.listProjectTree.mock.calls.map(([args]) => args.directoryPath)).toEqual([
      "",
      "src",
    ]);
    await act(async () => hook.result.current.toggleDirectory("src"));
    await act(async () => hook.result.current.toggleDirectory("src"));
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(2);
    await act(async () =>
      hook.result.current.openSearchResult({
        name: "nested",
        path: "src/nested",
        type: "directory",
      }),
    );
    expect(bridge.listProjectTree.mock.calls.map(([args]) => args.directoryPath)).toEqual([
      "",
      "src",
      "src/nested",
    ]);
  });

  it.each([0, 1])(
    "shares initial and directory loads across independent mounts (unmounted=%s)",
    async (unmounted) => {
      const initial = Promise.withResolvers<TreeResult>();
      const directory = Promise.withResolvers<TreeResult>();
      bridge.listProjectTree
        .mockReturnValueOnce(initial.promise)
        .mockReturnValueOnce(directory.promise);
      const initialProps = props(`independent-${unmounted}`);
      const hooks = [
        renderHook(useProjectTree, { initialProps }),
        renderHook(useProjectTree, { initialProps }),
      ];
      expect(bridge.listProjectTree).toHaveBeenCalledTimes(1);
      hooks[unmounted]!.unmount();
      expect(useProjectTreeStore.getState().loadingPaths).toEqual({ "": true });
      await act(async () => initial.resolve(treeResult("root.txt")));
      const remaining = hooks[1 - unmounted]!;
      act(() => {
        void remaining.result.current.toggleDirectory("src");
      });
      const replacement = renderHook(useProjectTree, { initialProps });
      expect(bridge.listProjectTree.mock.calls.map(([args]) => args.directoryPath)).toEqual([
        "",
        "src",
      ]);
      remaining.unmount();
      expect(useProjectTreeStore.getState().loadingPaths).toEqual({ src: true });
      await act(async () =>
        directory.resolve({ directoryPath: "src", entries: treeResult("child.txt").entries }),
      );
      expect(useProjectTreeStore.getState().directoryEntries.src).toEqual(
        treeResult("child.txt").entries,
      );
      expect(useProjectTreeStore.getState().loadingPaths).toEqual({});
      replacement.unmount();
    },
  );

  it("shares one refresh queue and stays visible while either mount is visible", async () => {
    vi.useFakeTimers();
    const initial = Promise.withResolvers<TreeResult>();
    bridge.listProjectTree
      .mockReturnValueOnce(initial.promise)
      .mockResolvedValue(treeResult("latest.txt"));
    const initialProps = { ...props("shared-refresh"), visible: true };
    const first = renderHook(useProjectTree, { initialProps });
    const second = renderHook(useProjectTree, { initialProps });
    first.rerender({ ...initialProps, visible: false });
    act(() => useFileEditorStore.getState().bumpRefreshToken());
    await act(async () => vi.advanceTimersByTimeAsync(275));
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(1);
    await act(async () => initial.resolve(treeResult("stale.txt")));
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(2);
    expect(useProjectTreeStore.getState().directoryEntries[""]).toEqual(
      treeResult("latest.txt").entries,
    );
    act(() => useFileEditorStore.getState().bumpRefreshToken());
    await act(async () => vi.advanceTimersByTimeAsync(275));
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(3);
    second.unmount();
    act(() => useFileEditorStore.getState().bumpRefreshToken());
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(3);
    first.rerender(initialProps);
    await act(async () => {});
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(4);
  });

  it("drops an unmounted tree's response and clears its loading state", async () => {
    const pending = Promise.withResolvers<TreeResult>();
    bridge.listProjectTree.mockReturnValue(pending.promise);
    const hook = renderHook(useProjectTree, { initialProps: props("unmounted-reply") });
    hook.unmount();
    await act(async () => pending.resolve(treeResult("departed.txt")));
    expect(useProjectTreeStore.getState().directoryEntries).toEqual({});
    expect(useProjectTreeStore.getState().loadingPaths).toEqual({});
  });

  it("starts a fresh request after the last owner leaves and another mounts later", async () => {
    const departed = Promise.withResolvers<TreeResult>();
    const current = Promise.withResolvers<TreeResult>();
    bridge.listProjectTree
      .mockReturnValueOnce(departed.promise)
      .mockReturnValueOnce(current.promise);
    const initialProps = props("independent-remount");
    const first = renderHook(useProjectTree, { initialProps });
    const names = renderHook(() => useProjectRootNames(initialProps.rootContext.projectLocation));
    first.unmount();
    await act(async () => {});
    renderHook(useProjectTree, { initialProps });
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(2);
    await act(async () => departed.resolve(treeResult("departed.txt")));
    expect(useProjectTreeStore.getState().directoryEntries).toEqual({});
    expect([...names.result.current]).toEqual([]);
    await act(async () => current.resolve(treeResult("current.txt")));
    expect(useProjectTreeStore.getState().directoryEntries[""]).toEqual(
      treeResult("current.txt").entries,
    );
    expect([...names.result.current]).toEqual(["current.txt"]);
  });

  it("defers a queued refresh when hidden during the initial request", async () => {
    vi.useFakeTimers();
    const initial = Promise.withResolvers<TreeResult>();
    bridge.listProjectTree
      .mockReturnValueOnce(initial.promise)
      .mockResolvedValue(treeResult("latest.txt"));
    const initialProps = { ...props("hide-initial"), visible: true };
    const hook = renderHook(useProjectTree, { initialProps });
    act(() => useFileEditorStore.getState().bumpRefreshToken());
    hook.rerender({ ...initialProps, visible: false });
    await act(async () => initial.resolve(treeResult("stale.txt")));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(1);
    expect(useProjectTreeStore.getState().directoryEntries[""]).toEqual(
      treeResult("stale.txt").entries,
    );
    expect(useProjectTreeStore.getState().loadingPaths).toEqual({});
    hook.rerender(initialProps);
    await act(async () => {});
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(2);
    expect(useProjectTreeStore.getState().directoryEntries[""]).toEqual(
      treeResult("latest.txt").entries,
    );
  });

  it.each(["create", "rename", "move"] as const)(
    "reloads cached directories after %s",
    async (mutation) => {
      vi.useFakeTimers();
      bridge.listProjectTree.mockImplementation(({ directoryPath }) =>
        Promise.resolve({ directoryPath, entries: [] }),
      );
      const hook = renderHook(useProjectTree, { initialProps: props(`mutation-${mutation}`) });
      await act(async () => {});
      await act(async () => hook.result.current.toggleDirectory("src"));
      await act(async () => {
        if (mutation === "create")
          await hook.result.current.handleCreateEntry("src", "file", "new.txt");
        if (mutation === "rename")
          await hook.result.current.handleRenameEntry("src/old.txt", "new.txt");
        if (mutation === "move") await hook.result.current.handleMovePath("old.txt", "src");
      });
      expect(bridge.listProjectTree).toHaveBeenCalledTimes(2);
      await act(async () => vi.advanceTimersByTimeAsync(275));
      expect(bridge.listProjectTree.mock.calls.map(([args]) => args.directoryPath)).toEqual([
        "",
        "src",
        "",
        "src",
      ]);
      expect(useProjectTreeStore.getState().loadingPaths).toEqual({});
    },
  );

  it("refreshes a deleted entry's parent without listing its grandparent", async () => {
    bridge.listProjectTree.mockImplementation(({ directoryPath }) =>
      Promise.resolve({ directoryPath, entries: [] }),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const hook = renderHook(useProjectTree, { initialProps: props("deletion") });
    await waitFor(() => expect(useProjectTreeStore.getState().loadingPaths).toEqual({}));
    await act(async () =>
      hook.result.current.handleEntryAction(
        { name: "old.txt", path: "src/nested/old.txt", type: "file" },
        "delete",
      ),
    );
    expect(bridge.listProjectTree.mock.calls.map(([args]) => args.directoryPath)).toEqual([
      "",
      "src/nested",
    ]);
  });

  it("bounds a watcher burst's delay and keeps explicit refresh immediate", async () => {
    vi.useFakeTimers();
    bridge.listProjectTree.mockResolvedValue(treeResult("initial.txt"));
    const hook = renderHook(useProjectTree, { initialProps: props("debounce") });
    await act(async () => {});
    for (let index = 0; index < 5; index += 1) {
      act(() => useFileEditorStore.getState().bumpRefreshToken());
      await act(async () => vi.advanceTimersByTimeAsync(50));
    }
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(24));
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(2);
    act(() => useFileEditorStore.getState().bumpRefreshToken());
    await act(async () => hook.result.current.handleRootAction("refresh"));
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(3);
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(3);
  });

  it("displays a completed snapshot and coalesces overlapping watcher events into one trailing load", async () => {
    vi.useFakeTimers();
    const stale = Promise.withResolvers<TreeResult>();
    const latest = Promise.withResolvers<TreeResult>();
    bridge.listProjectTree
      .mockResolvedValueOnce(treeResult("initial.txt"))
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(latest.promise);
    renderHook(useProjectTree, { initialProps: props("trailing") });
    await act(async () => {});
    act(() => useFileEditorStore.getState().bumpRefreshToken());
    await act(async () => vi.advanceTimersByTimeAsync(275));
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(2);
    for (let index = 0; index < 5; index += 1) {
      act(() => useFileEditorStore.getState().bumpRefreshToken());
      await act(async () => vi.advanceTimersByTimeAsync(300));
    }
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(2);
    await act(async () => stale.resolve(treeResult("stale.txt")));
    expect(useProjectTreeStore.getState().directoryEntries[""]).toEqual(
      treeResult("stale.txt").entries,
    );
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(3);
    expect(useProjectTreeStore.getState().loadingPaths).toEqual({ "": true });
    await act(async () => latest.resolve(treeResult("latest.txt")));
    expect(useProjectTreeStore.getState().directoryEntries[""]).toEqual(
      treeResult("latest.txt").entries,
    );
    expect(useProjectTreeStore.getState().loadingPaths).toEqual({});
  });

  it("drops a refresh invalidated during the initial request from both the tree and root names", async () => {
    const initial = Promise.withResolvers<TreeResult>();
    const latest = Promise.withResolvers<TreeResult>();
    bridge.listProjectTree.mockReturnValueOnce(initial.promise).mockReturnValueOnce(latest.promise);
    const initialProps = props("initial-explicit-refresh");
    const tree = renderHook(useProjectTree, { initialProps });
    const names = renderHook(() => useProjectRootNames(initialProps.rootContext.projectLocation));
    let refreshed: Promise<void>;
    act(() => {
      refreshed = tree.result.current.handleRootAction("refresh");
    });
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(1);
    await act(async () => initial.resolve(treeResult("stale.txt")));
    expect(useProjectTreeStore.getState().directoryEntries).toEqual({});
    expect([...names.result.current]).toEqual([]);
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(2);
    await act(async () => {
      latest.resolve(treeResult("latest.txt"));
      await refreshed;
    });
    expect(useProjectTreeStore.getState().directoryEntries[""]).toEqual(
      treeResult("latest.txt").entries,
    );
    expect([...names.result.current]).toEqual(["latest.txt"]);
    expect(useProjectTreeStore.getState().loadingPaths).toEqual({});
  });

  it("does not install a pre-delete directory reply over the requested mutation reload", async () => {
    const stale = Promise.withResolvers<TreeResult>();
    const latest = Promise.withResolvers<TreeResult>();
    bridge.listProjectTree
      .mockResolvedValueOnce(treeResult("root.txt"))
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(latest.promise);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const tree = renderHook(useProjectTree, { initialProps: props("delete-in-flight") });
    await act(async () => {});
    act(() => {
      void tree.result.current.toggleDirectory("src");
    });
    let deleted: Promise<void>;
    await act(async () => {
      deleted = tree.result.current.handleEntryAction(
        { name: "old.txt", path: "src/old.txt", type: "file" },
        "delete",
      );
    });
    await act(async () =>
      stale.resolve({ directoryPath: "src", entries: treeResult("old.txt").entries }),
    );
    expect(useProjectTreeStore.getState().directoryEntries.src).toBeUndefined();
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(3);
    await act(async () => {
      latest.resolve({ directoryPath: "src", entries: [] });
      await deleted;
    });
    expect(useProjectTreeStore.getState().directoryEntries.src).toEqual([]);
  });

  it("does not restore a deleted directory's children from a pending expansion", async () => {
    vi.useFakeTimers();
    const old = Promise.withResolvers<TreeResult>();
    let directoryCalls = 0;
    bridge.listProjectTree.mockImplementation(({ directoryPath }) => {
      if (directoryPath === "src" && directoryCalls++ === 0) return old.promise;
      return Promise.resolve({ directoryPath, entries: [] });
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const tree = renderHook(useProjectTree, { initialProps: props("delete-directory-in-flight") });
    await act(async () => {});
    act(() => {
      void tree.result.current.toggleDirectory("src");
    });
    let deleted: Promise<void>;
    await act(async () => {
      deleted = tree.result.current.handleEntryAction(
        { name: "src", path: "src", type: "directory" },
        "delete",
      );
    });
    expect(useProjectTreeStore.getState().directoryEntries.src).toEqual([]);
    await act(async () => {
      old.resolve({ directoryPath: "src", entries: treeResult("deleted-child.txt").entries });
      await deleted;
    });
    expect(useProjectTreeStore.getState().directoryEntries.src).toEqual([]);
    await act(async () => vi.advanceTimersByTimeAsync(275));
    expect(useProjectTreeStore.getState().directoryEntries.src).toEqual([]);
  });

  it("invalidates a remounted same-root loader when a departed view's delete completes", async () => {
    vi.useFakeTimers();
    const deletion = Promise.withResolvers<void>();
    const child = Promise.withResolvers<TreeResult>();
    let deleted = false;
    bridge.deleteProjectEntry.mockReturnValue(deletion.promise);
    bridge.listProjectTree.mockImplementation(({ directoryPath }) => {
      if (directoryPath === "src" && !deleted) return child.promise;
      return Promise.resolve({
        directoryPath,
        entries: deleted ? [] : [{ name: "src", path: "src", type: "directory" }],
      });
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const initialProps = props("delete-after-remount");
    const first = renderHook(useProjectTree, { initialProps });
    await act(async () => {});
    let operation: Promise<void>;
    act(() => {
      operation = first.result.current.handleEntryAction(
        { name: "src", path: "src", type: "directory" },
        "delete",
      );
    });
    first.unmount();
    await act(async () => {});
    const current = renderHook(useProjectTree, { initialProps });
    await act(async () => {});
    act(() => {
      void current.result.current.toggleDirectory("src");
    });
    await act(async () => {
      deleted = true;
      deletion.resolve();
      await operation;
    });
    expect(useProjectTreeStore.getState().directoryEntries.src).toEqual([]);
    await act(async () =>
      child.resolve({ directoryPath: "src", entries: treeResult("deleted-child.txt").entries }),
    );
    expect(useProjectTreeStore.getState().directoryEntries.src).toEqual([]);
    await act(async () => vi.advanceTimersByTimeAsync(275));
    expect(useProjectTreeStore.getState().directoryEntries).toEqual({ "": [], src: [] });
    expect(useProjectTreeStore.getState().loadingPaths).toEqual({});
  });

  it("does not invalidate another root's pending listing when a departed delete completes", async () => {
    vi.useFakeTimers();
    const deletion = Promise.withResolvers<void>();
    const child = Promise.withResolvers<TreeResult>();
    bridge.deleteProjectEntry.mockReturnValue(deletion.promise);
    bridge.listProjectTree.mockImplementation(({ directoryPath }) =>
      directoryPath === "src"
        ? child.promise
        : Promise.resolve({
            directoryPath,
            entries: [{ name: "src", path: "src", type: "directory" }],
          }),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const first = renderHook(useProjectTree, { initialProps: props("delete-departed-A") });
    await act(async () => {});
    let operation: Promise<void>;
    act(() => {
      operation = first.result.current.handleEntryAction(
        { name: "old.txt", path: "src/old.txt", type: "file" },
        "delete",
      );
    });
    first.unmount();
    await act(async () => {});
    const current = renderHook(useProjectTree, { initialProps: props("delete-current-B") });
    await act(async () => {});
    act(() => {
      void current.result.current.toggleDirectory("src");
    });
    await act(async () => {
      deletion.resolve();
      await operation;
    });
    await act(async () =>
      child.resolve({ directoryPath: "src", entries: treeResult("keep-B.txt").entries }),
    );
    expect(useProjectTreeStore.getState().rootKey).toBe("delete-current-B:");
    expect(useProjectTreeStore.getState().directoryEntries.src).toEqual(
      treeResult("keep-B.txt").entries,
    );
    await act(async () => vi.advanceTimersByTimeAsync(275));
    expect(useProjectTreeStore.getState().directoryEntries.src).toEqual(
      treeResult("keep-B.txt").entries,
    );
    expect(useProjectTreeStore.getState().loadingPaths).toEqual({});
  });

  it("keeps the completed snapshot when the pending watcher refresh fails", async () => {
    vi.useFakeTimers();
    const initial = Promise.withResolvers<TreeResult>();
    bridge.listProjectTree
      .mockReturnValueOnce(initial.promise)
      .mockRejectedValueOnce(new Error("listing failed"));
    renderHook(useProjectTree, { initialProps: props("debounced-failure") });
    act(() => useFileEditorStore.getState().bumpRefreshToken());
    await act(async () => initial.resolve(treeResult("stale.txt")));
    expect(useProjectTreeStore.getState().directoryEntries[""]).toEqual(
      treeResult("stale.txt").entries,
    );
    expect(useProjectTreeStore.getState().loadingPaths).toEqual({ "": true });
    await act(async () => vi.advanceTimersByTimeAsync(275));
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(2);
    expect(useProjectTreeStore.getState().loadingPaths).toEqual({});
    expect(useProjectTreeStore.getState().directoryEntries[""]).toEqual(
      treeResult("stale.txt").entries,
    );
  });

  it.each([250, 300])(
    "shows first data and makes progress during sustained %sms watcher events with 350ms listings",
    async (interval) => {
      vi.useFakeTimers();
      let version = 0;
      let inFlight = 0;
      let maximumInFlight = 0;
      const snapshots: { at: number; name: string }[] = [];
      const started = Date.now();
      bridge.listProjectTree.mockImplementation(() => {
        const capturedVersion = version;
        inFlight += 1;
        maximumInFlight = Math.max(maximumInFlight, inFlight);
        return new Promise((resolve) => {
          setTimeout(() => {
            inFlight -= 1;
            resolve(treeResult(`version-${capturedVersion}.txt`));
          }, 350);
        });
      });
      const unsubscribe = useProjectTreeStore.subscribe((state, previous) => {
        const entry = state.directoryEntries[""]?.[0];
        if (entry && state.directoryEntries[""] !== previous.directoryEntries[""]) {
          snapshots.push({ at: Date.now() - started, name: entry.name });
        }
      });
      try {
        renderHook(useProjectTree, { initialProps: props(`sustained-${interval}`) });
        for (let event = 1; event <= 20; event += 1) {
          await act(async () => vi.advanceTimersByTimeAsync(interval));
          version = event;
          act(() => useFileEditorStore.getState().bumpRefreshToken());
        }
        expect(snapshots[0]).toEqual({ at: 350, name: "version-0.txt" });
        expect(
          snapshots.some(
            (snapshot) => snapshot.name !== "version-0.txt" && snapshot.at < interval * 20,
          ),
        ).toBe(true);
        expect(useProjectTreeStore.getState().directoryEntries[""]).toBeDefined();
        await act(async () => vi.advanceTimersByTimeAsync(1000));
        expect(useProjectTreeStore.getState().directoryEntries[""]).toEqual(
          treeResult("version-20.txt").entries,
        );
        expect(useProjectTreeStore.getState().loadingPaths).toEqual({});
        expect(maximumInFlight).toBe(1);
        expect(inFlight).toBe(0);
      } finally {
        unsubscribe();
      }
    },
  );

  it.each(["create", "rename", "move"] as const)(
    "rejects a pre-%s snapshot even when watcher snapshots may display",
    async (mutation) => {
      vi.useFakeTimers();
      const old = Promise.withResolvers<TreeResult>();
      const latest = Promise.withResolvers<TreeResult>();
      bridge.listProjectTree.mockReturnValueOnce(old.promise).mockReturnValue(latest.promise);
      const initialProps = props(`mutation-fence-${mutation}`);
      const tree = renderHook(useProjectTree, { initialProps });
      const names = renderHook(() => useProjectRootNames(initialProps.rootContext.projectLocation));
      await act(async () => {
        if (mutation === "create")
          await tree.result.current.handleCreateEntry("", "file", "new.txt");
        if (mutation === "rename")
          await tree.result.current.handleRenameEntry("old.txt", "new.txt");
        if (mutation === "move") await tree.result.current.handleMovePath("old.txt", "src");
      });
      await act(async () => old.resolve(treeResult("old.txt")));
      expect(useProjectTreeStore.getState().directoryEntries).toEqual({});
      expect([...names.result.current]).toEqual([]);
      await act(async () => latest.resolve(treeResult("current.txt")));
      await act(async () => vi.advanceTimersByTimeAsync(275));
      expect(useProjectTreeStore.getState().directoryEntries[""]).toEqual(
        treeResult("current.txt").entries,
      );
      expect([...names.result.current]).toEqual(["current.txt"]);
    },
  );

  it.each(["unmount", "switch", "clear"] as const)(
    "does not adopt a names-only request after chat departure (%s)",
    async (departure) => {
      const a = context(`departed-names-${departure}-A`);
      const b = context(`departed-names-${departure}-B`);
      const old = Promise.withResolvers<TreeResult>();
      let aCalls = 0;
      bridge.listProjectTree.mockImplementation(({ projectLocation }) => {
        if (projectLocation.kind === "posix" && projectLocation.path === a.projectLocation.path) {
          aCalls += 1;
          return aCalls === 1 ? old.promise : Promise.resolve(treeResult("current-A.txt"));
        }
        return Promise.resolve(treeResult("B.txt"));
      });
      const initialProps: { location: ProjectLocation | undefined } = {
        location: a.projectLocation,
      };
      const chat = renderHook(
        ({ location }: { location: ProjectLocation | undefined }) => useProjectRootNames(location),
        { initialProps },
      );
      if (departure === "unmount") chat.unmount();
      else chat.rerender({ location: departure === "clear" ? undefined : b.projectLocation });
      act(() => useFileEditorStore.getState().bumpRefreshToken());
      renderHook(useProjectTree, {
        initialProps: { rootContext: a, onSelectFile: vi.fn<(path: string) => void>() },
      });
      expect(aCalls).toBe(2);
      await act(async () => old.resolve(treeResult("departed-A.txt")));
      expect(useProjectTreeStore.getState().directoryEntries[""]).toEqual(
        treeResult("current-A.txt").entries,
      );
      const currentNames = renderHook(() => useProjectRootNames(a.projectLocation));
      expect([...currentNames.result.current]).toEqual(["current-A.txt"]);
    },
  );

  it.each([false, true])(
    "defers hidden watcher reloads and catches up once when shown (initially visible=%s)",
    async (initiallyVisible) => {
      vi.useFakeTimers();
      bridge.listProjectTree.mockResolvedValue(treeResult("current.txt"));
      const initialProps = {
        ...props(`visibility-${initiallyVisible}`),
        visible: initiallyVisible,
      };
      const hook = renderHook(useProjectTree, { initialProps });
      await act(async () => {});
      const initialCalls = initiallyVisible ? 1 : 0;
      expect(bridge.listProjectTree).toHaveBeenCalledTimes(initialCalls);
      act(() => useFileEditorStore.getState().bumpRefreshToken());
      hook.rerender({ ...initialProps, visible: false });
      for (let index = 0; index < 4; index += 1) {
        act(() => useFileEditorStore.getState().bumpRefreshToken());
        await act(async () => vi.advanceTimersByTimeAsync(300));
      }
      expect(bridge.listProjectTree).toHaveBeenCalledTimes(initialCalls);
      hook.rerender({ ...initialProps, visible: true });
      await act(async () => {});
      expect(bridge.listProjectTree).toHaveBeenCalledTimes(initialCalls + 1);
      hook.rerender({ ...initialProps, visible: false });
      await act(async () => {});
      hook.rerender({ ...initialProps, visible: true });
      await act(async () => vi.advanceTimersByTimeAsync(300));
      expect(bridge.listProjectTree).toHaveBeenCalledTimes(initialCalls + 2);
    },
  );

  it("revalidates once across owners after a pause without a watcher token and keeps cached rows", async () => {
    vi.useFakeTimers();
    const freshRoot = Promise.withResolvers<TreeResult>();
    const freshChild = Promise.withResolvers<TreeResult>();
    let changed = false;
    bridge.listProjectTree.mockImplementation(({ directoryPath }) => {
      if (changed) return directoryPath === "" ? freshRoot.promise : freshChild.promise;
      return Promise.resolve({
        directoryPath,
        entries: treeResult(directoryPath ? "old-child.txt" : "old-root.txt").entries,
      });
    });
    const initialProps = { ...props("resume-without-token"), visible: true };
    const first = renderHook(useProjectTree, { initialProps });
    const second = renderHook(useProjectTree, { initialProps });
    await act(async () => {});
    await act(async () => first.result.current.toggleDirectory("src"));
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(2);
    first.rerender({ ...initialProps, visible: false });
    second.rerender({ ...initialProps, visible: false });
    await act(async () => {});
    changed = true;
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(2);
    expect(useFileEditorStore.getState().refreshToken).toBe(0);
    first.rerender(initialProps);
    second.rerender(initialProps);
    expect(bridge.listProjectTree.mock.calls.map(([args]) => args.directoryPath)).toEqual([
      "",
      "src",
      "",
      "src",
    ]);
    expect(useProjectTreeStore.getState().directoryEntries[""]).toEqual(
      treeResult("old-root.txt").entries,
    );
    expect(useProjectTreeStore.getState().directoryEntries.src).toEqual(
      treeResult("old-child.txt").entries,
    );
    await act(async () => {
      freshRoot.resolve(treeResult("new-root.txt"));
      freshChild.resolve({ directoryPath: "src", entries: treeResult("new-child.txt").entries });
    });
    expect(useProjectTreeStore.getState().directoryEntries[""]).toEqual(
      treeResult("new-root.txt").entries,
    );
    expect(useProjectTreeStore.getState().directoryEntries.src).toEqual(
      treeResult("new-child.txt").entries,
    );
    expect(useProjectTreeStore.getState().loadingPaths).toEqual({});
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(4);
  });

  it.each([false, true])(
    "does not turn a same-commit owner handoff into a resume refresh (settled=%s)",
    async (settled) => {
      const initial = Promise.withResolvers<TreeResult>();
      bridge.listProjectTree.mockReturnValue(initial.promise);
      const initialProps = props(`handoff-${settled}`);
      const first = renderHook(useProjectTree, { initialProps });
      if (settled) await act(async () => initial.resolve(treeResult("current.txt")));
      first.unmount();
      renderHook(useProjectTree, { initialProps });
      await act(async () => initial.resolve(treeResult("current.txt")));
      expect(bridge.listProjectTree).toHaveBeenCalledTimes(1);
      expect(useProjectTreeStore.getState().directoryEntries[""]).toEqual(
        treeResult("current.txt").entries,
      );
    },
  );

  it("does not pause or refresh a visible owner when an independent hidden owner changes", async () => {
    vi.useFakeTimers();
    bridge.listProjectTree.mockResolvedValue(treeResult("current.txt"));
    const initialProps = { ...props("independent-hidden-owner"), visible: true };
    renderHook(useProjectTree, { initialProps });
    await act(async () => {});
    const hidden = renderHook(useProjectTree, {
      initialProps: { ...initialProps, visible: false },
    });
    hidden.rerender(initialProps);
    hidden.rerender({ ...initialProps, visible: false });
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    hidden.unmount();
    await act(async () => {});
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(1);
    expect(useProjectTreeStore.getState().directoryEntries[""]).toEqual(
      treeResult("current.txt").entries,
    );
  });

  it("drops a scheduled refresh when the root switches or unmounts", async () => {
    vi.useFakeTimers();
    bridge.listProjectTree.mockResolvedValue(treeResult("current.txt"));
    const hook = renderHook(useProjectTree, { initialProps: props("scheduled-A") });
    await act(async () => {});
    act(() => useFileEditorStore.getState().bumpRefreshToken());
    hook.rerender(props("scheduled-B"));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(2);
    act(() => useFileEditorStore.getState().bumpRefreshToken());
    hook.unmount();
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(2);
    expect(useProjectTreeStore.getState().loadingPaths).toEqual({});
  });
  it.each([false, true])(
    "rejects departed root responses, including return to the same root (return=%s)",
    async (returnToFirst) => {
      const old = Promise.withResolvers<TreeResult>();
      let firstPending = true;
      bridge.listProjectTree.mockImplementation(({ projectLocation }) =>
        projectLocation.kind === "posix" && projectLocation.path === "/fixture/A" && firstPending
          ? old.promise
          : Promise.resolve(treeResult("current.txt")),
      );
      const hook = renderHook(useProjectTree, { initialProps: props("A") });
      expect(bridge.listProjectTree).toHaveBeenCalled();
      hook.rerender(props("B"));
      await waitFor(() =>
        expect(useProjectTreeStore.getState().directoryEntries[""]).toEqual(
          treeResult("current.txt").entries,
        ),
      );
      firstPending = false;
      if (returnToFirst) {
        hook.rerender(props("A"));
      }
      await waitFor(() =>
        expect(useProjectTreeStore.getState().rootKey).toBe(returnToFirst ? "A:" : "B:"),
      );
      await waitFor(() =>
        expect(useProjectTreeStore.getState().directoryEntries[""]).toEqual(
          treeResult("current.txt").entries,
        ),
      );
      await act(async () => {
        old.resolve(treeResult("departed.txt"));
        await old.promise;
      });
      expect(useProjectTreeStore.getState().directoryEntries[""]).toEqual(
        treeResult("current.txt").entries,
      );
    },
  );
  it("does not let a retained previous root refresh the active root", async () => {
    bridge.listProjectTree.mockImplementation(({ projectLocation }) =>
      Promise.resolve(
        treeResult(
          projectLocation.kind === "posix" && projectLocation.path === "/fixture/A"
            ? "A.txt"
            : "B.txt",
        ),
      ),
    );
    const old = renderHook(useProjectTree, { initialProps: props("A") });
    await waitFor(() =>
      expect(useProjectTreeStore.getState().directoryEntries[""]).toEqual(
        treeResult("A.txt").entries,
      ),
    );
    renderHook(useProjectTree, { initialProps: props("B") });
    await waitFor(() =>
      expect(useProjectTreeStore.getState().directoryEntries[""]).toEqual(
        treeResult("B.txt").entries,
      ),
    );
    const requests = bridge.listProjectTree.mock.calls.length;
    await act(async () => old.result.current.handleRootAction("refresh"));
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(requests);
    expect(useProjectTreeStore.getState().directoryEntries[""]).toEqual(
      treeResult("B.txt").entries,
    );
  });

  it("does not let a hidden different root replace the visible tree and loads it when shown", async () => {
    bridge.listProjectTree
      .mockResolvedValueOnce(treeResult("visible.txt"))
      .mockResolvedValueOnce(treeResult("shown.txt"));
    renderHook(useProjectTree, { initialProps: props("visible-owner") });
    await act(async () => {});
    const initialProps = { ...props("hidden-owner"), visible: false };
    const hidden = renderHook(useProjectTree, { initialProps });
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(1);
    expect(useProjectTreeStore.getState().rootKey).toBe("visible-owner:");
    expect(useProjectTreeStore.getState().directoryEntries[""]).toEqual(
      treeResult("visible.txt").entries,
    );
    hidden.rerender({ ...initialProps, visible: true });
    await act(async () => {});
    expect(bridge.listProjectTree).toHaveBeenCalledTimes(2);
    expect(useProjectTreeStore.getState().rootKey).toBe("hidden-owner:");
    expect(useProjectTreeStore.getState().directoryEntries[""]).toEqual(
      treeResult("shown.txt").entries,
    );
  });
});
