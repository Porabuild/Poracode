import { Button, Tooltip } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CirclePlay, History, Loader2, Pause, Pencil, Play, Trash2 } from "lucide-react";
import type { ScheduledTask } from "@/shared/contracts";

interface ScheduleRowProps {
  task: ScheduledTask;
  recurrenceLabel: string;
  nextRunLabel: string;
  onRunNow: (task: ScheduledTask) => void;
  onToggleEnabled: (task: ScheduledTask) => void;
  onEdit: (task: ScheduledTask) => void;
  onDelete: (task: ScheduledTask) => void;
  onShowRuns: (task: ScheduledTask) => void;
}

export function ScheduleRow({
  task,
  recurrenceLabel,
  nextRunLabel,
  onRunNow,
  onToggleEnabled,
  onEdit,
  onDelete,
  onShowRuns,
}: ScheduleRowProps) {
  const { t } = useLingui();
  const isRunning = task.lastStatus === "running";

  return (
    <div className="group flex items-center gap-3 border-b border-[var(--hairline)] px-3 py-2.5 transition-colors last:border-b-0 hover:bg-default-100/60 focus-within:bg-default-100/60">
      <span
        className={`size-1.5 shrink-0 rounded-full ${task.lastStatus === "failed" ? "bg-danger" : isRunning ? "bg-accent" : task.enabled ? "bg-success" : "bg-muted"}`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{task.name}</p>
        <p className="truncate text-xs text-muted">
          {recurrenceLabel} · {nextRunLabel}
        </p>
      </div>
      <div
        className={`flex shrink-0 items-center gap-0.5 transition-opacity focus-within:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 ${isRunning ? "opacity-100" : "opacity-0"}`}
      >
        <Tooltip delay={0}>
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            aria-label={t`Previous runs`}
            onPress={() => onShowRuns(task)}
          >
            <History className="size-4" />
          </Button>
          <Tooltip.Content>{t`Previous runs`}</Tooltip.Content>
        </Tooltip>
        <Tooltip delay={0}>
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            isDisabled={isRunning}
            aria-label={t`Run now`}
            onPress={() => onRunNow(task)}
          >
            {isRunning ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          </Button>
          <Tooltip.Content>{t`Run now`}</Tooltip.Content>
        </Tooltip>
        <Tooltip delay={0}>
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            aria-label={task.enabled ? t`Pause` : t`Resume`}
            onPress={() => onToggleEnabled(task)}
          >
            {task.enabled ? <Pause className="size-4" /> : <CirclePlay className="size-4" />}
          </Button>
          <Tooltip.Content>{task.enabled ? t`Pause` : t`Resume`}</Tooltip.Content>
        </Tooltip>
        <Tooltip delay={0}>
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            aria-label={t`Edit schedule`}
            onPress={() => onEdit(task)}
          >
            <Pencil className="size-4" />
          </Button>
          <Tooltip.Content>{t`Edit schedule`}</Tooltip.Content>
        </Tooltip>
        <Tooltip delay={0}>
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            className="text-muted hover:text-danger"
            aria-label={t`Delete schedule`}
            onPress={() => onDelete(task)}
          >
            <Trash2 className="size-4" />
          </Button>
          <Tooltip.Content>{t`Delete schedule`}</Tooltip.Content>
        </Tooltip>
      </div>
    </div>
  );
}
