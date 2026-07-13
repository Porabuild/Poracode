import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { Plugins } from "@dnd-kit/abstract";
import { Feedback, PointerActivationConstraints } from "@dnd-kit/dom";
import { DragDropProvider, DragOverlay, KeyboardSensor, PointerSensor } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import type { PaneLayout, PaneLayoutAxis, PaneLayoutInsertTarget } from "@/shared/paneLayout";
import { findPanePath } from "@/shared/paneLayout";
import { useFileEditorStore } from "./state/fileEditorStore";
import { useThread } from "./state/useThread";

export type DragSourceData =
  | { type: "project"; projectId: string }
  | {
      type: "thread";
      threadId: string;
      projectId: string;
      worktreePath?: string;
      sortGroup?: string;
      sortIndex?: number;
    }
  | { type: "worktree-group"; worktreePath: string; projectId: string; threadIds: string[] }
  | { type: "pane"; paneId: string }
  | { type: "new-thread"; projectId: string }
  | {
      type: "sidebar-panel";
      panel: "files" | "git" | "terminal";
      projectId: string;
      worktreePath?: string;
    }
  | { type: "editor-tab"; path: string };

export type PaneDropIndicator =
  | { kind: "replace"; paneId: string }
  | { kind: "split-pane"; paneId: string; edge: "left" | "right" | "top" | "bottom" }
  | { kind: "insert-split"; target: PaneLayoutInsertTarget; zoneId: string };

type DndSnapshot = {
  source: DragSourceData | null;
  paneIndicator: PaneDropIndicator | null;
  mainPanelDropActive: boolean;
};
const EMPTY_DND_SNAPSHOT: DndSnapshot = {
  source: null,
  paneIndicator: null,
  mainPanelDropActive: false,
};

let dndSnapshot: DndSnapshot = EMPTY_DND_SNAPSHOT;
const dndListeners = new Set<() => void>();

function subscribeDndStore(listener: () => void) {
  dndListeners.add(listener);
  return () => dndListeners.delete(listener);
}

function emitDndStore() {
  for (const listener of dndListeners) {
    listener();
  }
}

function updateDndSnapshot(nextSnapshot: DndSnapshot) {
  if (
    dndSnapshot.source === nextSnapshot.source &&
    dndSnapshot.paneIndicator === nextSnapshot.paneIndicator &&
    dndSnapshot.mainPanelDropActive === nextSnapshot.mainPanelDropActive
  ) {
    return;
  }
  dndSnapshot = nextSnapshot;
  emitDndStore();
}

function setDragSource(source: DragSourceData | null) {
  updateDndSnapshot({ ...dndSnapshot, source });
}

function setPaneIndicatorState(paneIndicator: PaneDropIndicator | null) {
  updateDndSnapshot({ ...dndSnapshot, paneIndicator });
}

function setMainPanelDropActive(mainPanelDropActive: boolean) {
  updateDndSnapshot({ ...dndSnapshot, mainPanelDropActive });
}

function useDndSelector<T>(selector: (snapshot: DndSnapshot) => T) {
  return useSyncExternalStore(
    subscribeDndStore,
    () => selector(dndSnapshot),
    () => selector(EMPTY_DND_SNAPSHOT),
  );
}

export function useDragSource() {
  return useDndSelector((snapshot) => snapshot.source);
}

export function useIsDraggingPane(paneId: string) {
  return useDndSelector(
    (snapshot) => snapshot.source?.type === "pane" && snapshot.source.paneId === paneId,
  );
}

export function useIsDraggingThread(threadId: string) {
  return useDndSelector(
    (snapshot) => snapshot.source?.type === "thread" && snapshot.source.threadId === threadId,
  );
}

export function useIsDraggingProject(projectId: string) {
  return useDndSelector(
    (snapshot) => snapshot.source?.type === "project" && snapshot.source.projectId === projectId,
  );
}

export function useIsDraggingWorktreeGroup(worktreePath: string) {
  return useDndSelector(
    (snapshot) =>
      snapshot.source?.type === "worktree-group" && snapshot.source.worktreePath === worktreePath,
  );
}

export function useIsDraggingEditorTab(path: string) {
  return useDndSelector(
    (snapshot) => snapshot.source?.type === "editor-tab" && snapshot.source.path === path,
  );
}

export function useIsMainPanelDropActive() {
  return useDndSelector((snapshot) => snapshot.mainPanelDropActive);
}

