import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { Bot, X } from "lucide-react";
import type { ProjectLocation, ToolCallPayload } from "@/shared/contracts";
import { PixelLoader } from "@/renderer/components/common";
import { readBridge } from "@/renderer/bridge";
import { OverlayShell } from "@/renderer/components/layout/OverlayShell";
import { useAppStore } from "@/renderer/state/appStore";
import { getRuntimeItemPayload } from "@/renderer/state/slices/runtimeEventSlice";
import { getChildItemIdsStoreSelector, getRuntimeItemStoreSelector } from "../../chatPaneSelectors";
import { isElementAtBottom } from "../../chatScrollGeometry";
import { ChatItemRow } from "./ChatItemRow";
import { deriveToolDisplay, isWorkflowTool } from "./toolDisplay";
import { WorkflowOverlayBody } from "./WorkflowOverlayBody";
import { parseWorkflowInfo, type WorkflowInfo } from "./workflowDisplay";

interface SubAgentOverlayProps {
  threadId: string;
  projectLocation?: ProjectLocation;
}

export function SubAgentOverlay({ threadId, projectLocation }: SubAgentOverlayProps) {
  const openParentItemId = useAppStore((s) => s.openSubAgentByThread[threadId] ?? null);
  const closeSubAgent = useAppStore((s) => s.closeSubAgent);

  // Keep the body rendered through the fade-out by remembering the last
  // non-null parent id; cleared once the OverlayShell finishes its exit.
  const lastParentRef = useRef<string | null>(null);
  if (openParentItemId) lastParentRef.current = openParentItemId;
  const renderingParentItemId = lastParentRef.current;

  if (!renderingParentItemId) return null;

  return (
    <OverlayShell
      mode="absolute"
      open={openParentItemId !== null}
      onExited={() => {
        lastParentRef.current = null;
        closeSubAgent(threadId);
      }}
    >
      <SubAgentOverlayBody
        threadId={threadId}
        parentItemId={renderingParentItemId}
        onClose={() => closeSubAgent(threadId)}
        projectLocation={projectLocation}
      />
    </OverlayShell>
  );
}

interface SubAgentOverlayBodyProps {
  threadId: string;
  parentItemId: string;
  onClose: () => void;
  projectLocation: ProjectLocation | undefined;
}

function SubAgentOverlayBody({
  threadId,
  parentItemId,
  onClose,
  projectLocation,
}: SubAgentOverlayBodyProps) {
  const item = useAppStore(getRuntimeItemStoreSelector(threadId, parentItemId));
  const childIds = useAppStore(getChildItemIdsStoreSelector(threadId, parentItemId));
  const applyRuntimeEvents = useAppStore((s) => s.applyRuntimeEvents);

  // Subscribe to the supervisor's child-event stream for this sub-agent while
  // the overlay is open. The supervisor buffers events when no renderer is
  // subscribed (perf gate); on subscribe it drains the buffer as `history` and
  // forwards the live tail through the regular runtime-event channels. Items
  // already in the store are no-ops when replayed, so we keep the persisted
  // child history intact and let any new events layer on top.
  useEffect(() => {
    let cancelled = false;
    const bridge = readBridge();
    void bridge
      .subagentSubscribe({ threadId, parentItemId })
      .then((result) => {
        if (cancelled || result.history.length === 0) return;
        applyRuntimeEvents(threadId, result.history);
      })
      .catch((err: unknown) => {
        console.warn("[subagent] subscribe failed", { threadId, parentItemId, err });
      });
    return () => {
      cancelled = true;
      void bridge.subagentUnsubscribe({ threadId, parentItemId }).catch((err: unknown) => {
        console.warn("[subagent] unsubscribe failed", { threadId, parentItemId, err });
      });
    };
  }, [threadId, parentItemId, applyRuntimeEvents]);

  if (!item) {
    return (
      <Shell title="Subagent" onClose={onClose}>
        <p className="px-3 py-4 text-sm text-foreground-muted">Subagent not found.</p>
      </Shell>
    );
  }

  const payload = getRuntimeItemPayload<ToolCallPayload>(item, "tool_call");
  const display = payload ? deriveToolDisplay(payload) : null;
  const Icon = display?.Icon ?? Bot;
  const title = display?.title ?? "Subagent";
  const isRunning = item.state !== "completed" || payload?.status === "running";
  const workflow = payload && isWorkflowTool(payload) ? parseWorkflowInfo(payload) : null;
  const workflowProgress: WorkflowOverlayProgress | null = workflow
    ? {
        ...(payload?.progress?.description ? { description: payload.progress.description } : {}),
        ...(payload?.progress?.lastToolName ? { lastToolName: payload.progress.lastToolName } : {}),
        ...(typeof payload?.progress?.stepCount === "number"
          ? { stepCount: payload.progress.stepCount }
          : {}),
        isRunning,
      }
    : null;

  const renderWorkflow = !!(workflow && workflow.manifestPath);
  return (
    <Shell
      title={title}
      icon={<Icon className="size-3.5 shrink-0 text-[color:var(--muted)]" />}
      onClose={onClose}
      hideTitleBorder={renderWorkflow}
    >
      {renderWorkflow ? (
        <WorkflowOverlayBody
          itemId={parentItemId}
          workflow={workflow!}
          isRunning={isRunning}
          projectLocation={projectLocation}
        />
      ) : (
        <ChildList
          threadId={threadId}
          childIds={childIds}
          stickToBottom={isRunning}
          workflow={workflow}
          workflowProgress={workflowProgress}
        />
      )}
    </Shell>
  );
}

interface WorkflowOverlayProgress {
  description?: string;
  lastToolName?: string;
  stepCount?: number;
  isRunning: boolean;
}

