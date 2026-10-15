import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BackgroundTask } from "@/shared/contracts";
import type { ThreadDocksPlacement } from "@/shared/settings";
import { AppProvider } from "@/renderer/components/ui/provider";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ThreadBackgroundTaskRow } from "./ThreadBackgroundTaskRow";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn<() => Promise<Record<string, unknown>>>() }));
vi.mock("@/renderer/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/bridge")>()),
  readBridge: () => ({ invokeThreadSessionAction: invoke }),
  isRemoteSession: () => false,
}));
const task: BackgroundTask = {
  taskId: "server",
  kind: "command",
  description: "Start admin UI",
  startedAt: Date.now() - 60_000,
  progress: "Server ready",
  lastProgressAt: Date.now() - 20_000,
  stopAction: { id: "stop.v1", payload: { task: "server", token: "run-1" } },
};
const row = (value = task, placement: ThreadDocksPlacement = "composer") => (
  <AppProvider>
    <ul>
      <ThreadBackgroundTaskRow threadId="thread" task={value} placement={placement} />
    </ul>
  </AppProvider>
);

describe("compact background task row", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("starts as one row and reveals progress only on expansion", () => {
    const { container } = render(row());
    expect(container.querySelectorAll("li")).toHaveLength(1);
    expect(screen.getByRole("img", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByText("Server ready")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start admin UI" }));
    expect(screen.getByText("Server ready")).toBeInTheDocument();
    expect(screen.getByText(/Last progress .* ago/)).toBeInTheDocument();
    // Long progress scrolls inside the details instead of growing the dock.
    expect(container.querySelectorAll("li")[1]).toHaveClass("max-h-32", "overflow-y-auto");
    expect(screen.getByRole("button", { name: "Start admin UI" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("shows metadata beneath the panel title and keeps the composer summary compact", () => {
    const { container, rerender } = render(row(task, "right"));
    const disclosure = screen.getByRole("button", { name: "Start admin UI" });
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(disclosure).toContainElement(screen.getByText("Server ready"));
    expect(disclosure).toContainElement(container.querySelector('[title^="Running for"]'));
    expect(container.querySelectorAll("li")).toHaveLength(1);

    rerender(row(task, "composer"));
    expect(screen.queryByText("Server ready")).not.toBeInTheDocument();
    expect(disclosure).not.toContainElement(container.querySelector('[title^="Running for"]'));
    expect(screen.getByRole("img", { name: "Loading" })).toBeInTheDocument();
  });

  it("keeps the Stop button pending until the existing session action confirms", async () => {
    let resolve!: (value: Record<string, unknown>) => void;
    invoke.mockReturnValue(
      new Promise((res) => {
        resolve = res;
      }),
    );
    render(row());
    fireEvent.click(screen.getByRole("button", { name: "Stop Start admin UI" }));
    expect(invoke).toHaveBeenCalledExactlyOnceWith({
      threadId: "thread",
      actionId: "stop.v1",
      payload: task.stopAction!.payload,
    });
    expect(screen.getByLabelText("Stopping Start admin UI…")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.queryByText("Server ready")).not.toBeInTheDocument();
    await act(async () => resolve({}));
    expect(screen.getByRole("button", { name: "Stop Start admin UI" })).toBeInTheDocument();
  });

  it("reveals a failure and permits retry without hiding the live task", async () => {
    invoke.mockRejectedValue(new Error("The task has not confirmed that it stopped. Try again."));
    render(row());
    fireEvent.click(screen.getByRole("button", { name: "Stop Start admin UI" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("not confirmed"));
    expect(screen.getByRole("button", { name: "Stop Start admin UI" })).toBeInTheDocument();
    expect(screen.getByText("Server ready")).toBeInTheDocument();
  });

  it("renders old task payloads without inventing timing or Stop support", () => {
    render(row({ taskId: "old", kind: "other", description: "Legacy task" }));
    expect(screen.queryByRole("button", { name: /^Stop / })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Legacy task" }));
    expect(screen.getByText("No progress reported")).toBeInTheDocument();
  });
});
