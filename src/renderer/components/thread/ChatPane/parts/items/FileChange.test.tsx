import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { ChatPaneActionsContext } from "../../chatPaneActionsContext";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { acquireHistoryItemDetails } from "@/renderer/state/historyItemDetails";
import { FileChange } from "./FileChange";

vi.mock("@/renderer/state/historyItemDetails", () => ({
  acquireHistoryItemDetails: vi.fn<typeof acquireHistoryItemDetails>(),
}));

describe("FileChange", () => {
  afterEach(() => vi.mocked(acquireHistoryItemDetails).mockReset());

  it("loads the complete row when a deferred row is expanded", async () => {
    const full = makeFileChangeItem();
    const { args: _args, result: _result, ...header } = full.payload as Record<string, unknown>;
    const deferred: RuntimeChatItem = { ...full, payload: header, detailsDeferred: true };
    vi.mocked(acquireHistoryItemDetails).mockReturnValue({
      promise: Promise.resolve(full as never),
      release() {},
    });
    render(
      <AppProvider>
        <ChatPaneActionsContext.Provider value={{ threadId: "thread-1" }}>
          <FileChange item={deferred} />
        </ChatPaneActionsContext.Provider>
      </AppProvider>,
    );

    // The header and totals come from the deferred row; nothing is fetched yet.
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(acquireHistoryItemDetails).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("foo.ts"));

    await waitFor(() => {
      expect(document.body).toHaveTextContent(/old/);
      expect(document.body).toHaveTextContent(/new/);
    });
    expect(acquireHistoryItemDetails).toHaveBeenCalledWith("thread-1", deferred);
  });

  it("offers Retry when the deferred row cannot be loaded", async () => {
    const full = makeFileChangeItem();
    const { args: _args, result: _result, ...header } = full.payload as Record<string, unknown>;
    const deferred: RuntimeChatItem = { ...full, payload: header, detailsDeferred: true };
    vi.mocked(acquireHistoryItemDetails).mockReturnValue({
      promise: Promise.reject(new Error("offline")),
      release() {},
    });
    render(
      <AppProvider>
        <ChatPaneActionsContext.Provider value={{ threadId: "thread-1" }}>
          <FileChange item={deferred} />
        </ChatPaneActionsContext.Provider>
      </AppProvider>,
    );

    fireEvent.click(screen.getByText("foo.ts"));
    const retry = await screen.findByRole("button", { name: "Retry" });

    vi.mocked(acquireHistoryItemDetails).mockReturnValue({
      promise: Promise.resolve(full as never),
      release() {},
    });
    fireEvent.click(retry);

    await waitFor(() => {
      expect(document.body).toHaveTextContent(/old/);
      expect(document.body).toHaveTextContent(/new/);
    });
  });

  it("colors diff summary counts", () => {
    render(
      <AppProvider>
        <FileChange item={makeFileChangeItem({ added: 12, removed: 3 })} />
      </AppProvider>,
    );

    expect(screen.getByText("+12")).toHaveClass("text-success");
    expect(screen.getByText("-3")).toHaveClass("text-danger");
  });

  it("hides zero diff summary values", () => {
    render(
      <AppProvider>
        <FileChange item={makeFileChangeItem({ added: 8, removed: 0 })} />
      </AppProvider>,
    );

    expect(screen.getByText("+8")).toHaveClass("text-success");
    expect(screen.queryByText("-0")).not.toBeInTheDocument();
  });

  it("renders unified diff results without args/result labels", async () => {
    render(
      <AppProvider>
        <FileChange item={makeFileChangeItem()} />
      </AppProvider>,
    );

    fireEvent.click(screen.getByText("foo.ts"));

    await waitFor(() => {
      expect(document.body).toHaveTextContent(/old/);
      expect(document.body).toHaveTextContent(/new/);
    });
    expect(screen.queryByText("args")).not.toBeInTheDocument();
    expect(screen.queryByText("result")).not.toBeInTheDocument();
  });

  it("renders apply_patch add-file content for a session plan path", () => {
    render(
      <AppProvider>
        <FileChange item={makeCreateFileChangeItem()} />
      </AppProvider>,
    );

    fireEvent.click(screen.getByText("plan.md"));

    expect(document.body).toHaveTextContent(/Problem:/);
    expect(document.body).toHaveTextContent(/show plan previews for apply_patch creates/);
    expect(screen.queryByText(/Path escapes the project root/)).not.toBeInTheDocument();
  });

  it("renders a synthesized diff for replacement-style edits", async () => {
    render(
      <AppProvider>
        <FileChange item={makeReplacementFileChangeItem()} />
      </AppProvider>,
    );

    fireEvent.click(screen.getByText("foo.ts"));

    await waitFor(() => {
      expect(document.body).toHaveTextContent(/old value/);
      expect(document.body).toHaveTextContent(/new value/);
    });
    expect(screen.queryByText("args")).not.toBeInTheDocument();
    expect(screen.queryByText("result")).not.toBeInTheDocument();
  });
});

function makeFileChangeItem(
  diffSummary: { added: number; removed: number } = { added: 1, removed: 1 },
): RuntimeChatItem {
  return {
    id: "file-change-1",
    type: "file_change",
    state: "completed",
    payload: {
      path: "src/foo.ts",
      changeKind: "edit",
      diffSummary,
      args: [
        "*** Begin Patch",
        "*** Update File: src/foo.ts",
        "@@",
        "-old",
        "+new",
        "*** End Patch",
      ].join("\n"),
      result: {
        detailedContent: [
          "diff --git a/src/foo.ts b/src/foo.ts",
          "--- a/src/foo.ts",
          "+++ b/src/foo.ts",
          "@@ -1 +1 @@",
          "-old",
          "+new",
          "",
        ].join("\n"),
      },
    },
    streams: {},
  };
}

function makeCreateFileChangeItem(): RuntimeChatItem {
  const planPath =
    "/Users/serhiivecherenko/.copilot/session-state/d8992383-f6b2-4ee2-a017-d59315f53dc1/plan.md";

  return {
    id: "file-change-create-1",
    type: "file_change",
    state: "completed",
    payload: {
      path: planPath,
      changeKind: "create",
      args: [
        "*** Begin Patch",
        `*** Add File: ${planPath}`,
        "+Problem:",
        "+- show plan previews for apply_patch creates",
        "+",
        "+Approach:",
        "+- render add-file contents from patch args",
        "*** End Patch",
      ].join("\n"),
    },
    streams: {},
  };
}

function makeReplacementFileChangeItem(): RuntimeChatItem {
  return {
    id: "file-change-replace-1",
    type: "file_change",
    state: "completed",
    payload: {
      path: "src/foo.ts",
      changeKind: "edit",
      diffSummary: { added: 1, removed: 1 },
      args: {
        filePath: "src/foo.ts",
        oldString: "old value",
        newString: "new value",
      },
      result: { content: "Edit applied successfully." },
    },
    streams: {},
  };
}
