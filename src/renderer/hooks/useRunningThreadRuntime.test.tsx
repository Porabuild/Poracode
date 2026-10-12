import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import {
  __resetRendererEventInterestsForTest,
  noteRendererEventInterestWireCoverage,
  snapshotRendererEventInterests,
  subscribeRendererEventInterests,
} from "@/renderer/state/rendererEventInterests";
import { useRunningThreadRuntime } from "./useRunningThreadRuntime";

vi.mock("@/renderer/state/dbStorage", () => ({
  createDbStorage: () => ({ getItem: () => null, setItem: () => {}, removeItem: () => {} }),
}));

vi.mock("@/renderer/state/managedRootCatalog/rootCatalogCommands", () => ({
  isManagedRootDesktopRuntime: () => true,
}));
vi.mock("@/renderer/state/chatRuntimePersister", async (original) => ({
  ...(await original<typeof import("@/renderer/state/chatRuntimePersister")>()),
  hasHydratedThreadRuntimeItems: () => false,
  hydrateThreadRuntimeItems: vi.fn<(threadId: string) => Promise<void>>(async () => {}),
}));

function thread(id: string, status: Thread["status"] = "working"): Thread {
  return {
    id,
    status,
    projectId: "project",
    title: id,
    agentKind: "test-agent",
    config: { model: "auto" },
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-10-12T08:00:00Z",
    updatedAt: "2026-10-12T08:00:00Z",
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  __resetRendererEventInterestsForTest();
  useAppStore.setState({ threads: [], view: { kind: "home" } });
});
afterEach(() => {
  __resetRendererEventInterestsForTest();
  vi.useRealTimers();
});

it("keeps both running threads covered across navigation and retires settled ownership", async () => {
  const unsubscribe = subscribeRendererEventInterests((snapshot) =>
    noteRendererEventInterestWireCoverage(snapshot.runtimeThreadIds),
  );
  useAppStore.setState({ threads: [thread("a"), thread("b", "launching")] });
  const { unmount } = renderHook(() => useRunningThreadRuntime(true));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(snapshotRendererEventInterests().runtimeThreadIds).toEqual(["b", "a"]);

  await act(() => useAppStore.setState({ view: { kind: "thread", panes: ["a"] } }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000);
  });
  await act(() => useAppStore.setState({ view: { kind: "thread", panes: ["b"] } }));
  expect(snapshotRendererEventInterests().runtimeThreadIds).toEqual(["b", "a"]);

  await act(() =>
    useAppStore.setState({ threads: [thread("a", "idle"), thread("b", "needs_reply")] }),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250);
  });
  expect(snapshotRendererEventInterests().runtimeThreadIds).toEqual(["b"]);
  unmount();
  await vi.advanceTimersByTimeAsync(250);
  expect(snapshotRendererEventInterests().runtimeThreadIds).toEqual([]);
  unsubscribe();
});

it("waits for readiness and leaves terminal and remotely owned streams to their owners", async () => {
  useAppStore.setState({
    threads: [
      thread("gui"),
      { ...thread("terminal"), presentationMode: "terminal" },
      { ...thread("remote"), remoteServerId: "other-host", remoteId: "remote" },
    ],
  });
  const { rerender, unmount } = renderHook(({ enabled }) => useRunningThreadRuntime(enabled), {
    initialProps: { enabled: false },
  });
  expect(snapshotRendererEventInterests().runtimeThreadIds).toEqual([]);
  rerender({ enabled: true });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(snapshotRendererEventInterests().runtimeThreadIds).toEqual(["gui"]);
  unmount();
});
