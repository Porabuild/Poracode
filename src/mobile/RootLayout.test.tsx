// @vitest-environment jsdom
import { StrictMode, useEffect, type ReactNode } from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeImageLightbox,
  openImageLightbox,
} from "@/renderer/components/composer/ImageLightbox";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { RootLayout } from "./RootLayout";
import { useDesktopPanelStore } from "./desktopPanelStore";

const routerMock = vi.hoisted(() => ({
  navigate: vi.fn<(options: unknown) => void>(),
  pathname: "/threads",
  pendingPathname: null as string | null,
  historyBack: vi.fn<() => void>(),
  canGoBack: true,
}));

const mediaMock = vi.hoisted(() => ({ isWide: false, rightPanel: false }));
const threadDetailMock = vi.hoisted(() => ({ mounts: 0 }));

const remoteMock = vi.hoisted(() => ({
  session: {
    booted: true,
    connection: "online",
    message: null,
    desktops: [{ id: "desktop-1", label: "Poracode on Mac" }],
    activeDesktop: { id: "desktop-1", label: "Poracode on Mac" } as {
      id: string;
      label: string;
    } | null,
    projects: [
      {
        id: "project-1",
        name: "Repo",
        location: { kind: "posix", path: "/repo" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    threads: [
      {
        id: "thread-1",
        projectId: "project-1",
        title: "Worktree thread",
        agentKind: "codex",
        config: { model: "gpt" },
        status: "idle",
        attention: "none",
        presentationMode: "gui",
        worktreePath: "/repo-wt",
        worktreeBranch: "feature",
        archived: false,
        done: false,
        starred: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    selectedThread: null as { id: string; title: string } | null,
    selectedThreadSnapshot: null,
    reconnect: vi.fn<() => void>(),
    openThread: vi.fn<(thread: unknown) => Promise<void>>().mockResolvedValue(undefined),
    applyThreadAction: vi
      .fn<(thread: unknown, action: unknown) => Promise<void>>()
      .mockResolvedValue(undefined),
  },
}));

vi.mock("@tanstack/react-router", () => ({
  Outlet: () => <div data-testid="outlet" />,
  useNavigate: () => routerMock.navigate,
  useRouter: () => ({
    history: {
      back: routerMock.historyBack,
      canGoBack: () => routerMock.canGoBack,
    },
  }),
  useRouterState: ({
    select,
  }: {
    select: (state: {
      location: { pathname: string };
      resolvedLocation: { pathname: string };
      matches: { pathname: string }[];
    }) => string;
  }) =>
    select({
      location: { pathname: routerMock.pendingPathname ?? routerMock.pathname },
      resolvedLocation: { pathname: routerMock.pathname },
      matches: [{ pathname: routerMock.pathname }],
    }),
}));

vi.mock("@/renderer/views/MainView/parts/PullFromSourceDialog", () => ({
  PullFromSourceDialog: () => <div data-testid="pull-from-source-dialog" />,
}));

vi.mock("@/renderer/deferredFeatures", () => ({
  DeferredFileEditorPanel: () => <div data-testid="file-editor-panel" />,
}));

vi.mock("./components", () => ({
  ConnectionBanner: (props: { state: string }) => (
    <div data-testid="connection-banner" data-state={props.state} />
  ),
  ConnectionPill: (props: { state: string; label?: string }) => (
    <button
      type="button"
      data-testid="connection-pill"
      data-state={props.state}
      aria-label="Connection status"
    >
      {props.label}
    </button>
  ),
  EmptyState: (props: { title: ReactNode; hint?: ReactNode; action?: ReactNode }) => (
    <div>
      <strong>{props.title}</strong>
      {props.hint}
      {props.action}
    </div>
  ),
  // Functional stand-in: renders the trigger plus one button per item, so
  // tests can drive the header quick menu without the portal/animation layer.
  SheetMenu: (props: {
    items: readonly { id: string; label: string; disabled?: boolean }[];
    onSelect: (id: string) => void;
    trigger: (api: { open: () => void; isOpen: boolean }) => ReactNode;
  }) => (
    <>
      {props.trigger({ open: () => {}, isOpen: false })}
      {props.items.map((item) => (
        <button
          key={item.id}
          type="button"
          disabled={item.disabled}
          onClick={() => props.onSelect(item.id)}
        >
          {item.label}
        </button>
      ))}
    </>
  ),
}));

vi.mock("./UserMessageActionsSheet", () => ({
  UserMessageActionsSheet: () => null,
}));

vi.mock("./TodoActionsSheet", () => ({
  TodoActionsSheet: () => null,
}));

vi.mock("./storage", () => ({
  getStoredPreference: vi.fn<() => Promise<string>>().mockResolvedValue(""),
  setStoredPreference: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

vi.mock("./ThreadTitleRow", () => ({
  ThreadTitleRow: (props: { thread: { id: string; title: string } }) => (
    <div data-testid="thread-title-row" data-thread-id={props.thread.id}>
      {props.thread.title}
    </div>
  ),
}));

vi.mock("./ThreadUsageIndicator", () => ({
  ThreadUsageIndicator: (props: { thread: { id: string } }) => (
    <div data-testid="thread-usage" data-thread-id={props.thread.id} />
  ),
}));

vi.mock("./useMediaQuery", () => ({
  DESKTOP_RIGHT_PANEL_QUERY: "(min-width: 1200px)",
  WIDE_SHELL_QUERY: "(min-width: 900px)",
  useMediaQuery: (query: string) =>
    query === "(min-width: 1200px)" ? mediaMock.rightPanel : mediaMock.isWide,
}));

vi.mock("./useRemoteDesktop", () => ({
  useRemoteDesktop: () => remoteMock.session,
}));

vi.mock("./ThreadDetail", () => ({
  ThreadDetail: (props: { thread: { id: string } | null }) => {
    useEffect(() => {
      threadDetailMock.mounts += 1;
    }, []);
    return <div data-testid="persistent-thread-detail" data-thread-id={props.thread?.id} />;
  },
}));

vi.mock("./views/ThreadsView", () => ({
  ThreadsView: (props: { emptyStateOverride?: ReactNode }) => (
    <div data-testid="threads-view">{props.emptyStateOverride}</div>
  ),
}));

describe("mobile RootLayout", () => {
  beforeEach(() => {
    closeImageLightbox();
    localStorage.removeItem("poracode-mobile.sidebar-width");
    routerMock.navigate.mockReset();
    routerMock.pathname = "/threads";
    routerMock.pendingPathname = null;
    routerMock.historyBack.mockReset();
    routerMock.canGoBack = true;
    mediaMock.isWide = false;
    mediaMock.rightPanel = false;
    threadDetailMock.mounts = 0;
    remoteMock.session.connection = "online";
    remoteMock.session.desktops = [{ id: "desktop-1", label: "Poracode on Mac" }];
    remoteMock.session.activeDesktop = { id: "desktop-1", label: "Poracode on Mac" };
    remoteMock.session.selectedThread = null;
    usePanelStore.setState({
      gitReviewContext: null,
      gitReviewAsPanel: false,
      gitOverlayOpen: false,
      prReviewContext: null,
    });
    useDesktopPanelStore.setState({
      open: false,
      activeTab: "files",
      threadId: null,
      subAgentThreadId: null,
      subAgentParentItemId: null,
    });
    useFileEditorStore.getState().clearSession();
  });

  it("drives home navigation from the header (search + quick menu) with no tab bar", () => {
    render(<RootLayout />);

    // The bottom tab bar is gone.
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();

    // Search toggles the floating thread search (owned by the /threads route).
    const search = screen.getByLabelText("Search threads");
    expect(search).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(search);
    expect(search).toHaveAttribute("aria-pressed", "true");
    fireEvent.pointerDown(search);
    fireEvent.click(search);
    expect(search).toHaveAttribute("aria-pressed", "false");

    // The ⋯ quick menu hosts every secondary destination; Settings is last.
    fireEvent.click(screen.getByText("Usage"));
    expect(routerMock.navigate).toHaveBeenCalledWith({ to: "/usage" });
    fireEvent.click(screen.getByText("Connections"));
    expect(routerMock.navigate).toHaveBeenCalledWith({ to: "/desktops" });
    fireEvent.click(screen.getByText("Settings"));
    expect(routerMock.navigate).toHaveBeenCalledWith({ to: "/settings" });
  });

  it("uses real browser history when leaving a routed subagent page", () => {
    routerMock.pathname = "/subagent/thread-1/parent-1";

    const { container } = render(<RootLayout />);

    expect(container.querySelector(".m-shell")).toHaveAttribute("data-chrome", "subagent");
    expect(screen.getByText("Subagent")).toBeInTheDocument();
    fireEvent.click(container.querySelector(".m-back")!);
    expect(routerMock.historyBack).toHaveBeenCalledTimes(1);
    expect(routerMock.navigate).not.toHaveBeenCalled();
  });

  it("keeps the parent thread mounted while the routed subagent page covers it", () => {
    routerMock.pathname = "/thread/thread-1";
    const view = render(<RootLayout />);

    expect(screen.getByTestId("persistent-thread-detail")).toHaveAttribute(
      "data-thread-id",
      "thread-1",
    );
    expect(threadDetailMock.mounts).toBe(1);

    routerMock.pathname = "/subagent/thread-1/parent-1";
    view.rerender(<RootLayout />);
    expect(screen.getByTestId("persistent-thread-detail").parentElement).toHaveAttribute(
      "data-covered",
      "true",
    );

    routerMock.pathname = "/thread/thread-1";
    view.rerender(<RootLayout />);
    expect(threadDetailMock.mounts).toBe(1);
  });

  it("keeps the disconnected icon hidden until a desktop is active", () => {
    remoteMock.session.connection = "offline";
    remoteMock.session.desktops = [];
    remoteMock.session.activeDesktop = null;

    render(<RootLayout />);

    expect(screen.queryByTestId("connection-pill")).not.toBeInTheDocument();
  });

  it("disables desktop-backed quick-menu destinations when no desktop is paired", () => {
    remoteMock.session.connection = "offline";
    remoteMock.session.desktops = [];
    remoteMock.session.activeDesktop = null;

    render(<RootLayout />);

    expect(screen.getByRole("button", { name: "Usage" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Projects" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Browser" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ports" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Connections" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Settings" })).toBeEnabled();
  });

  it("keeps local settings deep links open when no desktop is paired", () => {
    routerMock.pathname = "/settings/appearance";
    remoteMock.session.desktops = [];
    remoteMock.session.activeDesktop = null;

    render(<RootLayout />);

    expect(routerMock.navigate).not.toHaveBeenCalledWith({ to: "/desktops" });
  });

  it("disables wide-shell desktop actions and hides the banner with no selected desktop", () => {
    mediaMock.isWide = true;
    remoteMock.session.connection = "offline";
    remoteMock.session.desktops = [];
    remoteMock.session.activeDesktop = null;

    render(<RootLayout />);

    expect(screen.getByRole("button", { name: "New thread" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Usage" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Projects" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Browser" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ports" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Settings" })).toBeEnabled();
    expect(screen.queryByTestId("connection-banner")).not.toBeInTheDocument();
    expect(screen.getByText("Connect desktop")).toBeInTheDocument();
  });

  it("uses the ghost button treatment for the wide-shell new thread action", () => {
    mediaMock.isWide = true;

    render(<RootLayout />);

    expect(screen.getByRole("button", { name: "New thread" })).toHaveClass("button--ghost");
  });

  it("shows the remote name and online connection state in the wide sidebar", () => {
    mediaMock.isWide = true;

    render(<RootLayout />);

    expect(screen.getByTestId("connection-pill")).toHaveAttribute("data-state", "online");
    expect(screen.getByTestId("connection-pill")).toHaveTextContent("Mac");
    expect(screen.queryByText("Poracode on Mac")).not.toBeInTheDocument();
  });

  it("hosts shared image previews opened from user messages", () => {
    openImageLightbox([{ src: "data:image/png;base64,AA==", alt: "Screenshot" }], 0);

    render(<RootLayout />);

    expect(screen.getByRole("dialog", { name: "Screenshot" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Screenshot" })).toHaveAttribute(
      "src",
      "data:image/png;base64,AA==",
    );
  });

  it("shows the offline banner when the selected desktop is offline", () => {
    mediaMock.isWide = true;
    remoteMock.session.connection = "offline";

    render(<RootLayout />);

    expect(screen.getByTestId("connection-banner")).toHaveAttribute("data-state", "offline");
  });

  it("resizes and persists the wide-shell sidebar", () => {
    mediaMock.isWide = true;
    localStorage.setItem("poracode-mobile.sidebar-width", "360");

    const { container } = render(<RootLayout />);
    const shell = container.querySelector<HTMLElement>(".m-shell--wide");
    const resizeHandle = screen.getByRole("separator", { name: "Resize sidebar" });
    expect(shell?.style.getPropertyValue("--m-sidebar-width")).toBe("360px");

    fireEvent.keyDown(resizeHandle, { key: "ArrowRight" });
    expect(shell?.style.getPropertyValue("--m-sidebar-width")).toBe("384px");
    expect(localStorage.getItem("poracode-mobile.sidebar-width")).toBe("384");

    fireEvent.mouseDown(resizeHandle, { button: 0, clientX: 384 });
    fireEvent.mouseMove(document, { clientX: 424 });
    fireEvent.mouseUp(document, { clientX: 424 });
    expect(shell?.style.getPropertyValue("--m-sidebar-width")).toBe("424px");
    expect(localStorage.getItem("poracode-mobile.sidebar-width")).toBe("424");
  });

  it("hosts the shared file editor in the desktop PWA content pane", () => {
    mediaMock.isWide = true;
    mediaMock.rightPanel = true;
    useFileEditorStore.setState({ overlayMode: "modal" });

    render(<RootLayout />);

    expect(screen.getByTestId("file-editor-panel")).toBeInTheDocument();
    expect(screen.getByTestId("file-editor-panel").parentElement).toHaveClass("m-detail");
  });

  it("places the home connection indicator after the brand before the More menu", () => {
    remoteMock.session.connection = "offline";

    render(<RootLayout />);

    const brand = screen.getByRole("button", { name: "Poracode" });
    const connection = screen.getByTestId("connection-pill");
    const more = screen.getByLabelText("More");
    expect(
      brand.compareDocumentPosition(connection) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      connection.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows a generic thread header (no thread-scoped actions) on a stale deep link", () => {
    // selectedThread falls back to the most-recent thread even when the routed
    // id was deleted elsewhere; the header must NOT bind its actions to it.
    remoteMock.session.selectedThread = remoteMock.session.threads[0]!;
    routerMock.pathname = "/thread/thread-deleted-elsewhere";

    render(<RootLayout />);

    expect(screen.queryByTestId("thread-title-row")).not.toBeInTheDocument();
    expect(screen.queryByTestId("thread-usage")).not.toBeInTheDocument();
    expect(screen.getByText("Thread")).toBeInTheDocument();
  });

  it("renders the thread header when the routed id matches the selected thread", () => {
    remoteMock.session.selectedThread = remoteMock.session.threads[0]!;
    routerMock.pathname = "/thread/thread-1";

    render(<RootLayout />);

    const row = screen.getByTestId("thread-title-row");
    expect(row).toHaveAttribute("data-thread-id", "thread-1");
    expect(screen.getByTestId("thread-usage")).toHaveAttribute("data-thread-id", "thread-1");
  });

  it("keeps outgoing chrome while the next location is pending", () => {
    remoteMock.session.selectedThread = remoteMock.session.threads[0]!;
    routerMock.pathname = "/threads";
    routerMock.pendingPathname = "/thread/thread-1";

    render(<RootLayout />);

    expect(screen.getByRole("button", { name: "Poracode" })).toBeInTheDocument();
    expect(screen.queryByTestId("thread-title-row")).not.toBeInTheDocument();
  });

  it("holds the previous thread header while pushing into the workspace screen", () => {
    vi.useFakeTimers();
    try {
      remoteMock.session.selectedThread = remoteMock.session.threads[0]!;
      routerMock.pathname = "/thread/thread-1";
      const { container, rerender } = render(
        <StrictMode>
          <RootLayout />
        </StrictMode>,
      );

      routerMock.pathname = "/workspace/thread-1";
      rerender(
        <StrictMode>
          <RootLayout />
        </StrictMode>,
      );

      const heldHeader = container.querySelector(".m-topbar--transition-hold");
      expect(heldHeader).toBeInTheDocument();
      expect(heldHeader).toHaveAttribute("data-chrome-layout", "thread");
      expect(heldHeader).toHaveAttribute("aria-hidden", "true");
      expect(heldHeader).toHaveAttribute("inert");
      expect(screen.getByTestId("thread-title-row")).toHaveAttribute("data-thread-id", "thread-1");

      act(() => {
        vi.advanceTimersByTime(1200);
      });
      expect(container.querySelector(".m-topbar--transition-hold")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("bridges desktop git-review signals to the workspace changes route", async () => {
    usePanelStore.setState({
      gitReviewContext: { projectId: "project-1", worktreePath: "/repo-wt" },
      gitOverlayOpen: true,
      gitReviewAsPanel: false,
    });

    render(<RootLayout />);

    expect(screen.getByTestId("pull-from-source-dialog")).toBeInTheDocument();
    await waitFor(() => {
      expect(routerMock.navigate).toHaveBeenCalledWith({
        to: "/workspace/$threadId",
        params: { threadId: "thread-1" },
        search: { tab: "changes" },
      });
    });
    expect(usePanelStore.getState().gitReviewContext).toBeNull();
    expect(usePanelStore.getState().gitOverlayOpen).toBe(false);
  });

  it("bridges desktop git-review signals into the desktop panel without route navigation", async () => {
    mediaMock.rightPanel = true;
    usePanelStore.setState({
      gitReviewContext: { projectId: "project-1", worktreePath: "/repo-wt" },
      gitOverlayOpen: true,
      gitReviewAsPanel: false,
    });

    render(<RootLayout />);

    await waitFor(() => {
      expect(useDesktopPanelStore.getState()).toMatchObject({
        open: true,
        activeTab: "git",
        threadId: "thread-1",
      });
    });
    expect(routerMock.navigate).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: "/workspace/$threadId" }),
    );
  });

  it("bridges desktop PR-review signals with branch-specific PR keys", async () => {
    usePanelStore.setState({
      prReviewContext: {
        projectId: "project-1",
        prNumber: 42,
        prKey: "__branchname:project-1:feature/mobile",
      },
    });

    render(<RootLayout />);

    await waitFor(() => {
      expect(routerMock.navigate).toHaveBeenCalledWith({
        to: "/pr/$prNumber",
        params: { prNumber: "42" },
        search: {
          project: "project-1",
          prKey: "__branchname:project-1:feature/mobile",
        },
      });
    });
    expect(usePanelStore.getState().prReviewContext).toBeNull();
  });
});
