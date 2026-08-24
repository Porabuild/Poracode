import { Fragment, useEffect, type ReactNode } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Bot, Check, GitBranch, X } from "lucide-react";
import { useShallow } from "zustand/shallow";
import { useAppStore } from "@/renderer/state/appStore";
import { useThreadSubAgentDockStore } from "@/renderer/state/threadSubAgentDockStore";
import { useThreadLiveWorkflowStore } from "@/renderer/state/threadLiveWorkflowStore";
import { useWorkflowRun } from "@/renderer/state/useWorkflowRun";
import { selectActiveSubAgentParentItemIds } from "@/renderer/state/subAgentSelectors";
import { getChildItemIdsStoreSelector, getRuntimeItemStoreSelector } from "../../chatPaneSelectors";
import { getRuntimeItemPayload } from "@/renderer/state/slices/runtimeEventSlice";
import {
  isWorkflowRunLive,
  type ProjectLocation,
  type ToolCallPayload,
  type WorkflowRun,
} from "@/shared/contracts";
import { deriveToolDisplay, isCrossagentTool, isWorkflowTool } from "./toolDisplay";
import { AnimatedFraction } from "@/renderer/components/common/AnimatedNumber";
import { formatTokenCount } from "@/renderer/components/thread/formatTokenCount";
import {
  ThreadDockActionRow,
  ThreadDockHeader,
  ThreadDockIconButton,
  ThreadDockList,
  ThreadDockSection,
} from "../../../ThreadDockUI";
import { parseWorkflowInfo } from "./workflowDisplay";
import {
  SubAgentProgressMeta,
  hasSubAgentProgressMeta,
  readSubAgentLiveLabel,
} from "./subAgentProgressMeta";

export type ActiveAgentKind = "subagent" | "crossagent" | "workflow";

/** Visible (non-dismissed) active agent item ids with their dock kind. */
function useVisibleActiveAgents(threadId: string): {
  visibleIds: readonly string[];
  kinds: readonly ActiveAgentKind[];
} {
  const ids = useAppStore((s) => selectActiveSubAgentParentItemIds(s, threadId));
  const dismissed = useThreadSubAgentDockStore((s) => s.dismissedByThread[threadId]);
  const visibleIds = dismissed ? ids.filter((id) => !dismissed[id]) : ids;
  const kinds = useAppStore(
    useShallow((s) =>
      visibleIds.map((id) => {
        const item = getRuntimeItemStoreSelector(threadId, id)(s);
        const payload = item
          ? getRuntimeItemPayload<ToolCallPayload>(item, "tool_call")
          : undefined;
        if (isWorkflowTool(payload)) return "workflow" as const;
        return isCrossagentTool(payload) ? ("crossagent" as const) : ("subagent" as const);
      }),
    ),
  );
  return { visibleIds, kinds };
}

/** Per-kind counts of the visible active agents — drives the mobile info chips. */
export function useActiveAgentKindCounts(threadId: string): Record<ActiveAgentKind, number> {
  const { kinds } = useVisibleActiveAgents(threadId);
  const counts: Record<ActiveAgentKind, number> = { subagent: 0, crossagent: 0, workflow: 0 };
  for (const kind of kinds) counts[kind] += 1;
  return counts;
}

interface ActiveSubAgentTileProps {
  threadId: string;
  projectLocation?: ProjectLocation;
  registrationOnly?: boolean;
  /** Restrict to these dock kinds (default: all). */
  kinds?: readonly ActiveAgentKind[];
}

export function ActiveSubAgentTile({
  threadId,
  projectLocation,
  registrationOnly = false,
  kinds: kindFilter,
}: ActiveSubAgentTileProps) {
  const dismissMany = useThreadSubAgentDockStore((s) => s.dismissMany);
  const { visibleIds, kinds } = useVisibleActiveAgents(threadId);

  if (visibleIds.length === 0) return null;

  if (registrationOnly) {
    return visibleIds.map((id) => (
      <ActiveSubAgentRow
        key={id}
        threadId={threadId}
        itemId={id}
        registrationOnly
        {...(projectLocation ? { projectLocation } : {})}
      />
    ));
  }

  return (
    <>
      {(["subagent", "crossagent", "workflow"] as const)
        .filter((kind) => !kindFilter || kindFilter.includes(kind))
        .map((kind) => {
          const sectionIds = visibleIds.filter((_, index) => kinds[index] === kind);
          return sectionIds.length > 0 ? (
            <ActiveAgentSection
              key={kind}
              kind={kind}
              threadId={threadId}
              ids={sectionIds}
              dismissMany={dismissMany}
              {...(projectLocation ? { projectLocation } : {})}
            />
          ) : null;
        })}
    </>
  );
}

