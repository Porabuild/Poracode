import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/renderer/testUtils/i18n";

const { openThread } = vi.hoisted(() => ({
  openThread: vi.fn<(id: string, options: { standalone: boolean }) => void>(),
}));
vi.mock("@/renderer/actions/threadActions", () => ({ openThread }));
import { ChatSidebarHeader } from "./ChatSidebarHeader";

const threads = [
  {
    id: "a",
    title: "Browser research",
    projectId: "repo-a",
    remoteServerId: "host",
    updatedAt: "2026-10-07T15:00:00Z",
  },
  {
    id: "b",
    title: "Home chat",
    projectId: "home",
    remoteServerId: "host",
    updatedAt: "2026-10-07T14:00:00Z",
  },
];
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("focused chat header", () => {
  it("opens a flat chat list from the centered title and selects only in this client", async () => {
    renderWithI18n(
      <ChatSidebarHeader threads={threads} selected={undefined} onNewChat={vi.fn<() => void>()} />,
    );
    expect(screen.getByRole("button", { name: "New chat" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Chats New chat" }));
    const item = await screen.findByRole("menuitem", { name: /^Home chat/ });
    expect(screen.getByRole("menuitem", { name: /^Browser research/ })).toBeTruthy();
    fireEvent.click(item);
    await waitFor(() => expect(openThread).toHaveBeenCalledWith("b", { standalone: true }));
  });

  it("filters titles without changing selection, shows relative time, and clears search on reopen", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-07T15:04:00Z"));
    renderWithI18n(
      <ChatSidebarHeader threads={threads} selected={undefined} onNewChat={vi.fn<() => void>()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Chats New chat" }));
    const input = await screen.findByRole("searchbox", { name: "Search recent chats" });
    expect(screen.getByText("4m")).toBeTruthy();
    expect(screen.getByText("1h")).toBeTruthy();
    fireEvent.change(input, { target: { value: "  HOME " } });
    expect(screen.queryByRole("menuitem", { name: /^Browser research/ })).toBeNull();
    expect(screen.getByRole("menuitem", { name: /^Home chat/ })).toBeTruthy();
    expect(openThread).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "missing" } });
    expect(screen.getByRole("status").textContent).toBe("No results");
    expect(screen.getByRole("menuitem", { name: "New chat" })).toBeTruthy();
    fireEvent.change(input, { target: { value: "home" } });
    fireEvent.click(screen.getByRole("menuitem", { name: /^Home chat/ }));
    await waitFor(() => expect(openThread).toHaveBeenCalledWith("b", { standalone: true }));
    fireEvent.click(screen.getByRole("button", { name: "Chats New chat" }));
    await screen.findByRole("menuitem", { name: /^Browser research/ });
    expect(screen.getByRole("searchbox", { name: "Search recent chats" })).toHaveValue("");
  });

  it("drives the list from search: arrows enter the menu and Enter opens the first match", async () => {
    const onNewChat = vi.fn<() => void>();
    renderWithI18n(
      <ChatSidebarHeader threads={threads} selected={threads[0]} onNewChat={onNewChat} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Chats Browser research" }));
    const input = await screen.findByRole("searchbox", { name: "Search recent chats" });
    expect(input).toHaveAttribute("aria-controls", screen.getByRole("menu").id);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "New chat" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: /^Browser research/ })).toHaveFocus();
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(screen.getByRole("menuitem", { name: /^Home chat/ })).toHaveFocus();
    input.focus();
    fireEvent.change(input, { target: { value: "home" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(openThread).toHaveBeenCalledWith("b", { standalone: true });
    expect(onNewChat).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("runs New chat on Enter with an empty search", async () => {
    const onNewChat = vi.fn<() => void>();
    renderWithI18n(
      <ChatSidebarHeader threads={threads} selected={undefined} onNewChat={onNewChat} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Chats New chat" }));
    const input = await screen.findByRole("searchbox", { name: "Search recent chats" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onNewChat).toHaveBeenCalledOnce();
    expect(openThread).not.toHaveBeenCalled();
  });

  it("disables both header controls while no host project is available", () => {
    renderWithI18n(
      <ChatSidebarHeader
        threads={[]}
        selected={undefined}
        onNewChat={vi.fn<() => void>()}
        isDisabled
      />,
    );
    expect(screen.getByRole("button", { name: "Chats New chat" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "New chat" })).toBeDisabled();
  });

  it("starts a fresh composer with the plus button", () => {
    const onNewChat = vi.fn<() => void>();
    renderWithI18n(
      <ChatSidebarHeader threads={threads} selected={threads[0]} onNewChat={onNewChat} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    expect(onNewChat).toHaveBeenCalledOnce();
    expect(openThread).not.toHaveBeenCalled();
  });
});
