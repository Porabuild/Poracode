import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import {
  AlertTriangle,
  Bot,
  Gauge,
  GitBranch,
  KeyRound,
  ListChecks,
  Target,
  Users,
} from "lucide-react";
import type { AgentStatus, Project, ProjectLocation, Thread } from "@/shared/contracts";
import {
  ActiveSubAgentTile,
  useActiveAgentKindCounts,
  type ActiveAgentKind,
} from "@/renderer/components/thread/ChatPane/parts/items/ActiveSubAgentTile";
import { ThreadContextDock } from "@/renderer/components/thread/ThreadContextDock";
import { ThreadErrorDock } from "@/renderer/components/thread/ThreadErrorDock";
import { ThreadGoalDock } from "@/renderer/components/thread/ThreadGoalDock";
import { ThreadAuthRequiredDock } from "@/renderer/components/thread/ThreadAuthRequiredDock";
import { ThreadTodoDock } from "@/renderer/components/thread/ThreadTodoDock";
import {
  resolveThreadAuthState,
  type ThreadErrorDockState,
} from "@/renderer/components/thread/threadErrorState";
import type { ThreadGoalDockState } from "@/renderer/components/thread/threadGoalState";
import type { ThreadTodoDockState } from "@/renderer/components/thread/threadTodoState";
import type { ThreadContextUsageSummary } from "@/renderer/components/thread/threadContextUsage";
import { ThreadUsageBubble, ThreadUsageDock } from "@/renderer/components/thread/ThreadUsageBubble";

type ChipKey = ActiveAgentKind | "auth" | "context" | "usage" | "plan" | "goal" | "errors";
const PANEL_EXIT_MS = 160;
const CHIP_EXIT_MS = 160;
const CHIP_ORDER: readonly ChipKey[] = [
  "subagent",
  "crossagent",
  "workflow",
  "auth",
  "context",
  "plan",
  "goal",
  "errors",
];

interface ChipDescriptor {
  readonly key: ChipKey;
  readonly icon: React.ElementType<{ className?: string; "aria-hidden"?: boolean }>;
  readonly label: string;
  readonly count?: string;
  readonly tone?: "danger" | "warning";
  readonly active?: boolean;
}