export function usePaneDropIndicatorState(paneId: string) {
  return useDndSelector((snapshot) => {
    const paneIndicator = snapshot.paneIndicator;
    if (!paneIndicator) return false as const;
    if (paneIndicator.kind === "replace" && paneIndicator.paneId === paneId)
      return "replace" as const;
    if (paneIndicator.kind !== "split-pane" || paneIndicator.paneId !== paneId)
      return false as const;
    if (paneIndicator.edge === "left") return "insert-left" as const;
    if (paneIndicator.edge === "right") return "insert-right" as const;
    if (paneIndicator.edge === "top") return "insert-top" as const;
    return "insert-bottom" as const;
  });
}

export function useIsInsertSplitHighlighted(zoneId: string) {
  return useDndSelector((snapshot) => {
    const paneIndicator = snapshot.paneIndicator;
    return paneIndicator?.kind === "insert-split" && paneIndicator.zoneId === zoneId;
  });
}

export function useIsRootInsertHighlighted(zoneId: string) {
  return useDndSelector((snapshot) => {
    const paneIndicator = snapshot.paneIndicator;
    return paneIndicator?.kind === "insert-split" && paneIndicator.zoneId === zoneId;
  });
}

const EDGE_THRESHOLD = 0.15;

export type MainPanelDropSource = Extract<
  DragSourceData,
  { type: "project" | "worktree-group" | "sidebar-panel" }
>;

let mainPanelDropZoneElement: HTMLElement | null = null;

/**
 * Registered by `MainPanelDropZone` via a ref callback. Module-level so the
 * dnd handlers can hit-test pointer position against the live element rect
 * without doing a `document.querySelector` on every drag move.
 */
export function setMainPanelDropZoneElement(element: HTMLElement | null): void {
  mainPanelDropZoneElement = element;
}

function isMainPanelDropSource(source: DragSourceData | undefined): source is MainPanelDropSource {
  return (
    source?.type === "sidebar-panel" ||
    source?.type === "project" ||
    source?.type === "worktree-group"
  );
}

type PaneDragSource = Extract<DragSourceData, { type: "pane" }>;

function isPaneDragSource(source: DragSourceData | undefined): source is PaneDragSource {
  return source?.type === "pane";
}

function isPointerInMainPanelDropZone(pointerX: number, pointerY: number): boolean {
  const element = mainPanelDropZoneElement;
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return (
    pointerX >= rect.left &&
    pointerX <= rect.right &&
    pointerY >= rect.top &&
    pointerY <= rect.bottom
  );
}

function getEdgeZone(
  element: Element,
  pointerX: number,
  pointerY: number,
): "left" | "right" | "top" | "bottom" | "center" {
  const rect = element.getBoundingClientRect();
  const xFrac = (pointerX - rect.left) / rect.width;
  const yFrac = (pointerY - rect.top) / rect.height;

  const distLeft = xFrac;
  const distRight = 1 - xFrac;
  const distTop = yFrac;
  const distBottom = 1 - yFrac;
  const minDist = Math.min(distLeft, distRight, distTop, distBottom);

  if (minDist > EDGE_THRESHOLD) return "center";
  if (minDist === distLeft) return "left";
  if (minDist === distRight) return "right";
  if (minDist === distTop) return "top";
  return "bottom";
}

function computePaneIndicator(
  sourceType: string,
  paneId: string,
  layout: PaneLayout,
  element: Element,
  pointerX: number,
  pointerY: number,
  sourcePaneId?: string,
): PaneDropIndicator | null {
  const zone = getEdgeZone(element, pointerX, pointerY);
  if (sourceType === "pane" && sourcePaneId === paneId) return null;
  if (zone === "center") {
    return { kind: "replace", paneId };
  }
  const siblingInsert = resolveSiblingInsertTarget(layout, paneId, zone);
  if (siblingInsert) {
    return siblingInsert;
  }
  return { kind: "split-pane", paneId, edge: zone };
}

function getNodeAtPath(layout: PaneLayout, path: number[]): PaneLayout | null {
  let current: PaneLayout = layout;
  for (const index of path) {
    if (current.kind !== "split") return null;
    const next = current.children[index];
    if (!next) return null;
    current = next;
  }
  return current;
}

