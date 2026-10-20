import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import {
  openThread,
  reopenPaneThreadsIfInactive,
  reopenStoredThread,
  setThreadRuntimeReopenEnabled,
  suppressAutomaticThreadReopen,
} from "@/renderer/actions/threadActions";
import {
  performThreadInputSubmit,
  type ThreadInputTransport,
} from "@/renderer/actions/threadRuntimeActions";
import * as runtimeInterestHydration from "@/renderer/state/runtimeInterestHydration";
import * as threadAnalytics from "@/renderer/analytics/posthog";
import { useAppStore } from "@/renderer/state/appStore";
import { applyRootCatalogThreadRows } from "@/renderer/state/managedRootCatalog/rootCatalogRows";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useThreadLifecycle } from "./useThreadLifecycle";

const savedThread: Thread = {
  id: "saved-thread",
  projectId: "project-1",
  title: "Saved GUI thread",
  agentKind: "test-provider",
  config: { model: "test-model" },
  presentationMode: "gui",
  status: "inactive",
  attention: "none",
  canResumeWithConfig: true,
  sessionRef: { providerSessionId: "saved-session", discoveredAt: "2026-10-09T00:00:00Z" },
  archived: false,
  done: false,
  starred: false,
  createdAt: "2026-10-09T00:00:00Z",
  updatedAt: "2026-10-09T00:00:00Z",
};

