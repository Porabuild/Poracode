import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useMobilePageHistory } from "./mobilePageHistory";

beforeEach(() => {
  usePanelStore.setState({
    mobileUtilityPage: null,
    settingsSection: null,
    subAgentPanelContext: null,
    subAgentPanelOpen: false,
  });
  window.history.replaceState({ __poracodeMobilePage: { page: "settings" } }, "");
});
afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "");
  usePanelStore.setState({
    mobileUtilityPage: null,
    settingsSection: null,
    subAgentPanelContext: null,
    subAgentPanelOpen: false,
  });
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

describe("compact subagent page history", () => {
  const thread = {
    id: "thread-1",
    projectId: "proj-1",
    title: "Thread 1",
    agentKind: "claude",
    config: { model: "claude-sonnet-4-6" },
    status: "idle" as const,
    attention: "none" as const,
    canResumeWithConfig: false,
    starred: false,
    archived: false,
    done: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  function seedThread() {
    useAppStore.setState({
      view: { kind: "thread", panes: ["thread-1"] },
      focusedPaneId: "thread-1",
      threads: [thread],
    });
  }

  it("serializes only the target and keeps Back/Forward across distinct subagents", async () => {
    window.history.replaceState(null, "");
    seedThread();
    const push = vi.spyOn(window.history, "pushState");
    renderHook(() => useMobilePageHistory(true));

    act(() => {
      usePanelStore.setState({
        mobileUtilityPage: "subagent",
        subAgentPanelContext: {
          threadId: "thread-1",
          parentItemId: "agent-1",
          projectLocation: { kind: "posix", path: "/work" },
          returnToThreadInfo: true,
        },
        subAgentPanelOpen: true,
      });
    });
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenLastCalledWith(
      {
        __poracodeMobilePage: {
          page: "subagent",
          subagentContext: { threadId: "thread-1", parentItemId: "agent-1" },
          view: { kind: "thread", threadId: "thread-1" },
        },
      },
      "",
    );

    act(() => {
      usePanelStore.getState().setSubAgentPanelContext({
        threadId: "thread-1",
        parentItemId: "agent-2",
      });
    });
    await waitFor(() => expect(push).toHaveBeenCalledTimes(2));
    expect(push).toHaveBeenLastCalledWith(
      {
        __poracodeMobilePage: {
          page: "subagent",
          subagentContext: { threadId: "thread-1", parentItemId: "agent-2" },
          view: { kind: "thread", threadId: "thread-1" },
        },
      },
      "",
    );

    // Back restores the first target without writing another entry.
    act(() => {
      window.history.replaceState(
        {
          __poracodeMobilePage: {
            page: "subagent",
            subagentContext: { threadId: "thread-1", parentItemId: "agent-1" },
            view: { kind: "thread", threadId: "thread-1" },
          },
        },
        "",
      );
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(usePanelStore.getState()).toMatchObject({
      mobileUtilityPage: "subagent",
      subAgentPanelContext: { threadId: "thread-1", parentItemId: "agent-1" },
    });

    // Forward restores the second target.
    act(() => {
      window.history.replaceState(
        {
          __poracodeMobilePage: {
            page: "subagent",
            subagentContext: { threadId: "thread-1", parentItemId: "agent-2" },
            view: { kind: "thread", threadId: "thread-1" },
          },
        },
        "",
      );
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(usePanelStore.getState().subAgentPanelContext).toMatchObject({
      parentItemId: "agent-2",
    });
    expect(push).toHaveBeenCalledTimes(2);
  });

  it("restores the owning parent thread even when the saved view was not the thread", async () => {
    window.history.replaceState(
      {
        __poracodeMobilePage: {
          page: "subagent",
          subagentContext: { threadId: "thread-1", parentItemId: "agent-1" },
          view: { kind: "home" },
        },
      },
      "",
    );
    seedThread();
    useAppStore.setState({ view: { kind: "home" }, focusedPaneId: null });
    const push = vi.spyOn(window.history, "pushState");

    renderHook(() => useMobilePageHistory(true));

    await waitFor(() => expect(usePanelStore.getState().mobileUtilityPage).toBe("subagent"));
    expect(usePanelStore.getState().subAgentPanelContext).toEqual({
      threadId: "thread-1",
      parentItemId: "agent-1",
    });
    expect(useAppStore.getState().view).toMatchObject({
      kind: "thread",
      panes: ["thread-1"],
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("clears the subagent context when leaving the page", async () => {
    window.history.replaceState(
      {
        __poracodeMobilePage: {
          page: "subagent",
          subagentContext: { threadId: "thread-1", parentItemId: "agent-1" },
          view: { kind: "thread", threadId: "thread-1" },
        },
      },
      "",
    );
    seedThread();
    usePanelStore.setState({
      subAgentPanelContext: { threadId: "thread-1", parentItemId: "agent-1" },
      subAgentPanelOpen: true,
    });
    renderHook(() => useMobilePageHistory(true));
    await waitFor(() => expect(usePanelStore.getState().mobileUtilityPage).toBe("subagent"));

    act(() => {
      window.history.replaceState(
        {
          __poracodeMobilePage: { view: { kind: "thread", threadId: "thread-1" } },
        },
        "",
      );
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(usePanelStore.getState()).toMatchObject({
      mobileUtilityPage: null,
      subAgentPanelContext: null,
      subAgentPanelOpen: false,
    });
  });

  it("rejects a subagent entry without a valid target", async () => {
    window.history.replaceState(
      {
        __poracodeMobilePage: {
          page: "subagent",
          subagentContext: { threadId: "", parentItemId: "agent-1" },
        },
      },
      "",
    );
    seedThread();
    const push = vi.spyOn(window.history, "pushState");

    renderHook(() => useMobilePageHistory(true));

    await waitFor(() => expect(usePanelStore.getState().mobileUtilityPage).toBeNull());
    expect(useAppStore.getState().view).toMatchObject({ kind: "thread", panes: ["thread-1"] });
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps a serialized parent view when a malformed subagent page is dropped", async () => {
    window.history.replaceState(
      {
        __poracodeMobilePage: {
          page: "subagent",
          subagentContext: { threadId: "thread-1", parentItemId: "" },
          view: { kind: "thread", threadId: "thread-1" },
        },
      },
      "",
    );
    seedThread();
    useAppStore.setState({ view: { kind: "home" }, focusedPaneId: null });
    const push = vi.spyOn(window.history, "pushState");

    renderHook(() => useMobilePageHistory(true));

    await waitFor(() =>
      expect(useAppStore.getState().view).toMatchObject({ kind: "thread", panes: ["thread-1"] }),
    );
    expect(usePanelStore.getState().mobileUtilityPage).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });
});
