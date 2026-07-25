import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { RemoteThreadView } from "./RemoteThreadView";

// ChatPane pulls heavy runtime deps and reads the global store; the remote view
// only needs to mount it, so stub it.
vi.mock("@/renderer/components/thread/ChatPane/ChatPane", () => ({
  ChatPane: (props: {
    thread: Thread;
    paneActionsOverride?: {
      openProjectRelativePath(path: string, lineNumber?: number): Promise<void>;
    };
  }) => (
    <div data-testid="chatpane">
      {props.thread.title}
      <button
        type="button"
        onClick={() => {
          void props.paneActionsOverride?.openProjectRelativePath("README.md", 2)?.catch(() => {});
        }}
      >
        open remote file
      </button>
    </div>
  ),
}));

vi.mock("@/renderer/components/thread/ThreadRuntimeRequestPanel/ThreadRuntimeRequestPanel", () => ({
  ThreadRuntimeRequestPanel: (props: {
    request: { requestId: string };
    onResolve: (input: { requestId: string; method: string; response: unknown }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        props.onResolve({
          requestId: props.request.requestId,
          method: "requestPermission",
          response: { optionId: "allow" },
        })
      }
    >
      resolve remote request
    </button>
  ),
}));

vi.mock("@/renderer/components/terminal/XTermSurface", () => ({
  XTermSurface: (props: {
    initialScrollback?: string;
    writeInput?: (data: string) => Promise<void>;
    resizeBackingTerminal?: (size: { cols: number; rows: number }) => Promise<void>;
  }) => (
    <div data-testid="remote-terminal">
      {props.initialScrollback}
      <button type="button" onClick={() => void props.writeInput?.("x")}>
        terminal input
      </button>
      <button
        type="button"
        onClick={() => void props.resizeBackingTerminal?.({ cols: 100, rows: 30 })}
      >
        terminal resize
      </button>
    </div>
  ),
}));

const thread = {
  id: "rt-1",
  projectId: "p1",
  title: "Remote thread",
  agentKind: "claude",
  config: {},
  status: "idle",
  presentationMode: "gui",
} as unknown as Thread;

const project: Project = {
  id: "p1",
  name: "Remote Project",
  location: { kind: "posix", path: "/remote/project" },
  createdAt: "2026-01-01T00:00:00.000Z",
};

function seedOpenThread(overrides?: Partial<Thread>) {
  const sendRemotePrompt = vi.fn<(prompt: string) => Promise<void>>(async () => {});
  const interruptThread = vi.fn<(d: string, t: string) => Promise<void>>(async () => {});
  const closeRemoteThread = vi.fn<() => void>();
  const resolveThreadRequest = vi.fn<
    (input: {
      desktopId: string;
      threadId: string;
      requestId: string;
      method: string;
      response: unknown;
    }) => Promise<void>
  >(async () => {});
  useRemoteServersStore.setState({
    openThread: { desktopId: "d1", threadId: "rt-1", thread: { ...thread, ...overrides } },
    runtime: {
      d1: {
        status: "online",
        projects: [project],
        threads: [{ ...thread, ...overrides }],
      },
    },
    servers: [
      {
        desktopId: "d1",
        label: "Server One",
        endpoint: "http://192.168.1.9:38987/",
        accessToken: "t",
        scopes: ["session:read", "session:operate", "projects:manage"],
      },
    ],
    sendRemotePrompt,
    interruptThread,
    closeRemoteThread,
    resolveThreadRequest,
  });
  return { sendRemotePrompt, interruptThread, closeRemoteThread, resolveThreadRequest };
}

describe("RemoteThreadView", () => {
  afterEach(() => {
    cleanup();
    useRemoteServersStore.setState({ openThread: null, servers: [], runtime: {} });
    useAppStore.setState({ runtimeRequestsByThread: {} });
    useFileEditorStore.setState({
      rootContext: null,
      overlayMode: null,
      tabs: [],
      activePath: null,
      previewTab: null,
      markdownPreviewPath: null,
      buffers: {},
      refreshToken: 0,
      pendingReveal: null,
    });
    document.body.innerHTML = "";
  });

  it("renders ChatPane and the server label for the open thread", () => {
    seedOpenThread();
    render(<RemoteThreadView />);
    expect(screen.getByTestId("chatpane").textContent).toContain("Remote thread");
    expect(screen.getByText("Server One")).toBeTruthy();
  });

  it("renders remote terminal scrollback and routes terminal input and resize", async () => {
    seedOpenThread({ presentationMode: "terminal" });
    const writeRemoteTerminal = vi.fn<(data: string) => Promise<void>>(async () => {});
    const resizeRemoteTerminal = vi.fn<(size: { cols: number; rows: number }) => Promise<void>>(
      async () => {},
    );
    useRemoteServersStore.setState((state) => ({
      openThread: state.openThread
        ? { ...state.openThread, terminalScrollback: "remote terminal frame" }
        : null,
      writeRemoteTerminal,
      resizeRemoteTerminal,
    }));

    render(<RemoteThreadView />);
    expect(screen.getByTestId("remote-terminal").textContent).toContain("remote terminal frame");
    expect(screen.queryByTestId("chatpane")).toBeNull();
    expect(screen.queryByPlaceholderText("Message the remote agent…")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "terminal input" }));
    fireEvent.click(screen.getByRole("button", { name: "terminal resize" }));
    await waitFor(() => expect(writeRemoteTerminal).toHaveBeenCalledWith("x"));
    expect(resizeRemoteTerminal).toHaveBeenCalledWith({ cols: 100, rows: 30 });
  });

  it("sends a prompt through the remote store and clears the input", async () => {
    const { sendRemotePrompt } = seedOpenThread();
    render(<RemoteThreadView />);
    const box = screen.getByPlaceholderText("Message the remote agent…") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "hi remote" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(sendRemotePrompt).toHaveBeenCalledWith("hi remote"));
    expect(box.value).toBe("");
  });

  it("shows Interrupt only while the thread is turn-active", () => {
    seedOpenThread({ status: "working" });
    render(<RemoteThreadView />);
    expect(screen.getByRole("button", { name: "Interrupt" })).toBeTruthy();
  });

  it("opens project-relative ChatPane file links through the remote file editor context", async () => {
    const gitCall = vi.fn<RemoteDesktopClient["gitCall"]>(async () => ({
      path: "README.md",
      status: "ready",
      modifiedAtMs: 123,
      content: "remote readme",
      lineEnding: "lf",
      hasBom: false,
    }));
    useRemoteServersStore
      .getState()
      .setClientFactory(() => ({ gitCall }) as unknown as RemoteDesktopClient);
    seedOpenThread();

    render(<RemoteThreadView />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "open remote file" }));
    });

    await waitFor(() =>
      expect(gitCall).toHaveBeenCalledWith("readProjectFile", {
        projectLocation: project.location,
        path: "README.md",
      }),
    );
    expect(useFileEditorStore.getState().rootContext).toMatchObject({
      projectId: "p1",
      remoteServerId: "d1",
      projectLocation: project.location,
    });
    await waitFor(() =>
      expect(useFileEditorStore.getState().buffers["README.md"]).toMatchObject({
        content: "remote readme",
        isLoading: false,
      }),
    );
  });

  it("resolves runtime requests through the remote server", async () => {
    const { resolveThreadRequest } = seedOpenThread({ status: "needs_approval" });
    useAppStore.setState({
      runtimeRequestsByThread: {
        "rt-1": [
          {
            requestId: "request-1",
            threadId: "rt-1",
            requestType: "tool_user_input",
            payload: { summary: "Choose", details: {}, options: [] },
            receivedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });

    render(<RemoteThreadView />);
    fireEvent.click(screen.getByRole("button", { name: "resolve remote request" }));

    await waitFor(() =>
      expect(resolveThreadRequest).toHaveBeenCalledWith({
        desktopId: "d1",
        threadId: "rt-1",
        requestId: "request-1",
        method: "requestPermission",
        response: { optionId: "allow" },
      }),
    );
  });

  it("denies a pending approval before sending a follow-up prompt", async () => {
    const { resolveThreadRequest, sendRemotePrompt } = seedOpenThread({
      status: "needs_approval",
    });
    useAppStore.setState({
      runtimeRequestsByThread: {
        "rt-1": [
          {
            requestId: "approval-1",
            threadId: "rt-1",
            requestType: "command_execution_approval",
            payload: {
              summary: "Run command",
              details: {},
              options: [{ optionId: "deny", label: "Deny" }],
            },
            receivedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });

    render(<RemoteThreadView />);
    const box = screen.getByPlaceholderText("Message the remote agent…") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "try another way" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(resolveThreadRequest).toHaveBeenCalledWith({
        desktopId: "d1",
        threadId: "rt-1",
        requestId: "approval-1",
        method: "requestPermission",
        response: { optionId: "deny" },
      }),
    );
    await waitFor(() => expect(sendRemotePrompt).toHaveBeenCalledWith("try another way"));
  });

  it("hides Interrupt when idle", () => {
    seedOpenThread({ status: "idle" });
    render(<RemoteThreadView />);
    expect(screen.queryByRole("button", { name: "Interrupt" })).toBeNull();
  });

  it("renders nothing when no remote thread is open", () => {
    useRemoteServersStore.setState({ openThread: null });
    const { container } = render(<RemoteThreadView />);
    expect(container.textContent).toBe("");
  });
});
