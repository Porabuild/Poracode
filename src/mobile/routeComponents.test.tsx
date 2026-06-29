// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ThreadRoute } from "./routeComponents";

const fixtures = vi.hoisted(() => {
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
    params: { threadId: routedThread.id },
    navigate: vi.fn<(options: unknown) => void>(),
    remote: {
      booted: true,
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
    useSearch: () => ({}),
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
    onResolveServerRequest: (input: {
      requestId: string;
      method: string;
      response: unknown;
    }) => Promise<void>;
  }) => (
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
});
