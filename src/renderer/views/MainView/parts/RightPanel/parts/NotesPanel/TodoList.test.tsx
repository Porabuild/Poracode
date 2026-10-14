// @vitest-environment jsdom
import { act, createEvent, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useNotesStore } from "@/renderer/state/notesStore";
import { setTodoActionsListener, type TodoActionsRequest } from "./todoActions";
import { TodoList } from "./TodoList";

const PROJECT_ID = "project-1";
const originalPoracode = window.poracode;

describe("TodoList", () => {
  beforeEach(() => {
    useNotesStore.setState({
      byProject: {
        [PROJECT_ID]: {
          status: "ready",
          doc: null,
          todos: [],
        },
      },
    });
  });

  afterEach(() => {
    window.poracode = originalPoracode;
    setTodoActionsListener(null);
  });

  it("commits consecutive touch-entered to-dos with the visible add button", () => {
    render(<TodoList projectId={PROJECT_ID} />);

    const input = screen.getByPlaceholderText("Add a to-do…");
    const add = screen.getByRole("button", { name: "Add to-do" });
    expect(add).toBeDisabled();

    fireEvent.change(input, { target: { value: "First task" } });
    expect(add).toBeEnabled();
    fireEvent.click(add);

    expect(input).toHaveValue("");
    expect(useNotesStore.getState().byProject[PROJECT_ID]?.todos).toHaveLength(1);

    fireEvent.change(input, { target: { value: "Second task" } });
    fireEvent.click(add);

    expect(useNotesStore.getState().byProject[PROJECT_ID]?.todos.map((todo) => todo.text)).toEqual([
      "First task",
      "Second task",
    ]);
  });

  it("opens the mobile action menu from a touch hold on the to-do text", () => {
    window.poracode = { appVersion: "remote" } as typeof window.poracode;
    useNotesStore.setState({
      byProject: {
        [PROJECT_ID]: {
          status: "ready",
          doc: null,
          todos: [
            {
              id: "todo-1",
              text: "Fix the flaky test",
              done: false,
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
      },
    });
    const openActions = vi.fn<(request: TodoActionsRequest) => void>();
    setTodoActionsListener(openActions);
    render(<TodoList projectId={PROJECT_ID} />);

    const todoText = screen.getByRole("button", { name: "Fix the flaky test" });
    const touchStart = createEvent.pointerDown(todoText, {
      pointerType: "touch",
      isPrimary: true,
      clientX: 0,
      clientY: 0,
    });
    fireEvent(todoText, touchStart);
    expect(touchStart.defaultPrevented).toBe(false);

    const selectionStart = new Event("selectstart", { bubbles: true, cancelable: true });
    todoText.dispatchEvent(selectionStart);
    expect(selectionStart.defaultPrevented).toBe(true);

    fireEvent.contextMenu(todoText);
    expect(openActions).toHaveBeenCalledExactlyOnceWith({
      text: "Fix the flaky test",
      requestRename: expect.any(Function),
      requestNewThread: expect.any(Function),
      requestRemove: expect.any(Function),
    });

    act(() => {
      openActions.mock.calls[0]![0].requestRename();
    });
    expect(screen.getByDisplayValue("Fix the flaky test")).toHaveFocus();
  });
});
