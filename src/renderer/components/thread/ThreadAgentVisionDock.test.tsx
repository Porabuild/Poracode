import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentVision } from "@/shared/agentVision";
import { AppProvider } from "@/renderer/components/ui/provider";
import { ThreadAgentVisionDock, useThreadAgentVision } from "./ThreadAgentVisionDock";
import {
  setAgentVisionSocketSender,
  handleAgentVisionServerMessage,
} from "@/renderer/browser/agentVisionStream";
import type { RemoteWebSocketClientMessage } from "@/shared/remote";

const fixture = vi.hoisted(() => ({
  agentVision:
    vi.fn<
      (threadId: string, preview: boolean, signal: AbortSignal) => Promise<AgentVision | null>
    >(),
  activation: null as unknown,
}));
vi.mock("@/renderer/state/useThread", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/state/useThread")>()),
  useThread: (id: string) => ({ id }),
}));
vi.mock("@/renderer/hostTransport/loopbackHttpWsTransport", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/hostTransport/loopbackHttpWsTransport")>()),
  readManagedLoopbackActivation: () => fixture.activation,
}));

const vision: AgentVision = {
  version: 1,
  source: "browser",
  toolName: "press",
  status: "running",
  updatedAt: 1,
  target: "https://example.test",
  image: "data:image/jpeg;base64,aGVsbG8=",
  capturedAt: 1,
};
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("ThreadAgentVisionDock", () => {
  it("polls only without a stream and preserves a reconnected stream after a failed fallback", async () => {
    vi.useFakeTimers();
    const send = vi.fn<(message: RemoteWebSocketClientMessage) => boolean>(() => true);
    setAgentVisionSocketSender(undefined, send);
    fixture.agentVision
      .mockReset()
      .mockResolvedValueOnce({ ...vision, streamVersion: 1 })
      .mockRejectedValue(new Error("HTTP unavailable"));
    fixture.activation = { client: { agentVision: fixture.agentVision } };
    const hook = renderHook(() => useThreadAgentVision("a", true, true));
    await act(async () => {});
    const watch = send.mock.calls[0]![0];
    if (watch.type !== "agent-vision-watch") throw new Error("Expected watch");
    act(() => {
      handleAgentVisionServerMessage(undefined, {
        type: "agent-vision-frame",
        watchId: watch.watchId,
        vision,
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(fixture.agentVision).toHaveBeenCalledTimes(1);
    const fallback = Promise.withResolvers<AgentVision | null>();
    fixture.agentVision.mockReturnValueOnce(fallback.promise);
    act(() => setAgentVisionSocketSender(undefined, null));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(fixture.agentVision).toHaveBeenCalledTimes(2);
    act(() => {
      setAgentVisionSocketSender(undefined, send);
      handleAgentVisionServerMessage(undefined, {
        type: "agent-vision-frame",
        watchId: watch.watchId,
        vision,
      });
    });
    await act(async () => fallback.reject(new Error("HTTP unavailable")));
    expect(hook.result.current).toEqual(vision);
    hook.unmount();
    setAgentVisionSocketSender(undefined, null);
  });
  it("enlarges a live preview, follows new frames and sources, and closes with Escape", async () => {
    const view = render(
      <AppProvider>
        <ThreadAgentVisionDock
          threadId="a"
          vision={vision}
          collapsed={false}
          onCollapsedChange={() => {}}
        />
      </AppProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open preview" }));
    const dialog = await screen.findByRole("dialog", { name: "Browser" });
    expect(within(dialog).getByRole("img")).toHaveAttribute("src", vision.image);
    view.rerender(
      <AppProvider>
        <ThreadAgentVisionDock
          threadId="a"
          vision={{ ...vision, source: "computer", image: "data:image/jpeg;base64,bmV3" }}
          collapsed={false}
          onCollapsedChange={() => {}}
        />
      </AppProvider>,
    );
    expect(screen.getByRole("dialog", { name: "Computer use" })).toBeInTheDocument();
    expect(within(dialog).getByRole("img")).toHaveAttribute("src", "data:image/jpeg;base64,bmV3");
    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the action in one header above the preview, and collapses", () => {
    const collapse = vi.fn<(collapsed: boolean) => void>();
    const view = render(
      <AppProvider>
        <ThreadAgentVisionDock
          threadId="a"
          vision={vision}
          collapsed={false}
          onCollapsedChange={collapse}
        />
      </AppProvider>,
    );
    expect(screen.getByRole("img", { name: "Agent's view" })).toHaveAttribute("src", vision.image);
    expect(screen.getByText("Press key")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Browser: Press key");
    expect(screen.queryByText("https://example.test")).not.toBeInTheDocument();
    expect(screen.queryByText("Last activity")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collapse agent vision" }));
    expect(collapse).toHaveBeenCalledWith(true);
    view.rerender(
      <AppProvider>
        <ThreadAgentVisionDock
          threadId="a"
          vision={vision}
          collapsed
          onCollapsedChange={collapse}
        />
      </AppProvider>,
    );
    expect(screen.queryByRole("img", { name: "Agent's view" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand agent vision" })).toBeInTheDocument();
  });

  it("ignores old thread and connection replies", async () => {
    const first = Promise.withResolvers<AgentVision>();
    const second = Promise.withResolvers<AgentVision>();
    fixture.agentVision
      .mockReset()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    fixture.activation = { client: { agentVision: fixture.agentVision } };
    const hook = renderHook(({ id }) => useThreadAgentVision(id, true, true), {
      initialProps: { id: "a" },
    });
    hook.rerender({ id: "b" });
    await act(async () => {
      second.resolve({ ...vision, target: "thread-b" });
    });
    expect(hook.result.current?.target).toBe("thread-b");
    await act(async () => {
      first.resolve({ ...vision, target: "thread-a" });
    });
    expect(hook.result.current?.target).toBe("thread-b");
    hook.unmount();
  });

  it("polls metadata while collapsed and stops when hidden", async () => {
    fixture.agentVision.mockReset().mockResolvedValue(vision);
    fixture.activation = { client: { agentVision: fixture.agentVision } };
    const hook = renderHook(({ visible }) => useThreadAgentVision("a", visible, false), {
      initialProps: { visible: true },
    });
    await waitFor(() => expect(hook.result.current).toEqual(vision));
    expect(fixture.agentVision).toHaveBeenCalledWith("a", false, expect.any(AbortSignal));
    hook.rerender({ visible: false });
    expect(fixture.agentVision.mock.calls[0]?.[2].aborted).toBe(true);
    hook.unmount();
  });
});