function resolveSiblingInsertTarget(
  layout: PaneLayout,
  paneId: string,
  zone: "left" | "right" | "top" | "bottom",
): Extract<PaneDropIndicator, { kind: "insert-split" }> | null {
  const panePath = findPanePath(layout, paneId);
  if (!panePath || panePath.length === 0) return null;

  const parentPath = panePath.slice(0, -1);
  const parent = getNodeAtPath(layout, parentPath);
  if (parent?.kind !== "split") return null;

  const childIndex = panePath[panePath.length - 1]!;
  if (zone === "left" && parent.axis === "vertical" && childIndex > 0) {
    const index = childIndex;
    return {
      kind: "insert-split",
      target: { path: parentPath, axis: "vertical", index },
      zoneId: `split-divider:vertical:${parentPath.join("-")}:${index}`,
    };
  }
  if (zone === "right" && parent.axis === "vertical" && childIndex < parent.children.length - 1) {
    const index = childIndex + 1;
    return {
      kind: "insert-split",
      target: { path: parentPath, axis: "vertical", index },
      zoneId: `split-divider:vertical:${parentPath.join("-")}:${index}`,
    };
  }
  if (zone === "top" && parent.axis === "horizontal" && childIndex > 0) {
    const index = childIndex;
    return {
      kind: "insert-split",
      target: { path: parentPath, axis: "horizontal", index },
      zoneId: `split-divider:horizontal:${parentPath.join("-")}:${index}`,
    };
  }
  if (
    zone === "bottom" &&
    parent.axis === "horizontal" &&
    childIndex < parent.children.length - 1
  ) {
    const index = childIndex + 1;
    return {
      kind: "insert-split",
      target: { path: parentPath, axis: "horizontal", index },
      zoneId: `split-divider:horizontal:${parentPath.join("-")}:${index}`,
    };
  }

  return null;
}

