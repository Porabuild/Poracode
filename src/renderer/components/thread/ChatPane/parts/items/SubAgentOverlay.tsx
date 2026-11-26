import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Bot, X } from "lucide-react";
import {
  agentPanelTitleTextClass,
  agentPanelMetaTextClass,
} from "@/renderer/components/layout/AgentPanelTitleRow";
import type { ProjectLocation, ToolCallPayload } from "@/shared/contracts";
import { resolveProjectLocation } from "@/shared/worktree";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { useProject, useThread } from "@/renderer/state/useThread";
import { useThreadRuntimeItem } from "@/renderer/state/useThreadRuntimeItem";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { useThreadTranscriptImageActions } from "../../useThreadTranscriptImageActions";
import {
  getRuntimeItemPayload,
  type RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";
import { guiChatFontCssVars } from "../../chatFontVars";
import { ChatPaneActionsContext } from "../../chatPaneActionsContext";
import { getChildTimelineEntriesStoreSelector } from "../../chatPaneSelectors";
import type { TurnTiming } from "../../ChatTurnElapsed";
import { buildSubAgentProgressParts, splitAgentTitleMeta } from "./subAgentProgressMeta";
import { deriveToolDisplay, isCrossagentTool, isWorkflowTool } from "./toolDisplay";
import { WorkflowOverlayBody } from "./WorkflowOverlayBody";
import { parseWorkflowInfo } from "./workflowDisplay";
import { SubAgentMessageList, type WorkflowOverlayProgress } from "./SubAgentMessageList";
import { PanelActivity } from "@/renderer/components/layout/panelMotion";
import { PaneVisibility } from "@/renderer/paneVisibility";

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
  visible?: boolean;
  /** Zero uses the normal frame-based reveal; other hosts keep a longer settle. */
  initialScrollRevealDelayMs?: number;
}

/** Reuse the transcript's running-state semantics for lease renewal. */
function isSubAgentParentActive(
  item: RuntimeChatItem | undefined,
  payload: ToolCallPayload | undefined,
): boolean {
  return item !== undefined && (item.state !== "completed" || payload?.status === "running");
}

/**
 * Mounted delegated viewers keyed by the exact thread+parent target. A legacy
 * host releases by parent, so an unmounted old effect must not send a late
 * release while a newer watcher owns that same slot.
 */
const mountedDelegatedViewers = new Map<string, Set<string>>();

function delegatedViewerKey(threadId: string, parentItemId: string): string {
  return JSON.stringify([threadId, parentItemId]);
}

function addMountedDelegatedViewer(key: string, viewerId: string): void {
  const viewers = mountedDelegatedViewers.get(key);
  if (viewers) viewers.add(viewerId);
  else mountedDelegatedViewers.set(key, new Set([viewerId]));
}

function removeMountedDelegatedViewer(key: string, viewerId: string): void {
  const viewers = mountedDelegatedViewers.get(key);
  if (!viewers) return;
  viewers.delete(viewerId);
  if (viewers.size === 0) mountedDelegatedViewers.delete(key);
}

function hasNewerMountedDelegatedViewer(key: string, viewerId: string): boolean {
  const viewers = mountedDelegatedViewers.get(key);
  if (!viewers) return false;
  for (const mounted of viewers) {
    if (mounted !== viewerId) return true;
  }
  return false;
}

