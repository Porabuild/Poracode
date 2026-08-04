// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { openTodoActions } from "@/renderer/views/MainView/parts/RightPanel/parts/NotesPanel/todoActions";
import { TodoActionsSheet } from "./TodoActionsSheet";

const routerMock = vi.hoisted(() => ({
  navigate: vi.fn<(options: unknown) => void>(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => routerMock.navigate,
}));

describe("TodoActionsSheet", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("starts a seeded draft and opens the mobile new-thread route", () => {
    const requestRename = vi.fn<() => void>();
    const requestNewThread = vi.fn<() => void>();
    const requestRemove = vi.fn<() => void>();
    render(<TodoActionsSheet />);

    act(() => {
      openTodoActions({
        text: "Fix the flaky test",
        requestRename,
        requestNewThread,
        requestRemove,
      });
    });

    expect(screen.getByRole("dialog", { name: "To-dos" })).toBeInTheDocument();
    expect(screen.getByText("Fix the flaky test")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start a new thread from this to-do" }));

    expect(requestRename).not.toHaveBeenCalled();
    expect(requestNewThread).toHaveBeenCalledOnce();
    expect(requestRemove).not.toHaveBeenCalled();
    expect(routerMock.navigate).toHaveBeenCalledWith({ to: "/new" });
  });

  it("offers the existing delete action from the same touch menu", () => {
    const requestRemove = vi.fn<() => void>();
    render(<TodoActionsSheet />);

    act(() => {
      openTodoActions({
        text: "Temporary test item",
        requestRename: vi.fn<() => void>(),
        requestNewThread: vi.fn<() => void>(),
        requestRemove,
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete to-do" }));

    expect(requestRemove).toHaveBeenCalledOnce();
    expect(routerMock.navigate).not.toHaveBeenCalled();
  });

  it("opens the to-do's inline rename editor", () => {
    const requestRename = vi.fn<() => void>();
    render(<TodoActionsSheet />);

    act(() => {
      openTodoActions({
        text: "Rename this item",
        requestRename,
        requestNewThread: vi.fn<() => void>(),
        requestRemove: vi.fn<() => void>(),
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Rename" }));

    expect(requestRename).toHaveBeenCalledOnce();
    expect(routerMock.navigate).not.toHaveBeenCalled();
  });
});
