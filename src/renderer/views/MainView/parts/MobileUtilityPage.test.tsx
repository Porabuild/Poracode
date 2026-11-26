import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PoracodeBridge } from "@/shared/ipc";
import { installBrowserClientRuntime, resetClientRuntimeForTest } from "@/renderer/clientRuntime";
import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { MobileUtilityPage } from "./MobileUtilityPage";

vi.mock("@/renderer/adaptiveLayout", () => ({
  useCompactLayout: () => true,
  isCompactLayoutViewport: () => true,
}));

vi.mock("./RightPanel/parts/NotesPanel/NotesPanel", () => ({
  NotesPanel: ({ projectId }: { projectId: string }) => <div>Notes for {projectId}</div>,
}));

vi.mock("./RightPanel/parts/BrowserPanel/BrowserPanel", () => ({
  BrowserPanel: () => <div>Browser surface</div>,
}));

vi.mock("@/renderer/deferredFeatures", () => ({
  DeferredDevTerminalPanel: (props: { positionOverride?: string }) => (
    <div data-position={props.positionOverride}>Terminal surface</div>
  ),
}));

const subagentContent = vi.hoisted(() => ({
  calls: [] as Array<Record<string, unknown>>,
}));
const subagentPage = vi.hoisted(() => ({
  ready: Promise.resolve(true as boolean | void),
  retain: vi.fn<(threadId: string) => { ready: Promise<boolean | void>; release: () => void }>(),
  release: vi.fn<() => void>(),
  loadItem:
    vi.fn<(threadId: string, itemId: string, isCurrent: () => boolean) => Promise<boolean>>(),
  cursor: null as number | null | undefined,
}));

vi.mock("@/renderer/components/thread/ChatPane/parts/items/SubAgentOverlay", () => ({
  SubAgentContent: (props: Record<string, unknown>) => {
    subagentContent.calls.push(props);
    return (
      <div data-testid="subagent-content">
        {String(props.threadId)}:{String(props.parentItemId)}
      </div>
    );
  },
  SubAgentOpenController: (props: {
    threadId: string;
    onOpen: (parentItemId: string, projectLocation: undefined) => void;
  }) => (
    <button
      type="button"
      data-testid="open-nested"
      onClick={() => props.onOpen("nested-parent", undefined)}
    >
      Open nested in {props.threadId}
    </button>
  ),
}));

vi.mock("@/renderer/state/runtimeInterestHydration", () => ({
  retainRuntimeThreadReader: (threadId: string) => {
    subagentPage.retain(threadId);
    return { ready: subagentPage.ready, release: subagentPage.release };
  },
}));

vi.mock("@/renderer/components/thread/ChatPane/loadRuntimeItemThroughHistory", () => ({
  loadRuntimeItemThroughHistory: subagentPage.loadItem,
}));

vi.mock("@/renderer/state/runtimeHistoryPaging", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/state/runtimeHistoryPaging")>()),
  runtimeWindowPageCursor: () => subagentPage.cursor,
}));

vi.mock("@/renderer/state/managedRootCatalog/rootCatalogAdapter", () => ({
  retryManagedRootCatalog: vi.fn<() => void>(),
}));

