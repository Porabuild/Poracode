// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://app.poracode.com/"}
import { useEffect, type ReactNode } from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { toast } from "@heroui/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { clearPairingLaunch, parsePairingLaunch, setPairingLaunch } from "./pairing";
import { RemoteClientError } from "./remoteClient";
import {
  DesktopsRoute,
  NotesRoute,
  SettingsSectionRoute,
  SubAgentRoute,
  TerminalRoute,
  ThreadRoute,
  ThreadsRoute,
  WorkspaceRoute,
} from "./routeComponents";
import { useDesktopPanelStore } from "./desktopPanelStore";

// Counts TerminalView mount events so a target change can be asserted to
// remount (fresh PTY) rather than reuse the stale one.
const terminalMounts = vi.hoisted(() => ({ count: 0 }));
const workspaceMounts = vi.hoisted(() => ({ count: 0 }));
const notesMounts = vi.hoisted(() => ({ count: 0 }));
const media = vi.hoisted(() => ({ wide: false, rightPanel: false }));
const desktopView = vi.hoisted(() => ({
  lastProps: null as null | {
    readonly manualEndpoint: string;
    readonly manualToken: string;
    readonly showPairingHint: boolean;
    readonly onPair: () => void;
    readonly onOpenDesktopServedApp?: () => void;
  },
}));
const mobileViews = vi.hoisted(() => ({
  threadsProps: null as null | {
    readonly onNewThreadInWorktree: (input: {
      projectId: string;
      worktreePath: string;
      worktreeBranch: string;
    }) => void;
  },
  quickComposeProps: null as null | {
    readonly expanded: boolean;
    readonly restoreWorktreeSelectionToken: number;
    readonly onExpandedChange: (expanded: boolean) => void;
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
    params: {
      threadId: routedThread.id,
      parentItemId: "parent-1",
      projectId: project.id,
      section: "usage",
    },
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
  }),
  useRemote: () => fixtures.remote,
}));

vi.mock("./useMediaQuery", () => ({
  DESKTOP_RIGHT_PANEL_QUERY: "(min-width: 1200px)",
  WIDE_SHELL_QUERY: "(min-width: 900px)",
  useMediaQuery: (query: string) =>
    query === "(min-width: 1200px)" ? media.rightPanel : media.wide,
}));

vi.mock("./views/ThreadView", () => ({
  ThreadView: (props: {
    thread: Thread | null;
    onOpenSubAgent: (parentItemId: string) => void;
    onOpenNotes: () => void;
    onOpenTerminal: () => void;
    onOpenWorkspace: (tab: "changes" | "files") => void;
  }) => (
    <div>
      <span data-testid="thread-title">{props.thread?.title ?? "No thread"}</span>
      <button type="button" onClick={props.onOpenTerminal}>
        Open terminal
      </button>
      <button type="button" onClick={props.onOpenNotes}>
        Open notes
      </button>
      <button type="button" onClick={() => props.onOpenWorkspace("changes")}>
        Open Git
      </button>
      <button type="button" onClick={() => props.onOpenSubAgent("parent-1")}>
        Open subagent
      </button>
    </div>
  ),
}));

