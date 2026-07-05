// @vitest-environment jsdom
import { useEffect } from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { TerminalRoute, ThreadRoute } from "./routeComponents";

// Counts TerminalView mount events so a target change can be asserted to
// remount (fresh PTY) rather than reuse the stale one.
const terminalMounts = vi.hoisted(() => ({ count: 0 }));

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
    params: { threadId: routedThread.id, projectId: project.id },
    search: {} as { worktree?: string; action?: string; fromThread?: string },
    navigate: vi.fn<(options: unknown) => void>(),
    remote: {
      booted: true,
      projects: [project],
      selectedThread,
      selectedThreadSnapshot: { thread: routedThread },
      threads: [selectedThread, routedThread],
      openThread: vi.fn<(thread: Thread) => Promise<void>>().mockResolvedValue(undefined),
      sendPrompt: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
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
  }),
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

vi.mock("./views/NewThreadView", () => ({
  NewThreadView: () => null,
}));

vi.mock("./views/ThreadsView", () => ({
  ThreadsView: () => null,
}));

vi.mock("./views/DesktopsView", () => ({
  DesktopsView: () => null,
}));

vi.mock("./views/MoreView", () => ({
  MoreView: () => null,
}));

describe("mobile route components", () => {
  beforeEach(() => {
    fixtures.params.threadId = "thread-routed";
    fixtures.params.projectId = "project-1";
    fixtures.search = {};
    fixtures.navigate.mockReset();
    fixtures.remote.openThread.mockClear();
    terminalMounts.count = 0;
  });

  it("renders the empty thread state for a missing routed thread instead of the stale selection", () => {
    fixtures.params.threadId = "thread-missing";

    render(<ThreadRoute />);

    expect(screen.getByTestId("thread-title")).toHaveTextContent("No thread");
    expect(fixtures.remote.openThread).not.toHaveBeenCalled();
  });

  it("opens a project terminal with the routed thread as the close target", () => {
    render(<ThreadRoute />);

    fireEvent.click(screen.getByRole("button", { name: "Open terminal" }));

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
    await waitFor(() => expect(terminalMounts.count).toBe(2));
  });
});
