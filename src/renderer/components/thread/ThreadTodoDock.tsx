import { useEffect, useRef } from "react";
import { Tooltip } from "@heroui/react";
import { ArrowRightLeft, Check, ChevronDown, Hourglass, ListChecks, X } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ThreadTodoDockPlacement } from "@/renderer/state/threadTodoDockStore";
import { AnimatedFraction } from "@/renderer/components/common/AnimatedNumber";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import type { ThreadTodoDockState, ThreadTodoStepStatus } from "./threadTodoState";
import { ThreadDockHeader, ThreadDockList, ThreadDockRow, ThreadDockSection } from "./ThreadDockUI";

interface ThreadTodoDockProps {
  state: ThreadTodoDockState;
  placement: ThreadTodoDockPlacement;
  collapsed: boolean;
  /** Hide the composer↔right-panel move action (no right panel on mobile). */
  canMove?: boolean;
  onPlacementChange: (placement: ThreadTodoDockPlacement) => void;
  onCollapsedChange: (collapsed: boolean) => void;
  onRetire: () => void;
}

export function ThreadTodoDock(props: ThreadTodoDockProps) {
  const {
    state,
    placement,
    collapsed,
    canMove = true,
    onPlacementChange,
    onCollapsedChange,
    onRetire,
  } = props;
  const { t } = useLingui();
  const activeRowRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (collapsed) return;
    if (typeof activeRowRef.current?.scrollIntoView === "function") {
      activeRowRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [collapsed, state.activeIndex, state.sourceItemId, state.steps.length]);

  const inProgressStepIndices = state.steps
    .map((s, i) => (s.status === "in_progress" ? i : -1))
    .filter((i) => i !== -1);

  const displayedStepIndices = collapsed
    ? inProgressStepIndices.length > 0
      ? inProgressStepIndices
      : [state.activeIndex]
    : state.steps.map((_, i) => i);

  if (displayedStepIndices.length === 0) return null;

  const moveLabel =
    placement === "composer" ? t`Move todo dock to right panel` : t`Attach todo dock to composer`;
  const completedCount = state.steps.reduce(
    (count, step) => (step.status === "completed" ? count + 1 : count),
    0,
  );
  const countLabel = <AnimatedFraction value={completedCount} total={state.steps.length} />;

  return (
    <ThreadDockSection
      ariaLabel={t`Thread todo dock`}
      placement={placement}
      collapsed={collapsed}
      className={
        placement === "right" ? "rounded-none border-0 bg-[var(--content-background)]" : ""
      }
    >
      <ThreadDockHeader
        icon={ListChecks}
        title={t`Plan`}
        countLabel={countLabel}
        actions={
          <>
            {canMove ? (
              <Tooltip delay={0}>
                <Tooltip.Trigger>
                  <button
                    aria-label={moveLabel}
                    className="shrink-0 rounded p-1 text-muted/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
                    type="button"
                    onClick={() =>
                      onPlacementChange(placement === "composer" ? "right" : "composer")
                    }
                  >
                    <ArrowRightLeft className="size-3.5" />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Content>{moveLabel}</Tooltip.Content>
              </Tooltip>
            ) : null}
            <Tooltip delay={0}>
              <Tooltip.Trigger>
                <button
                  aria-label={collapsed ? t`Expand todo dock` : t`Collapse todo dock`}
                  className="shrink-0 rounded p-1 text-muted/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
                  type="button"
                  onClick={() => onCollapsedChange(!collapsed)}
                >
                  <ChevronDown
                    className={`size-3.5 transition-transform ${collapsed ? "-rotate-90" : "rotate-0"}`}
                  />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Content>
                {collapsed ? <Trans>Expand</Trans> : <Trans>Collapse</Trans>}
              </Tooltip.Content>
            </Tooltip>
            <Tooltip delay={0}>
              <Tooltip.Trigger>
                <button
                  aria-label={t`Close plan`}
                  className="shrink-0 rounded p-1 text-muted/70 transition-colors hover:bg-danger-500/10 hover:text-danger-500"
                  type="button"
                  onClick={onRetire}
                >
                  <X className="size-3.5" />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Content>
                <Trans>Close plan</Trans>
              </Tooltip.Content>
            </Tooltip>
          </>
        }
      />

      <ThreadDockList placement={placement} collapsed={collapsed}>
        {displayedStepIndices.map((index) => {
          const step = state.steps[index];
          if (!step) return null;
          const isActive = index === state.activeIndex;
          const isDone = step.status === "completed";
          return (
            <ThreadDockRow
              key={`${state.sourceItemId}:${index}`}
              ref={isActive ? activeRowRef : undefined}
              isActive={isActive}
              isDone={isDone}
              title={step.text}
            >
              <StatusIcon status={step.status} />
              <span
                className={`min-w-0 flex-1 truncate leading-5 ${isDone ? "text-foreground-muted" : "text-foreground"}`}
              >
                {step.text}
              </span>
            </ThreadDockRow>
          );
        })}
      </ThreadDockList>
    </ThreadDockSection>
  );
}

function StatusIcon({ status }: { status: ThreadTodoStepStatus }) {
  const { t } = useLingui();
  switch (status) {
    case "completed":
      return (
        <Check aria-label={t`completed`} className="size-3.5 shrink-0 text-foreground-muted" />
      );
    case "in_progress":
      return (
        <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
          <PixelLoader size="xxs" className="text-foreground" />
        </span>
      );
    default:
      return (
        <Hourglass aria-label={t`pending`} className="size-3.5 shrink-0 text-foreground-muted/50" />
      );
  }
}
