import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation, ProjectTreeEntry } from "@/shared/contracts";
import { resetProjectTreeStore, useProjectTreeStore } from "@/renderer/state/projectTreeStore";
import { useProjectTree } from "./useProjectTree";

type TreeResult = { directoryPath: string; entries: ProjectTreeEntry[] };
const bridge = vi.hoisted(() => ({
  listProjectTree:
    vi.fn<
      (args: { projectLocation: ProjectLocation; directoryPath: string }) => Promise<TreeResult>
    >(),
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
    bridge.listProjectTree.mockReset();
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
});