function Shell({
  title,
  icon,
  onClose,
  children,
  hideTitleBorder = false,
}: {
  title: string;
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /**
   * Suppress the bottom border of the title row when the body renders its own
   * toolbar with a matching border directly below — avoids two parallel
   * dividers stacking next to each other.
   */
  hideTitleBorder?: boolean;
}) {
  const titleId = useId();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="flex h-full min-h-0 flex-col bg-[var(--content-background)]"
    >
      <div
        className={`flex shrink-0 items-center gap-2 px-2 py-1 ${
          hideTitleBorder ? "" : "border-b border-[color:var(--border)]"
        }`}
      >
        {icon ?? <Bot className="size-3.5 shrink-0 text-[color:var(--muted)]" />}
        <h2
          id={titleId}
          className="min-w-0 flex-1 truncate text-sm font-medium leading-tight text-foreground"
        >
          {title}
        </h2>
        <button
          type="button"
          aria-label="Close subagent"
          className="shrink-0 rounded p-1 text-muted/60 transition-colors hover:bg-[var(--row-hover)] hover:text-foreground"
          onClick={onClose}
        >
          <X className="size-3.5" />
        </button>
      </div>
      {children}
    </div>
  );
}

function ChildList({
  threadId,
  childIds,
  stickToBottom,
  workflow,
  workflowProgress,
}: {
  threadId: string;
  childIds: readonly string[];
  stickToBottom: boolean;
  workflow: WorkflowInfo | null;
  workflowProgress: WorkflowOverlayProgress | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const lastScrollTopRef = useRef(0);

  const scrollToBottom = useEffectEvent(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    lastScrollTopRef.current = el.scrollTop;
  });

  // Pin to bottom on first paint so opening the overlay lands on the latest
  // child step rather than the start of the trail.
  useLayoutEffect(() => {
    stickRef.current = true;
    scrollToBottom();
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const prev = lastScrollTopRef.current;
      const next = el.scrollTop;
      lastScrollTopRef.current = next;
      const atBottom = isElementAtBottom(el);
      if (next < prev && !atBottom) {
        stickRef.current = false;
      } else if (atBottom) {
        stickRef.current = true;
      }
    };
    lastScrollTopRef.current = el.scrollTop;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  const syncStickyScroll = useEffectEvent(() => {
    if (!stickRef.current) return;
    scrollToBottom();
  });

  useEffect(() => {
    if (!stickToBottom) return;
    const content = contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(() => {
      syncStickyScroll();
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [stickToBottom]);

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
      <div ref={contentRef} className="flex flex-col gap-1.5 px-3 py-3">
        {workflow ? (
          <WorkflowOverlayHeader workflow={workflow} progress={workflowProgress} />
        ) : null}
        {childIds.length === 0 ? (
          workflow ? (
            <WorkflowEmptyState progress={workflowProgress} />
          ) : (
            <p className="text-sm text-foreground-muted">Working…</p>
          )
        ) : (
          childIds.map((id) => (
            <ChatItemRow
              key={id}
              threadId={threadId}
              entry={{ kind: "item", id }}
              checkpointRevertControl={null}
            />
          ))
        )}
      </div>
    </div>
  );
}

function WorkflowOverlayHeader({
  workflow,
  progress,
}: {
  workflow: WorkflowInfo;
  progress: WorkflowOverlayProgress | null;
}) {
  if (workflow.phases.length === 0 && !workflow.description && !workflow.runId) return null;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-[color:var(--border)] bg-[var(--composer-surface)] px-3 py-2 text-[length:var(--lc-chat-font-size-meta)]">
      {workflow.description ? (
        <p className="text-foreground leading-snug">{workflow.description}</p>
      ) : null}
      {workflow.phases.length > 0 ? (
        <ol className="flex flex-col gap-0.5 text-foreground-muted">
          {workflow.phases.map((phase, index) => (
            <li key={`${index}-${phase.title}`} className="flex min-w-0 items-baseline gap-1.5">
              <span className="shrink-0 font-medium text-foreground/80">
                {index + 1}. {phase.title}
              </span>
              {phase.detail ? (
                <span className="min-w-0 truncate opacity-70">{phase.detail}</span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      {progress && (progress.description || typeof progress.stepCount === "number") ? (
        <WorkflowProgressLine progress={progress} />
      ) : null}
      {workflow.runId ? (
        <p className="font-mono text-[length:var(--lc-chat-font-size-meta)] text-foreground-muted/80">
          Run {workflow.runId}
        </p>
      ) : null}
    </div>
  );
}

function WorkflowProgressLine({ progress }: { progress: WorkflowOverlayProgress }) {
  const stepLabel =
    typeof progress.stepCount === "number"
      ? `${progress.stepCount} step${progress.stepCount === 1 ? "" : "s"}`
      : null;
  const live = progress.lastToolName ?? progress.description;
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-foreground-muted">
      {progress.isRunning ? <PixelLoader size="xxs" className="text-foreground-muted" /> : null}
      {live ? <span className="min-w-0 truncate">{live}</span> : null}
      {stepLabel ? <span className="shrink-0 tabular-nums">{stepLabel}</span> : null}
    </p>
  );
}

function WorkflowEmptyState({ progress }: { progress: WorkflowOverlayProgress | null }) {
  if (!progress?.isRunning) {
    return (
      <p className="text-sm text-foreground-muted">
        Workflow finished. Child agents ran in a separate process and aren&rsquo;t streamed here
        yet.
      </p>
    );
  }
  return (
    <p className="text-sm text-foreground-muted">
      Workflow is running in the background. Child agents run in a separate process and aren&rsquo;t
      streamed here yet.
    </p>
  );
}