function ActiveAgentSection({
  kind,
  threadId,
  ids,
  dismissMany,
  projectLocation,
}: {
  kind: "subagent" | "crossagent" | "workflow";
  threadId: string;
  ids: readonly string[];
  dismissMany: (threadId: string, itemIds: readonly string[]) => void;
  projectLocation?: ProjectLocation;
}) {
  const { t } = useLingui();
  const completedCount = useAppStore(
    (s) =>
      ids.filter((id) => {
        const item = getRuntimeItemStoreSelector(threadId, id)(s);
        if (!item) return false;
        const payload = getRuntimeItemPayload<ToolCallPayload>(item, "tool_call");
        return item.state === "completed" && payload?.status !== "running";
      }).length,
  );
  const title =
    kind === "workflow" ? t`Workflows` : kind === "crossagent" ? t`Crossagents` : t`Subagents`;
  const closePanelLabel =
    kind === "workflow"
      ? t`Close workflows panel`
      : kind === "crossagent"
        ? t`Close Crossagents panel`
        : t`Close subagents panel`;
  const closeLabel =
    kind === "workflow"
      ? t`Close workflows`
      : kind === "crossagent"
        ? t`Close Crossagents`
        : t`Close subagents`;

  return (
    <ThreadDockSection placement="composer" collapsed={false}>
      <ThreadDockHeader
        icon={kind === "workflow" ? GitBranch : Bot}
        title={title}
        countLabel={<AnimatedFraction value={completedCount} total={ids.length} />}
        actions={
          <ThreadDockIconButton
            label={closePanelLabel}
            tooltip={closeLabel}
            danger
            onPress={() => dismissMany(threadId, ids)}
          >
            <X className="size-3.5" />
          </ThreadDockIconButton>
        }
      />
      <ThreadDockList placement="composer" collapsed={false} gap="1">
        {ids.map((id) => (
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
  registrationOnly = false,
}: {
  threadId: string;
  itemId: string;
  projectLocation?: ProjectLocation;
  registrationOnly?: boolean;
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
  if (registrationOnly || !item || !payload?.name) return null;

  // The dock groups rows under kind headers (Subagents/Crossagents), so the
  // per-row "Agent:"/"Crossagent:" prefix would just repeat the header.
  const display = deriveToolDisplay(payload, { bareAgentTitle: true });
  const args =
    payload.args && typeof payload.args === "object" && !Array.isArray(payload.args)
      ? (payload.args as Record<string, unknown>)
      : undefined;
  const description = typeof args?.description === "string" ? args.description.trim() : undefined;
  const rowTitle = description || display.title;
  const isDone = !isRunning;
  const progress = payload?.progress;
  const stepCount = progress?.stepCount ?? childCount;
  const liveLabel = readSubAgentLiveLabel(progress, display.title);

  return (
    <ThreadDockActionRow
      title={rowTitle}
      onClick={() => openSubAgent(threadId, item.id)}
      className={`${isDone ? "opacity-60" : ""} ${!isDone ? "bg-accent/10" : ""}`}
      action={<X className="size-3" />}
      actionLabel={t`Remove ${rowTitle} from panel`}
      actionTitle={t`Remove from panel`}
      onAction={() => dismiss(threadId, itemId)}
    >
      {isDone ? (
        <Check aria-label={t`completed`} className="size-3.5 shrink-0 text-foreground-muted" />
      ) : (
        <Bot className="size-3.5 shrink-0 text-foreground-muted" />
      )}
      <span
        className={`min-w-0 flex-1 truncate leading-5 ${isDone ? "text-foreground-muted" : "text-foreground"}`}
      >
        {rowTitle}
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
    </ThreadDockActionRow>
  );
}

export function ThreadLiveWorkflowTracker(props: {
  threadId: string;
  projectLocation: ProjectLocation;
}) {
  return <ActiveSubAgentTile {...props} registrationOnly />;
}

function WorkflowDockStats({ run }: { run: WorkflowRun }) {
  const completed = countDoneWorkflowAgents(run);
  // The done/total pair animates because it ticks up while the run streams; the
  // token and duration strings stay plain text — they are pre-formatted labels,
  // not bare numbers.
  const parts: ReactNode[] = [];
  if (run.agentCount > 0) {
    parts.push(<AnimatedFraction key="progress" value={completed} total={run.agentCount} />);
  }
  if (run.totalTokens !== undefined) parts.push(`${formatTokenCount(run.totalTokens)} tok`);
  if (run.durationMs !== undefined) parts.push(formatDockDuration(run.durationMs));
  return (
    <span className="flex shrink-0 items-center gap-1 tabular-nums text-foreground-muted opacity-80">
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 ? <span aria-hidden="true">·</span> : null}
          {part}
        </Fragment>
      ))}
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
