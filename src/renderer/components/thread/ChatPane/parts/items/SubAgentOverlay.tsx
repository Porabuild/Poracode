import { useEffect, useId, useRef, type ReactNode } from "react";
import { Surface } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Bot, X } from "lucide-react";
import type { ProjectLocation, ToolCallPayload } from "@/shared/contracts";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { readBridge } from "@/renderer/bridge";
import { useScrollFade } from "@/renderer/hooks/useScrollFade";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  getRuntimeItemPayload,
  type RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";
import { guiChatFontCssVars } from "../../chatFontVars";
import {
  getChildTimelineEntriesStoreSelector,
  getRuntimeItemStoreSelector,
  type ChatTimelineEntry,
} from "../../chatPaneSelectors";
import { ChatScrollControls, type ChatScrollControlsHandle } from "../../ChatScrollControls";
import { ChatTurnElapsedFooter, type TurnTiming } from "../../ChatTurnElapsed";
import { MessageList } from "../MessageList";
import { buildSubAgentProgressParts } from "./subAgentProgressMeta";
import { chatMessageSurfaceClass } from "./chatMessageSurface";
import { deriveToolDisplay, isCrossagentTool, isWorkflowTool } from "./toolDisplay";
import { WorkflowOverlayBody } from "./WorkflowOverlayBody";
import { parseWorkflowInfo, type WorkflowInfo } from "./workflowDisplay";

interface SubAgentOpenControllerProps {
  threadId: string;
  projectLocation?: ProjectLocation;
  onOpen: (parentItemId: string, projectLocation: ProjectLocation | undefined) => void;
}

/**
 * Consumes the provider-agnostic "open subagent" signal and hands the target to
 * the active host. Desktop opens a temporary right-panel tab; mobile routes to
 * a history-backed page. Keeping presentation out of the tool rows means child
 * and active-agent entry points stay identical across hosts.
 */
export function SubAgentOpenController({
  threadId,
  projectLocation,
  onOpen,
}: SubAgentOpenControllerProps) {
  const openParentItemId = useAppStore((s) => s.openSubAgentByThread[threadId] ?? null);
  const closeSubAgent = useAppStore((s) => s.closeSubAgent);
  const handledParentItemIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!openParentItemId) {
      handledParentItemIdRef.current = null;
      return;
    }
    if (handledParentItemIdRef.current === openParentItemId) return;
    handledParentItemIdRef.current = openParentItemId;
    onOpen(openParentItemId, projectLocation);
    closeSubAgent(threadId);
  }, [closeSubAgent, onOpen, openParentItemId, projectLocation, threadId]);

  return null;
}

interface SubAgentContentProps {
  threadId: string;
  parentItemId: string;
  onClose?: () => void;
  projectLocation?: ProjectLocation;
  hideHeader?: boolean;
}