/** Shared live subagent content rendered by routed mobile pages and right panels. */
export function SubAgentContent(props: SubAgentContentProps) {
  const { threadId, parentItemId, visible = true } = props;
  const item = useThreadRuntimeItem(threadId, parentItemId);
  const payload = item ? getRuntimeItemPayload<ToolCallPayload>(item, "tool_call") : undefined;
  const ownsWorkflow = !!(
    payload &&
    isWorkflowTool(payload) &&
    parseWorkflowInfo(payload)?.manifestPath
  );
  const parentActive = isSubAgentParentActive(item, payload);
  const applyRuntimeEvents = useAppStore((s) => s.applyRuntimeEvents);
  const target = `${threadId}:${parentItemId}`;
  const [historyReadyFor, setHistoryReadyFor] = useState<string | null>(null);
  const stopRenewalRef = useRef<(() => void) | null>(null);

  // A completed parent is a terminal watch state: release any granted viewer
  // lease instead of renewing a transcript that can no longer emit live output.
  useEffect(() => {
    if (parentActive) return;
    stopRenewalRef.current?.();
  }, [parentActive]);

  // Subscribe to the supervisor's child-event stream for this sub-agent while
  // the overlay is open. Current hosts drain the buffer and replay it onto the
  // thread's regular runtime stream (events arrive via the standard channel);
  // the RPC `history` payload is empty and is a fallback for older hosts that
  // still return the drained buffer here. Late RPC responses are still applied
  // so history is not lost if the panel remounts before the response arrives.
  // A single attempt loop serializes the initial subscribe and every renewal:
  // transient failures retry with the same viewer id and bounded backoff while
  // the parent can still emit, and success resets the delay.
  useEffect(() => {
    const bridge = readBridge();
    const viewerId = crypto.randomUUID();
    const watchKey = delegatedViewerKey(threadId, parentItemId);
    addMountedDelegatedViewer(watchKey, viewerId);
    let closed = false;
    let stopped = false;
    let scopedLease = false;
    let inFlight = false;
    let initialSettled = false;
    let retryDelayMs = 1_000;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let leaseTimer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribed = false;

    const parentCanEmitLiveOutput = () => {
      const latest = useAppStore.getState().runtimeItemsByIdByThread[threadId]?.[parentItemId];
      const latestPayload = latest
        ? getRuntimeItemPayload<ToolCallPayload>(latest, "tool_call")
        : undefined;
      return isSubAgentParentActive(latest, latestPayload);
    };

    const unsubscribeViewer = () => {
      if (unsubscribed) return;
      // An unconfirmed/legacy release targets the host's parent slot rather
      // than this viewer id. A newer mounted watcher for the exact target owns
      // that release (and the host's lease expiry backs up a skipped one).
      // A confirmed scoped lease always releases its own viewer id.
      if (!scopedLease && hasNewerMountedDelegatedViewer(watchKey, viewerId)) return;
      unsubscribed = true;
      void bridge
        .subagentUnsubscribe({ threadId, parentItemId, viewerId })
        .catch((err: unknown) => {
          console.warn("[subagent] unsubscribe failed", { threadId, parentItemId, err });
        });
    };

    const clearRenewal = () => {
      if (leaseTimer === undefined) return;
      clearTimeout(leaseTimer);
      leaseTimer = undefined;
    };

    const clearRetry = () => {
      if (retryTimer === undefined) return;
      clearTimeout(retryTimer);
      retryTimer = undefined;
    };

    const scheduleRenewal = (leaseMs: number) => {
      if (closed || stopped || leaseMs <= 0) return;
      clearRenewal();
      // Refresh well before the host lease expires; the next timer is scheduled
      // only from a successful response, keeping one attempt in flight.
      leaseTimer = setTimeout(
        () => {
          leaseTimer = undefined;
          void attempt();
        },
        Math.max(1, Math.floor(leaseMs / 3)),
      );
    };

    const scheduleRetry = () => {
      if (closed || stopped) return;
      if (!parentCanEmitLiveOutput()) {
        stopped = true;
        return;
      }
      clearRetry();
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        void attempt();
      }, retryDelayMs);
      retryDelayMs = Math.min(15_000, retryDelayMs * 2);
    };

    const attempt = async () => {
      if (closed || stopped || inFlight) return;
      // A completed parent still gets its first one-shot subscribe so a saved
      // panel can replay legacy history, but never a retry or renewal.
      if (initialSettled && !parentCanEmitLiveOutput()) {
        stopped = true;
        return;
      }
      clearRetry();
      inFlight = true;
      try {
        const result = await bridge.subagentSubscribe({
          threadId,
          parentItemId,
          viewerId,
        });
        const leaseMs = result.leaseMs;
        const grantedNow = leaseMs !== undefined && leaseMs > 0;
        // Record a granted scoped lease before any stale-response guard so a
        // late valid acknowledgement still releases this viewer id.
        if (grantedNow) scopedLease = true;
        // Legacy hosts may return drained history even after the panel closed;
        // preserve that one-shot delivery before deciding lease cleanup.
        if (result.history.length > 0) applyRuntimeEvents(threadId, result.history);
        if (closed || stopped) return;
        if (grantedNow) {
          retryDelayMs = 1_000;
          if (parentCanEmitLiveOutput()) scheduleRenewal(leaseMs);
          else stopped = true;
          return;
        }
        // Legacy host without a lease: one-shot delivery only, no renewal.
        retryDelayMs = 1_000;
      } catch (err: unknown) {
        if (closed) return;
        console.warn("[subagent] subscribe attempt failed", { threadId, parentItemId, err });
        if (stopped) return;
        if (!parentCanEmitLiveOutput()) {
          if (scopedLease) stopped = true;
          return;
        }
        scheduleRetry();
      } finally {
        inFlight = false;
        if (!closed && !initialSettled) {
          initialSettled = true;
          setHistoryReadyFor(`${threadId}:${parentItemId}`);
        }
        // A close or completion before the request settles must not let the
        // host keep a viewer after the panel or parent has gone.
        if (closed || stopped) unsubscribeViewer();
      }
    };

    const stopWatching = () => {
      stopped = true;
      clearRenewal();
      clearRetry();
      if (!inFlight) unsubscribeViewer();
    };
    stopRenewalRef.current = stopWatching;

    void attempt();

    return () => {
      closed = true;
      removeMountedDelegatedViewer(watchKey, viewerId);
      stopRenewalRef.current = null;
      clearRenewal();
      clearRetry();
      // While an attempt is outstanding, its finally block owns the release.
      if (!inFlight) unsubscribeViewer();
    };
  }, [threadId, parentItemId, applyRuntimeEvents]);

  return (
    <PaneVisibility value={visible}>
      {/* Workflow bodies own polling and synthetic history; their transcript UI suspends below that owner. */}
      <PanelActivity visible={visible || ownsWorkflow}>
        <SubAgentTranscript {...props} historyReady={historyReadyFor === target} />
      </PanelActivity>
    </PaneVisibility>
  );
}

