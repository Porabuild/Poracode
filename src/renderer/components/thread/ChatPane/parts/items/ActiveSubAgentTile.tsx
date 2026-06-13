import { useEffect } from "react";
import { Tooltip } from "@heroui/react";
import { Bot, Check, GitBranch, X } from "lucide-react";
import { useAppStore } from "@/renderer/state/appStore";
import { useThreadSubAgentDockStore } from "@/renderer/state/threadSubAgentDockStore";
import { useWorkflowRun } from "@/renderer/state/useWorkflowRun";
import {
  getChildItemIdsStoreSelector,
  getRuntimeItemStoreSelector,
  selectActiveSubAgentParentItemIds,
} from "../../chatPaneSelectors";
import { getRuntimeItemPayload } from "@/renderer/state/slices/runtimeEventSlice";
import type { ProjectLocation, ToolCallPayload, WorkflowRun } from "@/shared/contracts";
import { deriveToolDisplay, isWorkflowTool } from "./toolDisplay";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { formatTokenCount } from "@/renderer/components/thread/formatTokenCount";
import { ThreadDockHeader, ThreadDockList, ThreadDockSection } from "../../../ThreadDockUI";
import { parseWorkflowInfo } from "./workflowDisplay";
import { SubAgentProgressMeta, hasSubAgentProgressMeta } from "./subAgentProgressMeta";

interface ActiveSubAgentTileProps {
  threadId: string;
  projectLocation?: ProjectLocation;
}

export function ActiveSubAgentTile({ threadId, projectLocation }: ActiveSubAgentTileProps) {
  const ids = useAppStore((s) => selectActiveSubAgentParentItemIds(s, threadId));
  const dismissed = useThreadSubAgentDockStore((s) => s.dismissedByThread[threadId]);
  const dismissMany = useThreadSubAgentDockStore((s) => s.dismissMany);

  const visibleIds = dismissed ? ids.filter((id) => !dismissed[id]) : ids;

  const completedCount = useAppStore(
    (s) =>
      visibleIds.filter((id) => {
        const item = getRuntimeItemStoreSelector(threadId, id)(s);
        if (!item) return false;
        const payload = getRuntimeItemPayload<ToolCallPayload>(item, "tool_call");
        return item.state === "completed" && payload?.status !== "running";
      }).length,
  );
  const workflowCount = useAppStore(
    (s) =>
      visibleIds.filter((id) => {
        const item = getRuntimeItemStoreSelector(threadId, id)(s);
        if (!item) return false;
        return isWorkflowTool(getRuntimeItemPayload<ToolCallPayload>(item, "tool_call"));
      }).length,
  );

  if (visibleIds.length === 0) return null;
  const title =
    workflowCount === visibleIds.length
      ? "Workflows"
      : workflowCount > 0
        ? "Background tasks"
        : "Subagents";
  const HeaderIcon = workflowCount === visibleIds.length ? GitBranch : Bot;

  return (
    <ThreadDockSection placement="composer" collapsed={false}>
      <ThreadDockHeader
        icon={HeaderIcon}
        title={title}
        countLabel={`${completedCount}/${visibleIds.length}`}
        actions={
          <Tooltip delay={0}>
            <Tooltip.Trigger>
              <button
                aria-label="Close subagents panel"
                className="shrink-0 rounded p-1 text-muted/70 transition-colors hover:bg-danger-500/10 hover:text-danger-500"
                type="button"
                onClick={() => dismissMany(threadId, visibleIds)}
              >
                <X className="size-3.5" />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content>Close subagents</Tooltip.Content>
          </Tooltip>
        }
      />
      <ThreadDockList placement="composer" collapsed={false} gap="1">
        {visibleIds.map((id) => (
          <ActiveSubAgentRow
            key={id}
            threadId={threadId}
            itemId={id}
            {...(projectLocation ? { projectLocation } : {})}
          />
        ))}
      </ThreadDockList>
    </ThreadDockSection>
  );
}