/** Shared live subagent content rendered by routed mobile pages and right panels. */
export function SubAgentContent({
  threadId,
  parentItemId,
  onClose,
  projectLocation,
  hideHeader = false,
}: SubAgentContentProps) {
  const { t } = useLingui();
  const item = useAppStore(getRuntimeItemStoreSelector(threadId, parentItemId));
  const childEntries = useAppStore(getChildTimelineEntriesStoreSelector(threadId, parentItemId));
  const applyRuntimeEvents = useAppStore((s) => s.applyRuntimeEvents);

  // Subscribe to the supervisor's child-event stream for this sub-agent while
  // the overlay is open. Current hosts drain the buffer and replay it onto the
  // thread's regular runtime stream (events arrive via the standard channel);
  // the RPC `history` payload is empty and is a fallback for older hosts that
  // still return the drained buffer here. Late RPC responses are still applied
  // so history is not lost if the panel remounts before the response arrives.
  useEffect(() => {
    const bridge = readBridge();
    void bridge
      .subagentSubscribe({ threadId, parentItemId })
      .then((result) => {
        if (result.history.length === 0) return;
        applyRuntimeEvents(threadId, result.history);
      })
      .catch((err: unknown) => {
        console.warn("[subagent] subscribe failed", { threadId, parentItemId, err });
      });
    return () => {
      void bridge.subagentUnsubscribe({ threadId, parentItemId }).catch((err: unknown) => {
        console.warn("[subagent] unsubscribe failed", { threadId, parentItemId, err });
      });
    };
  }, [threadId, parentItemId, applyRuntimeEvents]);

  if (!item) {
    return (
      <Shell title={t`Subagent`} hideHeader={hideHeader} {...(onClose ? { onClose } : {})}>
        <p className="px-3 py-4 text-sm text-foreground-muted">
          <Trans>Subagent not found.</Trans>
        </p>
      </Shell>
    );
  }

  const payload = getRuntimeItemPayload<ToolCallPayload>(item, "tool_call");
  const isCrossagent = isCrossagentTool(payload);
  const display = payload ? deriveToolDisplay(payload) : null;
  const Icon = display?.Icon ?? Bot;
  const header = resolveSubAgentHeader(
    display?.title ?? (isCrossagent ? t`Crossagent` : t`Subagent`),
    payload,
    isCrossagent,
    t`Crossagent`,
  );
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
  const turn = resolveSubAgentTurnTiming(item, payload, isRunning);
  const crossagentStatus =
    isCrossagent && !isRunning
      ? payload?.crossagentStatus === "running"
        ? null
        : (payload?.crossagentStatus ?? (payload?.status === "success" ? "completed" : "failed"))
      : null;

  const renderWorkflow = !!(workflow && workflow.manifestPath);
  return (
    <Shell
      title={header.title}
      {...(header.description ? { description: header.description } : {})}
      icon={<Icon className="size-3.5 shrink-0 text-[color:var(--muted)]" />}
      {...(onClose ? { onClose } : {})}
      closeLabel={isCrossagent ? t`Close Crossagent` : t`Close subagent`}
      hideTitleBorder={renderWorkflow}
      hideHeader={hideHeader}
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
          parentItemId={parentItemId}
          entries={childEntries}
          stickToBottom={isRunning}
          turn={turn}
          crossagentStatus={crossagentStatus}
          workflow={workflow}
          workflowProgress={workflowProgress}
        />
      )}
    </Shell>
  );
}

export function SubAgentHeaderText({
  threadId,
  parentItemId,
  compact = false,
  part = "all",
}: {
  threadId: string;
  parentItemId: string;
  compact?: boolean;
  part?: "all" | "title" | "description";
}) {
  const { t } = useLingui();
  const item = useAppStore(getRuntimeItemStoreSelector(threadId, parentItemId));
  const payload = item ? getRuntimeItemPayload<ToolCallPayload>(item, "tool_call") : undefined;
  const isCrossagent = isCrossagentTool(payload);
  const display = payload ? deriveToolDisplay(payload) : null;
  const header = resolveSubAgentHeader(
    display?.title ?? (isCrossagent ? t`Crossagent` : t`Subagent`),
    payload,
    isCrossagent,
    t`Crossagent`,
  );
  const title = (
    <span
      className={`block truncate font-medium leading-tight text-foreground ${
        compact ? "text-[0.6875rem]" : "text-sm"
      }`}
    >
      {header.title}
    </span>
  );
  const description = header.description ? (
    <span
      className={`block truncate leading-tight text-foreground-muted ${
        compact ? "text-[0.5625rem]" : "text-[0.6875rem]"
      }`}
    >
      {header.description}
    </span>
  ) : null;

  if (part === "title") return title;
  if (part === "description") return description;

  return (
    <span className="poracode-subagent-header-text flex min-w-0 flex-1 flex-col justify-center">
      {title}
      {description}
    </span>
  );
}

function resolveSubAgentHeader(
  fullTitle: string,
  payload: ToolCallPayload | undefined,
  isCrossagent: boolean,
  crossagentLabel: string,
): { title: string; description?: string } {
  const separator = " — ";
  const separatorIndex = fullTitle.indexOf(separator);
  if (separatorIndex > 0) {
    const title = fullTitle.slice(0, separatorIndex).trim();
    const description = fullTitle.slice(separatorIndex + separator.length).trim();
    if (title && description) return { title, description };
  }

  if (isCrossagent && payload?.name.includes(" · ")) {
    return { title: crossagentLabel, description: payload.name };
  }

  const description = buildSubAgentProgressParts({ progress: payload?.progress })
    .filter((part) => part.kind === "model" || part.kind === "effort")
    .map((part) => part.label)
    .join(" · ");
  return description ? { title: fullTitle, description } : { title: fullTitle };
}