describe("MobileUtilityPage", () => {
  beforeEach(() => {
    usePanelStore.setState({
      mobileUtilityPage: "projects",
      pullRequestsOverlayOpen: false,
      prReviewContext: null,
      subAgentPanelContext: null,
      subAgentPanelOpen: false,
    });
    subagentContent.calls = [];
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "desktop-1",
          label: "Studio",
          endpoint: "https://desktop.example.test",
          accessToken: "token",
          scopes: ["projects:manage"],
        },
      ],
      runtime: {
        "desktop-1": {
          status: "online",
          projects: [],
          threads: [],
        },
      },
      lastKnownProjects: {},
      excludedProjectIds: {},
    });
  });

  afterEach(() => {
    document.querySelector("[data-poracode-mobile-page-header-actions]")?.remove();
    resetClientRuntimeForTest();
    Reflect.deleteProperty(window, "poracode");
  });

  it("always identifies the active remote in the Projects bottom controls", () => {
    render(<MobileUtilityPage />);

    const picker = screen.getByRole("button", { name: "Connections" });
    expect(picker).toHaveTextContent("Studio");
    expect(picker).toHaveClass("m-floating-selector");
    expect(picker.querySelector(".lucide-chevron-up")).not.toBeNull();
  });

  it("identifies the browser's active connection in the compact page header", () => {
    usePanelStore.setState({ mobileUtilityPage: "browser" });
    const headerActions = document.createElement("div");
    headerActions.dataset.poracodeMobilePageHeaderActions = "unscoped";
    document.body.append(headerActions);

    render(<MobileUtilityPage />);

    const picker = screen.getByRole("button", { name: "Connections" });
    expect(picker).toHaveTextContent("Studio");
    expect(headerActions).toContainElement(picker);
    expect(screen.getByText("Browser surface")).toBeInTheDocument();
  });

  it("renders terminals as a dedicated compact page", () => {
    usePanelStore.setState({ mobileUtilityPage: "terminal" });

    render(<MobileUtilityPage />);

    expect(screen.getByText("Terminal surface")).toHaveAttribute("data-position", "mobile");
  });

  it("mounts Notes for a paired environment while its cached runtime is offline", () => {
    const browserBridge = {} as PoracodeBridge;
    window.poracode = browserBridge;
    installBrowserClientRuntime(browserBridge);
    const projectId = "remote:desktop-1:project:project-1";
    useAppStore.setState({
      projects: [
        {
          id: projectId,
          remoteServerId: "desktop-1",
          remoteId: "project-1",
          name: "Poracode",
          location: { kind: "posix", path: "/repo", remoteServerId: "desktop-1" },
          createdAt: "2026-08-15T00:00:00.000Z",
        },
      ],
      view: { kind: "draft", projectId },
    });
    usePanelStore.setState({ mobileUtilityPage: "notes" });
    useRemoteServersStore.setState((state) => ({
      runtime: {
        ...state.runtime,
        "desktop-1": { status: "offline", projects: [], threads: [] },
      },
    }));

    render(<MobileUtilityPage />);

    expect(screen.getByText(`Notes for ${projectId}`)).toBeInTheDocument();
    expect(screen.queryByText("No remote environments connected yet.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Project" })).toHaveTextContent("Poracode");
  });

  it("switches between project-scoped Notes from the bottom selector", async () => {
    const projectOne = {
      id: "remote:desktop-1:project:project-1",
      remoteServerId: "desktop-1",
      remoteId: "project-1",
      name: "Poracode",
      location: { kind: "posix" as const, path: "/repo", remoteServerId: "desktop-1" },
      createdAt: "2026-08-15T00:00:00.000Z",
    };
    const projectTwo = {
      ...projectOne,
      id: "remote:desktop-1:project:project-2",
      remoteId: "project-2",
      name: "Website",
      location: { ...projectOne.location, path: "/website" },
    };
    useAppStore.setState({
      projects: [projectOne, projectTwo],
      view: { kind: "draft", projectId: projectOne.id },
    });
    usePanelStore.setState({ mobileUtilityPage: "notes" });

    render(<MobileUtilityPage />);

    const picker = screen.getByRole("button", { name: "Project" });
    expect(picker).toHaveClass("m-floating-selector");
    expect(picker.parentElement).toHaveClass("m-utility-floating-actions--centered");
    expect(picker).toHaveTextContent("Poracode");
    fireEvent.click(picker);

    const dialog = await screen.findByRole("dialog", { name: "Project" });
    fireEvent.click(within(dialog).getByRole("button", { name: /Website/ }));

    expect(screen.getByText(`Notes for ${projectTwo.id}`)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Project" })).toBeNull());
    // Modal removal can precede React Aria restoring the background's accessibility.
    expect(await screen.findByRole("button", { name: "Project" })).toHaveTextContent("Website");
  });

  it("hides the page from keyboard and screen readers while the pull-request overlay covers it", () => {
    usePanelStore.setState({ mobileUtilityPage: "notes" });
    useAppStore.setState({ projects: [], view: { kind: "home" } });
    const { container } = render(<MobileUtilityPage />);
    const page = container.firstElementChild as HTMLElement;
    expect(page).not.toHaveAttribute("inert");
    expect(page).not.toHaveAttribute("aria-hidden");

    act(() => usePanelStore.setState({ pullRequestsOverlayOpen: true }));
    expect(container.firstElementChild).toBe(page);
    expect(page).toHaveAttribute("inert");
    expect(page).toHaveAttribute("aria-hidden", "true");

    act(() => usePanelStore.setState({ pullRequestsOverlayOpen: false }));
    expect(container.firstElementChild).toBe(page);
    expect(page).not.toHaveAttribute("inert");
    expect(page).not.toHaveAttribute("aria-hidden");
  });

  it("covers the page while a review is open even when the list overlay is closed", () => {
    usePanelStore.setState({ mobileUtilityPage: "projects" });
    const { container } = render(<MobileUtilityPage />);
    act(() =>
      usePanelStore.setState({
        prReviewContext: {
          projectId: "p",
          worktreePath: "/w",
          prNumber: 1,
          prKey: "k",
        },
      }),
    );
    expect(container.firstElementChild).toHaveAttribute("inert");
  });
});

