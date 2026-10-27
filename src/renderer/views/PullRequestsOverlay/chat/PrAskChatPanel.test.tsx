// @vitest-environment jsdom
import { useState } from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeTestAskSession, renderInPrDetail } from "../testing/prDetailTestScope";
import type { PrAskChatSession } from "./prAskSession";
import { PrAskChatPanel } from "./PrAskChatPanel";

vi.mock("@/renderer/views/MainView/parts/AppContent/parts/ThreadPane", () => ({
  ThreadPane: (props: { threadId: string; chatOnly?: boolean }) => (
    <div data-testid="thread-pane" data-thread={props.threadId} data-chat-only={props.chatOnly} />
  ),
}));
vi.mock("@/renderer/dnd", () => ({
  CompactDndProvider: (props: { children: React.ReactNode }) => <>{props.children}</>,
}));

function textbox() {
  return screen.getByPlaceholderText("Ask about this pull request");
}

function sendButton() {
  return screen.getByRole("button", { name: "Send" });
}

/** Keeps the draft the way the overlay shell does: above the panel, so it survives unmounting it. */
function Harness(props: {
  base: PrAskChatSession;
  variant: "panel" | "page" | undefined;
  initialDraft: string;
}) {
  const [draft, setDraft] = useState(props.initialDraft);
  const [shown, setShown] = useState(true);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setShown((value) => !value);
        }}
      >
        toggle chat
      </button>
      {shown ? (
        <PrAskChatPanel
          prNumber={42}
          {...(props.variant ? { variant: props.variant } : {})}
          session={{ ...props.base, draft, setDraft }}
        />
      ) : null}
    </>
  );
}

function renderPanel(
  base: PrAskChatSession,
  options: { variant?: "panel" | "page"; readOnly?: boolean; initialDraft?: string } = {},
) {
  return renderInPrDetail(
    <Harness base={base} variant={options.variant} initialDraft={options.initialDraft ?? ""} />,
    options.readOnly ? { readOnly: true } : {},
  );
}

function type(text: string) {
  fireEvent.change(textbox(), { target: { value: text } });
}