interface WorkflowOverlayProgress {
  description?: string;
  lastToolName?: string;
  stepCount?: number;
  isRunning: boolean;
}

function Shell({
  title,
  description,
  icon,
  onClose,
  closeLabel,
  children,
  hideTitleBorder = false,
  hideHeader = false,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  children: ReactNode;
  /**
   * Suppress the bottom border of the title row when the body renders its own
   * toolbar with a matching border directly below — avoids two parallel
   * dividers stacking next to each other.
   */
  hideTitleBorder?: boolean;
  hideHeader?: boolean;
}) {
  const { t } = useLingui();
  const titleId = useId();
  const guiChatFontSize = useSharedSettings((state) => state.guiChatFontSize);
  return (
    <div
      role="region"
      {...(hideHeader ? { "aria-label": title } : { "aria-labelledby": titleId })}
      className="poracode-subagent-surface flex h-full min-h-0 flex-col bg-[var(--content-background)] text-[length:var(--lc-chat-font-size)]"
      style={guiChatFontCssVars(guiChatFontSize)}
    >
      {hideHeader ? null : (
        <div
          className={`flex shrink-0 items-center gap-2 px-2 py-1 ${
            hideTitleBorder ? "" : "border-b border-[color:var(--border)]"
          }`}
        >
          {icon ?? <Bot className="size-3.5 shrink-0 text-[color:var(--muted)]" />}
          <span className="flex min-w-0 flex-1 flex-col justify-center">
            <h2 id={titleId} className="truncate text-sm font-medium leading-tight text-foreground">
              {title}
            </h2>
            {description ? (
              <span className="truncate text-[0.6875rem] leading-tight text-foreground-muted">
                {description}
              </span>
            ) : null}
          </span>
          {onClose ? (
            <button
              type="button"
              aria-label={closeLabel ?? t`Close subagent`}
              className="shrink-0 rounded p-1 text-muted/60 transition-colors hover:bg-[var(--row-hover)] hover:text-foreground"
              onClick={onClose}
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      )}
      {children}
    </div>
  );
}

function ChildList({
  threadId,
  parentItemId,
  entries,
  stickToBottom,
  turn,
  crossagentStatus,
  workflow,
  workflowProgress,
}: {
  threadId: string;
  parentItemId: string;
  entries: readonly ChatTimelineEntry[];
  stickToBottom: boolean;
  turn: TurnTiming | null;
  crossagentStatus: "completed" | "failed" | "cancelled" | null;
  workflow: WorkflowInfo | null;
  workflowProgress: WorkflowOverlayProgress | null;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollControlsRef = useRef<ChatScrollControlsHandle>(null);
  const virtualScrollToBottomRef = useRef<(() => void) | null>(null);
  const { setScrollContainer, scrollRef, scrollFadeStyle } = useScrollFade<HTMLDivElement>({
    contentRef,
  });

  return (
    <div className="relative min-h-0 flex-1">
      <MessageList
        threadId={threadId}
        entries={entries}
        isTurnActive={stickToBottom}
        markTailAsLive={stickToBottom}
        canRevertCheckpoints={false}
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
        scrollClassName="h-full min-h-0 overflow-y-auto [overflow-anchor:none] [scrollbar-gutter:stable]"
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
        initialScrollSettled
        initialScrollRevealDelayMs={0}
        virtualScrollToBottomRef={virtualScrollToBottomRef}
        onInitialScrollSettled={() => undefined}
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

function resolveSubAgentTurnTiming(
  item: RuntimeChatItem,
  payload: ToolCallPayload | undefined,
  isRunning: boolean,
): TurnTiming | null {
  if (isRunning) {
    return item.startedAt === undefined ? null : { startedAt: item.startedAt, endedAt: null };
  }
  const durationMs =
    item.startedAt !== undefined && item.completedAt !== undefined
      ? item.completedAt - item.startedAt
      : payload?.progress?.durationMs;
  return durationMs === undefined ? null : { startedAt: 0, endedAt: Math.max(0, durationMs) };
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
