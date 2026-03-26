import React, { Children, type ReactNode, useEffect, useRef, useState } from "react";

const MIN_PANE_PERCENT = 15;

function equalSizes(count: number): number[] {
  return Array.from({ length: count }, () => 100 / count);
}

export function SplitPaneContainer(props: { children: ReactNode }) {
  const items = Children.toArray(props.children).filter(Boolean);
  const count = items.length;
  const [sizes, setSizes] = useState(() => equalSizes(count));
  const [resizingIndex, setResizingIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ startX: 0, leftStart: 0, rightStart: 0, index: 0 });

  const childKeys = items
    .map((child) =>
      typeof child === "object" && child !== null && "key" in child
        ? (child as React.ReactElement).key
        : null,
    )
    .join(",");

  useEffect(() => {
    setSizes(equalSizes(count));
  }, [count, childKeys]);

  useEffect(() => {
    if (resizingIndex === null) return;

    function onMouseMove(e: MouseEvent) {
      const container = containerRef.current;
      if (!container) return;
      const totalWidth = container.offsetWidth;
      const deltaPx = e.clientX - dragRef.current.startX;
      const deltaPercent = (deltaPx / totalWidth) * 100;

      const newLeft = dragRef.current.leftStart + deltaPercent;
      const newRight = dragRef.current.rightStart - deltaPercent;

      if (newLeft < MIN_PANE_PERCENT || newRight < MIN_PANE_PERCENT) return;

      setSizes((prev) => {
        const next = [...prev];
        next[dragRef.current.index] = newLeft;
        next[dragRef.current.index + 1] = newRight;
        return next;
      });
    }

    function onMouseUp() {
      setResizingIndex(null);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [resizingIndex]);

  function handleResizeStart(e: React.MouseEvent, index: number) {
    e.preventDefault();
    dragRef.current = {
      startX: e.clientX,
      leftStart: sizes[index]!,
      rightStart: sizes[index + 1]!,
      index,
    };
    setResizingIndex(index);
  }

  if (count <= 1) {
    return <>{items[0]}</>;
  }

  return (
    <div
      ref={containerRef}
      className={`flex h-full min-h-0 w-full ${resizingIndex !== null ? "select-none" : ""}`}
    >
      {items.map((child, i) => (
        <div key={i} className="contents">
          <div
            className="h-full min-h-0 min-w-0 overflow-hidden"
            style={{ flexBasis: `${sizes[i]}%`, flexGrow: 0, flexShrink: 0 }}
          >
            {child}
          </div>
          {i < count - 1 && (
            <div
              className="lightcode-pane-divider"
              onMouseDown={(e) => handleResizeStart(e, i)}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize pane"
            />
          )}
        </div>
      ))}
      {resizingIndex !== null && <div className="fixed inset-0 z-50 cursor-col-resize" />}
    </div>
  );
}
