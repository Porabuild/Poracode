import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BackgroundTask } from "@/shared/contracts";
import type { ThreadDocksPlacement } from "@/shared/settings";
import { AppProvider } from "@/renderer/components/ui/provider";
import { dynamicActivate } from "@/renderer/i18n/i18n";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ThreadBackgroundTaskRow } from "./ThreadBackgroundTaskRow";

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

const OUTPUT_ACTION_ID = "background-task.output.v1";
const STOP_ACTION_ID = "background-task.stop.v1";
const task: BackgroundTask = {
  taskId: "server",
  kind: "command",
  category: "command",
  description: "Start admin UI",
  command: "pnpm dev",
  startedAt: Date.now() - 60_000,
  progress: "Server ready",
  lastProgressAt: Date.now() - 20_000,
  stopAction: { id: STOP_ACTION_ID, payload: { taskId: "server", token: "run-1" } },
  outputAction: { id: OUTPUT_ACTION_ID, payload: { taskId: "server", token: "run-1" } },
};
const displayTask: BackgroundTask = {
  taskId: "server",
  kind: "command",
  category: "command",
  description: "Start admin UI",
  command: "pnpm dev",
  startedAt: Date.now() - 60_000,
  progress: "Server ready",
  lastProgressAt: Date.now() - 20_000,
  stopAction: { id: STOP_ACTION_ID, payload: { taskId: "server", token: "run-1" } },
};

