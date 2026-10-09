import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { Thread } from "@/shared/contracts";
import { setThreadRuntimeReopenEnabled } from "@/renderer/actions/threadActions";
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
});
