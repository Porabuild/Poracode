import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "./state/appStore";

const { bridge } = vi.hoisted(() => ({
  bridge: {
    pickFolder: vi.fn().mockResolvedValue(null),
    listWslDistros: vi.fn().mockResolvedValue([]),
    getAgentStatuses: vi.fn().mockResolvedValue([]),
    getThreadSnapshots: vi.fn().mockResolvedValue([]),
    getThreadHistory: vi.fn().mockResolvedValue({ history: "", length: 0 }),
    startThread: vi.fn().mockResolvedValue(undefined),
    sendThreadInput: vi.fn().mockResolvedValue(undefined),
    writeTerminal: vi.fn().mockResolvedValue(undefined),
    resizeTerminal: vi.fn().mockResolvedValue(undefined),
    resolveThreadServerRequest: vi.fn().mockResolvedValue(undefined),
    closeThread: vi.fn().mockResolvedValue(undefined),
    setWindowChrome: vi.fn().mockResolvedValue(undefined),
    onSupervisorEvent: vi.fn(() => () => undefined),
  },
}));

vi.mock("./bridge", () => ({
  readBridge: () => bridge,
}));

vi.mock("./components/ui/provider", () => ({
  AppProvider: (props: { children: ReactNode }) => props.children,
}));

vi.mock("./components/layout/AppShell", () => ({
  AppShell: (props: { sidebar: ReactNode; content: ReactNode }) => (
    <div>
      <div>{props.sidebar}</div>
      <div>{props.content}</div>
    </div>
  ),
}));

vi.mock("./components/sidebar/Sidebar", () => ({
  Sidebar: (props: { onOpenThread?: (threadId: string) => void }) => (
    <div>
      sidebar
      <button onClick={() => props.onOpenThread?.("thread-1")} type="button">
        open-thread-1
      </button>
    </div>
  ),
}));

vi.mock("./components/thread/ThreadDraftView", () => ({
  ThreadDraftView: () => <div>draft</div>,
}));

vi.mock("./components/thread/ThreadView", () => ({
  ThreadView: (props: { thread: { title: string } }) => <div>{props.thread.title}</div>,
}));

import { App } from "./app";

describe("App", () => {
  const originalHasHydrated = useAppStore.persist.hasHydrated;
  const originalOnHydrate = useAppStore.persist.onHydrate;
  const originalOnFinishHydration = useAppStore.persist.onFinishHydration;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    useAppStore.persist.hasHydrated = originalHasHydrated;
    useAppStore.persist.onHydrate = originalOnHydrate;
    useAppStore.persist.onFinishHydration = originalOnFinishHydration;
    useAppStore.setState((state) => ({
      ...state,
      themeMode: "system",
      projects: [],
      threads: [],
      pendingServerRequests: [],
      agentStatuses: [],
      wslDistros: [],
      view: { kind: "home" },
    }));
  });

  it("reopens the selected stored thread on launch even without a session ref", async () => {
    useAppStore.persist.hasHydrated = vi.fn(() => true);
    useAppStore.persist.onHydrate = vi.fn(() => () => undefined);
    useAppStore.persist.onFinishHydration = vi.fn(() => () => undefined);

    useAppStore.setState((state) => ({
      ...state,
      projects: [
        {
          id: "project-1",
          name: "Repo",
          location: {
            kind: "windows",
            path: "C:\\repo",
          },
          createdAt: "2026-03-22T00:00:00.000Z",
        },
      ],
      threads: [
        {
          id: "thread-1",
          projectId: "project-1",
          title: "Persisted thread",
          agentKind: "codex",
          config: {
            model: "gpt-5.4",
          },
          status: "inactive",
          attention: "none",
          canResumeWithConfig: false,
          createdAt: "2026-03-22T00:00:00.000Z",
          updatedAt: "2026-03-22T00:00:00.000Z",
        },
      ],
      view: { kind: "thread", threadId: "thread-1" },
    }));

    render(<App />);

    await waitFor(() => {
      expect(bridge.startThread).toHaveBeenCalledWith({
        threadId: "thread-1",
        projectLocation: {
          kind: "windows",
          path: "C:\\repo",
        },
        agentKind: "codex",
        config: {
          model: "gpt-5.4",
        },
        prompt: "",
      });
    });
  });

  it("reopens the selected thread after persisted state hydrates", async () => {
    let hydrated = false;
    let onHydrate: ((state: ReturnType<typeof useAppStore.getState>) => void) | undefined;
    let onFinishHydration:
      | ((state: ReturnType<typeof useAppStore.getState>) => void)
      | undefined;

    useAppStore.persist.hasHydrated = vi.fn(() => hydrated);
    useAppStore.persist.onHydrate = vi.fn((listener) => {
      onHydrate = listener;
      return () => undefined;
    });
    useAppStore.persist.onFinishHydration = vi.fn((listener) => {
      onFinishHydration = listener;
      return () => undefined;
    });

    render(<App />);

    expect(bridge.startThread).not.toHaveBeenCalled();

    useAppStore.setState((state) => ({
      ...state,
      projects: [
        {
          id: "project-1",
          name: "Repo",
          location: {
            kind: "windows",
            path: "C:\\repo",
          },
          createdAt: "2026-03-22T00:00:00.000Z",
        },
      ],
      threads: [
        {
          id: "thread-1",
          projectId: "project-1",
          title: "Persisted thread",
          agentKind: "codex",
          config: {
            model: "gpt-5.4",
          },
          status: "idle",
          attention: "none",
          canResumeWithConfig: false,
          createdAt: "2026-03-22T00:00:00.000Z",
          updatedAt: "2026-03-22T00:00:00.000Z",
        },
      ],
      view: { kind: "thread", threadId: "thread-1" },
    }));

    onHydrate?.(useAppStore.getState());
    hydrated = true;
    onFinishHydration?.(useAppStore.getState());

    await waitFor(() => {
      expect(bridge.startThread).toHaveBeenCalledWith({
        threadId: "thread-1",
        projectLocation: {
          kind: "windows",
          path: "C:\\repo",
        },
        agentKind: "codex",
        config: {
          model: "gpt-5.4",
        },
        prompt: "",
      });
    });
  });

  it("initializes an inactive thread when the user selects it", async () => {
    useAppStore.persist.hasHydrated = vi.fn(() => true);
    useAppStore.persist.onHydrate = vi.fn(() => () => undefined);
    useAppStore.persist.onFinishHydration = vi.fn(() => () => undefined);

    useAppStore.setState((state) => ({
      ...state,
      projects: [
        {
          id: "project-1",
          name: "Repo",
          location: {
            kind: "windows",
            path: "C:\\repo",
          },
          createdAt: "2026-03-22T00:00:00.000Z",
        },
      ],
      threads: [
        {
          id: "thread-1",
          projectId: "project-1",
          title: "Persisted thread",
          agentKind: "codex",
          config: {
            model: "gpt-5.4",
          },
          status: "inactive",
          attention: "none",
          canResumeWithConfig: false,
          createdAt: "2026-03-22T00:00:00.000Z",
          updatedAt: "2026-03-22T00:00:00.000Z",
        },
      ],
      view: { kind: "home" },
    }));

    render(<App />);
    fireEvent.click(screen.getByText("open-thread-1"));

    await waitFor(() => {
      expect(bridge.startThread).toHaveBeenCalledWith({
        threadId: "thread-1",
        projectLocation: {
          kind: "windows",
          path: "C:\\repo",
        },
        agentKind: "codex",
        config: {
          model: "gpt-5.4",
        },
        prompt: "",
      });
    });
  });
});