function ActiveSubAgentRow({
  threadId,
  itemId,
  projectLocation,
}: {
  threadId: string;
  itemId: string;
  projectLocation?: ProjectLocation;
}) {
  const item = useAppStore(getRuntimeItemStoreSelector(threadId, itemId));
  const childCount = useAppStore(getChildItemIdsStoreSelector(threadId, itemId)).length;
  const openSubAgent = useAppStore((s) => s.openSubAgent);
  const dismiss = useThreadSubAgentDockStore((s) => s.dismiss);

  const payload = item ? getRuntimeItemPayload<ToolCallPayload>(item, "tool_call") : undefined;
  const workflow = payload && isWorkflowTool(payload) ? parseWorkflowInfo(payload) : null;
  const workflowRunResult = useWorkflowRun(
    workflow?.manifestPath ? itemId : null,
    workflow?.manifestPath ?? null,
    projectLocation ?? null,
    workflow?.transcriptDir ?? null,
  );
  const workflowRun = workflowRunResult.run;
  // A background workflow is "live" from the moment the SDK reports its
  // launch tool call as completed (because the work is in flight in a
  // separate process). The manifest takes a few seconds to appear on disk,
  // during which `workflowRun` is null — we MUST NOT flip the row to done
  // in that gap, otherwise the composer dock shows ✓ while the chat row
  // still says "starting…".
  const workflowIsBackground = workflow !== null && !!workflow.manifestPath;
  const workflowIsTerminal = workflowRun !== null && !isLiveWorkflowStatus(workflowRun.status);
  const workflowIsLive = workflowIsBackground && !workflowIsTerminal;

  // Auto-dismiss workflows once their manifest reports a terminal status. We
  // intentionally leave the row visible for one render cycle so the user
  // sees the final stats before the dock collapses.
  useEffect(() => {
    if (!workflow) return;
    if (!workflowIsTerminal) return;
    const timer = setTimeout(() => dismiss(threadId, itemId), 1500);
    return () => clearTimeout(timer);
  }, [workflow, workflowIsTerminal, dismiss, threadId, itemId]);

  if (!item || !payload?.name) return null;

  const display = deriveToolDisplay(payload);
  const isRunning = item.state !== "completed" || payload?.status === "running" || workflowIsLive;
  const isDone = !isRunning;
  const progress = payload?.progress;
  const stepCount = progress?.stepCount ?? childCount;
  const liveLabel = progress?.lastToolName ?? progress?.description;

  const innerClass = `flex items-center gap-2 rounded px-2 py-1 leading-5 ${
    isDone ? "opacity-60" : ""
  } ${!isDone ? "bg-accent/10" : ""}`;

  return (
    <li className="group relative flex" role="listitem">
      <button
        type="button"
        onClick={() => openSubAgent(threadId, item.id)}
        className={`flex min-w-0 flex-1 text-left transition-[padding,background-color] duration-150 hover:bg-foreground/5 group-hover:pr-8 ${innerClass}`}
        aria-label={display.title}
        title={display.title}
      >
        {isDone ? (
          <Check aria-label="completed" className="size-3.5 shrink-0 text-foreground-muted" />
        ) : (
          <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
            <PixelLoader size="xxs" className="text-foreground" />
          </span>
        )}
        <span
          className={`min-w-0 flex-1 truncate leading-5 ${isDone ? "text-foreground-muted" : "text-foreground"}`}
        >
          {display.title}
        </span>
        {workflow && workflowRun ? (
          <WorkflowDockStats run={workflowRun} />
        ) : workflowIsLive ? (
          <span className="shrink-0 text-foreground-muted opacity-80">starting…</span>
        ) : isRunning ? (
          <SubAgentProgressMeta
            progress={progress}
            liveLabel={liveLabel}
            stepCount={stepCount}
            includeStepCount
            className="max-w-[45%] shrink-0 text-foreground-muted opacity-80"
            liveMaxClassName="max-w-[20ch]"
            loaderClassName="text-foreground-muted"
          />
        ) : hasSubAgentProgressMeta(progress) ? (
          <SubAgentProgressMeta
            progress={progress}
            className="max-w-[45%] shrink-0 text-foreground-muted opacity-80"
            loaderClassName="text-foreground-muted"
          />
        ) : null}
      </button>
      <button
        type="button"
        aria-label={`Remove ${display.title} from panel`}
        title="Remove from panel"
        onClick={(e) => {
          e.stopPropagation();
          dismiss(threadId, itemId);
        }}
        className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center justify-center rounded p-0.5 text-muted/70 opacity-0 transition-opacity duration-150 hover:bg-danger-500/10 hover:text-danger-500 group-hover:opacity-100 focus:opacity-100"
      >
        <X className="size-3" />
      </button>
    </li>
  );
}

function WorkflowDockStats({ run }: { run: WorkflowRun }) {
  const completed = countDoneWorkflowAgents(run);
  const parts: string[] = [];
  if (run.agentCount > 0) parts.push(`${completed}/${run.agentCount}`);
  if (run.totalTokens !== undefined) parts.push(`${formatTokenCount(run.totalTokens)} tok`);
  if (run.durationMs !== undefined) parts.push(formatDockDuration(run.durationMs));
  return (
    <span className="shrink-0 tabular-nums text-foreground-muted opacity-80">
      {parts.join(" · ")}
    </span>
  );
}

function isLiveWorkflowStatus(status: WorkflowRun["status"]): boolean {
  return status === "running" || status === "unknown";
}

function countDoneWorkflowAgents(run: WorkflowRun): number {
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

function formatDockDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m${seconds.toString().padStart(2, "0")}s`;
}
