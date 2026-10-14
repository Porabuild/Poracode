import { startTransition, useEffect, useRef, useState } from "react";
import { Skeleton, Surface } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { usePanelContentDeferred } from "@/renderer/components/layout/panelMotion";
import { DeferredItemMarkdownInner } from "@/renderer/deferredFeatures";
import { useScrollFade } from "@/renderer/hooks/useScrollFade";
import type { ChatTimelineEntry } from "../../chatPaneSelectors";
import { ChatScrollControls, type ChatScrollControlsHandle } from "../../ChatScrollControls";
import { ChatTurnElapsedFooter, type TurnTiming } from "../../ChatTurnElapsed";
import { MessageList } from "../MessageList";
import { chatMessageSurfaceClass } from "./chatMessageSurface";
import type { WorkflowInfo } from "./workflowDisplay";

export interface WorkflowOverlayProgress {
  description?: string;
  lastToolName?: string;
  stepCount?: number;
  isRunning: boolean;
}

interface SubAgentMessageListProps {
  threadId: string;
  parentItemId: string;
  initialScrollRevealDelayMs: number;
  entries: readonly ChatTimelineEntry[];
  stickToBottom: boolean;
  turn: TurnTiming | null;
  crossagentStatus: "completed" | "failed" | "cancelled" | null;
  workflow: WorkflowInfo | null;
  workflowProgress: WorkflowOverlayProgress | null;
}

/** Prepare Markdown once, then let the virtualizer mount just the visible history. */
export function SubAgentMessageList(props: SubAgentMessageListProps & { historyReady: boolean }) {
  const [prepared, setPrepared] = useState(false);
  const [mounted, setMounted] = useState(false);
  const deferContent = usePanelContentDeferred();
  useEffect(() => {
    if (prepared || deferContent || !props.historyReady) return;
    let active = true;
    const markdownReady = DeferredItemMarkdownInner.preload().catch((error: unknown) => {
      console.warn("[subagent] Markdown preload failed", error);
    });
    const mount = () => {
      void markdownReady.then(() => {
        if (active) startTransition(() => setPrepared(true));
      });
    };
    // Yield after the panel has opened. There is no per-entry reveal queue:
    // history, appends and tool-group counts reach the virtualizer together.
    const cancel =
      typeof window.requestIdleCallback === "function"
        ? (() => {
            const id = window.requestIdleCallback(mount, { timeout: 50 });
            return () => window.cancelIdleCallback?.(id);
          })()
        : (() => {
            const id = window.setTimeout(mount, 16);
            return () => window.clearTimeout(id);
          })();
    return () => {
      active = false;
      cancel();
    };
  }, [prepared, deferContent, props.historyReady]);

  // Latch the actual first render, so a prepared transcript or a late history
  // response cannot start mounting during an interrupted opening/exit.
  const readyToMount = prepared && props.historyReady && !deferContent;
  if (readyToMount && !mounted) setMounted(true);
  return mounted || readyToMount ? (
    <MountedSubAgentMessageList {...props} />
  ) : (
    <div className="relative min-h-0 flex-1" aria-busy>
      <TranscriptSkeleton />
    </div>
  );
}

