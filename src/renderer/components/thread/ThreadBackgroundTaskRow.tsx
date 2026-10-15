import { useEffect, useId, useRef, useState } from "react";
import { ChevronRight, CircleAlert, Square } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { BackgroundTask } from "@/shared/contracts";
import type { ThreadDocksPlacement } from "@/shared/settings";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { Button } from "@/renderer/components/common";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { formatElapsed } from "@/renderer/utils/formatTime";
import { ThreadDockIconButton, ThreadDockRow } from "./ThreadDockUI";

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
  const [expanded, setExpanded] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string>();
  const label = task.description.trim() || t`Background task`;
  const inPanel = placement === "right";

  async function stop() {
    if (!task.stopAction || stopping) return;
    setStopping(true);
    setError(undefined);
    try {
      await readBridge().invokeThreadSessionAction({
        threadId,
        actionId: task.stopAction.id,
        payload: task.stopAction.payload,
      });
    } catch (failure) {
      setError(friendlyError(failure));
      setExpanded(true);
    } finally {
      setStopping(false);
    }
  }

  return (
    <>
      <ThreadDockRow rowKey={task.taskId}>
        <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
          <PixelLoader size="xxs" className="text-foreground" />
        </span>
        <Button
          variant="ghost"
          size="sm"
          className={`${inPanel ? "h-auto" : "h-5"} min-w-0 flex-1 justify-start gap-1 rounded-sm p-0 text-xs text-foreground hover:bg-transparent`}
          aria-label={label}
          aria-expanded={expanded}
          aria-controls={detailsId}
          onPress={() => setExpanded(!expanded)}
        >
          <span className="flex min-w-0 flex-1 flex-col justify-center text-left">
            <span
              className={`truncate ${inPanel ? "leading-tight" : "leading-5"} ${task.kind === "command" ? "font-mono text-[0.95em]" : ""}`}
            >
              {label}
            </span>
            {inPanel ? (
              <span className="flex min-w-0 items-baseline gap-1 text-[0.6875rem] leading-tight text-muted">
                {task.startedAt !== undefined ? (
                  <>
                    <TaskElapsed startedAt={task.startedAt} className="" />
                    <span aria-hidden>·</span>
                  </>
                ) : null}
                <span className="truncate">{task.progress || t`No progress reported`}</span>
              </span>
            ) : null}
          </span>
          <ChevronRight
            aria-hidden
            className={`size-3 shrink-0 text-muted transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        </Button>
        {!inPanel && task.startedAt !== undefined ? (
          <TaskElapsed startedAt={task.startedAt} />
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
      </ThreadDockRow>
      {expanded ? (
        <li
          id={detailsId}
          className="max-h-32 space-y-1 overflow-y-auto px-8 py-1 text-xs text-muted"
        >
          <p className="whitespace-pre-wrap break-words text-foreground">{label}</p>
          {task.progress ? (
            <p className="whitespace-pre-wrap break-words">{task.progress}</p>
          ) : null}
          {task.lastProgressAt !== undefined ? (
            <TaskElapsed startedAt={task.lastProgressAt} progress />
          ) : (
            <p>{t`No progress reported`}</p>
          )}
          {error ? (
            <p role="alert" className="flex items-start gap-1 text-danger">
              <CircleAlert aria-hidden className="mt-0.5 size-3 shrink-0" />
              {error}
            </p>
          ) : null}
        </li>
      ) : null}
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
