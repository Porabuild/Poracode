import type { ReactNode } from "react";
import { Tooltip } from "@heroui/react";
import { Activity, Bot, ListChecks, Target } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { ThreadDockKind } from "@/shared/settings";
import { toggleThreadDocksPanel } from "@/renderer/actions/panelActions";
import {
  floatingGlassActiveClass,
  floatingGlassBubbleActiveClass,
  floatingGlassBubbleClass,
  floatingGlassSurfaceClass,
} from "@/renderer/components/layout/floatingGlass";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { formatElapsed } from "@/renderer/utils/formatTime";
import type { ThreadGoalDockState } from "./threadGoalState";
import { useGoalElapsedSeconds } from "./threadGoalTiming";
import type { ThreadDocksSummary } from "./useThreadDocksSummary";

/**
 * Compact stand-ins for the informational docks while they live in the right
 * panel: one 28px glass pill per dock with content, showing the single most
 * useful number (goal elapsed, plan progress, running agents, running tasks).
 * Clicking opens the Docks tab scrolled to that section; clicking the active
 * one closes the panel again.
 */
export function ThreadDockBubbles({ summary }: { summary: ThreadDocksSummary }) {
  const { t } = useLingui();
  const panelShowing = usePanelStore((s) => s.threadDocksPanelOpen && s.rightPanelTab === "docks");
  const order = useSharedSettings((s) => s.threadDocksOrder);
  // The bubbles are one group for one panel: while the Docks tab is showing,
  // every bubble is pressed and clicking any of them hides the panel, so the
  // "Hide <dock>" name always describes what the click does.
  const isActive = (_kind: ThreadDockKind) => panelShowing;

  const bubbles: Record<ThreadDockKind, ReactNode> = {
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
    backgroundTasks:
      summary.backgroundTaskCount > 0 ? (
        <DockBubble
          key="backgroundTasks"
          kind="backgroundTasks"
          label={t`Background tasks`}
          active={isActive("backgroundTasks")}
          icon={<Activity className="size-3.5 shrink-0 text-muted motion-safe:animate-pulse" />}
        >
          <span className="[font-variant-numeric:tabular-nums]">{summary.backgroundTaskCount}</span>
        </DockBubble>
      ) : null,
  };

  return <>{order.map((kind) => bubbles[kind])}</>;
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
      icon={
        <Target
          className={`size-3.5 shrink-0 ${state.status === "active" ? "text-foreground" : "text-muted"}`}
        />
      }
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
}: {
  kind: ThreadDockKind;
  label: string;
  tooltip?: string;
  active: boolean;
  icon: ReactNode;
  children?: ReactNode;
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
      onClick={() => toggleThreadDocksPanel(kind)}
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
