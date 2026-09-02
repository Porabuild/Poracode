import { useEffect, useRef, useState } from "react";
import { Tooltip } from "@heroui/react";
import { CircleCheckBig, CircleStop, CircleX, Target } from "lucide-react";
import { msg } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import type { ThreadGoalDockState } from "./threadGoalState";
import type { ThreadDocksPlacement } from "@/shared/settings";
import type { TranslateFn } from "@/renderer/i18n/i18n";
import { formatElapsed } from "@/renderer/utils/formatTime";
import { ThreadDocksPlacementToggle } from "./ThreadDocksPlacementToggle";
import { ThreadDockSection } from "./ThreadDockUI";
import { ThreadGoalControls } from "./ThreadGoalControls";
import { formatTokenCount } from "./formatTokenCount";
import { useGoalElapsedSeconds } from "./threadGoalTiming";

interface ThreadGoalDockProps {
  threadId: string;
  state: ThreadGoalDockState;
  placement: ThreadDocksPlacement;
  showPlacementToggle?: boolean;
  /** Composer-only: hide this goal until it changes. The right panel has no dismiss. */
  onDismiss?: () => void;
}

export function ThreadGoalDock({
  threadId,
  state,
  placement,
  showPlacementToggle = false,
  onDismiss,
}: ThreadGoalDockProps) {
  const { t } = useLingui();
  const isActive = state.status === "active";
  const isComplete = state.status === "complete";
  const isFailed = state.status === "failed";
  const isCancelled = state.status === "cancelled";
  const elapsedSeconds = useGoalElapsedSeconds(state);
  const meta = goalMeta(state, t);
  const elapsedLabel = elapsedSeconds > 0 ? formatElapsed(elapsedSeconds) : null;
  const evaluationChecks = state.iterations !== undefined && state.iterations > 0;
  const hasMeta = meta.length > 0;
  const StatusIcon = isComplete
    ? CircleCheckBig
    : isFailed
      ? CircleX
      : isCancelled
        ? CircleStop
        : Target;
  const statusIconClass = isComplete
    ? "text-success"
    : isFailed
      ? "text-danger"
      : isActive
        ? "text-white"
        : "text-foreground-muted";
  return (
    <ThreadDockSection ariaLabel={t`Thread goal dock`} placement={placement} className="px-2 py-1">
      <div className="flex min-w-0 items-center gap-2 leading-5">
        {isActive ? (
          <span className="poracode-goal-active-icon shrink-0" aria-hidden="true">
            <span className="poracode-goal-active-icon__ring" />
            <StatusIcon className={`size-3.5 ${statusIconClass}`} />
          </span>
        ) : (
          <StatusIcon className={`size-3.5 shrink-0 ${statusIconClass}`} />
        )}
        <span className="shrink-0 font-semibold text-foreground">
          <Trans>Goal</Trans>
        </span>
        {hasMeta || evaluationChecks || elapsedLabel ? (
          <span className="flex min-w-0 shrink items-center gap-1 text-[0.85em] text-[color:var(--muted)] [font-variant-numeric:tabular-nums]">
            {hasMeta ? <span className="truncate">{meta.join(" · ")}</span> : null}
            {hasMeta && evaluationChecks ? <span aria-hidden="true">·</span> : null}
            {evaluationChecks ? (
              <span className="shrink-0">
                <Plural value={state.iterations ?? 0} one="# check" other="# checks" />
              </span>
            ) : null}
            {(hasMeta || evaluationChecks) && elapsedLabel ? (
              <span aria-hidden="true">·</span>
            ) : null}
            {elapsedLabel ? (
              <span className="inline-block shrink-0 text-center" style={{ minWidth: "7ch" }}>
                {elapsedLabel}
              </span>
            ) : null}
          </span>
        ) : null}
        <span className="h-3 w-px shrink-0 bg-[color:var(--border)]" />
        <GoalObjectiveText objective={state.objective} lastReason={state.lastReason} />
        {showPlacementToggle ? <ThreadDocksPlacementToggle placement="composer" /> : null}
        <ThreadGoalControls
          threadId={threadId}
          state={state}
          {...(onDismiss ? { onDismiss } : {})}
        />
      </div>
    </ThreadDockSection>
  );
}

function GoalObjectiveText({
  objective,
  lastReason,
}: {
  objective: string;
  lastReason?: string | undefined;
}) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const element = textRef.current;
    if (!element) return;

    const measure = () => {
      setIsOverflowing(element.scrollWidth > element.clientWidth);
    };
    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [objective]);

  const text = (
    <span ref={textRef} className="block truncate text-foreground">
      {objective}
    </span>
  );

  if (!isOverflowing && !lastReason) return <div className="min-w-0 flex-1">{text}</div>;
  return (
    <div className="min-w-0 flex-1">
      <Tooltip delay={0}>
        <Tooltip.Trigger className="block w-full min-w-0 overflow-hidden">{text}</Tooltip.Trigger>
        <Tooltip.Content className="max-w-[32rem] whitespace-normal break-words">
          <span className="block">{objective}</span>
          {lastReason ? (
            <span className="mt-1 block text-muted">
              <Trans>Last evaluation:</Trans> {lastReason}
            </span>
          ) : null}
        </Tooltip.Content>
      </Tooltip>
    </div>
  );
}

function goalMeta(state: ThreadGoalDockState, t: TranslateFn): string[] {
  const details: string[] = [];
  if (state.status !== "active") details.push(goalStatusLabel(state.status, t));
  if (state.tokenBudget != null) {
    const used = formatTokenCount(state.tokensUsed ?? 0);
    const budget = formatTokenCount(state.tokenBudget);
    details.push(t(msg`${used}/${budget} tokens`));
  } else if (state.tokensUsed !== undefined && state.tokensUsed > 0) {
    const used = formatTokenCount(state.tokensUsed);
    details.push(t(msg`${used} tokens`));
  }
  return details;
}

function goalStatusLabel(status: ThreadGoalDockState["status"], t: TranslateFn): string {
  switch (status) {
    case "active":
      return t(msg`Active`);
    case "paused":
      return t(msg`Paused`);
    case "budget_limited":
      return t(msg`Budget limit reached`);
    case "complete":
      return t(msg`Complete`);
    case "failed":
      return t(msg`Failed`);
    case "cancelled":
      return t(msg`Cancelled`);
  }
}
