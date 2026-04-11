import { createContext, useContext, useEffect, useRef, useState, useMemo } from "react";
import { DragDropProvider, PointerSensor, KeyboardSensor } from "@dnd-kit/react";
import { PointerActivationConstraints } from "@dnd-kit/dom";
import { isSortable } from "@dnd-kit/react/sortable";

// ── Drag source types ──────────────────────────────────────────
export type DragSourceData =
  | { type: "project"; projectId: string }
  | { type: "thread"; threadId: string; projectId: string; worktreePath?: string }
  | { type: "worktree-group"; worktreePath: string; projectId: string; threadIds: string[] }
  | { type: "pane"; paneId: string }
  | { type: "new-thread"; projectId: string };

// ── Pane drop indicator ────────────────────────────────────────
export type PaneDropIndicator =
  | { kind: "replace"; paneIndex: number }
  | { kind: "insert"; index: number };

// ── DnD context ────────────────────────────────────────────────
type DndContextValue = {
  source: DragSourceData | null;
  paneIndicator: PaneDropIndicator | null;
};

const DndContext = createContext<DndContextValue>({
  source: null,
  paneIndicator: null,
});

export function useDndContext() {
  return useContext(DndContext);
}

// ── Placement helpers ──────────────────────────────────────────
function getHorizontalZone(el: Element, pointerX: number): "left" | "center" | "right" {
  const rect = el.getBoundingClientRect();
  const fraction = (pointerX - rect.left) / rect.width;
  return fraction < 0.15 ? "left" : fraction > 0.85 ? "right" : "center";
}

function computePaneIndicator(
  sourceType: string,
  paneIndex: number,
  paneCount: number,
  el: Element,
  pointerX: number,
  sourceThreadId?: string,
  targetThreadId?: string,
): PaneDropIndicator | null {
  const zone = getHorizontalZone(el, pointerX);

  if (sourceType === "pane") {
    if (sourceThreadId === targetThreadId) return null;
    // If we have room (max 3 panes), allow inserting next to another pane
    if (paneCount < 3 && zone !== "center") {
      return { kind: "insert", index: zone === "left" ? paneIndex : paneIndex + 1 };
    }
    return { kind: "replace", paneIndex };
  }

  // Sidebar thread → zone-based
  if (zone === "center" || paneCount >= 3) {
    return { kind: "replace", paneIndex };
  }
  return { kind: "insert", index: zone === "left" ? paneIndex : paneIndex + 1 };
}

// ── Provider component ─────────────────────────────────────────
export function AppDndProvider(props: {
  children: React.ReactNode;
  onSidebarSortEnd: (
    source: DragSourceData,
    initialIndex: number,
    finalIndex: number,
    initialGroup: string | undefined,
    finalGroup: string | undefined,
  ) => void;
  onPaneDrop: (source: DragSourceData, target: PaneDropIndicator | null) => void;
  paneThreadIds: string[];
}) {
  const [source, setSource] = useState<DragSourceData | null>(null);
  const [paneIndicator, setPaneIndicator] = useState<PaneDropIndicator | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const paneIndicatorRef = useRef<PaneDropIndicator | null>(null);
  const paneThreadIdsRef = useRef(props.paneThreadIds);
  paneThreadIdsRef.current = props.paneThreadIds;

  // Track the current pane target so onDragMove can recompute the zone
  const activePaneTarget = useRef<{
    paneIndex: number;
    element: Element;
    sourceType: string;
    sourceThreadId?: string;
  } | null>(null);

  // Track pointer with capture phase so it works during dnd-kit's pointer capture
  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      pointer.current.x = e.clientX;
      pointer.current.y = e.clientY;
    }
    document.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
    return () => document.removeEventListener("pointermove", onPointerMove, { capture: true });
  }, []);

  function updatePaneIndicator() {
    const t = activePaneTarget.current;
    if (!t) return;
    const paneCount = paneThreadIdsRef.current.length;
    const targetThreadId = paneThreadIdsRef.current[t.paneIndex];
    const next = computePaneIndicator(
      t.sourceType,
      t.paneIndex,
      paneCount,
      t.element,
      pointer.current.x,
      t.sourceThreadId,
      targetThreadId,
    );
    setPaneIndicator(next);
    paneIndicatorRef.current = next;
  }

  const sensors = useMemo(
    () => [
      PointerSensor.configure({
        activationConstraints: [new PointerActivationConstraints.Distance({ value: 5 })],
      }),
      KeyboardSensor,
    ],
    [],
  );

  return (
    <DndContext.Provider value={{ source, paneIndicator }}>
      <DragDropProvider
        sensors={sensors}
        onDragStart={(event) => {
          const data = event.operation.source?.data as DragSourceData | undefined;
          if (data) setSource(data);
        }}
        onDragMove={() => {
          // Continuously recompute pane indicator as pointer moves within a pane
          if (activePaneTarget.current) {
            updatePaneIndicator();
          }
        }}
        onDragOver={(event) => {
          const target = event.operation.target;
          const data = event.operation.source?.data as DragSourceData | undefined;
          if (!data || !target) {
            activePaneTarget.current = null;
            setPaneIndicator(null);
            paneIndicatorRef.current = null;
            return;
          }

          const targetData = target.data as Record<string, unknown> | undefined;
          const targetType = targetData?.type as string | undefined;

          if (
            targetType === "pane-drop-zone" &&
            (data.type === "thread" || data.type === "pane" || data.type === "new-thread")
          ) {
            const paneIndex = targetData?.paneIndex as number;
            const el = target.element;
            if (el) {
              const sourceThreadId =
                data.type === "thread"
                  ? data.threadId
                  : data.type === "pane"
                    ? data.paneId
                    : undefined;
              activePaneTarget.current = {
                paneIndex,
                element: el,
                sourceType: data.type,
                ...(sourceThreadId !== undefined ? { sourceThreadId } : {}),
              };
              updatePaneIndicator();
            }
            return;
          }

          // Not over a pane
          activePaneTarget.current = null;
          setPaneIndicator(null);
          paneIndicatorRef.current = null;
        }}
        onDragEnd={(event) => {
          const src = event.operation.source;
          const data = src?.data as DragSourceData | undefined;

          if (!event.canceled && data) {
            if (
              (data.type === "pane" || data.type === "thread" || data.type === "new-thread") &&
              paneIndicatorRef.current
            ) {
              props.onPaneDrop(data, paneIndicatorRef.current);
            } else if (src && isSortable(src) && data.type !== "pane") {
              props.onSidebarSortEnd(
                data,
                src.initialIndex,
                src.index,
                src.initialGroup as string | undefined,
                src.group as string | undefined,
              );
            }
          }

          activePaneTarget.current = null;
          setSource(null);
          setPaneIndicator(null);
          paneIndicatorRef.current = null;
        }}
      >
        {props.children}
      </DragDropProvider>
    </DndContext.Provider>
  );
}