describe("MobileUtilityPage compact subagent", () => {
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
  const project = {
    id: "proj-1",
    name: "Project",
    location: { kind: "posix" as const, path: "/repo" },
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  beforeEach(() => {
    subagentContent.calls = [];
    subagentPage.ready = Promise.resolve(true);
    subagentPage.release.mockReset();
    subagentPage.loadItem.mockReset().mockResolvedValue(false);
    subagentPage.cursor = null;
    subagentPage.retain.mockReset();
    subagentPage.retain.mockImplementation(() => ({
      ready: subagentPage.ready,
      release: subagentPage.release,
    }));
    useAppStore.setState({
      threads: [thread],
      projects: [project],
      view: { kind: "thread", panes: ["thread-1"] },
      focusedPaneId: "thread-1",
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeStructuralVersionByThread: {},
      runtimeHydrationStatus: {},
    });
    usePanelStore.setState({
      mobileUtilityPage: "subagent",
      pullRequestsOverlayOpen: false,
      prReviewContext: null,
      subAgentPanelContext: { threadId: "thread-1", parentItemId: "parent-1" },
      subAgentPanelOpen: true,
    });
  });

  const parentItem: RuntimeChatItem = {
    id: "parent-1",
    type: "tool_call",
    state: "completed",
    payload: { name: "Task", status: "success" },
    streams: {},
  };

  function seedParent(id = parentItem.id) {
    useAppStore.setState({
      runtimeItemIdsByThread: { "thread-1": [id] },
      runtimeItemsByIdByThread: { "thread-1": { [id]: { ...parentItem, id } } },
      runtimeStructuralVersionByThread: { "thread-1": 1 },
    });
  }

  it("mounts the existing content once and owns the parent reader", async () => {
    seedParent();
    const view = render(<MobileUtilityPage />);

    expect(await screen.findByTestId("subagent-content")).toHaveTextContent("thread-1:parent-1");
    expect(subagentPage.retain).toHaveBeenCalledWith("thread-1");
    expect(document.querySelectorAll('[data-testid="subagent-content"]')).toHaveLength(1);
    expect(subagentContent.calls.length).toBeGreaterThan(0);
    expect(subagentContent.calls.at(-1)).toMatchObject({
      threadId: "thread-1",
      parentItemId: "parent-1",
      hideHeader: true,
      initialScrollRevealDelayMs: 0,
    });
    expect(subagentContent.calls.at(-1)).not.toHaveProperty("projectLocation");
    view.unmount();
    expect(subagentPage.release).toHaveBeenCalledTimes(1);
  });

  it("keeps a missing context as a Back-dismissable unavailable page", () => {
    usePanelStore.setState({ subAgentPanelContext: null });
    render(<MobileUtilityPage />);

    expect(screen.getByText("Subagent not found.")).toBeInTheDocument();
    expect(usePanelStore.getState().mobileUtilityPage).toBe("subagent");
    expect(subagentContent.calls).toHaveLength(0);
  });

  it("keeps a temporarily missing owner recoverable instead of auto-popping", () => {
    useAppStore.setState({ threads: [], focusedPaneId: null, view: { kind: "home" } });
    usePanelStore.setState({
      subAgentPanelContext: {
        threadId: "remote:desktop-1:thread:thread-1",
        parentItemId: "parent-1",
      },
    });
    render(<MobileUtilityPage />);

    expect(screen.getByText("Subagent not found.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(usePanelStore.getState().mobileUtilityPage).toBe("subagent");
  });

  it("pages an older target through bounded history before showing it", async () => {
    subagentPage.loadItem.mockImplementation(async (threadId, itemId) => {
      expect(threadId).toBe("thread-1");
      expect(itemId).toBe("parent-1");
      seedParent(itemId);
      return true;
    });
    render(<MobileUtilityPage />);

    expect(await screen.findByTestId("subagent-content")).toHaveTextContent("thread-1:parent-1");
    expect(subagentPage.loadItem).toHaveBeenCalledWith(
      "thread-1",
      "parent-1",
      expect.any(Function),
    );
    expect(screen.queryByText("Subagent not found.")).not.toBeInTheDocument();
  });

  it("shows an exhausted target without starting an unrelated read", async () => {
    render(<MobileUtilityPage />);

    expect(await screen.findByText("Subagent not found.")).toBeInTheDocument();
    expect(subagentPage.loadItem).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("waits for authoritative hydration after a void reader resolution before paging", async () => {
    subagentPage.ready = Promise.resolve(undefined);
    useAppStore.setState({ runtimeHydrationStatus: { "thread-1": "pending" } });
    subagentPage.loadItem.mockImplementation(async (threadId, itemId) => {
      expect(threadId).toBe("thread-1");
      expect(itemId).toBe("parent-1");
      seedParent(itemId);
      return true;
    });
    const view = render(<MobileUtilityPage />);

    await act(async () => Promise.resolve());
    expect(subagentPage.loadItem).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toBeInTheDocument();

    await act(async () => {
      useAppStore.setState({
        runtimeHydrationStatus: {},
        runtimeItemIdsByThread: { "thread-1": ["snapshot-only"] },
        runtimeItemsByIdByThread: {
          "thread-1": {
            "snapshot-only": { ...parentItem, id: "snapshot-only" },
          },
        },
      });
    });

    expect(await screen.findByTestId("subagent-content")).toHaveTextContent("thread-1:parent-1");
    expect(subagentPage.loadItem).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it("cancels a past-window read on target switch and reuses the owning reader", async () => {
    let resolveFirst: ((loaded: boolean) => void) | undefined;
    let firstCurrent: (() => boolean) | undefined;
    subagentPage.loadItem
      .mockImplementationOnce(
        (_threadId, _itemId, current) =>
          new Promise((resolve) => {
            firstCurrent = current;
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(async () => {
        seedParent("parent-2");
        return true;
      });
    const view = render(<MobileUtilityPage />);
    await waitFor(() => expect(subagentPage.loadItem).toHaveBeenCalledTimes(1));

    act(() => {
      usePanelStore.setState({
        subAgentPanelContext: { threadId: "thread-1", parentItemId: "parent-2" },
      });
    });
    await waitFor(() => expect(subagentPage.loadItem).toHaveBeenCalledTimes(2));
    expect(firstCurrent?.()).toBe(false);
    expect(subagentPage.retain).toHaveBeenCalledTimes(1);
    expect(subagentPage.release).not.toHaveBeenCalled();

    resolveFirst?.(true);
    await act(async () => Promise.resolve());
    expect(await screen.findByTestId("subagent-content")).toHaveTextContent("thread-1:parent-2");
    expect(screen.queryByText("Subagent not found.")).not.toBeInTheDocument();

    view.unmount();
    expect(subagentPage.release).toHaveBeenCalledTimes(1);
  });

  it("routes a nested row through showSubAgentPanel for the owning thread", async () => {
    seedParent();
    render(<MobileUtilityPage />);
    await screen.findByTestId("subagent-content");

    fireEvent.click(screen.getByTestId("open-nested"));

    expect(usePanelStore.getState().subAgentPanelContext).toMatchObject({
      threadId: "thread-1",
      parentItemId: "nested-parent",
    });
    expect(usePanelStore.getState().mobileUtilityPage).toBe("subagent");
  });

  it("clears a queued nested action when the page is dismissed", async () => {
    seedParent();
    const view = render(<MobileUtilityPage />);
    await screen.findByTestId("subagent-content");

    act(() => useAppStore.getState().openSubAgent("thread-1", "stale-nested"));
    expect(useAppStore.getState().openSubAgentByThread["thread-1"]).toBe("stale-nested");

    view.unmount();
    expect(useAppStore.getState().openSubAgentByThread["thread-1"]).toBeNull();
  });
});