const row = (value: BackgroundTask = task, placement: ThreadDocksPlacement = "composer") => (
  <AppProvider>
    <ul>
      <ThreadBackgroundTaskRow threadId="thread" task={value} placement={placement} />
    </ul>
  </AppProvider>
);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushReads() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("background task row", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invoke.mockReset();
    invoke.mockImplementation(async ({ actionId }) =>
      actionId === STOP_ACTION_ID ? {} : { output: "ready\n", totalBytes: 6, truncated: false },
    );
  });
  afterEach(async () => {
    await act(async () => {
      useSharedSettings.setState({ locale: "system" });
      await dynamicActivate("en");
    });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows the purpose and genuine progress once, never a progress placeholder", () => {
    const { rerender } = render(row(displayTask, "right"));
    expect(screen.getAllByText("Start admin UI")).toHaveLength(1);
    expect(screen.getAllByText("Server ready")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Start admin UI" })).toHaveAccessibleDescription(
      /Command.*Server ready/,
    );
    fireEvent.click(screen.getByRole("button", { name: "Start admin UI" }));
    expect(screen.getAllByText("Start admin UI")).toHaveLength(1);
    expect(screen.getAllByText("Server ready")).toHaveLength(1);
    expect(screen.queryByText("No progress reported")).not.toBeInTheDocument();
    expect(screen.getByText("pnpm dev")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start admin UI" }));
    rerender(row(displayTask, "composer"));
    expect(screen.queryByText("Server ready")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start admin UI" }));
    expect(screen.getAllByText("Start admin UI")).toHaveLength(1);
    expect(screen.getAllByText("Server ready")).toHaveLength(1);
    expect(screen.queryByText("No progress reported")).not.toBeInTheDocument();
  });

  it("shows a command equal to the purpose once and keeps it fully readable when expanded", () => {
    const commandTask: BackgroundTask = {
      ...displayTask,
      description: "pnpm dev",
      command: "pnpm dev",
    };
    render(row(commandTask));
    fireEvent.click(screen.getByRole("button", { name: "pnpm dev" }));
    expect(screen.getAllByText("pnpm dev")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "pnpm dev" })).toHaveClass("min-w-0");
    expect(screen.getByText("pnpm dev")).toHaveClass("whitespace-pre-wrap");
    expect(screen.queryByRole("region", { name: "Command" })).not.toBeInTheDocument();
  });

  it("bounds a multiline command-equals-title in both placements", () => {
    const command = "echo first\necho second\necho third";
    const multiline: BackgroundTask = {
      ...displayTask,
      description: command,
      command,
    };
    for (const placement of ["composer", "right"] as const) {
      const { unmount } = render(row(multiline, placement));
      const disclosure = screen.getByRole("button", { name: /^echo first/ });
      expect(disclosure).toHaveClass(placement === "composer" ? "h-5" : "h-auto");
      fireEvent.click(disclosure);
      expect(disclosure).toHaveClass(
        "h-auto",
        placement === "composer" ? "max-h-20" : "max-h-40",
        "overflow-y-auto",
      );
      expect(disclosure).not.toHaveClass("h-5");
      expect(within(disclosure).getByText(/echo first/)).toHaveClass("whitespace-pre-wrap");
      unmount();
    }
  });

  it("renders distinct provider-neutral category labels and legacy fallback", () => {
    const cases: Array<[BackgroundTask, string]> = [
      [{ taskId: "c", kind: "command", category: "command", description: "c" }, "Command"],
      [{ taskId: "m", kind: "other", category: "monitor", description: "m" }, "Monitor"],
      [{ taskId: "t", kind: "other", category: "tool", description: "t" }, "Tool"],
      [{ taskId: "a", kind: "other", category: "agent", description: "a" }, "Agent"],
      [{ taskId: "w", kind: "other", category: "workflow", description: "w" }, "Workflow"],
      [{ taskId: "o", kind: "other", category: "other", description: "o" }, "Other"],
      [{ taskId: "lc", kind: "command", description: "legacy command" }, "Command"],
      [{ taskId: "lo", kind: "other", description: "legacy other" }, "Other"],
    ];
    for (const [value, label] of cases) {
      const { unmount } = render(row(value));
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it("uses the watcher icon for monitor tasks", () => {
    const { container } = render(
      row({ taskId: "m", kind: "other", category: "monitor", description: "watch" }),
    );
    expect(container.querySelector("svg.lucide-radio")).not.toBeNull();
  });

  it("renders the actual command and bounded plaintext output", async () => {
    render(row(task));
    fireEvent.click(screen.getByRole("button", { name: "Start admin UI" }));
    await flushReads();
    expect(invoke).toHaveBeenCalledWith({
      threadId: "thread",
      actionId: OUTPUT_ACTION_ID,
      payload: task.outputAction!.payload,
    });
    expect(screen.getByRole("region", { name: "Command" })).toHaveTextContent("pnpm dev");
    const pre = screen.getByText("ready");
    expect(pre.tagName).toBe("PRE");
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("treats a genuine empty response as no output yet", async () => {
    invoke.mockImplementation(async () => ({ output: "", totalBytes: 0, truncated: false }));
    render(row(task));
    fireEvent.click(screen.getByRole("button", { name: "Start admin UI" }));
    await flushReads();
    expect(screen.getByText("No output yet")).toBeInTheDocument();
  });

  it("marks a truncated reply as the end of the output", async () => {
    invoke.mockImplementation(async () => ({
      output: "latest tail",
      totalBytes: 9_000,
      truncated: true,
    }));
    render(row(task));
    fireEvent.click(screen.getByRole("button", { name: "Start admin UI" }));
    await flushReads();
    expect(screen.getByText(/Only the end of the output is shown/)).toHaveTextContent(
      "9,000 bytes",
    );
    expect(screen.getByText("latest tail")).toBeInTheDocument();
  });

  it("preserves whitespace-only output and still renders the truncation hint", async () => {
    invoke.mockImplementation(async () => ({
      output: "  \n\t",
      totalBytes: 4,
      truncated: true,
    }));
    render(row(task));
    fireEvent.click(screen.getByRole("button", { name: "Start admin UI" }));
    await flushReads();
    const output = screen.getByRole("region", { name: "Task output" });
    expect(output.querySelector("pre")?.textContent).toBe("  \n\t");
    expect(screen.queryByText("No output yet")).not.toBeInTheDocument();
    expect(screen.getByText(/Only the end of the output is shown/)).toHaveTextContent("4 bytes");
  });

  it("formats the truncated byte count in the active locale", async () => {
    await act(async () => {
      useSharedSettings.setState({ locale: "de" });
      await dynamicActivate("de");
    });
    invoke.mockImplementation(async () => ({
      output: "ende",
      totalBytes: 9_000,
      truncated: true,
    }));
    render(row(task));
    fireEvent.click(screen.getByRole("button", { name: "Start admin UI" }));
    await flushReads();
    expect(screen.getByText(/nur das Ende der Ausgabe/)).toHaveTextContent("9.000 Bytes");
  });

  it("shows a read error inline, retries on demand, and keeps the task and Stop", async () => {
    invoke
      .mockRejectedValueOnce(new Error("read failed"))
      .mockResolvedValue({ output: "recovered", totalBytes: 9, truncated: false });
    render(row(task));
    fireEvent.click(screen.getByRole("button", { name: "Start admin UI" }));
    await flushReads();
    expect(screen.getByRole("alert")).toHaveTextContent("read failed");
    expect(screen.getByRole("button", { name: "Stop Start admin UI" })).toBeInTheDocument();
    expect(screen.getByText("Start admin UI")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start admin UI" }));
    fireEvent.click(screen.getByRole("button", { name: "Start admin UI" }));
    await flushReads();
    expect(invoke).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(invoke).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await flushReads();
    expect(screen.getByText("recovered")).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("rejects a malformed output reply without hiding the task", async () => {
    invoke.mockResolvedValue({ output: 42, totalBytes: 6, truncated: false });
    render(row(task));
    fireEvent.click(screen.getByRole("button", { name: "Start admin UI" }));
    await flushReads();
    expect(screen.getByRole("alert")).toHaveTextContent("could not be read");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop Start admin UI" })).toBeInTheDocument();
  });

  it("serializes polling and reschedules only after each read completes", async () => {
    const first = deferred<Record<string, unknown>>();
    invoke.mockImplementation(() => first.promise);
    render(row(task));
    fireEvent.click(screen.getByRole("button", { name: "Start admin UI" }));
    await flushReads();
    expect(invoke).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(invoke).toHaveBeenCalledTimes(1);

    first.resolve({ output: "done", totalBytes: 4, truncated: false });
    await flushReads();
    expect(screen.getByText("done")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_999);
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("stops polling when collapsed or unmounted", async () => {
    const { unmount } = render(row(task));
    fireEvent.click(screen.getByRole("button", { name: "Start admin UI" }));
    await flushReads();
    expect(invoke).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Start admin UI" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(invoke).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Start admin UI" }));
    await flushReads();
    expect(invoke).toHaveBeenCalledTimes(2);
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("reuses one in-flight read across collapse/reopen and hide/show", async () => {
    let visibility: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
    try {
      const read = deferred<Record<string, unknown>>();
      let calls = 0;
      invoke.mockImplementation(() => {
        calls += 1;
        return read.promise;
      });
      render(row(task));
      fireEvent.click(screen.getByRole("button", { name: "Start admin UI" }));
      await flushReads();
      expect(calls).toBe(1);

      fireEvent.click(screen.getByRole("button", { name: "Start admin UI" }));
      fireEvent.click(screen.getByRole("button", { name: "Start admin UI" }));
      await flushReads();
      expect(calls).toBe(1);

      visibility = "hidden";
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      visibility = "visible";
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await flushReads();
      expect(calls).toBe(1);

      read.resolve({ output: "current output", totalBytes: 14, truncated: false });
      await flushReads();
      expect(screen.getByText("current output")).toBeInTheDocument();
      expect(calls).toBe(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(calls).toBe(2);
    } finally {
      delete (document as { visibilityState?: DocumentVisibilityState }).visibilityState;
    }
  });

  it("stops polling while the document is hidden and resumes when visible", async () => {
    let visibility: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
    try {
      render(row(task));
      fireEvent.click(screen.getByRole("button", { name: "Start admin UI" }));
      await flushReads();
      expect(invoke).toHaveBeenCalledTimes(1);

      visibility = "hidden";
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(invoke).toHaveBeenCalledTimes(1);

      visibility = "visible";
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await flushReads();
      expect(invoke).toHaveBeenCalledTimes(2);
    } finally {
      delete (document as { visibilityState?: DocumentVisibilityState }).visibilityState;
    }
  });

  it("ignores a late response from an old arbitrary-payload run", async () => {
    const oldRead = deferred<Record<string, unknown>>();
    const newRead = deferred<Record<string, unknown>>();
    const reads = [oldRead, newRead];
    invoke.mockImplementation(() => reads.shift()!.promise);
    const oldRun: BackgroundTask = {
      ...task,
      outputAction: { id: OUTPUT_ACTION_ID, payload: { runKey: "one" } },
    };
    const { rerender } = render(row(oldRun));
    fireEvent.click(screen.getByRole("button", { name: "Start admin UI" }));
    await flushReads();
    expect(invoke).toHaveBeenCalledTimes(1);

    const nextRun: BackgroundTask = {
      ...task,
      outputAction: { id: OUTPUT_ACTION_ID, payload: { runKey: "two" } },
    };
    rerender(
      <AppProvider>
        <ul>
          <ThreadBackgroundTaskRow threadId="thread-2" task={nextRun} />
        </ul>
      </AppProvider>,
    );
    await flushReads();
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenLastCalledWith({
      threadId: "thread-2",
      actionId: OUTPUT_ACTION_ID,
      payload: { runKey: "two" },
    });

    oldRead.resolve({ output: "stale output", totalBytes: 12, truncated: false });
    await flushReads();
    expect(screen.queryByText("stale output")).not.toBeInTheDocument();

    newRead.resolve({ output: "fresh output", totalBytes: 12, truncated: false });
    await flushReads();
    expect(screen.getByText("fresh output")).toBeInTheDocument();
    expect(screen.queryByText("stale output")).not.toBeInTheDocument();
  });

  it("does not restart a read when only opaque payload key order changes", async () => {
    const read = deferred<Record<string, unknown>>();
    let calls = 0;
    invoke.mockImplementation(() => {
      calls += 1;
      return read.promise;
    });
    const first: BackgroundTask = {
      ...task,
      outputAction: {
        id: OUTPUT_ACTION_ID,
        payload: { runKey: "one", extra: "value" },
      },
    };
    const { rerender } = render(row(first));
    fireEvent.click(screen.getByRole("button", { name: "Start admin UI" }));
    await flushReads();
    expect(calls).toBe(1);

    const reordered: BackgroundTask = {
      ...task,
      outputAction: {
        id: OUTPUT_ACTION_ID,
        payload: { extra: "value", runKey: "one" },
      },
    };
    rerender(row(reordered));
    await flushReads();
    expect(calls).toBe(1);

    read.resolve({ output: "same run", totalBytes: 8, truncated: false });
    await flushReads();
    expect(screen.getByText("same run")).toBeInTheDocument();
  });

  it("keeps output reads separate from Stop while a read is pending", async () => {
    const output = deferred<Record<string, unknown>>();
    const stop = deferred<Record<string, unknown>>();
    invoke.mockImplementation(async ({ actionId }) =>
      actionId === OUTPUT_ACTION_ID ? output.promise : stop.promise,
    );
    render(row(task));
    fireEvent.click(screen.getByRole("button", { name: "Start admin UI" }));
    await flushReads();
    expect(screen.getByText("Loading output…")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Stop Start admin UI" }));
    expect(invoke).toHaveBeenCalledWith({
      threadId: "thread",
      actionId: STOP_ACTION_ID,
      payload: task.stopAction!.payload,
    });
    expect(screen.getByLabelText("Stopping Start admin UI…")).toHaveAttribute(
      "aria-disabled",
      "true",
    );

    output.resolve({ output: "ready while stopping", totalBytes: 18, truncated: false });
    await flushReads();
    expect(screen.getByText("ready while stopping")).toBeInTheDocument();
    expect(screen.getByLabelText("Stopping Start admin UI…")).toBeInTheDocument();
    await act(async () => stop.resolve({}));
  });

  it("keeps the composer summary compact and the panel metadata stacked", () => {
    const { rerender } = render(row(task, "right"));
    const panelDisclosure = screen.getByRole("button", { name: "Start admin UI" });
    expect(panelDisclosure).toHaveTextContent("Command");
    expect(panelDisclosure).toHaveTextContent("Server ready");
    expect(within(panelDisclosure).getByTitle(/Running for/)).toBeInTheDocument();

    rerender(row(task, "composer"));
    const composerDisclosure = screen.getByRole("button", { name: "Start admin UI" });
    expect(composerDisclosure).not.toHaveTextContent("Server ready");
    expect(screen.getByText("Command")).toBeInTheDocument();
    expect(screen.getByTitle(/Running for/)).toBeInTheDocument();
  });

  it("keeps the Stop action pending until the existing session action confirms", async () => {
    const stop = deferred<Record<string, unknown>>();
    invoke.mockImplementation(async ({ actionId }) =>
      actionId === STOP_ACTION_ID ? stop.promise : Promise.reject(new Error("no output")),
    );
    render(row(task));
    fireEvent.click(screen.getByRole("button", { name: "Stop Start admin UI" }));
    expect(screen.getByLabelText("Stopping Start admin UI…")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await act(async () => stop.resolve({}));
    expect(screen.getByRole("button", { name: "Stop Start admin UI" })).toBeInTheDocument();
  });

  it("reveals a Stop failure and permits retry without hiding the live task", async () => {
    invoke.mockImplementation(async ({ actionId }) => {
      if (actionId === STOP_ACTION_ID) {
        throw new Error("The task has not confirmed that it stopped. Try again.");
      }
      return { output: "still running", totalBytes: 13, truncated: false };
    });
    render(row(task));
    fireEvent.click(screen.getByRole("button", { name: "Stop Start admin UI" }));
    await flushReads();
    expect(
      screen.getByText("The task has not confirmed that it stopped. Try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop Start admin UI" })).toBeInTheDocument();
    expect(screen.getByText("Start admin UI")).toBeInTheDocument();
  });

  it("does not leak a pending Stop into a new arbitrary-payload run", async () => {
    const stop = deferred<Record<string, unknown>>();
    invoke.mockImplementation(async ({ actionId }) =>
      actionId === STOP_ACTION_ID ? stop.promise : Promise.reject(new Error("no output")),
    );
    const first: BackgroundTask = {
      ...displayTask,
      stopAction: { id: STOP_ACTION_ID, payload: { runKey: "one" } },
    };
    const next: BackgroundTask = {
      ...displayTask,
      stopAction: { id: STOP_ACTION_ID, payload: { runKey: "two" } },
    };
    const { rerender } = render(row(first));
    fireEvent.click(screen.getByRole("button", { name: "Stop Start admin UI" }));
    expect(screen.getByLabelText("Stopping Start admin UI…")).toBeInTheDocument();

    rerender(row(next));
    expect(screen.getByRole("button", { name: "Stop Start admin UI" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Stopping Start admin UI…")).not.toBeInTheDocument();

    await act(async () => stop.resolve({}));
    expect(screen.getByRole("button", { name: "Stop Start admin UI" })).toBeInTheDocument();
  });

  it("renders old payloads without inventing timing, progress, Stop or output reads", async () => {
    const legacy: BackgroundTask = { taskId: "old", kind: "other", description: "Legacy task" };
    render(row(legacy));
    expect(screen.queryByRole("button", { name: /^Stop / })).not.toBeInTheDocument();
    expect(screen.queryByTitle(/Running for/)).not.toBeInTheDocument();
    expect(screen.queryByText("Server ready")).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Legacy task" }));
    await flushReads();
    expect(screen.getByText("Output isn’t available for this task.")).toBeInTheDocument();
    expect(screen.queryByText("No progress reported")).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });
});
