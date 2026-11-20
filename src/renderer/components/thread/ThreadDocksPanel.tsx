import { useEffect, useRef, useState, type ReactNode } from "react";
import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { GripVertical } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ProjectLocation } from "@/shared/contracts";
import { threadCrewBinding } from "@/shared/crew";
import {
  normalizeThreadDocksOrder,
  reorderVisibleThreadDocks,
  type ThreadDockKind,
} from "@/shared/settings";
import { useAppStore } from "@/renderer/state/appStore";
import { useThread } from "@/renderer/state/useThread";
import { usePanelStore, type ThreadDockFocus } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useThreadGoalDockStore } from "@/renderer/state/threadGoalDockStore";
import { useThreadTodoDockStore } from "@/renderer/state/threadTodoDockStore";
import { ActiveSubAgentTile } from "./ChatPane/parts/items/ActiveSubAgentTile";
import { ThreadArtifactsDock, ThreadFilesDock } from "./ThreadArtifactsDock";
import { ThreadBackgroundTasksDock } from "./ThreadBackgroundTasksDock";
import { ThreadGoalDock } from "./ThreadGoalDock";
import { ThreadImagesDock } from "./ThreadImagesDock";
import { ThreadAgentVisionDock, useThreadAgentVision } from "./ThreadAgentVisionDock";
import { ThreadContextWindowDock } from "./ThreadContextWindowDock";
import { ThreadDockSortableScope } from "./ThreadDockUI";
import {
  ThreadAgentUsageDock,
  ThreadWorkspaceDock,
  useThreadAgentUsage,
} from "./ThreadDetailsDocks";
import { useThreadFilesAndArtifacts } from "./threadArtifacts";
import { ThreadTodoDock } from "./ThreadTodoDock";
import { PanelActivity } from "@/renderer/components/layout/panelMotion";
import { useThreadVideos } from "./threadVideos";
import { useThreadGalleryImages } from "./useThreadGalleryImages";
import { selectThreadGoalDockItem } from "./threadGoalState";
import {
  useThreadDocksSummary,
  useVisibleThreadGoalDockState,
  useVisibleThreadTodoDockState,
} from "./useThreadDocksSummary";

/**
 * Right-panel "Docks" tab: the thread's informational docks, media gallery, and
 * files & artifacts stacked as sortable sections in one panel.
 */
export function ThreadDocksPanel(props: {
  threadId: string;
  projectLocation?: ProjectLocation;
  visible?: boolean;
}) {
  return (
    <PanelActivity visible={props.visible ?? true}>
      <ThreadDocksContent {...props} />
    </PanelActivity>
  );
}

