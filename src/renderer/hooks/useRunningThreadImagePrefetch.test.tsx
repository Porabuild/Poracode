import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";

const mocks = vi.hoisted(() => {
  const starts = new Map<string, ReturnType<typeof vi.fn<() => void>>>();
  const start = vi.fn<(id: string) => () => void>((id) => {
    const stop = vi.fn<() => void>();
    starts.set(id, stop);
    return stop;
  });
  return { starts, start, managed: true };
});

vi.mock("@/renderer/state/runningThreadImagePrefetch", () => ({
  startThreadImagePrefetch: mocks.start,
}));
vi.mock("@/renderer/state/dbStorage", () => ({
  createDbStorage: () => ({ getItem: () => null, setItem: () => {}, removeItem: () => {} }),
}));
vi.mock("@/renderer/state/managedRootCatalog/rootCatalogCommands", () => ({
  isManagedRootDesktopRuntime: () => mocks.managed,
}));
vi.mock("./useRunningThreadRuntime", () => ({
  runningThreadIds: (threads: readonly Thread[]) =>
    threads
      .filter(
        (candidate) =>
          candidate.presentationMode === "gui" &&
          !candidate.archived &&
          (candidate.status === "working" || candidate.status === "launching"),
      )
      .map((candidate) => candidate.id),
}));

import { useRunningThreadImagePrefetch } from "./useRunningThreadImagePrefetch";

function thread(id: string, status: Thread["status"] = "working"): Thread {
  return {
    id,
    status,
    projectId: "project",
    title: id,
    agentKind: "claude",
    config: { model: "haiku" },
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-11-05T00:00:00Z",
    updatedAt: "2026-11-05T00:00:00Z",
  };
}

beforeEach(() => {
  mocks.starts.clear();
  mocks.start.mockClear();
  useAppStore.setState({ threads: [] });
});

it.each([true, false])("starts and stops running image prefetch (%s)", async (managed) => {
  mocks.managed = managed;
  useAppStore.setState({
    threads: [
      thread("a"),
      { ...thread("b"), remoteServerId: "other-host", remoteId: "b" },
      thread("idle", "idle"),
      { ...thread("archived"), archived: true },
      { ...thread("terminal"), presentationMode: "terminal" },
    ],
  });
  const { rerender, unmount } = renderHook(
    ({ enabled }) => useRunningThreadImagePrefetch(enabled),
    { initialProps: { enabled: false } },
  );
  expect(mocks.start).not.toHaveBeenCalled();
  await act(async () => rerender({ enabled: true }));
  expect(mocks.start.mock.calls.map((call) => call[0])).toEqual(["a", "b"]);

  await act(async () => {
    useAppStore.setState({ threads: [thread("a"), thread("idle", "idle")] });
  });
  expect(mocks.starts.get("b")).toHaveBeenCalledTimes(1);

  await act(async () => {
    rerender({ enabled: false });
  });
  expect(mocks.starts.get("a")).toHaveBeenCalledTimes(1);

  unmount();
  expect(mocks.starts.get("a")).toHaveBeenCalledTimes(1);
});
