import { useEffect, useId, useRef, useState } from "react";
import {
  Activity,
  Bot,
  ChevronRight,
  CircleAlert,
  Radio,
  Square,
  Terminal,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { BackgroundTask } from "@/shared/contracts";
import type { ThreadDocksPlacement } from "@/shared/settings";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { Button } from "@/renderer/components/common";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { formatElapsed } from "@/renderer/utils/formatTime";
import { CommandOutputViewport } from "./ChatPane/parts/items/CommandOutputViewport";
import {
  backgroundTaskActionKey,
  useThreadBackgroundTaskOutput,
} from "./useThreadBackgroundTaskOutput";
import { ThreadDockIconButton } from "./ThreadDockUI";

type TaskCategory = NonNullable<BackgroundTask["category"]> | "other";

const CATEGORY_ICONS: Record<TaskCategory, LucideIcon> = {
  command: Terminal,
  monitor: Radio,
  tool: Wrench,
  agent: Bot,
  workflow: Workflow,
  other: Activity,
};

const CATEGORY_LABELS = {
  command: msg`Command`,
  monitor: msg`Monitor`,
  tool: msg`Tool`,
  agent: msg`Agent`,
  workflow: msg`Workflow`,
  other: msg`Other`,
} as const;

function taskCategory(task: BackgroundTask): TaskCategory {
  return task.category ?? (task.kind === "command" ? "command" : "other");
}

/** Matches subagent rows: stacked metadata in the panel, one line above the composer. */
export function ThreadBackgroundTaskRow({
  threadId,
  task,
  placement = "composer",
}: {
  threadId: string;
  task: BackgroundTask;
  placement?: ThreadDocksPlacement;
}) {
  const { t } = useLingui();
  const detailsId = useId();
  const metadataId = useId();
  const [expanded, setExpanded] = useState(false);
  const stopActionKey = task.stopAction ? backgroundTaskActionKey(task.stopAction) : "";
  const stopIdentity = JSON.stringify([threadId, task.taskId, stopActionKey]);
  const [stopState, setStopState] = useState<{
    identity: string;
    stopping: boolean;
    error?: string;
  }>({ identity: stopIdentity, stopping: false });
  const stopping = stopState.identity === stopIdentity ? stopState.stopping : false;
  const error = stopState.identity === stopIdentity ? stopState.error : undefined;
  const category = taskCategory(task);
  const CategoryIcon = CATEGORY_ICONS[category];
  const categoryLabel = t(CATEGORY_LABELS[category]);
  const command = task.command?.trim();
  const description = task.description.trim();
  const label = description || command || t`Background task`;
  const commandIsLabel = command !== undefined && (description === "" || description === command);
  const expandedCommand = expanded && commandIsLabel;
  const showDetailsCommand = command !== undefined && !commandIsLabel;
  const progress = task.progress?.trim();
  const genuineProgress =
    progress && progress !== label && progress !== command ? progress : undefined;
  const inPanel = placement === "right";
  const disclosureHeight = expandedCommand
    ? inPanel
      ? "h-auto max-h-40 overflow-y-auto"
      : "h-auto max-h-20 overflow-y-auto"
    : inPanel
      ? "h-auto"
      : "h-5";
  const showSummaryProgress = inPanel && genuineProgress !== undefined;
  const showDetailsProgress = !inPanel && genuineProgress !== undefined;
  const output = useThreadBackgroundTaskOutput(threadId, task, expanded);
  const outputBusy =
    output.state.status === "loading" ||
    (output.state.status === "ready" && output.state.refreshing);

  async function stop() {
    if (!task.stopAction || stopping) return;
    const identity = stopIdentity;
    setStopState({ identity, stopping: true });
    try {
      await readBridge().invokeThreadSessionAction({
        threadId,
        actionId: task.stopAction.id,
        payload: task.stopAction.payload,
      });
      setStopState({ identity, stopping: false });
    } catch (failure) {
      setStopState({
        identity,
        stopping: false,
        error: friendlyError(failure),
      });
      setExpanded(true);
    }
  }

  return (
    <li data-row-key={task.taskId} className="min-w-0">
      <div
        data-summary="true"
        className={`flex items-center gap-2 rounded px-2 py-1 leading-5 ${
          !inPanel && expanded ? "sticky top-0 z-10 bg-[var(--content-background)]" : ""
        }`}
      >
        <span
          className="inline-flex size-3.5 shrink-0 items-center justify-center text-foreground-muted"
          aria-hidden
        >
          <CategoryIcon className="size-3.5" />
        </span>
        <Button
          variant="ghost"
          size="sm"
          className={`${disclosureHeight} min-w-0 flex-1 justify-start gap-1 rounded-sm p-0 text-xs text-foreground hover:bg-transparent`}
          aria-label={label}
          aria-describedby={metadataId}
          aria-expanded={expanded}
          aria-controls={detailsId}
          onPress={() => setExpanded(!expanded)}
        >
          <span className="flex min-w-0 flex-1 flex-col justify-center text-left">
            <span
              className={`${inPanel ? "leading-tight" : "leading-5"} ${
                expandedCommand ? "whitespace-pre-wrap break-words" : "truncate"
              } ${commandIsLabel ? "font-mono text-[0.95em]" : ""}`}
            >
              {label}
            </span>
            {inPanel ? (
              <span
                id={metadataId}
                className="flex min-w-0 items-baseline gap-1 text-[0.6875rem] leading-tight text-muted"
              >
                <span className="shrink-0">{categoryLabel}</span>
                {task.startedAt !== undefined ? (
                  <>
                    <span aria-hidden>·</span>
                    <TaskElapsed startedAt={task.startedAt} className="" />
                  </>
                ) : null}
                {showSummaryProgress ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className="truncate">{genuineProgress}</span>
                  </>
                ) : null}
              </span>
            ) : null}
          </span>
          <ChevronRight
            aria-hidden
            className={`size-3 shrink-0 text-muted transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        </Button>
        {!inPanel ? (
          <span
            id={metadataId}
            className="flex shrink-0 items-center gap-1 text-[0.6875rem] text-muted"
          >
            <span>{categoryLabel}</span>
            {task.startedAt !== undefined ? (
              <>
                <span aria-hidden>·</span>
                <TaskElapsed startedAt={task.startedAt} />
              </>
            ) : null}
          </span>
        ) : null}
        {task.stopAction ? (
          <ThreadDockIconButton
            label={stopping ? t`Stopping ${label}…` : t`Stop ${label}`}
            tooltip={stopping ? t`Stopping task…` : t`Stop task`}
            isPending={stopping}
            danger
            compact
            onPress={() => {
              void stop();
            }}
          >
            {stopping ? (
              <PixelLoader size="xxs" />
            ) : (
              <Square aria-hidden className="size-3 fill-current" />
            )}
          </ThreadDockIconButton>
        ) : null}
      </div>
      {expanded ? (
        <div id={detailsId} className="space-y-2 px-8 py-1 text-xs text-muted">
          {showDetailsCommand ? (
            <section className="space-y-1" aria-label={t`Command`}>
              <p className="text-[0.6875rem] font-medium text-muted">{t`Command`}</p>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[0.95em] leading-snug text-foreground">
                {command}
              </pre>
            </section>
          ) : null}
          {showDetailsProgress ? (
            <>
              <p className="whitespace-pre-wrap break-words">{genuineProgress}</p>
              {task.lastProgressAt !== undefined ? (
                <TaskElapsed startedAt={task.lastProgressAt} progress />
              ) : null}
            </>
          ) : null}
          <section
            className="space-y-1"
            aria-label={t`Task output`}
            aria-busy={outputBusy ? true : undefined}
          >
            {task.outputAction ? (
              <TaskOutput {...output} />
            ) : (
              <p>{t`Output isn’t available for this task.`}</p>
            )}
          </section>
          {error ? (
            <p role="alert" className="flex items-start gap-1 text-danger">
              <CircleAlert aria-hidden className="mt-0.5 size-3 shrink-0" />
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function TaskOutput({
  state,
  retry,
}: {
  state: ReturnType<typeof useThreadBackgroundTaskOutput>["state"];
  retry: () => void;
}) {
  const { i18n, t } = useLingui();
  if (state.status === "idle") return null;
  if (state.status === "loading") {
    return (
      <p role="status" className="flex items-center gap-1">
        <PixelLoader size="xxs" />
        {t`Loading output…`}
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 text-danger">
        <span>{state.message}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 min-w-0 px-1 text-xs text-foreground"
          onPress={retry}
        >
          {t`Retry`}
        </Button>
      </div>
    );
  }
  const truncated = state.truncated ? (
    <p>{t`Only the end of the output is shown (${i18n.number(state.totalBytes)} bytes).`}</p>
  ) : null;
  return (
    <>
      {truncated}
      {state.output.length === 0 ? (
        <p>{t`No output yet`}</p>
      ) : (
        <CommandOutputViewport text={state.output} language="plain" />
      )}
    </>
  );
}

function TaskElapsed({
  startedAt,
  progress = false,
  className = "text-[0.85em]",
}: {
  startedAt: number;
  progress?: boolean;
  className?: string;
}) {
  const { t } = useLingui();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const update = () => {
      if (!ref.current) return;
      const elapsed = formatElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
      ref.current.textContent = progress ? t`Last progress ${elapsed} ago` : elapsed;
      ref.current.title = progress ? "" : t`Running for ${elapsed}`;
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [startedAt, progress, t]);
  return (
    <span
      ref={ref}
      className={`shrink-0 text-muted [font-variant-numeric:tabular-nums] ${className}`}
    />
  );
}
