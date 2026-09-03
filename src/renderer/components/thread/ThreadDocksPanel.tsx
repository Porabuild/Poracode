import { useEffect, useRef, type ReactNode } from "react";
import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { GripVertical } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { ProjectLocation } from "@/shared/contracts";
import { reorderVisibleThreadDocks, type ThreadDockKind } from "@/shared/settings";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useThreadTodoDockStore } from "@/renderer/state/threadTodoDockStore";
import { ActiveSubAgentTile } from "./ChatPane/parts/items/ActiveSubAgentTile";
import { ThreadBackgroundTasksDock } from "./ThreadBackgroundTasksDock";
import { ThreadGoalDock } from "./ThreadGoalDock";
import { ThreadTodoDock } from "./ThreadTodoDock";
import {
  useThreadDocksSummary,
  useVisibleThreadGoalDockState,
  useVisibleThreadTodoDockState,
} from "./useThreadDocksSummary";

/**
 * Right-panel "Docks" tab: the thread's informational docks (goal, plan,
 * agents, background tasks) stacked as separate sections in one panel. Shown
 * only while `threadDocksPlacement` is "right"; the composer bubbles open it.
 */
export function ThreadDocksPanel({
  threadId,
  projectLocation,
}: {
  threadId: string;
  projectLocation?: ProjectLocation;
}) {
  const { t } = useLingui();
  const goalDockState = useVisibleThreadGoalDockState(threadId);
  const todoDockState = useVisibleThreadTodoDockState(threadId);
  const todoDockCollapsed = useThreadTodoDockStore(
    (s) => s.byThreadId[threadId]?.collapsed ?? s.defaultCollapsed,
  );
  const order = useSharedSettings((s) => s.threadDocksOrder);
  const setOrder = useSharedSettings((s) => s.setThreadDocksOrder);
  const summary = useThreadDocksSummary(threadId, goalDockState, todoDockState);
  const focus = usePanelStore((s) => s.threadDocksFocus);
  const docksShowing = usePanelStore((s) => s.threadDocksPanelOpen && s.rightPanelTab === "docks");
  const containerRef = useRef<HTMLDivElement>(null);
  const lastScrolledFocusRef = useRef<ThreadDockKind | null>(null);

  // The layer stays mounted while another right-panel tab shows; forgetting
  // the last scroll target when hidden lets the same bubble scroll again on
  // reopen.
  useEffect(() => {
    if (!docksShowing) lastScrolledFocusRef.current = null;
  }, [docksShowing]);

  // A bubble click names the active section. Scroll only when that selection
  // changes so later content updates do not fight the user's own scrolling.
  // Dock membership can lag the selection (agents or tasks still mounting),
  // so the counts participate too.
  useEffect(() => {
    if (!focus || lastScrolledFocusRef.current === focus) return;
    const target = containerRef.current?.querySelector<HTMLElement>(`[data-dock-kind="${focus}"]`);
    if (typeof target?.scrollIntoView === "function") {
      target.scrollIntoView({ block: "start" });
      lastScrolledFocusRef.current = focus;
    }
  }, [focus, goalDockState, todoDockState, summary.agentCount, summary.backgroundTaskCount]);

  const content: Record<ThreadDockKind, ReactNode> = {
    goal: goalDockState ? (
      <ThreadGoalDock threadId={threadId} state={goalDockState} placement="right" />
    ) : null,
    plan: todoDockState ? (
      <ThreadTodoDock
        collapsed={todoDockCollapsed}
        placement="right"
        state={todoDockState}
        onCollapsedChange={(collapsed) =>
          useThreadTodoDockStore.getState().setCollapsed(threadId, collapsed)
        }
        onRetire={() =>
          useThreadTodoDockStore.getState().retire(threadId, todoDockState.sourceItemId)
        }
      />
    ) : null,
    agents:
      summary.agentCount > 0 ? (
        <ActiveSubAgentTile
          threadId={threadId}
          placement="right"
          {...(projectLocation ? { projectLocation } : {})}
        />
      ) : null,
    backgroundTasks:
      summary.backgroundTaskCount > 0 ? (
        <ThreadBackgroundTasksDock threadId={threadId} placement="right" />
      ) : null,
  };
  const labels: Record<ThreadDockKind, string> = {
    goal: t`Goal`,
    plan: t`Plan`,
    agents: t`Agents`,
    backgroundTasks: t`Background tasks`,
  };
  const visibleOrder = order.filter((kind) => content[kind] !== null);

  function handleDragEnd(event: DragEndEvent) {
    if (event.canceled) return;
    const source = event.operation.source;
    if (!source || !isSortable(source)) return;
    const next = reorderVisibleThreadDocks(order, visibleOrder, source.initialIndex, source.index);
    setOrder(next);
  }

  return (
    <div role="region" aria-label={t`Thread docks`} className="flex h-full min-h-0 flex-col">
      {/* The title and placement toggle live in the shared right-panel header. */}
      <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <DragDropProvider onDragEnd={handleDragEnd}>
          {visibleOrder.map((kind, index) => (
            <DockSection key={kind} kind={kind} index={index} label={labels[kind]}>
              {content[kind]}
            </DockSection>
          ))}
        </DragDropProvider>
      </div>
    </div>
  );
}

function DockSection({
  kind,
  index,
  label,
  children,
}: {
  kind: ThreadDockKind;
  index: number;
  label: string;
  children: ReactNode;
}) {
  const { t } = useLingui();
  const { ref, handleRef, isDragging } = useSortable({
    id: `thread-dock:${kind}`,
    index,
    type: "thread-dock-order",
    accept: ["thread-dock-order"],
    group: "thread-dock-order",
    data: { kind },
  });
  return (
    <div
      ref={ref}
      data-dock-kind={kind}
      className={`group/dock relative scroll-mt-1 pl-4 ${isDragging ? "opacity-40" : ""}`}
    >
      <button
        ref={handleRef}
        type="button"
        aria-label={t`Reorder ${label}`}
        className="absolute left-0 top-0 z-10 flex h-8 w-4 cursor-grab items-center justify-center text-muted/30 transition-colors hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical className="size-3.5" />
      </button>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