/** Compact info chips floating above the collapsed thread composer. */
export function ComposerInfoChips(props: {
  readonly threadId: string;
  readonly agentStatus: AgentStatus | undefined;
  readonly project: Project | undefined;
  readonly projectLocation: ProjectLocation;
  readonly contextSummary?: ThreadContextUsageSummary | null | undefined;
  readonly todoDockState: ThreadTodoDockState | null;
  readonly goalDockState: ThreadGoalDockState | null;
  readonly errorDockStates: ThreadErrorDockState[];
  readonly onGoalDockDismiss: () => void;
  readonly onDismissError: (sourceItemId: string) => void;
  readonly onTodoDockPlacementChange: (placement: "composer" | "right") => void;
  readonly onTodoDockRetire?: (() => void) | undefined;
  readonly hidden: boolean;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  /** Merge context and quota meters into the mobile thread resource bubble. */
  readonly usageThread?: Thread;
}) {
  const { t } = useLingui();
  const { threadId, projectLocation, contextSummary, hidden } = props;
  const [openChip, setOpenChip] = useState<ChipKey | null>(null);
  const [closingChip, setClosingChip] = useState<ChipKey | null>(null);
  const [exitingChips, setExitingChips] = useState<readonly ChipDescriptor[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const currentChipsRef = useRef<readonly ChipDescriptor[]>([]);
  const previousChipsRef = useRef<readonly ChipDescriptor[]>([]);
  const previousThreadIdRef = useRef(threadId);
  const agentCounts = useActiveAgentKindCounts(threadId);
  const { authRequired } = resolveThreadAuthState({
    authState: props.agentStatus?.authState,
    errorDockStates: props.errorDockStates,
  });
  const completedSteps =
    props.todoDockState?.steps.filter((step) => step.status === "completed").length ?? 0;

  const chips: ChipDescriptor[] = [];
  if (agentCounts.subagent > 0) {
    chips.push({
      key: "subagent",
      icon: Bot,
      label: t`Subagents`,
      count: String(agentCounts.subagent),
      active: true,
    });
  }
  if (agentCounts.crossagent > 0) {
    chips.push({
      key: "crossagent",
      icon: Users,
      label: t`Crossagents`,
      count: String(agentCounts.crossagent),
      active: true,
    });
  }
  if (agentCounts.workflow > 0) {
    chips.push({
      key: "workflow",
      icon: GitBranch,
      label: t`Workflows`,
      count: String(agentCounts.workflow),
      active: true,
    });
  }
  if (authRequired && props.agentStatus) {
    chips.push({
      key: "auth",
      icon: KeyRound,
      label: t`Sign in required`,
      tone: "warning",
    });
  }
  if (contextSummary) {
    chips.push({
      key: "context",
      icon: Gauge,
      label: t`Context`,
      count: contextSummary.percentLabel,
    });
  }
  if (props.todoDockState) {
    chips.push({
      key: "plan",
      icon: ListChecks,
      label: t`Plan`,
      count: `${completedSteps}/${props.todoDockState.steps.length}`,
      active: props.todoDockState.steps.some((step) => step.status === "in_progress"),
    });
  }
  if (props.goalDockState) {
    chips.push({ key: "goal", icon: Target, label: t`Goal` });
  }
  if (props.errorDockStates.length > 0) {
    chips.push({
      key: "errors",
      icon: AlertTriangle,
      label: t`Errors`,
      tone: "danger",
      ...(props.errorDockStates.length > 1 ? { count: String(props.errorDockStates.length) } : {}),
    });
  }
  const chipKeys = chips.map((chip) => chip.key).join(",");
  currentChipsRef.current = chips;

  useLayoutEffect(() => {
    const currentChips = currentChipsRef.current;
    if (previousThreadIdRef.current !== threadId) {
      previousThreadIdRef.current = threadId;
      previousChipsRef.current = currentChips;
      setOpenChip(null);
      setClosingChip(null);
      setExitingChips([]);
      return;
    }
    const currentKeys = new Set(currentChips.map((chip) => chip.key));
    const removed = previousChipsRef.current.filter((chip) => !currentKeys.has(chip.key));
    setExitingChips((current) => {
      const retained = current.filter((chip) => !currentKeys.has(chip.key));
      const next = [
        ...retained,
        ...removed.filter((chip) => !retained.some((item) => item.key === chip.key)),
      ];
      return next.length === current.length && next.every((chip, index) => chip === current[index])
        ? current
        : next;
    });
    if (openChip !== null && removed.some((chip) => chip.key === openChip)) {
      setClosingChip(openChip);
      setOpenChip(null);
    }
    previousChipsRef.current = currentChips;
  }, [chipKeys, openChip, threadId]);

  useEffect(() => {
    if (exitingChips.length === 0) return;
    const timeout = window.setTimeout(() => setExitingChips([]), CHIP_EXIT_MS);
    return () => window.clearTimeout(timeout);
  }, [exitingChips]);

  useEffect(() => {
    if (openChip !== null || closingChip === null) return;
    const timeout = window.setTimeout(() => setClosingChip(null), PANEL_EXIT_MS);
    return () => window.clearTimeout(timeout);
  }, [closingChip, openChip]);

  const closePanel = () => {
    if (openChip !== null) setClosingChip(openChip);
    setOpenChip(null);
  };

  const panelOpen = openChip !== null;
  useEffect(() => {
    if (!panelOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const container = containerRef.current;
      if (container && event.target instanceof Node && !container.contains(event.target)) {
        if (openChip !== null) setClosingChip(openChip);
        setOpenChip(null);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [panelOpen, openChip]);

  const renderedChips = CHIP_ORDER.flatMap((key) => {
    const chip =
      chips.find((item) => item.key === key) ?? exitingChips.find((item) => item.key === key);
    return chip ? [chip] : [];
  });
  if (renderedChips.length === 0 && !props.leading && !props.trailing && !props.usageThread) {
    return null;
  }

  const renderedChip = openChip ?? closingChip;
  const open = renderedChips.find((chip) => chip.key === renderedChip) ?? null;
  const authChip = renderedChips.find((chip) => chip.key === "auth");
  const contextLivesInTrailing = props.usageThread !== undefined && contextSummary != null;
  const leadingChips = renderedChips.filter(
    (chip) => chip.key !== "auth" && (!contextLivesInTrailing || chip.key !== "context"),
  );

  const toggleContext = () => {
    if (!contextSummary) return;
    if (openChip === "context") {
      closePanel();
      return;
    }
    setClosingChip(null);
    setOpenChip("context");
  };
  const toggleUsage = () => {
    if (!props.usageThread) return;
    if (openChip === "usage") {
      closePanel();
      return;
    }
    setClosingChip(null);
    setOpenChip("usage");
  };
  const trailing = props.usageThread ? (
    <ThreadUsageBubble
      thread={props.usageThread}
      contextSummary={contextSummary ?? null}
      contextOpen={openChip === "context"}
      usageOpen={openChip === "usage"}
      onContextToggle={toggleContext}
      onUsageToggle={toggleUsage}
    />
  ) : (
    props.trailing
  );

  const renderChipButton = (chip: ChipDescriptor) => {
    const Icon = chip.icon;
    const isOpen = chip.key === openChip;
    const isExiting = !chips.some((item) => item.key === chip.key);
    return (
      <button
        key={chip.key}
        type="button"
        className="m-chip"
        data-open={isOpen || undefined}
        data-tone={chip.tone}
        data-active={chip.active || undefined}
        data-exiting={isExiting || undefined}
        aria-expanded={isOpen}
        aria-label={chip.label}
        title={chip.label}
        onClick={() => {
          if (isExiting) return;
          if (isOpen) {
            closePanel();
            return;
          }
          setClosingChip(null);
          setOpenChip(chip.key);
        }}
      >
        <Icon className="size-3.5" aria-hidden />
        {chip.count ? <span className="m-chip__count">{chip.count}</span> : null}
      </button>
    );
  };

  const panelKey = openChip ?? closingChip;
  const panelLabel = panelKey === "usage" ? t`Usage` : open?.label;

  return (
    <div ref={containerRef} className="m-thread-chips" data-hidden={hidden || undefined}>
      {panelKey && panelLabel ? (
        <div
          key={panelKey}
          className="m-chip-panel"
          data-open={openChip === panelKey || undefined}
          role="region"
          aria-label={panelLabel}
        >
          {panelKey === "usage" && props.usageThread ? (
            <ThreadUsageDock thread={props.usageThread} onClose={closePanel} />
          ) : null}
          {panelKey === "goal" && props.goalDockState ? (
            <ThreadGoalDock
              threadId={threadId}
              state={props.goalDockState}
              onDismiss={props.onGoalDockDismiss}
            />
          ) : null}
          {panelKey === "auth" && props.agentStatus ? (
            <ThreadAuthRequiredDock
              agentStatus={props.agentStatus}
              multilineDescription
              {...(props.project ? { project: props.project } : {})}
            />
          ) : null}
          {panelKey === "context" && contextSummary ? (
            <ThreadContextDock summary={contextSummary} onClose={closePanel} />
          ) : null}
          {panelKey === "plan" && props.todoDockState ? (
            <ThreadTodoDock
              state={props.todoDockState}
              placement="composer"
              collapsed={false}
              canMove={false}
              onCollapsedChange={closePanel}
              onPlacementChange={props.onTodoDockPlacementChange}
              onRetire={props.onTodoDockRetire ?? (() => undefined)}
            />
          ) : null}
          {panelKey === "errors"
            ? props.errorDockStates.map((state) => (
                <ThreadErrorDock
                  key={state.sourceItemId}
                  state={state}
                  onDismiss={() => props.onDismissError(state.sourceItemId)}
                />
              ))
            : null}
          {panelKey === "subagent" || panelKey === "crossagent" || panelKey === "workflow" ? (
            <ActiveSubAgentTile
              threadId={threadId}
              projectLocation={projectLocation}
              kinds={[panelKey]}
            />
          ) : null}
        </div>
      ) : null}
      <div className="m-chip-row">
        {props.leading}
        {leadingChips.map(renderChipButton)}
        {trailing || authChip ? (
          <div className="m-chip-row__trailing">
            {trailing}
            {authChip ? renderChipButton(authChip) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
