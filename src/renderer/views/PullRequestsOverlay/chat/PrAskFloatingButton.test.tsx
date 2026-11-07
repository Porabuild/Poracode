// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { makeTestAskChat } from "../testing/prDetailTestScope";
import { PrAskFloatingButton } from "./PrAskFloatingButton";

const NAME = "Ask about this pull request";

describe("PrAskFloatingButton", () => {
  it("opens the chat on press", () => {
    const chat = makeTestAskChat();
    render(<PrAskFloatingButton chat={chat} />);
    fireEvent.click(screen.getByRole("button", { name: NAME }));
    expect(chat.setOpen).toHaveBeenCalledWith(true);
  });

  it("is hidden while the chat is open", () => {
    render(<PrAskFloatingButton chat={makeTestAskChat({ open: true })} />);
    expect(screen.queryByRole("button", { name: NAME })).not.toBeInTheDocument();
  });

  it("is hidden when no agent can start a chat", () => {
    render(<PrAskFloatingButton chat={makeTestAskChat({ available: false })} />);
    expect(screen.queryByRole("button", { name: NAME })).not.toBeInTheDocument();
  });
});
