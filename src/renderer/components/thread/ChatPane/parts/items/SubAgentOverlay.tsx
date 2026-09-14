import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Bot, X } from "lucide-react";
import type { ProjectLocation, ToolCallPayload } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
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
} from "../../chatPaneSelectors";
import type { TurnTiming } from "../../ChatTurnElapsed";
import { buildSubAgentProgressParts } from "./subAgentProgressMeta";
import { deriveToolDisplay, isCrossagentTool, isWorkflowTool } from "./toolDisplay";
import { WorkflowOverlayBody } from "./WorkflowOverlayBody";
import { parseWorkflowInfo } from "./workflowDisplay";
import { SubAgentMessageList, type WorkflowOverlayProgress } from "./SubAgentMessageList";

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
  /** Zero uses the normal frame-based reveal; other hosts keep a longer settle. */
  initialScrollRevealDelayMs?: number;
}

/** Shared live subagent content rendered by routed mobile pages and right panels. */
export function SubAgentContent({
  threadId,
  parentItemId,
  onClose,
  projectLocation,
  hideHeader = false,
  initialScrollRevealDelayMs = 50,
}: SubAgentContentProps) {
  const { t } = useLingui();
  const item = useAppStore(getRuntimeItemStoreSelector(threadId, parentItemId));
  const childEntries = useAppStore(getChildTimelineEntriesStoreSelector(threadId, parentItemId));
  const applyRuntimeEvents = useAppStore((s) => s.applyRuntimeEvents);
  const target = `${threadId}:${parentItemId}`;
  const [historyReadyFor, setHistoryReadyFor] = useState<string | null>(null);

  // Subscribe to the supervisor's child-event stream for this sub-agent while
  // the overlay is open. Current hosts drain the buffer and replay it onto the
  // thread's regular runtime stream (events arrive via the standard channel);
  // the RPC `history` payload is empty and is a fallback for older hosts that
  // still return the drained buffer here. Late RPC responses are still applied
  // so history is not lost if the panel remounts before the response arrives.
  useEffect(() => {
    const bridge = readBridge();
    let active = true;
    void bridge
      .subagentSubscribe({ threadId, parentItemId })
      .then((result) => {
        if (result.history.length === 0) return;
        applyRuntimeEvents(threadId, result.history);
      })
      .catch((err: unknown) => {
        console.warn("[subagent] subscribe failed", { threadId, parentItemId, err });
      })
      .finally(() => {
        if (active) setHistoryReadyFor(target);
      });
    return () => {
      active = false;
      void bridge.subagentUnsubscribe({ threadId, parentItemId }).catch((err: unknown) => {
        console.warn("[subagent] unsubscribe failed", { threadId, parentItemId, err });
      });
    };
  }, [threadId, parentItemId, target, applyRuntimeEvents]);

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
        <SubAgentMessageList
          key={target}
          historyReady={historyReadyFor === target}
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
