// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://poracode.com/app"}
import { useEffect, type ReactNode } from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { clearPairingLaunch, parsePairingLaunch, setPairingLaunch } from "./pairing";
import {
  DesktopsRoute,
  SettingsSectionRoute,
  TerminalRoute,
  ThreadRoute,
  ThreadsRoute,
  WorkspaceRoute,
} from "./routeComponents";

// Counts TerminalView mount events so a target change can be asserted to
// remount (fresh PTY) rather than reuse the stale one.
const terminalMounts = vi.hoisted(() => ({ count: 0 }));
const workspaceMounts = vi.hoisted(() => ({ count: 0 }));
const desktopView = vi.hoisted(() => ({
  lastProps: null as null | {
    readonly manualEndpoint: string;
    readonly manualToken: string;
    readonly showPairingHint: boolean;
    readonly onPair: () => void;
  },
}));

const fixtures = vi.hoisted(() => {
  const project: Project = {
    id: "project-1",
    name: "Repo",
    location: { kind: "posix", path: "/repo" },
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const routedThread: Thread = {
    id: "thread-routed",
    projectId: "project-1",
    title: "Routed thread",
    agentKind: "codex",
    config: { model: "gpt-5" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: true,
    presentationMode: "gui",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as Thread;
  const selectedThread: Thread = {
    ...routedThread,
    id: "thread-selected",
    title: "Previously selected thread",
  };

  return {
    project,
    params: { threadId: routedThread.id, projectId: project.id, section: "usage" },
    search: {} as {
      worktree?: string;
      action?: string;
      fromThread?: string;
      tab?: "changes" | "files";
    },
    navigate: vi.fn<(options: unknown) => void>(),
    remote: {
      booted: true,
      connection: "online",
      activeDesktop: {
        desktopId: "desktop-1",
        label: "Poracode on Mac",
        scopes: ["projects:manage"],
      } as { desktopId: string; label: string; scopes: string[] } | null,
      desktops: [],
      activeDesktopId: "desktop-1",
      projects: [project],
      selectedThread,
      selectedThreadSnapshot: { thread: routedThread },
      threads: [selectedThread, routedThread],
      openThread: vi.fn<(thread: Thread) => Promise<void>>().mockResolvedValue(undefined),
      sendPrompt: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      pairDesktop: vi
        .fn<(endpoint: string, credential: string) => Promise<void>>()
        .mockResolvedValue(undefined),
      applyThreadAction: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      deleteWorktreeGroup: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    },
  };
});

vi.mock("@tanstack/react-router", () => ({
  getRouteApi: () => ({
    useParams: () => fixtures.params,
    useSearch: () => fixtures.search,
  }),
  useNavigate: () => fixtures.navigate,
}));

vi.mock("./remoteContext", () => ({
  useMobileApp: () => ({
    remote: fixtures.remote,
    projectFilter: null,
    setProjectFilter: () => undefined,
    threadSearchOpen: false,
    setThreadSearchOpen: () => undefined,
    threadSearchHost: null,
    setChromeHidden: () => undefined,
  }),
  useRemote: () => fixtures.remote,
}));

vi.mock("./useMediaQuery", () => ({
  WIDE_SHELL_QUERY: "(min-width: 900px)",
  useMediaQuery: () => false,
}));

vi.mock("./views/ThreadView", () => ({
  ThreadView: (props: { thread: Thread | null; onOpenTerminal: () => void }) => (
    <div>
      <span data-testid="thread-title">{props.thread?.title ?? "No thread"}</span>
      <button type="button" onClick={props.onOpenTerminal}>
        Open terminal
      </button>
    </div>
  ),
}));

vi.mock("./views/TerminalView", () => ({
  TerminalView: (props: { title: string; onClose: () => void }) => {
    // Counts mounts, not renders: a target change must remount (new key), so
    // this effect (empty deps) fires again only on a genuine remount.
    useEffect(() => {
      terminalMounts.count += 1;
    }, []);
    return (
      <div>
        <span data-testid="terminal-title">{props.title}</span>
        <button type="button" onClick={props.onClose}>
          Close terminal
        </button>
      </div>
    );
  },
}));

vi.mock("./views/WorkspaceView", () => ({
  WorkspaceView: () => {
    useEffect(() => {
      workspaceMounts.count += 1;
    }, []);
    return <div data-testid="workspace-view" />;
  },
}));

vi.mock("./views/NewThreadView", () => ({
  NewThreadView: () => null,
}));

vi.mock("./views/QuickCompose", () => ({
  QuickCompose: () => <div data-testid="quick-compose" />,
}));

vi.mock("./views/ThreadsView", () => ({
  ThreadsView: (props: { emptyStateOverride?: ReactNode }) => (
    <div data-testid="threads-view">
      {props.emptyStateOverride ? <div>{props.emptyStateOverride}</div> : null}
    </div>
  ),
}));

vi.mock("./views/DesktopsView", () => ({
  DesktopsView: (props: {
    readonly manualEndpoint: string;
    readonly manualToken: string;
    readonly showPairingHint: boolean;
    readonly onPair: () => void;
  }) => {
    desktopView.lastProps = props;
    return (
      <div>
        <span data-testid="manual-endpoint">{props.manualEndpoint}</span>
        <span data-testid="manual-token">{props.manualToken}</span>
        <span data-testid="pairing-hint">{String(props.showPairingHint)}</span>
        <button type="button" onClick={props.onPair}>
          Pair
        </button>
      </div>
    );
  },
}));

vi.mock("./views/MoreView", () => ({
  MoreView: () => null,
}));

vi.mock("./useGitSummaryHydration", () => ({
  useGitSummaryHydration: () => undefined,
}));

describe("mobile route components", () => {
  beforeAll(async () => {
    // React.lazy records resolution on the lazy wrapper only after it renders.
    // Warm both fullscreen wrappers in one commit so the suite pays one shared
    // Suspense retry instead of a separate ~300ms retry in each route test.
    const warmup = render(
      <>
        <WorkspaceRoute />
        <TerminalRoute />
      </>,
    );
    await Promise.all([
      screen.findByTestId("workspace-view"),
      screen.findByTestId("terminal-title"),
    ]);
    warmup.unmount();
  });

  beforeEach(() => {
    fixtures.params.threadId = "thread-routed";
    fixtures.params.projectId = "project-1";
    fixtures.search = {};
    fixtures.remote.connection = "online";
    fixtures.remote.projects = [fixtures.project];
    fixtures.remote.activeDesktop = {
      desktopId: "desktop-1",
      label: "Poracode on Mac",
      scopes: ["projects:manage"],
    };
    fixtures.remote.desktops = [];
    fixtures.remote.activeDesktopId = "desktop-1";
    fixtures.navigate.mockReset();
    fixtures.remote.openThread.mockClear();
    fixtures.remote.pairDesktop.mockClear();
    desktopView.lastProps = null;
    clearPairingLaunch();
    terminalMounts.count = 0;
    workspaceMounts.count = 0;
  });

  it("replaces the empty thread content with a desktop setup prompt while disconnected", () => {
    fixtures.remote.connection = "offline";

    render(<ThreadsRoute />);

    expect(screen.queryByTestId("quick-compose")).toBeNull();
    expect(screen.getByText("Connect desktop")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(fixtures.navigate).toHaveBeenCalledWith({ to: "/desktops" });
  });

  it("shows an add-project prompt instead of the home composer when no project is available", () => {
    fixtures.remote.projects = [];

    render(<ThreadsRoute />);

    expect(screen.queryByTestId("quick-compose")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add project" }));
    expect(fixtures.navigate).toHaveBeenCalledWith({ to: "/projects" });
  });

  it("renders the home composer only after a connected desktop has projects", async () => {
    render(<ThreadsRoute />);

    expect(await screen.findByTestId("quick-compose")).toBeTruthy();
  });

  it("redirects stale Usage settings when no desktop is paired", async () => {
    fixtures.remote.activeDesktop = null;
    fixtures.params.section = "usage";

    render(<SettingsSectionRoute />);

    await waitFor(() =>
      expect(fixtures.navigate).toHaveBeenCalledWith({ to: "/settings", replace: true }),
    );
  });

  it("attempts and consumes an http LAN pairing credential from the hosted app", async () => {
    setPairingLaunch({
      endpoint: "http://192.168.1.20:38987/",
      credential: "lc_pair_once",
    });

    render(<DesktopsRoute />);

    expect(screen.getByTestId("manual-endpoint")).toHaveTextContent("http://192.168.1.20:38987/");
    expect(screen.getByTestId("manual-token")).toHaveTextContent("lc_pair_once");
    expect(screen.getByTestId("pairing-hint")).toHaveTextContent("true");

    fireEvent.click(screen.getByRole("button", { name: "Pair" }));

    await waitFor(() =>
      expect(fixtures.remote.pairDesktop).toHaveBeenCalledWith(
        "http://192.168.1.20:38987/",
        "lc_pair_once",
      ),
    );
    expect(parsePairingLaunch().credential).toBeNull();
    expect(fixtures.navigate).toHaveBeenCalledWith({ to: "/threads" });
  });

  it("renders the empty thread state for a missing routed thread instead of the stale selection", () => {
    fixtures.params.threadId = "thread-missing";

    render(<ThreadRoute />);

    expect(screen.getByText("No thread selected")).toBeTruthy();
    expect(fixtures.remote.openThread).not.toHaveBeenCalled();
  });

  it("opens a project terminal with the routed thread as the close target", async () => {
    render(<ThreadRoute />);

    fireEvent.click(await screen.findByRole("button", { name: "Open terminal" }));

    expect(fixtures.navigate).toHaveBeenCalledWith({
      to: "/terminal/$projectId",
      params: { projectId: "project-1" },
      search: { fromThread: "thread-routed" },
    });
  });

  it("closes a project terminal back to its source thread", async () => {
    fixtures.search = { fromThread: "thread-routed" };
    render(<TerminalRoute />);

    fireEvent.click(await screen.findByRole("button", { name: "Close terminal" }));

    expect(fixtures.navigate).toHaveBeenCalledWith({
      to: "/thread/$threadId",
      params: { threadId: "thread-routed" },
    });
  });

  it("remounts the workspace when the routed thread target changes", async () => {
    fixtures.params.threadId = "thread-routed";
    fixtures.search = { tab: "files" };
    const { rerender } = render(<WorkspaceRoute />);
    await screen.findByTestId("workspace-view");
    expect(workspaceMounts.count).toBe(1);

    fixtures.params.threadId = "thread-selected";
    rerender(<WorkspaceRoute />);

    expect(workspaceMounts.count).toBe(2);
  });

  it("remounts the terminal (fresh shell) when the target changes", async () => {
    // Start on one worktree target.
    fixtures.search = { worktree: "/repo/a" };
    const { rerender } = render(<TerminalRoute />);
    await screen.findByTestId("terminal-title");
    expect(terminalMounts.count).toBe(1);

    // Navigate to a different target (new worktree + an action). TanStack Router
    // keeps TerminalRoute mounted, but the target-scoped key must remount
    // TerminalView so it doesn't reuse the old PTY/cwd.
    fixtures.search = { worktree: "/repo/b", action: "build" };
    rerender(<TerminalRoute />);
    expect(terminalMounts.count).toBe(2);
  });
});
