import { render } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { DragDropProvider, useDragDropManager, useDraggable, useDroppable } from "@dnd-kit/react";
import type { Draggable, Droppable } from "@dnd-kit/dom";
import { describe, expect, it } from "vitest";
import { useClearDndEntityElementsOnUnmount } from "./dndEntityCleanup";

interface CapturedEntities {
  draggable: Draggable | undefined;
  droppable: Droppable | undefined;
}

function ProbeHarness(props: {
  showItems: boolean;
  onCapture: (next: Partial<CapturedEntities>) => void;
}) {
  return (
    <DragDropProvider>
      <RegistryReader onCapture={props.onCapture} />
      {props.showItems ? <RefObjectDndItems /> : null}
    </DragDropProvider>
  );
}

function RegistryReader(props: { onCapture: (next: Partial<CapturedEntities>) => void }) {
  const manager = useDragDropManager();
  const onCapture = props.onCapture;
  useEffect(() => {
    const draggables = Array.from(manager?.registry.draggables.value ?? []);
    const droppables = Array.from(manager?.registry.droppables.value ?? []);
    if (draggables[0] || droppables[0]) {
      onCapture({
        ...(draggables[0] ? { draggable: draggables[0] } : {}),
        ...(droppables[0] ? { droppable: droppables[0] } : {}),
      });
    }
  });
  return null;
}

function RefObjectDndItems() {
  const dragRowRef = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLButtonElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const draggableResult = useDraggable({
    id: "probe-draggable",
    element: dragRowRef,
    handle: dragHandleRef,
  });
  useClearDndEntityElementsOnUnmount(draggableResult);

  const droppableResult = useDroppable({
    id: "probe-droppable",
    element: dropZoneRef,
  });
  useClearDndEntityElementsOnUnmount(droppableResult);

  return (
    <div>
      <div ref={dragRowRef} data-testid="drag-row">
        <button ref={dragHandleRef} type="button">
          Handle
        </button>
      </div>
      <div ref={dropZoneRef} data-testid="drop-zone" />
    </div>
  );
}

describe("useClearDndEntityElementsOnUnmount", () => {
  it("clears RefObject-backed Draggable and Droppable DOM elements on unmount without Proxy private-field errors", () => {
    const captured: CapturedEntities = {
      draggable: undefined,
      droppable: undefined,
    };
    const handleCapture = (next: Partial<CapturedEntities>) => {
      if (next.draggable) {
        captured.draggable = next.draggable;
      }
      if (next.droppable) {
        captured.droppable = next.droppable;
      }
    };

    const { rerender } = render(<ProbeHarness showItems={true} onCapture={handleCapture} />);

    expect(captured.draggable?.element).toBeInstanceOf(HTMLElement);
    expect(captured.draggable?.handle).toBeInstanceOf(HTMLElement);
    expect(captured.droppable?.element).toBeInstanceOf(HTMLElement);

    expect(() => {
      rerender(<ProbeHarness showItems={false} onCapture={handleCapture} />);
    }).not.toThrow();

    expect(captured.draggable?.element).toBeUndefined();
    expect(captured.draggable?.handle).toBeUndefined();
    expect(captured.droppable?.element).toBeUndefined();
  });
});
