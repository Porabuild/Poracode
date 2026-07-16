import { useEffect, useRef, useState } from "react";
import { Tooltip } from "@heroui/react";
import { CircleCheckBig, Target, X } from "lucide-react";
import { msg } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import type { ThreadGoalDockState } from "./threadGoalState";
import type { TranslateFn } from "@/renderer/i18n/i18n";
import { formatElapsed } from "@/renderer/utils/formatTime";
import { ThreadDockSection } from "./ThreadDockUI";
import { formatTokenCount } from "./formatTokenCount";

interface ThreadGoalDockProps {
  state: ThreadGoalDockState;
  onDismiss: () => void;
}

const localGoalTimingByItemId = new Map<
  string,
  { timeUsedSeconds: number; anchorSeconds: number }
>();

export function ThreadGoalDock({ state, onDismiss }: ThreadGoalDockProps) {
  const { t } = useLingui();
  const [localAnchorSeconds, setLocalAnchorSeconds] = useState(() =>
    resolveLocalGoalAnchorSeconds(state, Date.now() / 1000),
  );
  const [nowSeconds, setNowSeconds] = useState(() => Date.now() / 1000);
  const isActive = state.status === "active";
  const isComplete = state.status === "complete";

  useEffect(() => {
    const now = Date.now() / 1000;
    setLocalAnchorSeconds(resolveLocalGoalAnchorSeconds(state, now));
    setNowSeconds(now);
  }, [state]);

  useEffect(() => {
    if (!isActive) return;
    const interval = window.setInterval(() => setNowSeconds(Date.now() / 1000), 1000);
    return () => window.clearInterval(interval);
  }, [isActive]);

  const elapsedSeconds = resolveGoalElapsedSeconds(state, nowSeconds, localAnchorSeconds);
  const meta = goalMeta(state, t);
  const elapsedLabel = elapsedSeconds > 0 ? formatElapsed(elapsedSeconds) : null;
  const evaluatedTurns = state.iterations !== undefined && state.iterations > 0;
  const hasMeta = meta.length > 0;
  const StatusIcon = isComplete ? CircleCheckBig : Target;
  const statusIconClass = isComplete
    ? "text-success"
    : isActive
      ? "text-white"
      : "text-foreground-muted";

  return (
    <ThreadDockSection ariaLabel={t`Thread goal dock`} className="px-2 py-1">
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
        {hasMeta || evaluatedTurns || elapsedLabel ? (
          <span className="flex min-w-0 shrink items-center gap-1 text-[0.85em] text-[color:var(--muted)] [font-variant-numeric:tabular-nums]">
            {hasMeta ? <span className="truncate">{meta.join(" · ")}</span> : null}
            {hasMeta && evaluatedTurns ? <span aria-hidden="true">·</span> : null}
            {evaluatedTurns ? (
              <span className="shrink-0">
                <Plural value={state.iterations ?? 0} one="# turn" other="# turns" />
              </span>
            ) : null}
            {(hasMeta || evaluatedTurns) && elapsedLabel ? <span aria-hidden="true">·</span> : null}
            {elapsedLabel ? (
              <span className="inline-block shrink-0 text-center" style={{ minWidth: "7ch" }}>
                {elapsedLabel}
              </span>
            ) : null}
          </span>
        ) : null}
        <span className="h-3 w-px shrink-0 bg-[color:var(--border)]" />
        <GoalObjectiveText objective={state.objective} lastReason={state.lastReason} />
        <Tooltip delay={0}>
          <Tooltip.Trigger>
            <button
              aria-label={t`Close goal`}
              className="shrink-0 rounded p-1 text-muted/70 transition-colors hover:bg-danger-500/10 hover:text-danger-500"
              type="button"
              onClick={onDismiss}
            >
              <X className="size-3.5" />
            </button>
          </Tooltip.Trigger>
          <Tooltip.Content>
            <Trans>Close goal</Trans>
          </Tooltip.Content>
        </Tooltip>
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
        <Tooltip.Trigger>{text}</Tooltip.Trigger>
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
  }
}

function resolveGoalElapsedSeconds(
  state: ThreadGoalDockState,
  nowSeconds: number,
  localAnchorSeconds: number,
): number {
  const baseSeconds = state.timeUsedSeconds ?? 0;
  if (state.status !== "active") return Math.max(0, Math.round(baseSeconds));

  const serverUpdatedAtSeconds = normalizeTimestampSeconds(state.updatedAt);
  const anchorSeconds = serverUpdatedAtSeconds ?? localAnchorSeconds;
  const localDeltaSeconds = Math.max(0, nowSeconds - anchorSeconds);
  return Math.max(0, Math.round(baseSeconds + localDeltaSeconds));
}

function normalizeTimestampSeconds(timestamp: number | undefined): number | undefined {
  if (timestamp === undefined) return undefined;
  return timestamp > 1_000_000_000_000 ? timestamp / 1000 : timestamp;
}

function resolveLocalGoalAnchorSeconds(state: ThreadGoalDockState, nowSeconds: number): number {
  if (state.status !== "active" || state.updatedAt !== undefined) return nowSeconds;

  const timeUsedSeconds = state.timeUsedSeconds ?? 0;
  const cached = localGoalTimingByItemId.get(state.sourceItemId);
  if (cached?.timeUsedSeconds === timeUsedSeconds) {
    return cached.anchorSeconds;
  }

  const anchorSeconds = nowSeconds;
  if (localGoalTimingByItemId.size > 200) localGoalTimingByItemId.clear();
  localGoalTimingByItemId.set(state.sourceItemId, { timeUsedSeconds, anchorSeconds });
  return anchorSeconds;
}
