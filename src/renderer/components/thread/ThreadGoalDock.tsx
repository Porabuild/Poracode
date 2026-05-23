import { useEffect, useRef, useState } from "react";
import { Tooltip } from "@heroui/react";
import { CircleCheckBig, Target, X } from "lucide-react";
import type { ThreadGoalDockState } from "./threadGoalState";
import { ThreadDockSection } from "./ThreadDockUI";
import { formatElapsed } from "./ChatPane/formatElapsed";

interface ThreadGoalDockProps {
  state: ThreadGoalDockState;
  onDismiss: () => void;
}

const localGoalTimingByItemId = new Map<
  string,
  { timeUsedSeconds: number; anchorSeconds: number }
>();

export function ThreadGoalDock({ state, onDismiss }: ThreadGoalDockProps) {
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
  const meta = goalMeta(state);
  const elapsedLabel = elapsedSeconds > 0 ? formatElapsed(elapsedSeconds) : null;
  const hasMeta = meta.length > 0;
  const StatusIcon = isComplete ? CircleCheckBig : Target;
  const statusIconClass = isComplete
    ? "text-success"
    : isActive
      ? "text-white"
      : "text-foreground-muted";

  return (
    <ThreadDockSection ariaLabel="Thread goal dock" className="px-2 py-1">
      <div className="flex min-w-0 items-center gap-2 leading-5">
        {isActive ? (
          <span className="lightcode-goal-active-icon shrink-0" aria-hidden="true">
            <span className="lightcode-goal-active-icon__ring" />
            <StatusIcon className={`size-3.5 ${statusIconClass}`} />
          </span>
        ) : (
          <StatusIcon className={`size-3.5 shrink-0 ${statusIconClass}`} />
        )}
        <span className="shrink-0 font-semibold text-foreground">Goal</span>
        {hasMeta || elapsedLabel ? (
          <span className="flex min-w-0 shrink items-center gap-1 text-[0.85em] text-[color:var(--muted)] [font-variant-numeric:tabular-nums]">
            {hasMeta ? <span className="truncate">{meta.join(" · ")}</span> : null}
            {hasMeta && elapsedLabel ? <span aria-hidden="true">·</span> : null}
            {elapsedLabel ? (
              <span className="inline-block shrink-0 text-center" style={{ minWidth: "7ch" }}>
                {elapsedLabel}
              </span>
            ) : null}
          </span>
        ) : null}
        <span className="h-3 w-px shrink-0 bg-[color:var(--border)]" />
        <GoalObjectiveText objective={state.objective} />
        <Tooltip delay={0}>
          <Tooltip.Trigger>
            <button
              aria-label="Close goal"
              className="shrink-0 rounded p-1 text-muted/70 transition-colors hover:bg-danger-500/10 hover:text-danger-500"
              type="button"
              onClick={onDismiss}
            >
              <X className="size-3.5" />
            </button>
          </Tooltip.Trigger>
          <Tooltip.Content>Close goal</Tooltip.Content>
        </Tooltip>
      </div>
    </ThreadDockSection>
  );
}

function GoalObjectiveText({ objective }: { objective: string }) {
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

  if (!isOverflowing) return <div className="min-w-0 flex-1">{text}</div>;
  return (
    <div className="min-w-0 flex-1">
      <Tooltip delay={0}>
        <Tooltip.Trigger>{text}</Tooltip.Trigger>
        <Tooltip.Content className="max-w-[32rem] whitespace-normal break-words">
          {objective}
        </Tooltip.Content>
      </Tooltip>
    </div>
  );
}

function goalMeta(state: ThreadGoalDockState): string[] {
  const details: string[] = [];
  if (state.status !== "active") details.push(goalStatusLabel(state.status));
  if (state.tokenBudget != null) {
    details.push(
      `${formatTokenCount(state.tokensUsed ?? 0)}/${formatTokenCount(state.tokenBudget)} tokens`,
    );
  } else if (state.tokensUsed !== undefined && state.tokensUsed > 0) {
    details.push(`${formatTokenCount(state.tokensUsed)} tokens`);
  }
  return details;
}

function formatTokenCount(tokens: number): string {
  if (tokens < 10_000) return String(tokens);
  return `${Math.floor(tokens / 1_000)}k`;
}

function goalStatusLabel(status: ThreadGoalDockState["status"]): string {
  switch (status) {
    case "active":
      return "Active";
    case "paused":
      return "Paused";
    case "budget_limited":
      return "Budget limit reached";
    case "complete":
      return "Complete";
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
