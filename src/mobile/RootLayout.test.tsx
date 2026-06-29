// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
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
    desktops: [{ id: "desktop-1", label: "Lightcode on Mac" }],
    activeDesktop: { id: "desktop-1", label: "Lightcode on Mac" },
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
    selectedThread: null,
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
  ConnectionPill: () => null,
}));

vi.mock("./storage", () => ({
  getStoredPreference: vi.fn<() => Promise<string>>().mockResolvedValue(""),
  setStoredPreference: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

vi.mock("./ThreadTitleRow", () => ({
  ThreadTitleRow: () => null,
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
    usePanelStore.setState({
      gitReviewContext: null,
      gitReviewAsPanel: false,
      gitOverlayOpen: false,
      prReviewContext: null,
    });
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
