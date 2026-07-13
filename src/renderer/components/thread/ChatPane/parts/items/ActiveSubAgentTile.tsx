import { useEffect } from "react";
import { Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Bot, Check, GitBranch, X } from "lucide-react";
import { useAppStore } from "@/renderer/state/appStore";
import { useThreadSubAgentDockStore } from "@/renderer/state/threadSubAgentDockStore";
import { useThreadLiveWorkflowStore } from "@/renderer/state/threadLiveWorkflowStore";
import { useWorkflowRun } from "@/renderer/state/useWorkflowRun";
import {
  getChildItemIdsStoreSelector,
  getRuntimeItemStoreSelector,
  selectActiveSubAgentParentItemIds,
} from "../../chatPaneSelectors";
import { getRuntimeItemPayload } from "@/renderer/state/slices/runtimeEventSlice";
import {
  isWorkflowRunLive,
  type ProjectLocation,
  type ToolCallPayload,
  type WorkflowRun,
} from "@/shared/contracts";
import { deriveToolDisplay, isWorkflowTool } from "./toolDisplay";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { formatTokenCount } from "@/renderer/components/thread/formatTokenCount";
import { ThreadDockHeader, ThreadDockList, ThreadDockSection } from "../../../ThreadDockUI";
import { parseWorkflowInfo } from "./workflowDisplay";
import {
  SubAgentProgressMeta,
  hasSubAgentProgressMeta,
  readSubAgentLiveLabel,
} from "./subAgentProgressMeta";

interface ActiveSubAgentTileProps {
  threadId: string;
  projectLocation?: ProjectLocation;
}

