import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ContextMenu, ContextMenuSurface } from "./ContextMenu";

const dragState = { isDragging: false };
const draggableInputs: unknown[] = [];

vi.mock("@dnd-kit/react", () => ({
  useDraggable: (input: unknown) => {
    draggableInputs.push(input);
    return { isDragging: dragState.isDragging, ref: () => {} };
  },
}));

vi.hoisted(() => {
  class TestPointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "mouse";
    }
  }

  Object.defineProperty(globalThis, "PointerEvent", {
    configurable: true,
    value: TestPointerEvent,
  });
});

describe("ContextMenu", () => {
  it("does not wrap its child in an extra DOM element", () => {
    const { container } = render(
      <ContextMenu items={[]} onAction={vi.fn<(key: string) => void>()}>
        <button type="button">Row</button>
      </ContextMenu>,
    );

    expect(container.firstElementChild?.tagName).toBe("BUTTON");
    expect(screen.getByRole("button", { name: "Row" })).toBe(container.firstElementChild);
  });

  it("dispatches an item's trailing action without dispatching the row", async () => {
    const onAction = vi.fn<(key: string) => void>();
    render(
      <ContextMenu
        items={[
          {
            id: "run",
            label: "Run",
            endAction: { id: "stop", label: "Stop Run", icon: <span /> },
          },
        ]}
        onAction={onAction}
      >
        <button type="button">Row</button>
      </ContextMenu>,
    );

    fireEvent.contextMenu(screen.getByRole("button", { name: "Row" }));
    const stopButton = await screen.findByRole("button", { name: "Stop Run" });
    expect(stopButton).toHaveClass("[--button-bg-hover:var(--row-hover)]");
    fireEvent.pointerDown(stopButton, { pointerId: 1, pointerType: "mouse", button: 0 });
    fireEvent.pointerUp(stopButton, { pointerId: 1, pointerType: "mouse", button: 0 });
    fireEvent.click(stopButton);

    expect(onAction).toHaveBeenCalledWith("stop");
    expect(onAction).not.toHaveBeenCalledWith("run");
    await vi.waitFor(() => {
      expect(screen.queryByRole("menuitem", { name: "Run" })).not.toBeInTheDocument();
    });
  });

  describe("draggable rows", () => {
    const dragSource = {
      id: "new-thread-menu:p2",
      type: "new-thread",
      data: { type: "new-thread", projectId: "p2" },
    };

    function renderSurface(onClose: () => void, position: { x: number; y: number }) {
      return (
        <ContextMenuSurface
          position={position}
          items={[{ id: "p2", label: "Beta", dragSource }]}
          onAction={vi.fn<(key: string) => void>()}
          onClose={onClose}
        />
      );
    }

    it("registers the row as a drag source and marks it grabbable", async () => {
      dragState.isDragging = false;
      draggableInputs.length = 0;
      render(renderSurface(vi.fn<() => void>(), { x: 0, y: 0 }));

      const row = await screen.findByRole("menuitem", { name: "Beta" });
      expect(row).toHaveClass("cursor-grab");
      expect(draggableInputs).toContainEqual(dragSource);
    });

    it("hides the menu while a row is dragged and closes it on drop", async () => {
      dragState.isDragging = false;
      const onClose = vi.fn<() => void>();
      const { rerender } = render(renderSurface(onClose, { x: 0, y: 0 }));
      await screen.findByRole("menuitem", { name: "Beta" });

      // The dragged row keeps following the pointer (dnd-kit puts its feedback
      // in the top layer); the surface around it must not stay in the way.
      dragState.isDragging = true;
      rerender(renderSurface(onClose, { x: 0, y: 1 }));
      const menu = screen.getByRole("menu");
      await vi.waitFor(() => {
        expect(menu.closest(".opacity-0")).not.toBeNull();
      });
      expect(onClose).not.toHaveBeenCalled();
      // Still mounted: unmounting the dragged row would cancel the drag.
      expect(screen.getByRole("menuitem", { name: "Beta" })).toBeInTheDocument();

      dragState.isDragging = false;
      rerender(renderSurface(onClose, { x: 0, y: 2 }));
      await vi.waitFor(() => {
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("stacked ContextMenuSurface", () => {
    // Mirrors the real structure: the thread-row ContextMenu and the filter
    // subtree (overflow state + stacked surface) are siblings, so toggling
    // the overflow re-renders only the filter subtree — the thread-row menu
    // keeps its original closer registration, exactly like SortableThreadItem
    // vs SidebarProjectFilter in the flat thread list.
    function FilterHost() {
      const [overflow, setOverflow] = useState<{ x: number; y: number } | null>(null);
      return (
        <div role="menu">
          <button type="button" onClick={() => setOverflow({ x: 10, y: 10 })}>
            open-overflow
          </button>
          <button type="button" onClick={() => setOverflow(null)}>
            close-overflow
          </button>
          {overflow ? (
            <ContextMenuSurface
              position={overflow}
              items={[{ id: "b", label: "B item" }]}
              onAction={vi.fn<(key: string) => void>()}
              onClose={() => setOverflow(null)}
            />
          ) : null}
        </div>
      );
    }

    function Harness() {
      return (
        <>
          <ContextMenu
            items={[{ id: "a", label: "A item" }]}
            onAction={vi.fn<(key: string) => void>()}
          >
            <button type="button">row</button>
          </ContextMenu>
          <FilterHost />
        </>
      );
    }

    it("keeps a right-click menu dismissible after a stacked surface closes", async () => {
      render(<Harness />);

      fireEvent.contextMenu(screen.getByRole("button", { name: "row" }));
      expect(await screen.findByRole("menuitem", { name: "A item" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "open-overflow" }));
      expect(await screen.findByRole("menuitem", { name: "B item" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "A item" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "close-overflow" }));
      await vi.waitFor(() => {
        expect(screen.queryByRole("menuitem", { name: "B item" })).not.toBeInTheDocument();
      });

      fireEvent.mouseDown(document.body);

      // Dismissal runs through the window listener's setTimeout(0).
      await vi.waitFor(() => {
        expect(screen.queryByRole("menuitem", { name: "A item" })).not.toBeInTheDocument();
      });
    });

    it("dismisses a stacked surface when a new right-click menu opens", async () => {
      render(<Harness />);

      fireEvent.contextMenu(screen.getByRole("button", { name: "row" }));
      expect(await screen.findByRole("menuitem", { name: "A item" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "open-overflow" }));
      expect(await screen.findByRole("menuitem", { name: "B item" })).toBeInTheDocument();

      fireEvent.contextMenu(screen.getByRole("button", { name: "row" }));
      await vi.waitFor(() => {
        expect(screen.queryByRole("menuitem", { name: "B item" })).not.toBeInTheDocument();
      });
      expect(screen.getByRole("menuitem", { name: "A item" })).toBeInTheDocument();
    });
  });
});