describe("restored thread lifecycle", () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    setThreadRuntimeReopenEnabled(true);
    useSharedSettings.setState({ staleThreadUnloadMinutes: 0 });
    useAppStore.setState({
      threads: [],
      projects: [],
      view: { kind: "thread", panes: [savedThread.id] },
      pendingThreadLaunches: {},
      connectingThreadIds: {},
      lastViewedAtByThreadId: {},
    });
  });

  it("reopens a restored pane when its authoritative row arrives after readiness", async () => {
    renderHook(() => useThreadLifecycle(true));
    expect(useAppStore.getState().pendingThreadLaunches).toEqual({});
    const restoredView = useAppStore.getState().view;

    act(() => applyRootCatalogThreadRows([savedThread], new Set()));

    expect(useAppStore.getState().view).toBe(restoredView);
    await waitFor(() => {
      expect(useAppStore.getState().pendingThreadLaunches[savedThread.id]).toBe("");
      expect(useAppStore.getState().connectingThreadIds[savedThread.id]).toBeDefined();
    });
  });

  it("waits for snapshot readiness even when the authoritative row is resident", () => {
    useAppStore.setState({ threads: [savedThread] });
    const { rerender } = renderHook(({ ready }) => useThreadLifecycle(ready), {
      initialProps: { ready: false },
    });
    expect(useAppStore.getState().pendingThreadLaunches).toEqual({});
    rerender({ ready: true });
    expect(useAppStore.getState().pendingThreadLaunches[savedThread.id]).toBe("");
  });

  it("does not restart a live thread when its row arrives late", () => {
    renderHook(() => useThreadLifecycle(true));
    act(() => applyRootCatalogThreadRows([{ ...savedThread, status: "working" }], new Set()));
    expect(useAppStore.getState().pendingThreadLaunches).toEqual({});
  });

  it("does not retry on runtime or catalog churn after a failed reconnect", () => {
    useAppStore.setState({ threads: [savedThread] });
    renderHook(() => useThreadLifecycle(true));
    const token = useAppStore.getState().connectingThreadIds[savedThread.id]!;
    act(() => {
      useAppStore.getState().consumeThreadLaunch(savedThread.id);
      useAppStore.getState().finishThreadConnecting(savedThread.id, token);
      applyRootCatalogThreadRows([{ ...savedThread, status: "error" }], new Set());
    });
    act(() => applyRootCatalogThreadRows([savedThread], new Set()));
    expect(useAppStore.getState().pendingThreadLaunches).toEqual({});
    expect(useAppStore.getState().connectingThreadIds).toEqual({});
  });

  it("preserves drafts and history while reopening a late row", () => {
    const draft = {
      segments: [{ kind: "text" as const, content: "unsent draft" }],
      attachments: [],
    };
    const history = { [savedThread.id]: ["old-message"] };
    useAppStore.setState({
      threadDraftContents: { [savedThread.id]: draft },
      runtimeItemIdsByThread: history,
    });
    renderHook(() => useThreadLifecycle(true));
    act(() => applyRootCatalogThreadRows([savedThread], new Set()));
    expect(useAppStore.getState().threadDraftContents[savedThread.id]).toEqual(draft);
    expect(useAppStore.getState().runtimeItemIdsByThread).toBe(history);
  });

  it.each(["gui", "terminal"] as const)(
    "keeps a searched %s history stopped across the actual lifecycle pass and allows explicit resume",
    async (presentationMode) => {
      vi.spyOn(runtimeInterestHydration, "prepareRuntimeThreadReader").mockReturnValue({
        ready: Promise.resolve(),
        release: vi.fn<() => void>(),
      });
      const thread = { ...savedThread, presentationMode, archived: true };
      useAppStore.setState({ threads: [thread], view: { kind: "home" } });
      renderHook(() => useThreadLifecycle(true));
      act(() => openThread(thread.id, { reopenRuntime: false, focusComposer: false }));
      await waitFor(() => expect(useAppStore.getState().view.kind).toBe("thread"));
      expect(useAppStore.getState().pendingThreadLaunches).toEqual({});
      expect(useAppStore.getState().connectingThreadIds).toEqual({});
      await act(() =>
        useAppStore.setState({
          view: { kind: "thread", panes: [thread.id, "draft:project-1"] },
        }),
      );
      expect(useAppStore.getState().pendingThreadLaunches).toEqual({});
      act(() => reopenStoredThread(thread.id));
      expect(useAppStore.getState().pendingThreadLaunches[thread.id]).toBe("");
    },
  );

  it("keeps a remotely searched standalone pane stopped in the actual lifecycle pass", () => {
    const thread = {
      ...savedThread,
      id: "remote:search-host:thread:saved",
      archived: true,
      remoteServerId: "search-host",
      remoteId: "saved",
    };
    useAppStore.setState({ threads: [thread], view: { kind: "home" } });
    renderHook(() => useThreadLifecycle(true));
    act(() => {
      suppressAutomaticThreadReopen(thread.id);
      useAppStore.getState().openThreadStandalone(thread.id);
    });
    expect(useAppStore.getState().pendingThreadLaunches).toEqual({});
    expect(useAppStore.getState().connectingThreadIds).toEqual({});
    act(() => reopenStoredThread(thread.id));
    expect(useAppStore.getState().pendingThreadLaunches[thread.id]).toBe("");
  });

  it("allows a normal open after browsing a saved history without relaunching it", async () => {
    vi.spyOn(runtimeInterestHydration, "prepareRuntimeThreadReader").mockReturnValue({
      ready: Promise.resolve(),
      release: vi.fn<() => void>(),
    });
    useAppStore.setState({ threads: [savedThread], view: { kind: "home" } });
    renderHook(() => useThreadLifecycle(true));
    act(() => openThread(savedThread.id, { reopenRuntime: false }));
    await waitFor(() => expect(useAppStore.getState().view.kind).toBe("thread"));
    expect(useAppStore.getState().pendingThreadLaunches).toEqual({});
    act(() => openThread(savedThread.id));
    await waitFor(() =>
      expect(useAppStore.getState().pendingThreadLaunches[savedThread.id]).toBe(""),
    );
  });

  it("sends explicit input from saved history and retires the automatic-reopen exclusion", async () => {
    vi.spyOn(threadAnalytics, "captureThreadPromptSubmitted").mockImplementation(() => {});
    vi.spyOn(runtimeInterestHydration, "prepareRuntimeThreadReader").mockReturnValue({
      ready: Promise.resolve(),
      release: vi.fn<() => void>(),
    });
    const thread = { ...savedThread, archived: true };
    useAppStore.setState({ threads: [thread], view: { kind: "home" } });
    renderHook(() => useThreadLifecycle(true));
    act(() => openThread(thread.id, { reopenRuntime: false }));
    await waitFor(() => expect(useAppStore.getState().view.kind).toBe("thread"));
    expect(useAppStore.getState().pendingThreadLaunches).toEqual({});
    const sendThreadInput = vi
      .fn<ThreadInputTransport["sendThreadInput"]>()
      .mockResolvedValue(undefined);
    await act(() =>
      performThreadInputSubmit({
        thread,
        prompt: "Continue this saved conversation",
        transport: { sendThreadInput },
      }),
    );
    expect(sendThreadInput).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ threadId: thread.id, prompt: "Continue this saved conversation" }),
    );
    act(() =>
      useAppStore.getState().updateThreadRuntime(thread.id, {
        status: "inactive",
        attention: "none",
        canResumeWithConfig: true,
      }),
    );
    act(() => reopenPaneThreadsIfInactive());
    expect(useAppStore.getState().pendingThreadLaunches[thread.id]).toBe("");
  });

  it("retires a browse-only exclusion when its pane closes before restoring the same id", async () => {
    vi.spyOn(runtimeInterestHydration, "prepareRuntimeThreadReader").mockReturnValue({
      ready: Promise.resolve(),
      release: vi.fn<() => void>(),
    });
    useAppStore.setState({ threads: [savedThread], view: { kind: "home" } });
    renderHook(() => useThreadLifecycle(true));
    act(() => openThread(savedThread.id, { reopenRuntime: false }));
    await waitFor(() => expect(useAppStore.getState().view.kind).toBe("thread"));
    expect(useAppStore.getState().pendingThreadLaunches).toEqual({});
    await act(async () => useAppStore.getState().openHome());
    expect(useAppStore.getState().view.kind).toBe("home");
    expect(useAppStore.getState().threads[0]?.status).toBe("inactive");
    act(() => {
      useAppStore.getState().openThreadStandalone(savedThread.id);
      reopenPaneThreadsIfInactive();
    });
    expect(useAppStore.getState().pendingThreadLaunches[savedThread.id]).toBe("");
  });
});