function TranscriptSkeleton({ settled = false }: { settled?: boolean }) {
  return (
    <>
      {!settled ? (
        <span role="status" className="sr-only">
          <Trans>Loading</Trans>
        </span>
      ) : null}
      <div
        aria-hidden
        className={`poracode-subagent-skeleton pointer-events-none absolute inset-0 overflow-hidden px-3 pt-3 transition-[opacity,visibility] duration-150 motion-reduce:transition-none ${
          settled ? "invisible opacity-0" : "visible opacity-100"
        }`}
      >
        {/* Fixed, static rows stay outside transcript measurement and scroll layout. */}
        <div className="mx-auto flex max-w-[920px] flex-col gap-6 px-3 py-2">
          {["w-4/5", "w-3/5", "w-2/3"].map((lastLineWidth) => (
            <div key={lastLineWidth} className="flex flex-col gap-2.5">
              <Skeleton animationType="none" className="mb-1 h-3 w-2/5 bg-foreground/10" />
              <Skeleton animationType="none" className="h-2.5 w-full bg-foreground/10" />
              <Skeleton animationType="none" className="h-2.5 w-full bg-foreground/10" />
              <Skeleton
                animationType="none"
                className={`h-2.5 bg-foreground/10 ${lastLineWidth}`}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function MountedSubAgentMessageList({
  threadId,
  parentItemId,
  initialScrollRevealDelayMs,
  entries,
  stickToBottom,
  turn,
  crossagentStatus,
  workflow,
  workflowProgress,
}: SubAgentMessageListProps) {
  const [initialScrollSettled, setInitialScrollSettled] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollControlsRef = useRef<ChatScrollControlsHandle>(null);
  const virtualScrollToBottomRef = useRef<(() => void) | null>(null);
  const { setScrollContainer, scrollRef, scrollFadeStyle } = useScrollFade<HTMLDivElement>({
    contentRef,
  });

  return (
    <div
      className="relative min-h-0 flex-1"
      aria-busy={!initialScrollSettled}
      inert={!initialScrollSettled}
    >
      <TranscriptSkeleton settled={initialScrollSettled} />
      <MessageList
        threadId={threadId}
        entries={entries}
        isTurnActive={stickToBottom}
        markTailAsLive={stickToBottom}
        canRevertCheckpoints={false}
        drawDistance={100}
        setScrollContainer={setScrollContainer}
        scrollContentRef={contentRef}
        onContentHeightChange={() => scrollControlsRef.current?.onContentHeightChange()}
        onVirtualizerLayoutChange={() => scrollControlsRef.current?.beginVirtualizerLayoutChange()}
        onLiveVirtualizerLayoutChange={() =>
          scrollControlsRef.current?.beginLiveVirtualizerLayoutChange()
        }
        registerVirtualScrollToBottom={(handler) => {
          virtualScrollToBottomRef.current = handler;
        }}
        scrollClassName={`h-full min-h-0 overflow-y-auto [overflow-anchor:none] [scrollbar-gutter:stable] transition-opacity duration-150 motion-reduce:transition-none ${
          initialScrollSettled ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        scrollStyle={scrollFadeStyle}
        contentClassName="poracode-subagent-list-content min-h-full px-3 pt-3"
        header={
          workflow ? (
            <WorkflowOverlayHeader workflow={workflow} progress={workflowProgress} />
          ) : null
        }
        footer={
          crossagentStatus || turn ? (
            <>
              {crossagentStatus ? <CrossagentStatusFooter status={crossagentStatus} /> : null}
              {turn ? <ChatTurnElapsedFooter turn={turn} /> : null}
            </>
          ) : null
        }
        emptyContent={
          workflow ? (
            <WorkflowEmptyState progress={workflowProgress} />
          ) : (
            <p className="text-sm text-foreground-muted">
              <Trans>Working…</Trans>
            </p>
          )
        }
        onPointerDownCapture={() => scrollControlsRef.current?.markUserScrollIntent()}
        onKeyDownCapture={() => scrollControlsRef.current?.markUserScrollIntent()}
        onWheelCapture={(event) => {
          if (event.deltaY >= 0) return;
          scrollControlsRef.current?.markUserScrollIntent();
          scrollControlsRef.current?.disableStickToBottom();
        }}
      />
      <ChatScrollControls
        ref={scrollControlsRef}
        scrollRef={scrollRef}
        contentRef={contentRef}
        layoutChangeToken={null}
        tailEntryId={entries.at(-1)?.id ?? null}
        threadId={`${threadId}:subagent:${parentItemId}`}
        tailLoaderVisible={turn !== null}
        initialScrollSettled={initialScrollSettled}
        initialScrollRevealDelayMs={initialScrollRevealDelayMs}
        virtualScrollToBottomRef={virtualScrollToBottomRef}
        onInitialScrollSettled={() => setInitialScrollSettled(true)}
      />
    </div>
  );
}

function CrossagentStatusFooter({ status }: { status: "completed" | "failed" | "cancelled" }) {
  const { t } = useLingui();
  const label =
    status === "completed" ? t`Completed` : status === "cancelled" ? t`Cancelled` : t`Failed`;
  return (
    <div className="mx-auto w-full max-w-[920px]">
      <Surface variant="transparent" className={chatMessageSurfaceClass}>
        <span
          className="text-[length:var(--lc-chat-font-size-meta)] text-foreground-muted"
          aria-live="polite"
        >
          {label}
        </span>
      </Surface>
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
          <Trans>Run {workflow.runId}</Trans>
        </p>
      ) : null}
    </div>
  );
}

function WorkflowProgressLine({ progress }: { progress: WorkflowOverlayProgress }) {
  const { stepCount } = progress;
  const live = progress.lastToolName ?? progress.description;
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-foreground-muted">
      {progress.isRunning ? <PixelLoader size="xxs" className="text-foreground-muted" /> : null}
      {live ? <span className="min-w-0 truncate">{live}</span> : null}
      {typeof stepCount === "number" ? (
        <span className="shrink-0 tabular-nums">
          <Plural value={stepCount} one="# step" other="# steps" />
        </span>
      ) : null}
    </p>
  );
}

function WorkflowEmptyState({ progress }: { progress: WorkflowOverlayProgress | null }) {
  if (!progress?.isRunning) {
    return (
      <p className="text-sm text-foreground-muted">
        <Trans>
          Workflow finished. Child agents ran in a separate process and aren&rsquo;t streamed here
          yet.
        </Trans>
      </p>
    );
  }
  return (
    <p className="text-sm text-foreground-muted">
      <Trans>
        Workflow is running in the background. Child agents run in a separate process and
        aren&rsquo;t streamed here yet.
      </Trans>
    </p>
  );
}
