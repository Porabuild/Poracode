import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { I18nProvider } from "@lingui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { deleteProject } from "@/renderer/actions/projectActions";
import { closeExitedShell } from "@/renderer/actions/terminalTabActions";
import type { PoracodeBridge } from "@/shared/ipc";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import * as deviceHost from "@/renderer/hostTransport/loopbackHttpWsTransport";
import { i18n } from "@/renderer/i18n/i18n";
import { installBrowserClientRuntime, resetClientRuntimeForTest } from "@/renderer/clientRuntime";
import { useAppStore } from "@/renderer/state/appStore";
import { resetDevTerminalStore, useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { ThreadDocksPlacementToggle } from "@/renderer/components/thread/ThreadDocksPlacementToggle";
import { applySideChatPanel } from "@/renderer/components/thread/SideChat/sideChatPanelStore";
import { ProjectAuxiliaryPanel } from "./ProjectAuxiliaryPanel";
import { usePanelVisibility } from "./AppShell/parts/usePanelVisibility";

vi.mock("@/renderer/analytics/useProductViewTracking", () => ({
  productSurfaceView: vi.fn<(tab: string, mode: string) => string>(() => "git"),
  useProductViewTracking: vi.fn<() => void>(),
}));

vi.mock("@/renderer/state/gitRefresh", () => ({
  prefetchVisibleGitPanelPrData: vi.fn<(projectId: string, worktreePath?: string) => Promise<void>>(
    () => Promise.resolve(),
  ),
}));

interface CapturedRightPanelProps {
  conversationModel?: ReactNode;
  subagentTitle?: ReactNode;
  activeTab: string;
  projectName?: string;
  docksContent?: ReactElement;
  docksHeaderActions?: ReactElement;
  notesContent?: ReactElement<{ projectId: string }>;
  devicesContent?: ReactNode;
  showDevicesTab?: boolean;
  onOpenDevices?: () => void;
  onClose?: () => void;
  onBackSubagent?: () => void;
  onCloseSubagent?: () => void;
}

const unifiedRightPanelProps = vi.hoisted(() => ({
  current: null as CapturedRightPanelProps | null,
}));
const deviceFixture = vi.hoisted(() => ({ mounted: 0, retired: [] as string[] }));

vi.mock("@/renderer/deferredFeatures", async () => {
  const actual = await vi.importActual<typeof import("@/renderer/deferredFeatures")>(
    "@/renderer/deferredFeatures",
  );
  const { useEffect, useState } = await import("react");
  return {
    ...actual,
    DeferredDeviceWorkspace: ({ threadId, visible }: { threadId: string; visible: boolean }) => {
      const [instance] = useState(() => ++deviceFixture.mounted);
      useEffect(
        () => () => {
          deviceFixture.retired.push(threadId);
        },
        [threadId],
      );
      return (
        <div
          data-testid="fixture-device-workspace"
          data-thread={threadId}
          data-visible={String(visible)}
          data-instance={instance}
        />
      );
    },
  };
});

vi.mock("@/renderer/components/layout/UnifiedRightPanel", () => ({
  UnifiedRightPanel: (props: CapturedRightPanelProps) => {
    unifiedRightPanelProps.current = props;
    return <>{props.devicesContent}</>;
  },
}));

function makeThread(id: string, projectId: string, worktreePath: string): Thread {
  const now = "2026-08-03T00:00:00.000Z";
  return {
    id,
    projectId,
    worktreePath,
    title: id,
    agentKind: "codex",
    config: { model: "gpt-5.4" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: now,
    updatedAt: now,
  };
}

const threadA = makeThread("thread-a", "project-a", "/worktree-a");
const threadB = makeThread("thread-b", "project-b", "/worktree-b");
const threadC = makeThread("thread-c", "project-c", "/worktree-c");

function makeProject(id: string): Project {
  return {
    id,
    name: `Project ${id}`,
    location: { kind: "windows", path: `C:\\${id}` },
    createdAt: "2026-08-01T00:00:00.000Z",
  };
}

function focusThread(threadId: string): void {
  useAppStore.setState({
    threads: [threadA, threadB, threadC],
    view: { kind: "thread", panes: [threadId] },
    focusedPaneId: threadId,
  });
}

function seedImageOnlyThread(): void {
  useAppStore.setState({
    runtimeItemIdsByThread: { [threadA.id]: ["user-image"] },
    runtimeItemsByIdByThread: {
      [threadA.id]: {
        "user-image": {
          id: "user-image",
          type: "user_message",
          state: "completed",
          payload: {
            content: [
              {
                kind: "image",
                source: "attachment",
                path: "/tmp/a.png",
                name: "a.png",
              },
            ],
          },
          streams: {},
        },
      },
    },
    runtimeStructuralVersionByThread: { [threadA.id]: 1 },
  });
}

describe("ProjectAuxiliaryPanel", () => {
  it("keeps panel navigation above device-only header targets without adding a row to Notes", async () => {
    const { UnifiedRightPanel } = await vi.importActual<
      typeof import("@/renderer/components/layout/UnifiedRightPanel")
    >("@/renderer/components/layout/UnifiedRightPanel");
    const title = vi.fn<(element: HTMLDivElement | null) => void>();
    const actions = vi.fn<(element: HTMLDivElement | null) => void>();
    const panel = (activeTab: "devices" | "notes") => (
      <I18nProvider i18n={i18n}>
        <UnifiedRightPanel
          activeTab={activeTab}
          onTabChange={() => {}}
          gitContent={null}
          filesContent={null}
          browserContent={null}
          devicesContent={<div>Device body</div>}
          devicesThreadId="thread-a"
          devicesTitleRef={title}
          devicesActionsRef={actions}
          showTerminalTab={false}
          showFilesTab={false}
          showGitTab={false}
          showUsageTab={false}
          showNotesTab={false}
          showDevicesTab
          showBrowserTab={false}
          projectName="Project"
          onClose={() => {}}
        />
      </I18nProvider>
    );
    const view = render(panel("devices"));
    const rows = view.container.querySelectorAll(".poracode-overlay-header");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveClass("poracode-overlay-header--no-drag");
    expect(rows[0]?.contains(document.getElementById("panel-devices-thread-a"))).toBe(true);
    expect(title.mock.calls.at(-1)?.[0]?.parentElement).toBe(rows[1]);
    expect(actions.mock.calls.at(-1)?.[0]?.parentElement).toBe(rows[1]);
    expect(rows[1]?.querySelector('[title="Hide panel"]')).toBeNull();
    view.rerender(panel("notes"));
    expect(view.container.querySelectorAll(".poracode-overlay-header")).toHaveLength(1);
    expect(view.container.querySelector("[data-device-header]")).toBeNull();
  });

  it("only puts side-chat metadata in the toolbar while its tab is active", () => {
    applySideChatPanel({
      id: "side",
      source: { ...threadA, presentationMode: "gui" },
      context: null,
      prompt: "",
      title: "Side chat",
    });
    render(
      <I18nProvider i18n={i18n}>
        <ProjectAuxiliaryPanel includeTerminal visible />
      </I18nProvider>,
    );
    expect(unifiedRightPanelProps.current?.activeTab).toBe("sideChat");
    expect(unifiedRightPanelProps.current?.conversationModel).toBeDefined();
    act(() => usePanelStore.getState().setRightPanelTab("git"));
    expect(unifiedRightPanelProps.current?.activeTab).toBe("git");
    expect(unifiedRightPanelProps.current?.conversationModel).toBeUndefined();
  });

  beforeEach(() => {
    applySideChatPanel(null);
    localStorage.clear();
    unifiedRightPanelProps.current = null;
    focusThread(threadA.id);
    useAppStore.setState({
      projects: [],
      runtimeBackgroundTasksByThread: {},
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeStructuralVersionByThread: {},
    });
    useDevTerminalStore.setState({ isOpen: false, tabs: [] });
    useSharedSettings.setState({ threadDocksPlacement: "composer", terminalPosition: "right" });
    usePanelStore.setState({
      gitReviewContext: {
        projectId: threadB.projectId,
        worktreePath: threadB.worktreePath!,
        originComposerId: threadB.id,
      },
      gitReviewAsPanel: true,
      rightPanelFollowsThread: true,
      rightPanelTab: "git",
      rightPanelSplit: null,
      filesPanelContext: null,
      browserPanelOpen: false,
      usagePanelOpen: false,
      notesPanelOpen: false,
      deviceWorkspaceThreadId: null,
      deviceWorkspaceDetached: false,
      threadDocksPanelOpen: false,
      threadDocksReturnThreadId: null,
      subAgentPanelOpen: false,
      subAgentPanelContext: null,
      bottomPanelDocks: { left: null, right: null },
    });
    deviceFixture.mounted = 0;
    deviceFixture.retired = [];
  });

  afterEach(() => {
    applySideChatPanel(null);
    resetClientRuntimeForTest();
    useRemoteServersStore.setState({ servers: [], runtime: {} });
  });

  it.each([true, false])(
    "floats without keeping the side panel open or retiring its controller (%s)",
    (includeTerminal) => {
      usePanelStore.setState({ gitReviewContext: null, rightPanelFollowsThread: false });
      usePanelStore.getState().setDeviceWorkspaceThreadId(threadA.id);
      const panel = render(
        <I18nProvider i18n={i18n}>
          <ProjectAuxiliaryPanel includeTerminal={includeTerminal} visible />
        </I18nProvider>,
      );
      const workspace = screen.getByTestId("fixture-device-workspace");
      const instance = workspace.getAttribute("data-instance");
      const visibility = renderHook(() => usePanelVisibility());
      expect(visibility.result.current.sidePanelOpen).toBe(true);
      act(() => usePanelStore.getState().setDeviceWorkspaceDetached(true));
      expect(visibility.result.current.sidePanelOpen).toBe(false);
      panel.rerender(
        <I18nProvider i18n={i18n}>
          <ProjectAuxiliaryPanel includeTerminal={includeTerminal} visible={false} />
        </I18nProvider>,
      );
      expect(workspace.getAttribute("data-visible")).toBe("true");
      expect(workspace.getAttribute("data-instance")).toBe(instance);
      expect(deviceFixture.retired).toEqual([]);
      act(() => usePanelStore.getState().setDeviceWorkspaceDetached(false));
      expect(visibility.result.current.sidePanelOpen).toBe(true);
      expect(workspace.getAttribute("data-visible")).toBe("false");
      expect(deviceFixture.retired).toEqual([]);
      visibility.unmount();
    },
  );

  it.each([true, false])(
    "keeps one device instance across Notes switches (terminal included: %s)",
    (includeTerminal) => {
      usePanelStore.setState({ rightPanelFollowsThread: false, notesPanelOpen: true });
      usePanelStore.getState().setDeviceWorkspaceThreadId(threadA.id);
      const panel = render(
        <I18nProvider i18n={i18n}>
          <ProjectAuxiliaryPanel includeTerminal={includeTerminal} visible />
        </I18nProvider>,
      );
      const workspace = screen.getByTestId("fixture-device-workspace");
      const instance = workspace.getAttribute("data-instance");
      expect(unifiedRightPanelProps.current?.activeTab).toBe("devices");
      expect(workspace.getAttribute("data-visible")).toBe("true");
      act(() => usePanelStore.getState().setRightPanelTab("notes"));
      expect(unifiedRightPanelProps.current?.activeTab).toBe("notes");
      expect(screen.getAllByTestId("fixture-device-workspace")).toHaveLength(1);
      expect(workspace.getAttribute("data-visible")).toBe("false");
      act(() => unifiedRightPanelProps.current?.onOpenDevices?.());
      expect(workspace.getAttribute("data-visible")).toBe("true");
      expect(workspace.getAttribute("data-instance")).toBe(instance);
      expect(deviceFixture.retired).toEqual([]);
      panel.rerender(
        <I18nProvider i18n={i18n}>
          <ProjectAuxiliaryPanel includeTerminal={includeTerminal} visible={false} />
        </I18nProvider>,
      );
      expect(workspace.getAttribute("data-visible")).toBe("false");
      act(() => unifiedRightPanelProps.current?.onClose?.());
      expect(usePanelStore.getState().deviceWorkspaceThreadId).toBeNull();
      expect(screen.queryByTestId("fixture-device-workspace")).toBeNull();
      expect(deviceFixture.retired).toEqual([threadA.id]);
    },
  );

  it("opens an exact clicked thread before follow-lock resumes and respects explicit unlocking", async () => {
    usePanelStore.getState().setDeviceWorkspaceThreadId(threadB.id);
    render(
      <I18nProvider i18n={i18n}>
        <ProjectAuxiliaryPanel includeTerminal visible />
      </I18nProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.getByTestId("fixture-device-workspace").getAttribute("data-thread")).toBe(
      threadB.id,
    );
    act(() => focusThread(threadC.id));
    await waitFor(() =>
      expect(screen.getByTestId("fixture-device-workspace").getAttribute("data-thread")).toBe(
        threadC.id,
      ),
    );
    expect(deviceFixture.retired).toContain(threadB.id);
    act(() => {
      usePanelStore.setState({ rightPanelFollowsThread: false });
      focusThread(threadA.id);
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.getByTestId("fixture-device-workspace").getAttribute("data-thread")).toBe(
      threadC.id,
    );
  });

  it("replaces the instance on host endpoint/owner change and removes it with its unloaded thread", () => {
    usePanelStore.setState({ rightPanelFollowsThread: false });
    useAppStore.setState({
      threads: [{ ...threadA, remoteServerId: "host-a", remoteId: "host-thread" }],
    });
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "host-a",
          label: "Host A",
          endpoint: "https://host-a.example",
          accessToken: "fixture",
          scopes: [],
        },
      ],
    });
    usePanelStore.getState().setDeviceWorkspaceThreadId(threadA.id);
    render(
      <I18nProvider i18n={i18n}>
        <ProjectAuxiliaryPanel includeTerminal visible />
      </I18nProvider>,
    );
    const first = screen.getByTestId("fixture-device-workspace").getAttribute("data-instance");
    act(() => {
      void useRemoteServersStore.setState((state) => ({
        servers: state.servers.map((server) => ({
          ...server,
          endpoint: "https://replacement.example",
        })),
      }));
    });
    expect(screen.getByTestId("fixture-device-workspace").getAttribute("data-instance")).not.toBe(
      first,
    );
    expect(deviceFixture.retired).toEqual([threadA.id]);
    const second = screen.getByTestId("fixture-device-workspace").getAttribute("data-instance");
    act(() => {
      void useAppStore.setState({
        threads: [{ ...threadA, remoteServerId: "host-b", remoteId: "other-host-thread" }],
      });
    });
    expect(screen.getByTestId("fixture-device-workspace").getAttribute("data-instance")).not.toBe(
      second,
    );
    expect(screen.getAllByTestId("fixture-device-workspace")).toHaveLength(1);
    act(() => {
      void useAppStore.setState({ threads: [] });
    });
    expect(screen.queryByTestId("fixture-device-workspace")).toBeNull();
    expect(deviceFixture.retired).toEqual([threadA.id, threadA.id, threadA.id]);
  });

  it("retires the old device instance when its managed host activation changes", () => {
    usePanelStore.setState({ rightPanelFollowsThread: false });
    usePanelStore.getState().setDeviceWorkspaceThreadId(threadA.id);
    const activation = {
      seq: 1,
      endpoint: "http://127.0.0.1:12345",
      client: {} as RemoteDesktopClient,
      authority: "fixture-activation-1",
    };
    const snapshot = vi
      .spyOn(deviceHost, "readManagedLoopbackActivation")
      .mockReturnValue(activation);
    try {
      const panel = render(
        <I18nProvider i18n={i18n}>
          <ProjectAuxiliaryPanel includeTerminal visible />
        </I18nProvider>,
      );
      const first = screen.getByTestId("fixture-device-workspace").getAttribute("data-instance");
      snapshot.mockReturnValue({ ...activation, seq: 2, authority: "fixture-activation-2" });
      panel.rerender(
        <I18nProvider i18n={i18n}>
          <ProjectAuxiliaryPanel includeTerminal visible />
        </I18nProvider>,
      );
      expect(screen.getByTestId("fixture-device-workspace").getAttribute("data-instance")).not.toBe(
        first,
      );
      expect(deviceFixture.retired).toEqual([threadA.id]);
    } finally {
      snapshot.mockRestore();
    }
  });

  it("replaces a verified desktop behind the same connection and endpoint without keying consent to credentials", () => {
    usePanelStore.setState({ rightPanelFollowsThread: false });
    useAppStore.setState({
      threads: [{ ...threadA, remoteServerId: "stable-connection", remoteId: "host-thread" }],
    });
    useRemoteServersStore.setState({
      servers: [
        {
          connectionId: "stable-connection",
          desktopId: "verified-host-a",
          label: "Device host",
          endpoint: "https://same-route.example",
          accessToken: "fixture-a",
          scopes: [],
        },
      ],
    });
    usePanelStore.getState().setDeviceWorkspaceThreadId(threadA.id);
    render(
      <I18nProvider i18n={i18n}>
        <ProjectAuxiliaryPanel includeTerminal visible />
      </I18nProvider>,
    );
    const first = screen.getByTestId("fixture-device-workspace").getAttribute("data-instance");
    act(() => {
      void useRemoteServersStore.setState((state) => ({
        servers: state.servers.map((server) => ({ ...server, accessToken: "fixture-b" })),
      }));
    });
    expect(screen.getByTestId("fixture-device-workspace").getAttribute("data-instance")).toBe(
      first,
    );
    expect(deviceFixture.retired).toEqual([]);
    act(() => {
      void useRemoteServersStore.setState((state) => ({
        servers: state.servers.map((server) => ({ ...server, desktopId: "verified-host-b" })),
      }));
    });
    expect(screen.getByTestId("fixture-device-workspace").getAttribute("data-instance")).not.toBe(
      first,
    );
    expect(screen.getAllByTestId("fixture-device-workspace")).toHaveLength(1);
    expect(deviceFixture.retired).toEqual([threadA.id]);
    expect(useRemoteServersStore.getState().servers[0]).toMatchObject({
      connectionId: "stable-connection",
      endpoint: "https://same-route.example",
    });
    expect(screen.getByTestId("fixture-device-workspace").getAttribute("data-thread")).toBe(
      threadA.id,
    );
  });

  it("preserves a git badge target when the locked panel opens", async () => {
    render(
      <I18nProvider i18n={i18n}>
        <ProjectAuxiliaryPanel includeTerminal visible />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(usePanelStore.getState().gitReviewContext).toEqual({
        projectId: threadB.projectId,
        worktreePath: threadB.worktreePath!,
        originComposerId: threadB.id,
      });
    });

    act(() => focusThread(threadC.id));

    await waitFor(() => {
      expect(usePanelStore.getState().gitReviewContext).toEqual({
        projectId: threadC.projectId,
        worktreePath: threadC.worktreePath!,
      });
    });
  });

  it.each([false, true])(
    "returns to Thread Info even if the last agent finished: %s",
    (completed) => {
      focusThread(threadA.id);
      useSharedSettings.setState({ threadDocksPlacement: "right" });
      useAppStore.setState({
        runtimeItemIdsByThread: { [threadA.id]: ["agent-1"] },
        runtimeItemsByIdByThread: {
          [threadA.id]: {
            "agent-1": {
              id: "agent-1",
              type: "tool_call",
              state: completed ? "completed" : "started",
              payload: {
                name: "spawnAgent",
                status: completed ? "success" : "running",
                isSubAgent: true,
              },
              streams: {},
            },
          },
        },
        runtimeStructuralVersionByThread: { [threadA.id]: 1 },
      });
      usePanelStore.setState({
        rightPanelTab: "subagent",
        gitReviewContext: null,
        threadDocksPanelOpen: true,
        threadDocksFocus: "agents",
        subAgentPanelOpen: true,
        subAgentPanelContext: {
          threadId: threadA.id,
          parentItemId: "agent-1",
          returnToThreadInfo: true,
        },
      });
      render(
        <I18nProvider i18n={i18n}>
          <ProjectAuxiliaryPanel includeTerminal visible />
        </I18nProvider>,
      );

      expect(unifiedRightPanelProps.current?.activeTab).toBe("subagent");
      expect(unifiedRightPanelProps.current?.conversationModel).toBeDefined();
      expect(unifiedRightPanelProps.current?.subagentTitle).toBeDefined();
      expect(unifiedRightPanelProps.current?.onBackSubagent).toBeTypeOf("function");
      act(() => unifiedRightPanelProps.current?.onBackSubagent?.());
      expect(usePanelStore.getState()).toMatchObject({
        rightPanelTab: "docks",
        threadDocksPanelOpen: true,
        threadDocksFocus: "agents",
        subAgentPanelContext: null,
        subAgentPanelOpen: false,
      });
      expect(unifiedRightPanelProps.current?.activeTab).toBe("docks");
      expect(unifiedRightPanelProps.current?.conversationModel).toBeUndefined();
      const visibility = renderHook(() => usePanelVisibility());
      expect(visibility.result.current.sidePanelOpen).toBe(true);

      act(() => focusThread(threadB.id));
      expect(visibility.result.current.sidePanelOpen).toBe(false);
    },
  );

  it("passes the focused worktree location to right-panel docks", async () => {
    useAppStore.setState({
      projects: [
        {
          id: threadA.projectId,
          name: "Project A",
          location: { kind: "posix", path: "/repo-a" },
          createdAt: "2026-08-03T00:00:00.000Z",
        },
      ],
      runtimeBackgroundTasksByThread: {
        [threadA.id]: [{ taskId: "task-1", kind: "other", description: "Watch" }],
      },
    });
    useSharedSettings.setState({ threadDocksPlacement: "right" });
    usePanelStore.setState({ threadDocksPanelOpen: true, rightPanelTab: "docks" });

    render(
      <I18nProvider i18n={i18n}>
        <ProjectAuxiliaryPanel includeTerminal visible />
      </I18nProvider>,
    );

    await waitFor(() => expect(unifiedRightPanelProps.current?.docksContent).toBeDefined());
    expect(unifiedRightPanelProps.current?.docksHeaderActions).toMatchObject({
      type: ThreadDocksPlacementToggle,
      props: { placement: "right" },
    });
    expect(
      unifiedRightPanelProps.current?.docksContent?.props as {
        projectLocation?: { kind: string; path: string };
      },
    ).toMatchObject({ projectLocation: { kind: "posix", path: "/worktree-a" } });
  });

  it("keeps an explicitly opened image-only Thread info panel visible", () => {
    seedImageOnlyThread();
    useSharedSettings.setState({ threadDocksPlacement: "right" });
    usePanelStore.setState({
      gitReviewContext: null,
      gitReviewAsPanel: false,
      threadDocksPanelOpen: true,
      rightPanelTab: "docks",
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <I18nProvider i18n={i18n}>{children}</I18nProvider>
    );
    const { result } = renderHook(() => usePanelVisibility(), { wrapper });
    expect(result.current.rightPanelOpen).toBe(true);

    act(() => usePanelStore.getState().setThreadDocksPanelOpen(false));
    expect(result.current.rightPanelOpen).toBe(false);
  });

  it("opens image-focused Thread info while informational docks stay above the composer", async () => {
    seedImageOnlyThread();
    usePanelStore.setState({
      threadDocksPanelOpen: true,
      threadDocksFocus: "images",
      rightPanelTab: "docks",
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <I18nProvider i18n={i18n}>{children}</I18nProvider>
    );
    const { result } = renderHook(() => usePanelVisibility(), { wrapper });
    expect(result.current.rightPanelOpen).toBe(true);

    render(
      <I18nProvider i18n={i18n}>
        <ProjectAuxiliaryPanel includeTerminal visible />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(unifiedRightPanelProps.current?.activeTab).toBe("docks");
      expect(unifiedRightPanelProps.current?.conversationModel).toBeUndefined();
    });
    expect(unifiedRightPanelProps.current?.docksContent).toBeDefined();
    expect(unifiedRightPanelProps.current?.docksHeaderActions).toMatchObject({
      type: ThreadDocksPlacementToggle,
      props: { placement: "composer" },
    });
  });

  it("leaves the browser tab when the browser panel was dismissed with it selected", async () => {
    // Closing the last browser tab clears browserPanelOpen over IPC but leaves
    // rightPanelTab on "browser"; the panel must fall back to an open panel
    // instead of rendering an empty browser layer.
    usePanelStore.setState({ rightPanelTab: "browser", browserPanelOpen: false });

    render(
      <I18nProvider i18n={i18n}>
        <ProjectAuxiliaryPanel includeTerminal visible />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(unifiedRightPanelProps.current?.activeTab).toBe("git");
    });
  });

  it("keeps the browser tab active while the browser panel is open", async () => {
    usePanelStore.setState({ rightPanelTab: "browser", browserPanelOpen: true });

    render(
      <I18nProvider i18n={i18n}>
        <ProjectAuxiliaryPanel includeTerminal visible />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(unifiedRightPanelProps.current?.activeTab).toBe("browser");
    });
  });

  it("keeps the restored Ports tab active with the terminal docked at the bottom", async () => {
    installBrowserClientRuntime({} as PoracodeBridge);
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "desktop-1",
          label: "Studio",
          endpoint: "http://192.168.1.10:3200",
          accessToken: "token",
          scopes: ["ports:forward"],
        },
      ],
      runtime: {
        "desktop-1": { status: "online", projects: [], threads: [] },
      },
    });
    usePanelStore.setState({ rightPanelTab: "ports", portsPanelOpen: true });

    render(
      <I18nProvider i18n={i18n}>
        <ProjectAuxiliaryPanel includeTerminal={false} visible />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(unifiedRightPanelProps.current?.activeTab).toBe("ports");
    });
  });

  it("keeps the Ports tab active for an Electron-as-client connection", async () => {
    // No browser runtime installed: the desktop client with a connected
    // remote server must expose the same ports panel (WS8 parity — the
    // routes are live and entry URLs open externally via the bridge).
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "desktop-1",
          label: "Studio",
          endpoint: "http://192.168.1.10:3200",
          accessToken: "token",
          scopes: ["ports:forward"],
        },
      ],
      runtime: {
        "desktop-1": { status: "online", projects: [], threads: [] },
      },
    });
    usePanelStore.setState({ rightPanelTab: "ports", portsPanelOpen: true });

    render(
      <I18nProvider i18n={i18n}>
        <ProjectAuxiliaryPanel includeTerminal={false} visible />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(unifiedRightPanelProps.current?.activeTab).toBe("ports");
    });
  });

  it("hides the Ports tab when no remote server is connected", async () => {
    useRemoteServersStore.setState({ servers: [], runtime: {} });
    usePanelStore.setState({ rightPanelTab: "ports", portsPanelOpen: true });

    render(
      <I18nProvider i18n={i18n}>
        <ProjectAuxiliaryPanel includeTerminal={false} visible />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(unifiedRightPanelProps.current?.activeTab).not.toBe("ports");
    });
  });
  describe("when the last terminal shell exits on Home", () => {
    // Notes on Home has no project of its own, so it takes the terminal's.
    function openProjectBTerminalOnHome() {
      resetDevTerminalStore();
      useAppStore.setState({
        view: { kind: "home" },
        threads: [],
        projects: [makeProject("project-a"), makeProject("project-b")],
      });
      usePanelStore.setState({ gitReviewContext: null, notesPanelOpen: true });
      const store = useDevTerminalStore.getState();
      const tab = store.addTab("project-b", "Shell");
      store.openPanel("project-b");
      return tab;
    }

    function renderPanel() {
      render(
        <I18nProvider i18n={i18n}>
          <ProjectAuxiliaryPanel includeTerminal visible />
        </I18nProvider>,
      );
    }

    function shownNotes() {
      const props = unifiedRightPanelProps.current;
      return {
        activeTab: props?.activeTab,
        projectName: props?.projectName,
        projectId: props?.notesContent?.props.projectId,
      };
    }

    const projectBNotes = {
      activeTab: "notes",
      projectName: "Project project-b",
      projectId: "project-b",
    };

    it("keeps Notes on the terminal's project when it was in front of the terminal", () => {
      const tab = openProjectBTerminalOnHome();
      usePanelStore.setState({ rightPanelTab: "notes" });
      renderPanel();
      expect(shownNotes()).toEqual(projectBNotes);

      act(() => closeExitedShell(tab.id));

      expect(shownNotes()).toEqual(projectBNotes);
    });

    it("keeps Notes on the terminal's project when it takes over from the terminal's split", () => {
      const tab = openProjectBTerminalOnHome();
      usePanelStore.setState({
        rightPanelTab: "terminal",
        rightPanelSplit: { tab: "notes", placement: "bottom" },
      });
      renderPanel();
      expect(unifiedRightPanelProps.current?.notesContent?.props.projectId).toBe("project-b");

      act(() => closeExitedShell(tab.id));

      expect(usePanelStore.getState().rightPanelSplit).toBeNull();
      expect(shownNotes()).toEqual(projectBNotes);
    });

    it("moves Notes off the terminal's project when that project is removed", async () => {
      const tab = openProjectBTerminalOnHome();
      usePanelStore.setState({ rightPanelTab: "notes" });
      renderPanel();
      act(() => closeExitedShell(tab.id));
      expect(shownNotes()).toEqual(projectBNotes);

      await act(async () => deleteProject("project-b"));

      // Notes edits are saved under the project the panel renders.
      expect(useDevTerminalStore.getState().activeProjectId).toBeNull();
      expect(shownNotes()).toEqual({
        activeTab: "notes",
        projectName: "Project project-a",
        projectId: "project-a",
      });
    });
  });
});