vi.mock("@/renderer/components/thread/ChatPane/parts/items/SubAgentOverlay", () => ({
  SubAgentContent: (props: { threadId: string; parentItemId: string; hideHeader?: boolean }) => (
    <div data-testid="subagent-content" data-hide-header={props.hideHeader || undefined}>
      {props.threadId}:{props.parentItemId}
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

vi.mock("./views/NotesView", () => ({
  NotesView: (props: { projectId: string; onClose: () => void }) => {
    useEffect(() => {
      notesMounts.count += 1;
    }, []);
    return (
      <div>
        <span data-testid="notes-project">{props.projectId}</span>
        <button type="button" onClick={props.onClose}>
          Close notes
        </button>
      </div>
    );
  },
}));

vi.mock("./views/DesktopWorkspacePanel", () => ({
  DesktopWorkspacePanel: (props: { threadContent: ReactNode }) => (
    <div data-testid="desktop-workspace-panel">{props.threadContent}</div>
  ),
}));

vi.mock("./views/NewThreadView", () => ({
  NewThreadView: () => null,
}));

vi.mock("./views/QuickCompose", () => ({
  QuickCompose: (props: {
    expanded: boolean;
    restoreWorktreeSelectionToken: number;
    onExpandedChange: (expanded: boolean) => void;
  }) => {
    mobileViews.quickComposeProps = props;
    return <div data-testid="quick-compose" data-expanded={String(props.expanded)} />;
  },
}));

vi.mock("./views/ThreadsView", () => ({
  ThreadsView: (props: {
    emptyStateOverride?: ReactNode;
    onNewThreadInWorktree: (input: {
      projectId: string;
      worktreePath: string;
      worktreeBranch: string;
    }) => void;
  }) => {
    mobileViews.threadsProps = props;
    return (
      <div data-testid="threads-view">
        {props.emptyStateOverride ? <div>{props.emptyStateOverride}</div> : null}
      </div>
    );
  },
}));

vi.mock("./views/DesktopsView", () => ({
  DesktopsView: (props: {
    readonly manualEndpoint: string;
    readonly manualToken: string;
    readonly showPairingHint: boolean;
    readonly onPair: () => void;
    readonly onOpenDesktopServedApp?: () => void;
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
        <NotesRoute />
      </>,
    );
    await Promise.all([
      screen.findByTestId("workspace-view"),
      screen.findByTestId("terminal-title"),
      screen.findByTestId("notes-project"),
    ]);
    warmup.unmount();
  });

  beforeEach(() => {
    fixtures.params.threadId = "thread-routed";
    fixtures.params.parentItemId = "parent-1";
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
    notesMounts.count = 0;
    media.wide = false;
    media.rightPanel = false;
    useDesktopPanelStore.setState({
      open: false,
      activeTab: "files",
      threadId: null,
      subAgentThreadId: null,
      subAgentParentItemId: null,
    });
    mobileViews.threadsProps = null;
    mobileViews.quickComposeProps = null;
    useAppStore.setState({ pendingDraftWorktreeSelections: {} });
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

  it("expands the phone's inline composer and targets the selected worktree", async () => {
    render(<ThreadsRoute />);
    await screen.findByTestId("quick-compose");

    act(() => {
      mobileViews.threadsProps?.onNewThreadInWorktree({
        projectId: "project-1",
        worktreePath: "/repo/.poracode/worktrees/calm-viper",
        worktreeBranch: "poracode/calm-viper",
      });
    });

    expect(fixtures.navigate).not.toHaveBeenCalledWith({ to: "/new" });
    expect(mobileViews.quickComposeProps?.expanded).toBe(true);
    expect(useAppStore.getState().pendingDraftWorktreeSelections["project-1"]).toEqual({
      branch: "poracode/calm-viper",
      baseBranch: "poracode/calm-viper",
      isWorktree: true,
      worktreePath: "/repo/.poracode/worktrees/calm-viper",
    });

    act(() => mobileViews.quickComposeProps?.onExpandedChange(false));

    expect(mobileViews.quickComposeProps?.expanded).toBe(false);
    expect(mobileViews.quickComposeProps?.restoreWorktreeSelectionToken).toBe(1);
  });

  it("reveals the inline composer for a worktree target queued from another phone route", async () => {
    useAppStore.getState().setPendingDraftWorktreeSelection("project-1", {
      branch: "poracode/calm-viper",
      baseBranch: "poracode/calm-viper",
      isWorktree: true,
      worktreePath: "/repo/.poracode/worktrees/calm-viper",
    });

    render(<ThreadsRoute />);
    await screen.findByTestId("quick-compose");

    expect(mobileViews.quickComposeProps?.expanded).toBe(true);
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
        "http://192.168.1.20:38987",
        "lc_pair_once",
      ),
    );
    expect(parsePairingLaunch().credential).toBeNull();
    expect(fixtures.navigate).toHaveBeenCalledWith({ to: "/threads" });
  });

  it("offers the desktop-served handoff after the browser refuses a cleartext LAN endpoint", async () => {
    setPairingLaunch({
      endpoint: "http://192.168.1.20:38987/",
      credential: "lc_pair_once",
    });
    // A blocked request rejects at the transport layer, with no response.
    fixtures.remote.pairDesktop.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    // The suite runs on an https origin (see the environment options above), so
    // the cleartext LAN endpoint is a mixed-content target here. jsdom's own
    // `assign` is non-configurable, so stub the whole location for this test.
    const assign = vi.fn<(url: string) => void>();
    const original = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        assign,
        protocol: original.protocol,
        origin: original.origin,
        href: original.href,
        search: "",
        hash: "",
      },
    });

    try {
      render(<DesktopsRoute />);
      expect(desktopView.lastProps?.onOpenDesktopServedApp).toBeUndefined();

      fireEvent.click(screen.getByRole("button", { name: "Pair" }));

      await waitFor(() => expect(desktopView.lastProps?.onOpenDesktopServedApp).toBeDefined());
      desktopView.lastProps?.onOpenDesktopServedApp?.();
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: original });
    }

    expect(assign).toHaveBeenCalledWith("http://192.168.1.20:38987/pair#token=lc_pair_once");
  });

  it("tells the user to mint a new code when the pairing credential is spent", async () => {
    setPairingLaunch({ endpoint: "https://desktop.tailnet.ts.net/", credential: "lc_pair_once" });
    fixtures.remote.pairDesktop.mockRejectedValueOnce(
      new RemoteClientError("Invalid pairing token.", 401, "invalid_pairing_token"),
    );
    const danger = vi.spyOn(toast, "danger");

    render(<DesktopsRoute />);
    fireEvent.click(screen.getByRole("button", { name: "Pair" }));

    await waitFor(() =>
      expect(danger).toHaveBeenCalledWith(expect.stringContaining("no longer valid")),
    );
    danger.mockRestore();
  });

  it("keeps the desktop's own failure reason instead of blaming the browser", async () => {
    setPairingLaunch({
      endpoint: "http://192.168.1.20:38987/",
      credential: "lc_pair_once",
    });
    // A consumed one-time credential is a desktop answer, not a blocked request:
    // the handoff would not help, so it must stay hidden.
    fixtures.remote.pairDesktop.mockRejectedValueOnce(
      new RemoteClientError("Invalid pairing token.", 401, "invalid_pairing_token"),
    );

    render(<DesktopsRoute />);
    fireEvent.click(screen.getByRole("button", { name: "Pair" }));

    await waitFor(() => expect(fixtures.remote.pairDesktop).toHaveBeenCalled());
    expect(desktopView.lastProps?.onOpenDesktopServedApp).toBeUndefined();
  });

  it("omits the desktop-served handoff for a loopback endpoint the browser can already reach", async () => {
    setPairingLaunch({ endpoint: "http://127.0.0.1:38987/", credential: "lc_pair_once" });
    fixtures.remote.pairDesktop.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    render(<DesktopsRoute />);
    fireEvent.click(screen.getByRole("button", { name: "Pair" }));

    await waitFor(() => expect(fixtures.remote.pairDesktop).toHaveBeenCalled());
    expect(desktopView.lastProps?.onOpenDesktopServedApp).toBeUndefined();
  });

  it("renders the empty thread state for a missing routed thread instead of the stale selection", () => {
    fixtures.params.threadId = "thread-missing";

    render(<ThreadRoute />);

    expect(screen.getByText("No thread selected")).toBeTruthy();
    expect(fixtures.remote.openThread).not.toHaveBeenCalled();
  });

  it("opens the routed thread even when it is already the fallback selection", () => {
    // Deep link / reload onto the most-recent thread: remote.selectedThread
    // already matches the route via the recency fallback, but nothing has
    // opened it (no watched pane, no snapshot request) — the old effect
    // early-returned here and the thread stayed blank forever.
    const previous = fixtures.remote.selectedThread;
    fixtures.remote.selectedThread = fixtures.remote.threads[1]!;
    try {
      render(<ThreadRoute />);

      expect(fixtures.remote.openThread).toHaveBeenCalledWith(
        expect.objectContaining({ id: "thread-routed" }),
      );
    } finally {
      fixtures.remote.selectedThread = previous;
    }
  });

  it("re-opens the routed thread once the desktop connects on a cold deep-link load", () => {
    // Cold boot: the thread is seeded from the localStorage mirror (so threadId
    // is stable from the first render) while the desktop connection is still
    // being established async. openThread bails on the null desktop, so the
    // effect must re-run when the desktop id appears — otherwise the history
    // snapshot never loads and the transcript stays blank forever.
    fixtures.remote.activeDesktop = null;
    const { rerender } = render(<ThreadRoute />);
    fixtures.remote.openThread.mockClear();

    fixtures.remote.activeDesktop = {
      desktopId: "desktop-1",
      label: "Poracode on Mac",
      scopes: ["projects:manage"],
    };
    rerender(<ThreadRoute />);

    expect(fixtures.remote.openThread).toHaveBeenCalledWith(
      expect.objectContaining({ id: "thread-routed" }),
    );
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

  it("opens project notes for the routed thread and returns to it", async () => {
    render(<ThreadRoute />);

    fireEvent.click(await screen.findByRole("button", { name: "Open notes" }));

    expect(fixtures.navigate).toHaveBeenCalledWith({
      to: "/notes/$threadId",
      params: { threadId: "thread-routed" },
    });

    fixtures.navigate.mockReset();
    render(<NotesRoute />);
    fireEvent.click(await screen.findByRole("button", { name: "Close notes" }));
    expect(fixtures.navigate).toHaveBeenCalledWith({
      to: "/thread/$threadId",
      params: { threadId: "thread-routed" },
    });
  });

  it("opens notes in the desktop panel without navigating away from the thread", async () => {
    media.wide = true;
    media.rightPanel = true;
    render(<ThreadRoute />);

    fireEvent.click(await screen.findByRole("button", { name: "Open notes" }));

    expect(useDesktopPanelStore.getState()).toMatchObject({
      open: true,
      activeTab: "notes",
      threadId: "thread-routed",
    });
    expect(fixtures.navigate).not.toHaveBeenCalled();
  });

  it("routes a phone subagent into its own history-backed page", async () => {
    render(<ThreadRoute />);

    fireEvent.click(await screen.findByRole("button", { name: "Open subagent" }));

    expect(fixtures.navigate).toHaveBeenCalledWith({
      to: "/subagent/$threadId/$parentItemId",
      params: { threadId: "thread-routed", parentItemId: "parent-1" },
    });
  });

  it("opens a desktop-width PWA subagent in the temporary right-panel tab", async () => {
    media.wide = true;
    media.rightPanel = true;
    render(<ThreadRoute />);

    fireEvent.click(await screen.findByRole("button", { name: "Open subagent" }));

    expect(useDesktopPanelStore.getState()).toMatchObject({
      open: true,
      activeTab: "subagent",
      subAgentThreadId: "thread-routed",
      subAgentParentItemId: "parent-1",
    });
    expect(fixtures.navigate).not.toHaveBeenCalled();
  });

  it("renders the routed subagent target and migrates deep links into the desktop panel", async () => {
    const { unmount } = render(<SubAgentRoute />);
    expect(screen.getByTestId("subagent-content")).toHaveTextContent("thread-routed:parent-1");
    expect(screen.getByTestId("subagent-content")).toHaveAttribute("data-hide-header", "true");
    unmount();

    media.wide = true;
    media.rightPanel = true;
    render(<SubAgentRoute />);

    await waitFor(() => {
      expect(useDesktopPanelStore.getState()).toMatchObject({
        open: true,
        activeTab: "subagent",
        subAgentThreadId: "thread-routed",
        subAgentParentItemId: "parent-1",
      });
    });
    expect(fixtures.navigate).toHaveBeenCalledWith({
      to: "/thread/$threadId",
      params: { threadId: "thread-routed" },
      replace: true,
    });
  });

  it("opens Git in the desktop panel without navigating or remounting the thread route", async () => {
    media.wide = true;
    media.rightPanel = true;
    render(<ThreadRoute />);

    fireEvent.click(await screen.findByRole("button", { name: "Open Git" }));

    expect(useDesktopPanelStore.getState()).toMatchObject({
      open: true,
      activeTab: "git",
      threadId: "thread-routed",
    });
    expect(fixtures.navigate).not.toHaveBeenCalled();
    expect(screen.getByTestId("thread-title")).toHaveTextContent("Routed thread");
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

  it("opens a desktop workspace deep link in the shell panel and returns to the thread route", async () => {
    media.wide = true;
    media.rightPanel = true;
    fixtures.params.threadId = "thread-routed";
    fixtures.search = { tab: "changes" };

    render(<WorkspaceRoute />);

    await waitFor(() => {
      expect(useDesktopPanelStore.getState()).toMatchObject({
        open: true,
        activeTab: "git",
        threadId: "thread-routed",
      });
    });
    expect(fixtures.navigate).toHaveBeenCalledWith({
      to: "/thread/$threadId",
      params: { threadId: "thread-routed" },
      replace: true,
    });
    expect(screen.queryByTestId("workspace-view")).not.toBeInTheDocument();
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
