import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useMobilePageHistory } from "./mobilePageHistory";

beforeEach(() => {
  usePanelStore.setState({ mobileUtilityPage: null, settingsSection: null });
  window.history.replaceState({ __poracodeMobilePage: { page: "settings" } }, "");
});
afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "");
  usePanelStore.setState({ mobileUtilityPage: null, settingsSection: null });
  useAppStore.setState({ view: { kind: "home" }, focusedPaneId: null });
});

it("restores a page on reload without pushing a duplicate history entry", async () => {
  const push = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
  renderHook(() => useMobilePageHistory(true));
  await waitFor(() => expect(usePanelStore.getState().mobileUtilityPage).toBe("settings"));
  expect(push).not.toHaveBeenCalled();
});

it("restores compact history after a viewport change without duplicating the page", async () => {
  const push = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
  const { rerender } = renderHook(({ compact }) => useMobilePageHistory(compact), {
    initialProps: { compact: false },
  });
  rerender({ compact: true });
  await waitFor(() => expect(usePanelStore.getState().mobileUtilityPage).toBe("settings"));
  expect(push).not.toHaveBeenCalled();

  act(() => usePanelStore.getState().openMobileUtilityPage("usage"));
  expect(push).toHaveBeenCalledTimes(1);
  expect(push).toHaveBeenLastCalledWith({ __poracodeMobilePage: { page: "usage" } }, "");
});

it("applies Back and Forward without writing another history entry", async () => {
  const push = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
  renderHook(() => useMobilePageHistory(true));
  await waitFor(() => expect(usePanelStore.getState().mobileUtilityPage).toBe("settings"));

  act(() => {
    window.history.replaceState(null, "");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(usePanelStore.getState().mobileUtilityPage).toBeNull();

  act(() => {
    window.history.replaceState({ __poracodeMobilePage: { page: "settings" } }, "");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(usePanelStore.getState().mobileUtilityPage).toBe("settings");
  expect(push).not.toHaveBeenCalled();
});

it("keeps navigation requested in the same batch as a history restoration", async () => {
  const push = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
  renderHook(() => useMobilePageHistory(true));
  await waitFor(() => expect(usePanelStore.getState().mobileUtilityPage).toBe("settings"));

  act(() => {
    window.history.replaceState({ __poracodeMobilePage: { page: "usage" } }, "");
    window.dispatchEvent(new PopStateEvent("popstate"));
    usePanelStore.getState().openMobileUtilityPage("ports");
  });
  expect(usePanelStore.getState().mobileUtilityPage).toBe("ports");
  expect(push).toHaveBeenCalledTimes(1);
  expect(push).toHaveBeenLastCalledWith({ __poracodeMobilePage: { page: "ports" } }, "");
});

it("pushes history when opening a thread and returns to Home on popstate (iOS swipe back)", async () => {
  window.history.replaceState(null, "");
  useAppStore.setState({
    view: { kind: "home" },
    focusedPaneId: null,
    threads: [
      {
        id: "thread-1",
        projectId: "proj-1",
        title: "Thread 1",
        agentKind: "claude",
        config: { model: "claude-sonnet-4-6" },
        status: "idle",
        attention: "none",
        canResumeWithConfig: false,
        starred: false,
        archived: false,
        done: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  });
  const push = vi.spyOn(window.history, "pushState");
  renderHook(() => useMobilePageHistory(true));

  act(() => {
    useAppStore.getState().openThread("thread-1");
  });
  expect(push).toHaveBeenCalledTimes(1);
  expect(push).toHaveBeenLastCalledWith(
    { __poracodeMobilePage: { view: { kind: "thread", threadId: "thread-1" } } },
    "",
  );

  // Opening a utility page from the thread preserves the thread as the back target.
  act(() => {
    usePanelStore.getState().openMobileUtilityPage("notes");
  });
  expect(push).toHaveBeenCalledTimes(2);
  expect(push).toHaveBeenLastCalledWith(
    {
      __poracodeMobilePage: {
        page: "notes",
        view: { kind: "thread", threadId: "thread-1" },
      },
    },
    "",
  );

  // First swipe-back closes Notes and returns to thread-1.
  act(() => {
    window.history.replaceState(
      { __poracodeMobilePage: { view: { kind: "thread", threadId: "thread-1" } } },
      "",
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(usePanelStore.getState().mobileUtilityPage).toBeNull();
  expect(useAppStore.getState().view).toMatchObject({ kind: "thread", panes: ["thread-1"] });

  // Second swipe-back returns from thread-1 to Home.
  act(() => {
    window.history.replaceState(null, "");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(usePanelStore.getState().mobileUtilityPage).toBeNull();
  expect(useAppStore.getState().view).toEqual({ kind: "home" });
});

it("pops workspace history instead of pushing a duplicate thread entry on close", () => {
  window.history.replaceState(null, "");
  useAppStore.setState({
    view: { kind: "home" },
    focusedPaneId: null,
    threads: [
      {
        id: "thread-1",
        projectId: "proj-1",
        title: "Thread 1",
        agentKind: "claude",
        config: { model: "claude-sonnet-4-6" },
        status: "idle",
        attention: "none",
        canResumeWithConfig: false,
        starred: false,
        archived: false,
        done: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  });
  const push = vi.spyOn(window.history, "pushState");
  const back = vi.spyOn(window.history, "back");
  renderHook(() => useMobilePageHistory(true));

  act(() => {
    useAppStore.getState().openThread("thread-1");
  });
  expect(push).toHaveBeenCalledTimes(1);

  act(() => {
    usePanelStore.setState({
      gitReviewContext: { projectId: "proj-1" },
      mobileUtilityPage: "workspace",
    });
  });
  expect(push).toHaveBeenCalledTimes(2);
  expect(push).toHaveBeenLastCalledWith(
    {
      __poracodeMobilePage: {
        page: "workspace",
        workspaceContext: { projectId: "proj-1" },
        view: { kind: "thread", threadId: "thread-1" },
      },
    },
    "",
  );

  // Closing workspace directly while staying on thread-1 must pop, not push thread-1 again.
  window.history.replaceState(
    {
      __poracodeMobilePage: {
        page: "workspace",
        workspaceContext: { projectId: "proj-1" },
        view: { kind: "thread", threadId: "thread-1" },
      },
    },
    "",
  );
  act(() => {
    usePanelStore.getState().closeMobileUtilityPage();
  });
  expect(push).toHaveBeenCalledTimes(2);
  expect(back).toHaveBeenCalledTimes(1);
});