describe("PrAskChatPanel", () => {
  it("shows an intro with the app composer before the first question", () => {
    renderPanel(makeTestAskSession());
    expect(screen.getByRole("heading", { name: "Ask about PR #42" })).toBeInTheDocument();
    expect(screen.queryByTestId("thread-pane")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open as thread" })).toBeDisabled();
    expect(textbox()).toBeEnabled();
    expect(sendButton()).toBeDisabled();
  });

  it("renders the chat thread in chat-only mode and opens it as a thread", () => {
    const value = makeTestAskSession({ threadId: "thread-1" });
    renderPanel(value);
    const pane = screen.getByTestId("thread-pane");
    expect(pane).toHaveAttribute("data-thread", "thread-1");
    expect(pane).toHaveAttribute("data-chat-only", "true");
    expect(screen.queryByPlaceholderText("Ask about this pull request")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open as thread" }));
    expect(value.openAsThread).toHaveBeenCalledTimes(1);
  });

  it("closes from the header", () => {
    const value = makeTestAskSession();
    renderPanel(value);
    fireEvent.click(screen.getByRole("button", { name: "Close chat" }));
    expect(value.setOpen).toHaveBeenCalledWith(false);
  });

  it("shows a failed launch with a retry above a locked composer", () => {
    const value = makeTestAskSession({
      threadId: "thread-1",
      error: { message: "Agent failed to start.", uncertain: false },
    });
    renderPanel(value);
    expect(screen.getByRole("alert")).toHaveTextContent("Agent failed to start.");
    expect(screen.queryByTestId("thread-pane")).not.toBeInTheDocument();
    expect(textbox()).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(value.retry).toHaveBeenCalledTimes(1);
  });

  it("locks the composer after an uncertain launch until Retry is used", () => {
    const value = makeTestAskSession({
      error: { message: "Connection lost.", uncertain: true },
    });
    renderPanel(value, { initialDraft: "Again?" });
    expect(textbox()).toBeDisabled();
    expect(screen.getByText(/Use Retry/)).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
    fireEvent.keyDown(textbox(), { key: "Enter" });
    expect(value.send).not.toHaveBeenCalled();
  });

  describe("composer", () => {
    it("sends the trimmed text on Enter and clears the box once the chat accepted it", async () => {
      const value = makeTestAskSession();
      renderPanel(value);
      type("  Why this change?  ");
      fireEvent.keyDown(textbox(), { key: "Enter" });
      expect(value.send).toHaveBeenCalledTimes(1);
      expect(value.send).toHaveBeenCalledWith("Why this change?");
      await waitFor(() => expect(textbox()).toHaveValue(""));
    });

    it("keeps the text when the chat refused or failed to send it, and lets the user retry", async () => {
      const value = makeTestAskSession();
      vi.mocked(value.send).mockResolvedValueOnce(false);
      renderPanel(value);
      type("Will this be lost?");
      fireEvent.keyDown(textbox(), { key: "Enter" });
      await waitFor(() => expect(sendButton()).toBeEnabled());
      expect(textbox()).toHaveValue("Will this be lost?");

      fireEvent.click(sendButton());
      expect(value.send).toHaveBeenCalledTimes(2);
      await waitFor(() => expect(textbox()).toHaveValue(""));
    });

    it("does not wipe what the user typed while the message was being sent", async () => {
      const value = makeTestAskSession();
      let accept: (accepted: boolean) => void = () => {};
      vi.mocked(value.send).mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            accept = resolve;
          }),
      );
      renderPanel(value);
      type("First");
      fireEvent.keyDown(textbox(), { key: "Enter" });
      expect(sendButton()).toBeDisabled();
      type("First, and more");
      accept(true);
      await waitFor(() => expect(sendButton()).toBeEnabled());
      expect(textbox()).toHaveValue("First, and more");
    });

    it("keeps Shift+Enter for a new line", () => {
      const value = makeTestAskSession();
      renderPanel(value);
      type("line one");
      fireEvent.keyDown(textbox(), { key: "Enter", shiftKey: true });
      expect(value.send).not.toHaveBeenCalled();
      expect(textbox()).toHaveValue("line one");
    });

    it("does not send while an input method is composing", () => {
      const value = makeTestAskSession();
      renderPanel(value);
      type("変更");
      fireEvent.keyDown(textbox(), { key: "Enter", isComposing: true });
      expect(value.send).not.toHaveBeenCalled();
    });

    it("sends with the button and ignores an empty box", () => {
      const value = makeTestAskSession();
      renderPanel(value);
      expect(sendButton()).toBeDisabled();
      fireEvent.keyDown(textbox(), { key: "Enter" });
      expect(value.send).not.toHaveBeenCalled();
      type("   ");
      fireEvent.keyDown(textbox(), { key: "Enter" });
      expect(value.send).not.toHaveBeenCalled();
      type("Is this safe?");
      expect(sendButton()).toBeEnabled();
      fireEvent.click(sendButton());
      expect(value.send).toHaveBeenCalledWith("Is this safe?");
    });

    it("is locked with its reason while the review is read-only", () => {
      const value = makeTestAskSession();
      renderPanel(value, { readOnly: true, initialDraft: "Hello" });
      expect(textbox()).toBeDisabled();
      expect(sendButton()).toBeDisabled();
      expect(screen.getByText(/loading or offline/)).toBeInTheDocument();
      fireEvent.keyDown(textbox(), { key: "Enter" });
      expect(value.send).not.toHaveBeenCalled();
    });

    it("is locked with its reason when the chat is unavailable", () => {
      const value = makeTestAskSession({ available: false });
      renderPanel(value, { initialDraft: "Hello" });
      expect(textbox()).toBeDisabled();
      expect(sendButton()).toBeDisabled();
      expect(screen.getByText(/no agent can start a chat/)).toBeInTheDocument();
      expect(value.send).not.toHaveBeenCalled();
    });

    it("holds the send while a message is on its way or the agent is answering", () => {
      for (const state of [{ starting: true }, { busy: true }]) {
        const value = makeTestAskSession(state);
        const view = renderPanel(value, { initialDraft: "Another question" });
        expect(sendButton()).toBeDisabled();
        fireEvent.keyDown(textbox(), { key: "Enter" });
        expect(value.send).not.toHaveBeenCalled();
        expect(textbox()).toHaveValue("Another question");
        view.unmount();
      }
    });

    it("keeps the draft when the chat is closed and opened again", () => {
      renderPanel(makeTestAskSession());
      type("Unsent thought");
      fireEvent.click(screen.getByRole("button", { name: "toggle chat" }));
      expect(screen.queryByPlaceholderText("Ask about this pull request")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "toggle chat" }));
      expect(textbox()).toHaveValue("Unsent thought");
    });
  });

  describe("page variant", () => {
    it("has no title row of its own, since the page header carries it", () => {
      renderPanel(makeTestAskSession(), { variant: "page" });
      expect(screen.queryByRole("heading", { name: "Ask about PR #42" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Open as thread" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Close chat" })).not.toBeInTheDocument();
      expect(textbox()).toBeEnabled();
    });

    it("still renders the thread pane once the thread exists", () => {
      renderPanel(makeTestAskSession({ threadId: "thread-1" }), { variant: "page" });
      expect(screen.getByTestId("thread-pane")).toHaveAttribute("data-thread", "thread-1");
    });
  });
});