function SubAgentTranscript({
  threadId,
  parentItemId,
  onClose,
  projectLocation,
  hideHeader = false,
  initialScrollRevealDelayMs = 50,
  historyReady,
}: SubAgentContentProps & { historyReady: boolean }) {
  const { t } = useLingui();
  const item = useThreadRuntimeItem(threadId, parentItemId);
  const childEntries = useAppStore(getChildTimelineEntriesStoreSelector(threadId, parentItemId));
  const thread = useThread(threadId);
  const project = useProject(thread?.projectId);
  const hydrationStatus = useAppStore((state) => state.runtimeHydrationStatus[threadId]);
  const runtimeItemIds = useAppStore((state) => state.runtimeItemIdsByThread[threadId]);
  const threadsAvailable = useAppStore((state) => state.threads.length > 0);
  const resolvedProjectLocation =
    projectLocation ??
    (thread && project ? resolveProjectLocation(project.location, thread.worktreePath) : undefined);
  const transcriptImageActions = useThreadTranscriptImageActions(thread, resolvedProjectLocation);
  const target = `${threadId}:${parentItemId}`;
  // Reload/Back restores this page before the owning thread's persisted history
  // has necessarily arrived. Only a missing target after hydration settled is
  // genuinely gone.
  const waitingForHistory =
    !item &&
    (thread !== undefined || !threadsAvailable) &&
    (hydrationStatus === "pending" ||
      (hydrationStatus === undefined && runtimeItemIds === undefined));

  if (!item) {
    return (
      <Shell title={t`Subagent`} hideHeader={hideHeader} {...(onClose ? { onClose } : {})}>
        {waitingForHistory ? (
          <div className="flex h-full min-h-0 items-center justify-center" role="status">
            <PixelLoader size="lg" />
          </div>
        ) : (
          <p className="px-3 py-4 text-sm text-foreground-muted">
            <Trans>Subagent not found.</Trans>
          </p>
        )}
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
  const isRunning = isSubAgentParentActive(item, payload);
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
          projectLocation={resolvedProjectLocation}
        />
      ) : (
        <ChatPaneActionsContext.Provider value={transcriptImageActions}>
          <SubAgentMessageList
            key={target}
            historyReady={childEntries.length > 0 || historyReady}
            initialScrollRevealDelayMs={initialScrollRevealDelayMs}
            threadId={threadId}
            parentItemId={parentItemId}
            entries={childEntries}
            stickToBottom={isRunning}
            turn={turn}
            crossagentStatus={crossagentStatus}
            workflow={workflow}
            workflowProgress={workflowProgress}
          />
        </ChatPaneActionsContext.Provider>
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
  const item = useThreadRuntimeItem(threadId, parentItemId);
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
      className={
        compact
          ? agentPanelTitleTextClass
          : "block truncate font-medium leading-tight text-foreground text-sm"
      }
    >
      {header.title}
    </span>
  );
  const description = header.description ? (
    <span
      className={
        compact
          ? agentPanelMetaTextClass
          : "block truncate leading-tight text-foreground-muted text-[0.6875rem]"
      }
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
  const split = splitAgentTitleMeta(fullTitle);
  if (split.meta) return { title: split.title, description: split.meta };

  if (isCrossagent && payload?.name.includes(" · ")) {
    return {
      title: payload.title?.trim() ? fullTitle : crossagentLabel,
      description: splitAgentTitleMeta(payload.name).meta ?? payload.name,
    };
  }

  const description = buildSubAgentProgressParts({ progress: payload?.progress })
    .filter((part) => part.kind === "model" || part.kind === "effort")
    .map((part) => part.label)
    .join(" · ");
  return description ? { title: fullTitle, description } : { title: fullTitle };
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
