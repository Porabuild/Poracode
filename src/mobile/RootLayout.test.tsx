// @vitest-environment jsdom
import { StrictMode, type ReactNode } from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { usePanelStore } from "@/renderer/state/panelStore";
import { RootLayout } from "./RootLayout";

const routerMock = vi.hoisted(() => ({
  navigate: vi.fn<(options: unknown) => void>(),
  pathname: "/threads",
}));

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
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: routerMock.pathname } }),
}));

vi.mock("@/renderer/views/MainView/parts/PullFromSourceDialog", () => ({
  PullFromSourceDialog: () => <div data-testid="pull-from-source-dialog" />,
}));

vi.mock("./components", () => ({
  ConnectionBanner: () => null,
  ConnectionPill: (props: { state: string }) => (
    <button
      type="button"
      data-testid="connection-pill"
      data-state={props.state}
      aria-label="Connection status"
    />
  ),
  // Functional stand-in: renders the trigger plus one button per item, so
  // tests can drive the header quick menu without the portal/animation layer.
  SheetMenu: (props: {
    items: readonly { id: string; label: string }[];
    onSelect: (id: string) => void;
    trigger: (api: { open: () => void; isOpen: boolean }) => ReactNode;
  }) => (
    <>
      {props.trigger({ open: () => {}, isOpen: false })}
      {props.items.map((item) => (
        <button key={item.id} type="button" onClick={() => props.onSelect(item.id)}>
          {item.label}
        </button>
      ))}
    </>
  ),
}));

vi.mock("./UserMessageActionsSheet", () => ({
  UserMessageActionsSheet: () => null,
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
  WIDE_SHELL_QUERY: "(min-width: 900px)",
  useMediaQuery: () => false,
}));

vi.mock("./useRemoteDesktop", () => ({
  useRemoteDesktop: () => remoteMock.session,
}));

vi.mock("./views/ThreadsView", () => ({
  ThreadsView: () => <div data-testid="threads-view" />,
}));

describe("mobile RootLayout", () => {
  beforeEach(() => {
    routerMock.navigate.mockReset();
    routerMock.pathname = "/threads";
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
    expect(routerMock.navigate).toHaveBeenCalledWith({ to: "/more/usage" });
    fireEvent.click(screen.getByText("Connections"));
    expect(routerMock.navigate).toHaveBeenCalledWith({ to: "/desktops" });
    fireEvent.click(screen.getByText("Settings"));
    expect(routerMock.navigate).toHaveBeenCalledWith({ to: "/more" });
  });

  it("keeps the disconnected icon hidden until a desktop is active", () => {
    remoteMock.session.connection = "offline";
    remoteMock.session.desktops = [];
    remoteMock.session.activeDesktop = null;

    render(<RootLayout />);

    expect(screen.queryByTestId("connection-pill")).not.toBeInTheDocument();
  });

  it("places the home connection indicator after the desktop name before the More menu", () => {
    remoteMock.session.connection = "offline";

    render(<RootLayout />);

    const brand = screen.getByText("Mac").closest("button");
    const connection = screen.getByTestId("connection-pill");
    const more = screen.getByLabelText("More");
    expect(brand).not.toBeNull();
    expect(
      brand!.compareDocumentPosition(connection) & Node.DOCUMENT_POSITION_FOLLOWING,
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

      act(() => vi.advanceTimersByTime(1200));
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
