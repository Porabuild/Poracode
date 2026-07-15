import { memo, useState, type ReactNode } from "react";
import { Tooltip } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { TranslateFn } from "@/renderer/i18n/i18n";
import { Bot, ChevronDown, ChevronRight, CircleAlert, type LucideIcon } from "lucide-react";
import { isWorkflowRunLive, type ToolCallPayload, type WorkflowRun } from "@/shared/contracts";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { useAppStore } from "@/renderer/state/appStore";
import {
  getRuntimeItemPayload,
  type RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";
import { useWorkflowRun } from "@/renderer/state/useWorkflowRun";
import { formatTokenCount } from "@/renderer/components/thread/formatTokenCount";
import { useChatPaneActions } from "../../chatPaneActionsContext";
import { getChildItemIdsStoreSelector } from "../../chatPaneSelectors";
import { extractAcpResultPart } from "./acpToolPayload";
import { ChatFilePath } from "./ChatFilePath";
import {
  chatRowClass,
  chatRowHoverClass,
  chatRowIndicatorClass,
  normalizeCallTitleSeparator,
} from "./chatRow";
import { ItemMarkdown } from "./ItemMarkdown";
import {
  SubAgentProgressMeta,
  hasSubAgentProgressMeta,
  readSubAgentLiveLabel,
} from "./subAgentProgressMeta";
import { deriveToolDisplay, isWorkflowTool } from "./toolDisplay";
import { parseWorkflowInfo } from "./workflowDisplay";
import { WorkflowResultGroup } from "./WorkflowResultGroup";
import { useShimmer } from "@/renderer/thinkingAnimator";

interface SubAgentToolCallProps {
  threadId: string;
  item: RuntimeChatItem;
}

export const SubAgentToolCall = memo(function SubAgentToolCall({
  threadId,
  item,
}: SubAgentToolCallProps) {
  const { t } = useLingui();
  const payload = getRuntimeItemPayload<ToolCallPayload>(item, "tool_call");
  const childCount = useAppStore(getChildItemIdsStoreSelector(threadId, item.id)).length;
  const openSubAgent = useAppStore((s) => s.openSubAgent);

  const actions = useChatPaneActions();
  const projectLocation = actions?.projectLocation;
  const workflow = payload && isWorkflowTool(payload) ? parseWorkflowInfo(payload) : null;
  // Subscribe to the live workflow manifest while this row is mounted so the
  // right-hand label shows `n/n agents · time · tokens · tools` instead of
  // the stale `done` — Claude SDK reports the tool as completed the moment
  // the workflow launches, but the actual work may run for minutes. Hook
  // must run unconditionally (before any early return) — `useWorkflowRun`
  // no-ops cleanly when its inputs are null.
  const workflowRun = useWorkflowRun(
    workflow?.manifestPath ? item.id : null,
    workflow?.manifestPath ?? null,
    projectLocation ?? null,
    workflow?.transcriptDir ?? null,
  );

  const isCompleted = item.state === "completed" && payload?.status !== "running";
  // A workflow with a manifestPath is a *background* run — the parent SDK
  // marks the tool completed instantly but the actual work continues. Treat
  // the row as live until the manifest itself reports a terminal status;
  // a missing manifest file (ENOENT) is normal in the first ~second after
  // launch and must NOT collapse the row to "done".
  const workflowIsBackground = workflow !== null && !!workflow.manifestPath;
  // Only a workflow launched in THIS session can still be live; a row replayed
  // from a prior session's transcript on thread open renders with its final
  // manifest stats, never a live spinner (its detached process is gone).
  const workflowOwnedThisSession = item.observedLive === true;
  const workflowIsLive =
    workflowIsBackground &&
    workflowOwnedThisSession &&
    (workflowRun.run === null || isWorkflowRunLive(workflowRun.run));
  const isRunning = !isCompleted || workflowIsLive;
  const titleRef = useShimmer<HTMLElement>(isRunning);
  if (!payload?.name) return null;
  const display = deriveToolDisplay(payload);
  const displayTitle = normalizeCallTitleSeparator(display.title);
  const displayPrefix = display.parts
    ? normalizeCallTitleSeparator(display.parts.prefix)
    : undefined;
  const Icon: LucideIcon = display.Icon;
  const completedResultText = isCompleted ? extractAcpResultPart(payload).text.trim() : "";
  const workflowResultText = workflow ? completedResultText : "";
  const resultText = workflow ? "" : completedResultText;
  // Surface tool_use_error inline (without XML tags) as a tooltip on the
  // error icon — the user explicitly does not want an inline error banner.
  const workflowErrorText =
    workflow && payload.status === "error"
      ? (extractToolUseErrorText(completedResultText) ?? completedResultText)
      : "";
  const status = resolveStatus(
    item,
    payload,
    display.title,
    childCount,
    workflowErrorText,
    workflow ? workflowRun.run : null,
    workflowIsLive,
    t,
  );

  return (
    <div className="flex w-full min-w-0 flex-col gap-1 pl-4">
      <button
        type="button"
        onClick={() => openSubAgent(threadId, item.id)}
        className={`group ${chatRowClass} gap-1.5 text-[length:var(--lc-chat-font-size-command)] leading-tight ${chatRowHoverClass}`}
        aria-label={t`Open subagent: ${display.title}`}
      >
        <span className="size-3 shrink-0 text-[color:var(--muted)]">
          <Icon className="size-3" />
        </span>
        {display.parts ? (
          // Shimmer only the stable prefix — the path segment can change while
          // running, and mutating text under `background-clip: text` ghosts old
          // glyphs (see .poracode-thinking-text in styles.css).
          <code className="flex min-w-0 items-baseline overflow-hidden font-mono text-[color:var(--muted)]">
            <span
              ref={titleRef}
              className={`shrink-0 whitespace-pre ${isRunning ? "poracode-thinking-text" : ""}`}
              {...(isRunning ? { "data-poracode-shimmer-text": displayPrefix } : {})}
            >
              {displayPrefix}
            </span>
            {display.parts.filePath ? (
              <ChatFilePath
                className="flex-1"
                path={display.parts.path}
                basenameClassName="!text-[color:var(--foreground)]"
                dirClassName="!text-[color:var(--muted)]"
              />
            ) : (
              <span className="lc-truncate-start flex-1">{display.parts.path}</span>
            )}
          </code>
        ) : (
          <code
            ref={titleRef}
            className={`block min-w-0 truncate font-mono text-[color:var(--muted)] ${isRunning ? "poracode-thinking-text" : ""}`}
            {...(isRunning ? { "data-poracode-shimmer-text": displayTitle } : {})}
          >
            {displayTitle}
          </code>
        )}
        {status.rightLabel ? (
          <span className={`shrink-0 tabular-nums font-medium ${status.rightLabelClassName}`}>
            {status.rightLabel}
          </span>
        ) : null}
        <ChevronRight className={chatRowIndicatorClass} />
      </button>
      {workflowResultText ? <WorkflowResultGroup resultText={workflowResultText} /> : null}
      {resultText ? <SubAgentResultDisclosure text={resultText} /> : null}
    </div>
  );
});

function extractToolUseErrorText(text: string): string | null {
  const match = /<tool_use_error>([\s\S]*?)<\/tool_use_error>/i.exec(text);
  if (!match) return null;
  const inner = (match[1] ?? "").trim();
  return inner.length > 0 ? inner : null;
}

function SubAgentResultDisclosure({ text }: { text: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const actions = useChatPaneActions();
  return (
    <div className="flex w-full flex-col items-stretch justify-center px-2 py-2 text-[length:var(--lc-chat-font-size-meta)] text-foreground-muted">
      <button
        type="button"
        onClick={() => {
          setIsOpen((v) => !v);
          actions?.onContentHeightChange();
        }}
        aria-expanded={isOpen}
        className="group inline-flex min-w-0 items-center gap-1.5 self-start leading-none italic opacity-80 hover:text-foreground hover:opacity-100"
      >
        <Bot className="size-3 shrink-0" />
        <span>
          <Trans>Subagent Result</Trans>
        </span>
        <ChevronDown
          className={`size-3 shrink-0 opacity-100 transition-[transform,opacity] [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-visible:opacity-100 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen ? (
        <div className="mt-2 max-h-64 overflow-y-auto border-l border-dashed border-[color:var(--border)] pl-3 italic [scrollbar-gutter:stable]">
          <ItemMarkdown text={text} />
        </div>
      ) : null}
    </div>
  );
}

interface SubAgentStatus {
  rightLabel: ReactNode;
  rightLabelClassName: string;
}

function resolveStatus(
  item: RuntimeChatItem,
  payload: ToolCallPayload | undefined,
  displayTitle: string,
  childCount: number,
  errorTooltipText: string,
  workflowRun: WorkflowRun | null,
  workflowIsLive: boolean,
  t: TranslateFn,
): SubAgentStatus {
  const isRunning = item.state !== "completed" || payload?.status === "running" || workflowIsLive;
  const progress = payload?.progress;
  const liveLabel = readSubAgentLiveLabel(progress, displayTitle);
  // Prefer the supervisor-reported counter — it survives child-event gating
  // (overlay closed); fall back to local children count when the supervisor
  // hasn't populated stepCount yet.
  const stepCount = progress?.stepCount ?? childCount;

  // Workflow takes precedence over the generic running label so we always
  // see N/N agents instead of "0 steps" when the manifest data is in.
  if (workflowRun) {
    return {
      rightLabel: <WorkflowRunStats run={workflowRun} live={workflowIsLive} />,
      rightLabelClassName: "!text-[color:var(--muted)]",
    };
  }
  if (workflowIsLive) {
    return {
      rightLabel: (
        <span className="inline-flex min-w-0 items-center gap-1.5 text-[color:var(--muted)]">
          <span>
            <Trans>starting…</Trans>
          </span>
          <PixelLoader size="xxs" className="text-[color:var(--muted)]" />
        </span>
      ),
      rightLabelClassName: "!text-[color:var(--muted)]",
    };
  }

  if (isRunning) {
    return {
      rightLabel: (
        <SubAgentProgressMeta
          progress={progress}
          liveLabel={liveLabel}
          stepCount={stepCount}
          includeStepCount
          leadingSeparator
          className="text-[color:var(--muted)]"
          liveMaxClassName="max-w-[28ch]"
        />
      ),
      rightLabelClassName: "!text-[color:var(--muted)]",
    };
  }
  if (payload?.status === "error") {
    const icon = <CircleAlert className="size-3 text-danger" aria-label={t(msg`error`)} />;
    return {
      rightLabel: errorTooltipText ? (
        <Tooltip delay={0}>
          <Tooltip.Trigger>
            <span className="inline-flex items-center">{icon}</span>
          </Tooltip.Trigger>
          <Tooltip.Content className="max-w-[420px] whitespace-pre-wrap break-words text-left">
            {errorTooltipText}
          </Tooltip.Content>
        </Tooltip>
      ) : (
        icon
      ),
      rightLabelClassName: "text-danger",
    };
  }
  if (hasSubAgentProgressMeta(progress)) {
    return {
      rightLabel: (
        <SubAgentProgressMeta
          progress={progress}
          leadingSeparator
          className="text-[color:var(--muted)]"
        />
      ),
      rightLabelClassName: "!text-[color:var(--muted)]",
    };
  }
  return {
    rightLabel: (
      <span className="text-[color:var(--muted)]">
        <Trans>done</Trans>
      </span>
    ),
    rightLabelClassName: "!text-[color:var(--muted)]",
  };
}

function WorkflowRunStats({ run, live }: { run: WorkflowRun; live: boolean }) {
  const { t } = useLingui();
  const completed = countDoneAgents(run);
  // Workflow runtime only records agents in `workflowProgress` once they
  // complete, so mid-run `agentCount` can be 0 even though work is in
  // flight. Fall back to the highest agent count we've observed (sum of
  // agents tracked in phases + unphased) so the label never collapses to
  // an empty `0/0 agents` while the workflow is genuinely running.
  const trackedAgents = sumTrackedAgents(run);
  const total = Math.max(run.agentCount, trackedAgents);
  // Liveness is decided by the caller (session ownership + manifest status),
  // not the manifest alone, so a replayed dead run shows stats without a spinner.
  const isLive = live;
  const parts: string[] = [];
  if (total > 0) {
    parts.push(`${completed}/${total} agents`);
  } else if (isLive) {
    // No agents have completed yet and the manifest hasn't pre-declared
    // a count — surface a generic "running" so the row isn't blank.
    parts.push(t`running`);
  }
  if (run.durationMs !== undefined && run.durationMs > 0) {
    parts.push(formatWorkflowDuration(run.durationMs));
  }
  if (run.totalTokens !== undefined && run.totalTokens > 0) {
    parts.push(`${formatTokenCount(run.totalTokens)} tok`);
  }
  if (run.totalToolCalls !== undefined && run.totalToolCalls > 0) {
    parts.push(`${run.totalToolCalls} tools`);
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[color:var(--muted)]">
      <span className="tabular-nums">
        {parts.length > 0 ? parts.join(" · ") : isLive ? t`running` : t`done`}
      </span>
      {isLive ? <PixelLoader size="xxs" className="text-[color:var(--muted)]" /> : null}
    </span>
  );
}

function countDoneAgents(run: WorkflowRun): number {
  let total = 0;
  for (const phase of run.phases) {
    for (const agent of phase.agents) {
      if (agent.state === "done" || agent.state === "failed" || agent.state === "cancelled") {
        total += 1;
      }
    }
  }
  for (const agent of run.unphasedAgents) {
    if (agent.state === "done" || agent.state === "failed" || agent.state === "cancelled") {
      total += 1;
    }
  }
  return total;
}

function sumTrackedAgents(run: WorkflowRun): number {
  let total = run.unphasedAgents.length;
  for (const phase of run.phases) total += phase.agents.length;
  return total;
}

function formatWorkflowDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m${seconds.toString().padStart(2, "0")}s`;
}
