import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { RemoteThreadView } from "./RemoteThreadView";

// ChatPane pulls heavy runtime deps and reads the global store; the remote view
// only needs to mount it, so stub it.
vi.mock("@/renderer/components/thread/ChatPane/ChatPane", () => ({
  ChatPane: (props: { thread: Thread }) => <div data-testid="chatpane">{props.thread.title}</div>,
}));

const thread = {
  id: "rt-1",
  projectId: "p1",
  title: "Remote thread",
  agentKind: "claude",
  config: {},
  status: "idle",
} as unknown as Thread;

function seedOpenThread(overrides?: Partial<Thread>) {
  const sendRemotePrompt = vi.fn<(prompt: string) => Promise<void>>(async () => {});
  const interruptThread = vi.fn<(d: string, t: string) => Promise<void>>(async () => {});
  const closeRemoteThread = vi.fn<() => void>();
  useRemoteServersStore.setState({
    openThread: { desktopId: "d1", threadId: "rt-1", thread: { ...thread, ...overrides } },
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
  });
  return { sendRemotePrompt, interruptThread, closeRemoteThread };
}

describe("RemoteThreadView", () => {
  afterEach(() => {
    useRemoteServersStore.setState({ openThread: null, servers: [] });
    document.body.innerHTML = "";
  });

  it("renders ChatPane and the server label for the open thread", () => {
    seedOpenThread();
    render(<RemoteThreadView />);
    expect(screen.getByTestId("chatpane").textContent).toBe("Remote thread");
    expect(screen.getByText("Server One")).toBeTruthy();
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
