import { fireEvent, screen, waitFor } from "@testing-library/react";
import { toast } from "@heroui/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ThreadFollowUpQueue } from "./ThreadFollowUpQueue";
import { ThreadFollowUpEditor } from "./ThreadFollowUpEditor";

const bridge = vi.hoisted(() => ({
  removeQueuedThreadFollowUp: vi.fn<() => Promise<void>>(),
  pauseThreadFollowUps: vi.fn<() => Promise<void>>(),
  resumeThreadFollowUps: vi.fn<() => Promise<void>>(),
  editQueuedThreadFollowUp: vi.fn<() => Promise<void>>(),
  steerQueuedThreadFollowUp: vi.fn<() => Promise<void>>(),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));
const queue = {
  items: [
    { id: "first", prompt: "First task", stagedAt: 1 },
    { id: "second", prompt: "Second task", stagedAt: 2 },
  ],
  paused: false,
};

describe("ThreadFollowUpQueue", () => {
  beforeEach(() => {
    bridge.removeQueuedThreadFollowUp.mockReset().mockResolvedValue(undefined);
    bridge.pauseThreadFollowUps.mockReset().mockResolvedValue(undefined);
    bridge.resumeThreadFollowUps.mockReset().mockResolvedValue(undefined);
    bridge.editQueuedThreadFollowUp.mockReset().mockResolvedValue(undefined);
    bridge.steerQueuedThreadFollowUp.mockReset().mockResolvedValue(undefined);
  });

  it("focuses the editor after its pause request finishes", () => {
    const props = {
      item: queue.items[0]!,
      onSave: vi.fn<() => void>(),
      onCancel: vi.fn<() => void>(),
    };
    const view = render(<ThreadFollowUpEditor {...props} pending />);
    expect(screen.getByRole("textbox")).toBeDisabled();
    view.rerender(<ThreadFollowUpEditor {...props} pending={false} />);
    expect(screen.getByRole("textbox")).toHaveFocus();
  });

  it("cancels only the chosen item and waits for authoritative state", async () => {
    render(<ThreadFollowUpQueue threadId="thread" queue={queue} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Remove queued follow-up" })[1]!);
    await waitFor(() =>
      expect(bridge.removeQueuedThreadFollowUp).toHaveBeenCalledWith({
        threadId: "thread",
        id: "second",
      }),
    );
    expect(screen.getByText("First task")).toBeInTheDocument();
    expect(screen.getByText("Second task")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Resume queued follow-ups" }),
    ).not.toBeInTheDocument();
  });

  it("offers an explicit resume action when paused", async () => {
    render(<ThreadFollowUpQueue threadId="thread" queue={{ ...queue, paused: true }} />);
    fireEvent.click(screen.getByRole("button", { name: "Resume queued follow-ups" }));
    await waitFor(() =>
      expect(bridge.resumeThreadFollowUps).toHaveBeenCalledWith({ threadId: "thread" }),
    );
  });

  it("steers the selected item without removing it optimistically", async () => {
    render(<ThreadFollowUpQueue threadId="thread" queue={queue} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Steer queued follow-up" })[1]!);
    await waitFor(() =>
      expect(bridge.steerQueuedThreadFollowUp).toHaveBeenCalledWith({
        threadId: "thread",
        id: "second",
      }),
    );
    expect(screen.getByText("Second task")).toBeInTheDocument();
    expect(bridge.removeQueuedThreadFollowUp).not.toHaveBeenCalled();
  });

  it.each(["Remove queued follow-up", "Steer queued follow-up"])(
    "keeps keyboard focus after %s removes its row",
    async (name) => {
      const restoreFocus = vi.fn<() => void>();
      const view = render(
        <ThreadFollowUpQueue threadId="thread" queue={queue} onRestoreFocus={restoreFocus} />,
      );
      const action = screen.getAllByRole("button", { name })[0]!;
      action.focus();
      fireEvent.click(action);
      view.rerender(
        <ThreadFollowUpQueue
          threadId="thread"
          queue={{ ...queue, items: [queue.items[1]!] }}
          onRestoreFocus={restoreFocus}
        />,
      );
      expect(screen.getByText("Second task").closest("li")).toHaveFocus();
      await waitFor(() => expect(screen.getByRole("button", { name })).toBeEnabled());
      const lastAction = screen.getByRole("button", { name });
      lastAction.focus();
      fireEvent.click(lastAction);
      view.rerender(
        <ThreadFollowUpQueue threadId="thread" queue={null} onRestoreFocus={restoreFocus} />,
      );
      expect(restoreFocus).toHaveBeenCalledOnce();
    },
  );

  it("edits text in place while preserving attachment metadata and FIFO identity", async () => {
    const attachment = {
      kind: "attachment" as const,
      path: "/tmp/screenshot.png",
      mimeType: "image/png",
    };
    render(
      <ThreadFollowUpQueue
        threadId="thread"
        queue={{
          ...queue,
          paused: true,
          items: [
            { ...queue.items[0]!, segments: [attachment, { kind: "text", content: "First task" }] },
          ],
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit queued follow-up" }));
    expect(await screen.findByText("screenshot.png")).toBeInTheDocument();
    expect(screen.queryByText("@/tmp/screenshot.png")).not.toBeInTheDocument();
    fireEvent.change(await screen.findByRole("textbox", { name: "Edit queued follow-up" }), {
      target: { value: "Updated task" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(bridge.editQueuedThreadFollowUp).toHaveBeenCalledWith({
        threadId: "thread",
        id: "first",
        expectedStagedAt: 1,
        prompt: "Updated task",
        segments: [attachment, { kind: "text", content: "Updated task" }],
      }),
    );
    expect(screen.queryByText("@/tmp/screenshot.pngUpdated task")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
    expect(document.activeElement).toBe(
      screen.getAllByRole("button", { name: "Edit queued follow-up" })[0]!.closest("li"),
    );
  });

  it("cancels an edit without changing the message", async () => {
    render(<ThreadFollowUpQueue threadId="thread" queue={queue} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Edit queued follow-up" })[0]!);
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "Discard this" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(screen.getByText("First task")).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByText("First task").closest("li"));
    expect(bridge.editQueuedThreadFollowUp).not.toHaveBeenCalled();
  });

  it("keeps dirty text when the last queued message disappears on another client", async () => {
    const restoreFocus = vi.fn<() => void>();
    const view = render(
      <ThreadFollowUpQueue threadId="thread" queue={{ ...queue, items: [queue.items[0]!] }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit queued follow-up" }));
    fireEvent.change(await screen.findByRole("textbox"), {
      target: { value: "Keep my unfinished edit" },
    });
    view.rerender(
      <ThreadFollowUpQueue threadId="thread" queue={null} onRestoreFocus={restoreFocus} />,
    );
    expect(screen.getByRole("textbox")).toHaveValue("Keep my unfinished edit");
    expect(screen.getByText(/This message is no longer queued/)).toHaveAttribute("role", "status");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(restoreFocus).toHaveBeenCalledOnce();
  });

  it("preserves dirty text and blocks a stale save after a remote edit", async () => {
    const view = render(<ThreadFollowUpQueue threadId="thread" queue={queue} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Edit queued follow-up" })[0]!);
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "Local edit" } });
    view.rerender(
      <ThreadFollowUpQueue
        threadId="thread"
        queue={{
          ...queue,
          paused: true,
          items: [{ ...queue.items[0]!, stagedAt: 5, prompt: "Remote edit" }, queue.items[1]!],
        }}
      />,
    );
    expect(screen.getByRole("textbox")).toHaveValue("Local edit");
    expect(screen.getByText(/This queued follow-up changed/)).toHaveAttribute("role", "status");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Remote edit")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume queued follow-ups" })).toBeEnabled();
  });

  it("blocks other row actions and a save after remote resume without losing text", async () => {
    const view = render(
      <ThreadFollowUpQueue threadId="thread" queue={{ ...queue, paused: true }} />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Edit queued follow-up" })[0]!);
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "Keep draft" } });
    expect(screen.getByRole("button", { name: "Edit queued follow-up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Steer queued follow-up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove queued follow-up" })).toBeDisabled();
    view.rerender(<ThreadFollowUpQueue threadId="thread" queue={queue} />);
    expect(screen.getByRole("textbox")).toHaveValue("Keep draft");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    view.rerender(
      <ThreadFollowUpQueue
        threadId="thread"
        queue={{ ...queue, paused: true, items: [queue.items[1]!] }}
      />,
    );
    expect(screen.getByRole("button", { name: "Resume queued follow-ups" })).toBeEnabled();
  });

  it("retains the edited text if saving fails", async () => {
    const reportError = vi.spyOn(toast, "danger").mockImplementation(() => undefined as never);
    bridge.editQueuedThreadFollowUp.mockRejectedValueOnce(new Error("Connection lost"));
    try {
      render(<ThreadFollowUpQueue threadId="thread" queue={{ ...queue, paused: true }} />);
      fireEvent.click(screen.getAllByRole("button", { name: "Edit queued follow-up" })[0]!);
      fireEvent.change(await screen.findByRole("textbox"), { target: { value: "Keep this edit" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(reportError).toHaveBeenCalledWith("Connection lost"));
      expect(screen.getByRole("textbox")).toHaveValue("Keep this edit");
    } finally {
      reportError.mockRestore();
    }
  });

  it("keeps queued content visible when cancellation fails", async () => {
    const reportError = vi.spyOn(toast, "danger").mockImplementation(() => undefined as never);
    bridge.removeQueuedThreadFollowUp.mockRejectedValueOnce(new Error("Connection lost"));
    try {
      render(<ThreadFollowUpQueue threadId="thread" queue={queue} />);
      fireEvent.click(screen.getAllByRole("button", { name: "Remove queued follow-up" })[0]!);
      await waitFor(() => expect(reportError).toHaveBeenCalledWith("Connection lost"));
      expect(screen.getByText("First task")).toBeInTheDocument();
    } finally {
      reportError.mockRestore();
    }
  });
});