export function ActiveSubAgentTile({ threadId, projectLocation }: ActiveSubAgentTileProps) {
  const { t } = useLingui();
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
      ? t`Workflows`
      : workflowCount > 0
        ? t`Background tasks`
        : t`Subagents`;
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
                aria-label={t`Close subagents panel`}
                className="shrink-0 rounded p-1 text-muted/70 transition-colors hover:bg-danger-500/10 hover:text-danger-500"
                type="button"
                onClick={() => dismissMany(threadId, visibleIds)}
              >
                <X className="size-3.5" />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content>
              <Trans>Close subagents</Trans>
            </Tooltip.Content>
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
  const { t } = useLingui();
  const item = useAppStore(getRuntimeItemStoreSelector(threadId, itemId));
  const childCount = useAppStore(getChildItemIdsStoreSelector(threadId, itemId)).length;
  const openSubAgent = useAppStore((s) => s.openSubAgent);
  const dismiss = useThreadSubAgentDockStore((s) => s.dismiss);
  const registerLiveWorkflow = useThreadLiveWorkflowStore((s) => s.register);
  const markWorkflowTerminal = useThreadLiveWorkflowStore((s) => s.markTerminal);

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
  // during which `workflowRun` is null - we MUST NOT flip the row to done
  // in that gap, otherwise the composer dock shows ✓ while the chat row
  // still says "starting…".
  const workflowIsBackground = workflow !== null && !!workflow.manifestPath;
  // A detached background workflow only keeps running while THIS app session's
  // process is alive. Opening a thread whose workflow was launched in a prior
  // session (or before a restart) must not show it as live - that process is
  // gone, even if the manifest is still pinned "running" on disk. `observedLive`
  // is set only on items that streamed in live this session, so it tells us
  // whether this session is the one that launched the workflow.
  const workflowOwnedThisSession = item?.observedLive === true;
  const workflowIsTerminal = workflowRun !== null && !isWorkflowRunLive(workflowRun);
  const workflowIsLive = workflowIsBackground && workflowOwnedThisSession && !workflowIsTerminal;

  // Auto-dismiss workflows once their manifest reports a terminal status. We
  // intentionally leave the row visible for one render cycle so the user
  // sees the final stats before the dock collapses.
  useEffect(() => {
    if (!workflow) return;
    if (!workflowIsTerminal) return;
    const timer = setTimeout(() => dismiss(threadId, itemId), 1500);
    return () => clearTimeout(timer);
  }, [workflow, workflowIsTerminal, dismiss, threadId, itemId]);

  // Publish this workflow's liveness to the thread-level tracker so the sidebar
  // row and chat header keep showing the working spinner after the foreground
  // turn ends - and even after this dock unmounts (the tracker polls on its
  // own). We register (not unregister) on unmount: the tracker clears the entry
  // when its own poll sees a terminal status, so dismissing the dock or
  // switching threads doesn't drop a still-running workflow.
  const liveWorkflowManifestPath = workflow?.manifestPath;
  const liveWorkflowTranscriptDir = workflow?.transcriptDir;
  useEffect(() => {
    if (!liveWorkflowManifestPath || !projectLocation) return;
    // Never light the thread spinner for a workflow this session didn't launch
    // (replayed from history on thread open) - it's already dead.
    if (!workflowOwnedThisSession) return;
    if (workflowIsTerminal) {
      markWorkflowTerminal(threadId, itemId);
      return;
    }
    registerLiveWorkflow({
      threadId,
      itemId,
      manifestPath: liveWorkflowManifestPath,
      location: projectLocation,
      ...(liveWorkflowTranscriptDir ? { transcriptDir: liveWorkflowTranscriptDir } : {}),
    });
  }, [
    liveWorkflowManifestPath,
    liveWorkflowTranscriptDir,
    projectLocation,
    workflowOwnedThisSession,
    workflowIsTerminal,
    threadId,
    itemId,
    registerLiveWorkflow,
    markWorkflowTerminal,
  ]);

  const isRunning = item?.state !== "completed" || payload?.status === "running" || workflowIsLive;
  if (!item || !payload?.name) return null;

  const display = deriveToolDisplay(payload);
  const isDone = !isRunning;
  const progress = payload?.progress;
  const stepCount = progress?.stepCount ?? childCount;
  const liveLabel = readSubAgentLiveLabel(progress, display.title);

  const innerClass = `flex items-center gap-2 rounded px-2 py-1 leading-5 ${
    isDone ? "opacity-60" : ""
  } ${!isDone ? "bg-accent/10" : ""}`;

  return (
    <li className="group relative flex">
      <button
        type="button"
        onClick={() => openSubAgent(threadId, item.id)}
        className={`poracode-subagent-dock-row flex min-w-0 flex-1 text-left transition-[padding,background-color] duration-150 hover:bg-foreground/5 group-hover:pr-8 ${innerClass}`}
        aria-label={display.title}
        title={display.title}
      >
        {isDone ? (
          <Check aria-label={t`completed`} className="size-3.5 shrink-0 text-foreground-muted" />
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
          <span className="shrink-0 text-foreground-muted opacity-80">
            <Trans>starting…</Trans>
          </span>
        ) : isRunning ? (
          <SubAgentProgressMeta
            progress={progress}
            liveLabel={liveLabel}
            stepCount={stepCount}
            includeStepCount
            className="max-w-[45%] shrink-0 text-foreground-muted opacity-80"
            liveMaxClassName="max-w-[20ch]"
          />
        ) : hasSubAgentProgressMeta(progress) ? (
          <SubAgentProgressMeta
            progress={progress}
            className="max-w-[45%] shrink-0 text-foreground-muted opacity-80"
          />
        ) : null}
      </button>
      <button
        type="button"
        aria-label={t`Remove ${display.title} from panel`}
        title={t`Remove from panel`}
        onClick={(e) => {
          e.stopPropagation();
          dismiss(threadId, itemId);
        }}
        className="poracode-subagent-dismiss absolute right-1 top-1/2 flex -translate-y-1/2 items-center justify-center rounded p-0.5 text-muted/70 opacity-0 transition-opacity duration-150 hover:bg-danger-500/10 hover:text-danger-500 group-hover:opacity-100 focus:opacity-100"
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
