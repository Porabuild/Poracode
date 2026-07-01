// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { TerminalRoute, ThreadRoute } from "./routeComponents";

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
      resolveRequest: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
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
  ThreadView: (props: {
    thread: Thread | null;
    onOpenTerminal: () => void;
    onResolveServerRequest: (input: {
      requestId: string;
      method: string;
      response: unknown;
    }) => Promise<void>;
  }) => (
    <div>
      <span data-testid="thread-title">{props.thread?.title ?? "No thread"}</span>
      <button
        type="button"
        onClick={() =>
          void props.onResolveServerRequest({
            requestId: "request-1",
            method: "requestPermission",
            response: { optionId: "allow" },
          })
        }
      >
        Resolve request
      </button>
      <button type="button" onClick={props.onOpenTerminal}>
        Open terminal
      </button>
    </div>
  ),
}));

vi.mock("./views/TerminalView", () => ({
  TerminalView: (props: { title: string; onClose: () => void }) => (
    <div>
      <span data-testid="terminal-title">{props.title}</span>
      <button type="button" onClick={props.onClose}>
        Close terminal
      </button>
    </div>
  ),
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
    fixtures.remote.resolveRequest.mockClear();
  });

  it("resolves runtime requests against the routed thread, not a stale selected thread", async () => {
    render(<ThreadRoute />);

    fireEvent.click(screen.getByRole("button", { name: "Resolve request" }));

    await waitFor(() => {
      expect(fixtures.remote.resolveRequest).toHaveBeenCalledWith({
        threadId: "thread-routed",
        requestId: "request-1",
        method: "requestPermission",
        response: { optionId: "allow" },
      });
    });
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
});