export function AppDndProvider(props: {
  children: React.ReactNode;
  onSidebarSortEnd: (
    source: DragSourceData,
    initialIndex: number,
    finalIndex: number,
    initialGroup: string | undefined,
    finalGroup: string | undefined,
    target: DragSourceData | null,
  ) => void;
  onPaneDrop: (source: DragSourceData, target: PaneDropIndicator | null) => void;
  onMainPanelDrop: (source: MainPanelDropSource) => void;
  paneLayout: PaneLayout;
}) {
  const pointer = useRef({ x: 0, y: 0 });
  const paneIndicatorRef = useRef<PaneDropIndicator | null>(null);
  const mainPanelDropActiveRef = useRef(false);
  const sidebarSortTargetRef = useRef<DragSourceData | null>(null);

  const activePaneTarget = useRef<{
    paneId: string;
    element: Element;
    sourceType: string;
    sourcePaneId?: string;
  } | null>(null);

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      pointer.current.x = event.clientX;
      pointer.current.y = event.clientY;
    }
    document.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
    return () => document.removeEventListener("pointermove", onPointerMove, { capture: true });
  }, []);

  function updatePaneIndicator() {
    const target = activePaneTarget.current;
    if (!target) return;
    const next = computePaneIndicator(
      target.sourceType,
      target.paneId,
      props.paneLayout,
      target.element,
      pointer.current.x,
      pointer.current.y,
      target.sourcePaneId,
    );
    setPaneIndicatorState(next);
    paneIndicatorRef.current = next;
  }

  function updateMainPanelDropState(source: DragSourceData | undefined) {
    const isActive =
      isMainPanelDropSource(source) &&
      isPointerInMainPanelDropZone(pointer.current.x, pointer.current.y);
    mainPanelDropActiveRef.current = isActive;
    setMainPanelDropActive(isActive);
    return isActive;
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

  // Pane drags use a separate overlay (below), so disable the default tween:
  // moving the real pane element would reparent its chat scroller and reset
  // `scrollTop`. Sidebar sortables keep default feedback.
  const plugins = useMemo(
    () => (defaults: Plugins) =>
      defaults.map((plugin) =>
        plugin === Feedback ? Feedback.configure({ dropAnimation: null }) : plugin,
      ),
    [],
  );

  return (
    <DragDropProvider
      sensors={sensors}
      plugins={plugins}
      onDragStart={(event) => {
        const data = event.operation.source?.data as DragSourceData | undefined;
        if (data) setDragSource(data);
        sidebarSortTargetRef.current = null;
        mainPanelDropActiveRef.current = false;
        // Lets CSS opt chat scrollers out of dnd-kit's AutoScroller ancestor scan.
        document.documentElement.dataset.poracodeDragActive = "true";
      }}
      onDragMove={(event) => {
        const data = event.operation.source?.data as DragSourceData | undefined;
        if (isMainPanelDropSource(data)) {
          updateMainPanelDropState(data);
          return;
        }
        if (activePaneTarget.current) {
          updatePaneIndicator();
        }
      }}
      onDragOver={(event) => {
        const target = event.operation.target;
        const data = event.operation.source?.data as DragSourceData | undefined;
        if (isMainPanelDropSource(data) && updateMainPanelDropState(data)) {
          activePaneTarget.current = null;
          setPaneIndicatorState(null);
          paneIndicatorRef.current = null;
          return;
        }
        if (!data || !target) {
          activePaneTarget.current = null;
          setPaneIndicatorState(null);
          paneIndicatorRef.current = null;
          mainPanelDropActiveRef.current = false;
          setMainPanelDropActive(false);
          return;
        }

        const targetData = target.data as Record<string, unknown> | undefined;
        const targetType = targetData?.type as string | undefined;

        mainPanelDropActiveRef.current = false;
        setMainPanelDropActive(false);

        if (
          (data.type === "project" || data.type === "thread" || data.type === "worktree-group") &&
          (targetType === "project" || targetType === "thread" || targetType === "worktree-group")
        ) {
          const sidebarTarget = target.data as DragSourceData;
          const isSameTarget =
            (data.type === "project" &&
              sidebarTarget.type === "project" &&
              data.projectId === sidebarTarget.projectId) ||
            (data.type === "thread" &&
              sidebarTarget.type === "thread" &&
              data.threadId === sidebarTarget.threadId) ||
            (data.type === "worktree-group" &&
              sidebarTarget.type === "worktree-group" &&
              data.worktreePath === sidebarTarget.worktreePath);
          if (!isSameTarget) {
            sidebarSortTargetRef.current = sidebarTarget;
          }
        }

        if (
          targetType === "pane-drop-zone" &&
          (data.type === "thread" || data.type === "pane" || data.type === "new-thread")
        ) {
          const paneId = targetData?.paneId as string | undefined;
          const element = target.element;
          if (paneId && element) {
            const sourcePaneId =
              data.type === "thread"
                ? data.threadId
                : data.type === "pane"
                  ? data.paneId
                  : undefined;
            activePaneTarget.current = {
              paneId,
              element,
              sourceType: data.type,
              ...(sourcePaneId ? { sourcePaneId } : {}),
            };
            updatePaneIndicator();
          }
          return;
        }

        if (
          targetType === "pane-insert-zone" &&
          (data.type === "thread" || data.type === "pane" || data.type === "new-thread")
        ) {
          activePaneTarget.current = null;
          const axis = targetData?.axis as PaneLayoutAxis | undefined;
          const index = targetData?.index as number | undefined;
          const zoneId = targetData?.zoneId as string | undefined;
          const path = Array.isArray(targetData?.path) ? (targetData?.path as number[]) : undefined;
          if (
            path &&
            index !== undefined &&
            zoneId &&
            (axis === "horizontal" || axis === "vertical")
          ) {
            const next: PaneDropIndicator = {
              kind: "insert-split",
              target: { path, axis, index },
              zoneId,
            };
            setPaneIndicatorState(next);
            paneIndicatorRef.current = next;
          } else {
            setPaneIndicatorState(null);
            paneIndicatorRef.current = null;
          }
          return;
        }

        activePaneTarget.current = null;
        setPaneIndicatorState(null);
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
          } else if (isMainPanelDropSource(data) && updateMainPanelDropState(data)) {
            props.onMainPanelDrop(data);
          } else if (data.type === "editor-tab" && src && isSortable(src)) {
            useFileEditorStore.getState().reorderTabs(src.initialIndex, src.index);
          } else if (src && isSortable(src) && data.type !== "pane") {
            props.onSidebarSortEnd(
              data,
              src.initialIndex,
              src.index,
              src.initialGroup as string | undefined,
              src.group as string | undefined,
              sidebarSortTargetRef.current,
            );
          }
        }

        activePaneTarget.current = null;
        setDragSource(null);
        setPaneIndicatorState(null);
        setMainPanelDropActive(false);
        paneIndicatorRef.current = null;
        mainPanelDropActiveRef.current = false;
        sidebarSortTargetRef.current = null;
        delete document.documentElement.dataset.poracodeDragActive;
      }}
    >
      {props.children}
      <DragOverlay
        disabled={(source) => !isPaneDragSource(source?.data as DragSourceData | undefined)}
      >
        {(source) => <PaneDragPreview paneId={(source.data as PaneDragSource).paneId} />}
      </DragOverlay>
    </DragDropProvider>
  );
}

function PaneDragPreview({ paneId }: { paneId: string }) {
  const thread = useThread(paneId);
  return (
    <div className="pointer-events-none flex h-12 min-w-[180px] max-w-[280px] items-center gap-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 text-xs shadow-lg">
      <span className="truncate font-medium text-foreground">{thread?.title ?? "Pane"}</span>
    </div>
  );
}
