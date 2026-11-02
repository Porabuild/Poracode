import type { ReactNode } from "react";
import { Tooltip } from "@heroui/react";
import { Activity, Bot, ListChecks } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { ThreadDockKind, ThreadDocksPlacement } from "@/shared/settings";
import { toggleThreadDocksPanel } from "@/renderer/actions/panelActions";
import {
  floatingGlassActiveClass,
  floatingGlassBubbleActiveClass,
  floatingGlassBubbleClass,
  floatingGlassSurfaceClass,
} from "@/renderer/components/layout/floatingGlass";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useThreadBackgroundTasksDockStore } from "@/renderer/state/threadBackgroundTasksDockStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { formatElapsed } from "@/renderer/utils/formatTime";
import type { ThreadGoalDockState } from "./threadGoalState";
import { ThreadGoalStatusIcon } from "./ThreadGoalStatusIcon";
import { ThreadImagesBubble } from "./ThreadImagesBubble";
import { useGoalElapsedSeconds } from "./threadGoalTiming";
import {
  useThreadBackgroundTasks,
  useVisibleThreadBackgroundTasks,
  type ThreadDocksSummary,
} from "./useThreadDocksSummary";

/**
 * Compact stand-ins for the informational docks while they live in the right
 * panel: one 28px glass pill per dock with content, showing the single most
 * useful number (goal elapsed, plan progress, running agents, running tasks).
 * Clicking opens the Docks tab scrolled to that section; clicking the active
 * one closes the panel again.
 */
export function ThreadDockBubbles({
  summary,
  threadId,
}: {
  summary: ThreadDocksSummary;
  threadId: string;
}) {
  const { t } = useLingui();
  const panelShowing = usePanelStore((s) => s.threadDocksPanelOpen && s.rightPanelTab === "docks");
  const order = useSharedSettings((s) => s.threadDocksOrder);
  // The bubbles are one group for one panel: while the Docks tab is showing,
  // every bubble is pressed and clicking any of them hides the panel, so the
  // "Hide <dock>" name always describes what the click does.
  const isActive = (_kind: ThreadDockKind) => panelShowing;

  const bubbles: Record<ThreadDockKind, ReactNode> = {
    vision: null,
    goal: summary.goal ? (
      <GoalBubble key="goal" state={summary.goal} active={isActive("goal")} />
    ) : null,
    plan: summary.plan ? (
      <DockBubble
        key="plan"
        kind="plan"
        label={t`Plan`}
        active={isActive("plan")}
        icon={<ListChecks className="size-3.5 shrink-0 text-muted" />}
      >
        <span className="[font-variant-numeric:tabular-nums]">
          {summary.plan.steps.filter((step) => step.status === "completed").length}/
          {summary.plan.steps.length}
        </span>
      </DockBubble>
    ) : null,
    agents:
      summary.agentCount > 0 ? (
        <DockBubble
          key="agents"
          kind="agents"
          label={t`Agents`}
          active={isActive("agents")}
          icon={<Bot className="size-3.5 shrink-0 text-muted" />}
        >
          <span className="[font-variant-numeric:tabular-nums]">{summary.agentCount}</span>
        </DockBubble>
      ) : null,
    backgroundTasks: (
      <ThreadBackgroundTasksBubble
        key="backgroundTasks"
        threadId={threadId}
        active={panelShowing}
      />
    ),
    images: <ThreadImagesBubble key="images" threadId={threadId} />,
    info: null,
    context: null,
    usage: null,
  };

  return <>{order.map((kind) => bubbles[kind])}</>;
}

/**
 * Live task count. Hiding the dock must not hide the only way to rediscover
 * still-running work, so a hidden dock keeps an unpressed recovery bubble whose
 * name describes the next click. With composer placement the bubble appears
 * only while the dock is hidden and restores it in place; there is no panel.
 */
export function ThreadBackgroundTasksBubble({
  threadId,
  placement = "right",
  active = false,
}: {
  threadId: string;
  placement?: ThreadDocksPlacement;
  /** Whether the Docks panel is showing; right placement only. */
  active?: boolean;
}) {
  const { t } = useLingui();
  const liveTaskCount = useThreadBackgroundTasks(threadId).length;
  const tasksHidden = useVisibleThreadBackgroundTasks(threadId).length === 0;
  const docksInComposer = placement === "composer";
  if (liveTaskCount === 0 || (docksInComposer && !tasksHidden)) return null;
  return (
    <DockBubble
      kind="backgroundTasks"
      label={t`Background tasks`}
      active={!tasksHidden && !docksInComposer && active}
      onPress={() => {
        useThreadBackgroundTasksDockStore.getState().show(threadId);
        if (docksInComposer) return;
        if (tasksHidden) usePanelStore.getState().openThreadDocksPanel("backgroundTasks");
        else toggleThreadDocksPanel("backgroundTasks");
      }}
      icon={<Activity className="size-3.5 shrink-0 text-muted" />}
    >
      <span className="[font-variant-numeric:tabular-nums]">{liveTaskCount}</span>
    </DockBubble>
  );
}

function GoalBubble({ state, active }: { state: ThreadGoalDockState; active: boolean }) {
  const { t } = useLingui();
  const elapsedSeconds = useGoalElapsedSeconds(state);
  return (
    <DockBubble
      kind="goal"
      label={t`Goal`}
      tooltip={state.objective}
      active={active}
      icon={<ThreadGoalStatusIcon status={state.status} />}
    >
      {elapsedSeconds > 0 ? (
        <span className="[font-variant-numeric:tabular-nums]">{formatElapsed(elapsedSeconds)}</span>
      ) : null}
    </DockBubble>
  );
}

function DockBubble({
  kind,
  label,
  tooltip,
  active,
  icon,
  children,
  onPress,
}: {
  kind: ThreadDockKind;
  label: string;
  tooltip?: string;
  active: boolean;
  icon: ReactNode;
  children?: ReactNode;
  onPress?: () => void;
}) {
  const { t } = useLingui();
  const bubble = (
    <button
      type="button"
      aria-label={active ? t`Hide ${label}` : t`Show ${label}`}
      aria-pressed={active}
      data-dock-bubble={kind}
      className={`${floatingGlassSurfaceClass} ${floatingGlassBubbleClass} flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors ${
        active ? `${floatingGlassActiveClass} ${floatingGlassBubbleActiveClass}` : ""
      }`}
      onClick={onPress ?? (() => toggleThreadDocksPanel(kind))}
    >
      {icon}
      {children}
    </button>
  );
  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger>{bubble}</Tooltip.Trigger>
      <Tooltip.Content placement="top" className="max-w-[28rem] text-xs">
        {tooltip ? `${label} · ${tooltip}` : label}
      </Tooltip.Content>
    </Tooltip>
  );
}
