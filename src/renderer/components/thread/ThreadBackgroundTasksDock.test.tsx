import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BackgroundTask } from "@/shared/contracts";
import { AppProvider } from "@/renderer/components/ui/provider";
import { useAppStore } from "@/renderer/state/appStore";
import { useThreadBackgroundTasksDockStore } from "@/renderer/state/threadBackgroundTasksDockStore";
import { ThreadBackgroundTasksDock } from "./ThreadBackgroundTasksDock";

type SessionActionRequest = {
  threadId: string;
  actionId: string;
  payload: Record<string, string>;
};

const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn<(request: SessionActionRequest) => Promise<Record<string, unknown>>>(),
}));
vi.mock("@/renderer/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/bridge")>()),
  readBridge: () => ({ invokeThreadSessionAction: invoke }),
  isRemoteSession: () => false,
}));

const STOP_ACTION_ID = "stop.v1";
const OUTPUT_ACTION_ID = "output.v1";
const pendingTask: BackgroundTask = {
  taskId: "server",
  kind: "command",
  category: "command",
  description: "Pending task",
  startedAt: 1_000,
  stopAction: { id: STOP_ACTION_ID, payload: { runKey: "one" } },
  outputAction: { id: OUTPUT_ACTION_ID, payload: { runKey: "one" } },
};

const dock = (threadId: string) => (
  <AppProvider>
    <ThreadBackgroundTasksDock threadId={threadId} placement="composer" />
  </AppProvider>
);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("ThreadBackgroundTasksDock", () => {
  beforeEach(() => {
    invoke.mockReset();
    useThreadBackgroundTasksDockStore.setState({
      collapsed: false,
      dismissedTasksKeyByThread: {},
    });
    useAppStore.setState({ runtimeBackgroundTasksByThread: {} });
  });

  it("keeps a pending Stop when only the output action changes", async () => {
    const stop = deferred<Record<string, unknown>>();
    invoke.mockImplementation(async ({ actionId }) =>
      actionId === STOP_ACTION_ID ? stop.promise : Promise.reject(new Error("not read here")),
    );
    useAppStore.setState({
      runtimeBackgroundTasksByThread: { "thread-1": [pendingTask] },
    });
    render(dock("thread-1"));
    fireEvent.click(screen.getByRole("button", { name: "Stop Pending task" }));
    expect(screen.getByLabelText("Stopping Pending task…")).toBeInTheDocument();

    act(() => {
      useAppStore.setState({
        runtimeBackgroundTasksByThread: {
          "thread-1": [
            {
              ...pendingTask,
              outputAction: {
                id: OUTPUT_ACTION_ID,
                payload: { runKey: "two" },
              },
            },
          ],
        },
      });
    });
    expect(screen.getByLabelText("Stopping Pending task…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop Pending task" })).not.toBeInTheDocument();

    await act(async () => stop.resolve({}));
    expect(screen.getByRole("button", { name: "Stop Pending task" })).toBeInTheDocument();
  });

  it("resets the row's pending Stop on a thread switch", async () => {
    const stop = deferred<Record<string, unknown>>();
    invoke.mockImplementation(async ({ actionId }) =>
      actionId === STOP_ACTION_ID ? stop.promise : Promise.reject(new Error("not read here")),
    );
    useAppStore.setState({
      runtimeBackgroundTasksByThread: {
        "thread-1": [pendingTask],
        "thread-2": [pendingTask],
      },
    });
    const { rerender } = render(dock("thread-1"));
    fireEvent.click(screen.getByRole("button", { name: "Stop Pending task" }));
    expect(screen.getByLabelText("Stopping Pending task…")).toBeInTheDocument();

    rerender(dock("thread-2"));
    expect(screen.getByRole("button", { name: "Stop Pending task" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Stopping Pending task…")).not.toBeInTheDocument();
    await act(async () => stop.resolve({}));
  });
});