function ThreadDocksContent({
  threadId,
  projectLocation,
  visible = true,
}: {
  threadId: string;
  projectLocation?: ProjectLocation;
  visible?: boolean;
}) {
  const { t } = useLingui();
  const goalDockState = useVisibleThreadGoalDockState(threadId);
  const goalDockItem = useAppStore((s) => selectThreadGoalDockItem(s, threadId));
  const todoDockState = useVisibleThreadTodoDockState(threadId);
  const todoDockCollapsed = useThreadTodoDockStore(
    (s) => s.byThreadId[threadId]?.collapsed ?? s.defaultCollapsed,
  );
  const savedOrder = useSharedSettings((s) => s.threadDocksOrder);
  const order = normalizeThreadDocksOrder(savedOrder);
  const setOrder = useSharedSettings((s) => s.setThreadDocksOrder);
  const summary = useThreadDocksSummary(threadId, goalDockState, todoDockState);
  const docksShowing = usePanelStore((s) => s.threadDocksPanelOpen && s.rightPanelTab === "docks");
  const [visionCollapse, setVisionCollapse] = useState({ threadId, collapsed: false });
  const visionCollapsed = visionCollapse.threadId === threadId && visionCollapse.collapsed;
  const vision = useThreadAgentVision(threadId, visible, !visionCollapsed);
  const gallery = useThreadGalleryImages(threadId, { lightbox: true, requestPending: visible });
  const videos = useThreadVideos(threadId);
  const { files, artifacts } = useThreadFilesAndArtifacts(threadId);
  const thread = useThread(threadId);
  const crewBinding = threadCrewBinding(thread?.config);
  const threadExists = thread !== undefined;
  const usage = useThreadAgentUsage(threadId);
  const focus = usePanelStore((s) => s.threadDocksFocus);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastScrolledFocusRef = useRef<ThreadDockFocus | null>(null);

  const content: Record<ThreadDockKind, ReactNode> = {
    vision: vision ? (
      <ThreadAgentVisionDock
        threadId={threadId}
        vision={vision}
        collapsed={visionCollapsed}
        onCollapsedChange={(collapsed) => setVisionCollapse({ threadId, collapsed })}
      />
    ) : null,
    goal: goalDockState ? (
      <ThreadGoalDock
        threadId={threadId}
        state={goalDockState}
        placement="right"
        onDismiss={() => {
          if (goalDockItem) useThreadGoalDockStore.getState().dismiss(threadId, goalDockItem);
        }}
      />
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
      summary.agentCount > 0 || crewBinding ? (
        <ActiveSubAgentTile
          threadId={threadId}
          placement="right"
          {...(crewBinding ? { crewBinding } : {})}
          {...(thread ? { thread } : {})}
          {...(projectLocation ? { projectLocation } : {})}
        />
      ) : null,
    backgroundTasks:
      summary.backgroundTaskCount > 0 ? (
        <ThreadBackgroundTasksDock threadId={threadId} placement="right" />
      ) : null,
    images:
      gallery.length > 0 || videos.length > 0 ? (
        <ThreadImagesDock
          key={threadId}
          gallery={gallery}
          videos={videos}
          threadId={threadId}
          visible={visible}
        />
      ) : null,
    files:
      files.length > 0 ? (
        <ThreadFilesDock key={threadId} files={files} threadId={threadId} />
      ) : null,
    artifacts:
      artifacts.length > 0 ? (
        <ThreadArtifactsDock key={threadId} artifacts={artifacts} threadId={threadId} />
      ) : null,
    info: threadExists ? <ThreadWorkspaceDock key={threadId} threadId={threadId} /> : null,
    context: threadExists ? <ThreadContextWindowDock key={threadId} threadId={threadId} /> : null,
    usage: usage ? <ThreadAgentUsageDock key={threadId} usage={usage} /> : null,
  };

  // The layer stays mounted while another right-panel tab shows; forgetting
  // the last scroll target when hidden lets the same bubble scroll again on
  // reopen.
  useEffect(() => {
    if (!docksShowing) lastScrolledFocusRef.current = null;
  }, [docksShowing]);

  // A bubble click names the active section. Scroll only when that selection
  // changes (once its members mount) so later updates do not fight scrolling.
  const focusedDockMounted = focus !== null && content[focus] !== null;
  useEffect(() => {
    if (!focus || !focusedDockMounted || lastScrolledFocusRef.current === focus) return;
    const target = containerRef.current?.querySelector<HTMLElement>(`[data-dock-kind="${focus}"]`);
    if (typeof target?.scrollIntoView === "function") {
      target.scrollIntoView({ block: "start" });
      lastScrolledFocusRef.current = focus;
    }
  }, [focus, focusedDockMounted]);

  const labels: Record<ThreadDockKind, string> = {
    vision: t`Agent vision`,
    goal: t`Goal`,
    plan: t`Plan`,
    agents: t`Agents`,
    backgroundTasks: t`Background tasks`,
    images: t`Media`,
    files: t`Files`,
    artifacts: t`Artifacts`,
    info: t`Thread info`,
    context: t`Context window`,
    usage: t`Usage`,
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
    <div
      role="region"
      aria-label={t`Thread docks`}
      className="flex h-full min-h-0 flex-col bg-[var(--content-background)]"
    >
      <div
        ref={containerRef}
        className="min-h-0 flex-1 overflow-y-auto p-2.5 [scrollbar-gutter:stable]"
      >
        {visibleOrder.length === 0 && !threadExists ? (
          <p className="px-1 py-2 text-xs text-foreground-muted">
            <Trans>No active tasks.</Trans>
          </p>
        ) : null}
        <DragDropProvider onDragEnd={handleDragEnd}>
          <div className="flex flex-col gap-2">
            {visibleOrder.map((kind, index) => (
              <DockSection key={kind} kind={kind} index={index} label={labels[kind]}>
                {content[kind]}
              </DockSection>
            ))}
          </div>
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
      className={`group/dock relative scroll-mt-2 ${isDragging ? "opacity-40" : ""}`}
    >
      <button
        ref={handleRef}
        type="button"
        aria-label={t`Reorder ${label}`}
        className="absolute left-2 top-[7px] z-10 flex h-6 w-4 cursor-grab items-center justify-center rounded-2xl text-muted/40 transition-colors hover:text-foreground outline-none focus-visible:focus-ring active:cursor-grabbing"
      >
        <GripVertical className="size-3.5" />
      </button>
      <ThreadDockSortableScope>
        <div className="flex min-w-0 flex-col gap-2">{children}</div>
      </ThreadDockSortableScope>
    </div>
  );
}
