import { Activity, X } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { ThreadDocksPlacement } from "@/shared/settings";
import { ThreadBackgroundTaskRow } from "./ThreadBackgroundTaskRow";
import { useThreadBackgroundTasksDockStore } from "@/renderer/state/threadBackgroundTasksDockStore";
import { useVisibleThreadBackgroundTasks } from "./useThreadDocksSummary";
import { ThreadDocksPlacementToggle } from "./ThreadDocksPlacementToggle";
import {
  ThreadDockCollapseButton,
  ThreadDockHeader,
  ThreadDockIconButton,
  ThreadDockList,
  ThreadDockSection,
} from "./ThreadDockUI";

/**
 * Existing compact dock for commands, watchers and detached jobs. Providers
 * can advertise timing, progress and independent Stop through the shared task
 * contract. Sub-agent runs are not listed here;
 * they have their own dock. Collapsed, it keeps the header count and the
 * newest task, mirroring how the collapsed Plan keeps its in-progress steps.
 */
export function ThreadBackgroundTasksDock({
  threadId,
  placement,
  showPlacementToggle = false,
  onDismiss,
}: {
  threadId: string;
  placement: ThreadDocksPlacement;
  showPlacementToggle?: boolean;
  /** Lets a host sheet close once the hidden dock has nothing left to show. */
  onDismiss?: () => void;
}) {
  const { t } = useLingui();
  const tasks = useVisibleThreadBackgroundTasks(threadId);
  const collapsed = useThreadBackgroundTasksDockStore((s) => s.collapsed);
  const setCollapsed = useThreadBackgroundTasksDockStore((s) => s.setCollapsed);
  const dismiss = useThreadBackgroundTasksDockStore((s) => s.dismiss);
  if (tasks.length === 0) return null;

  const shown = collapsed ? tasks.slice(-1) : tasks;

  return (
    <ThreadDockSection placement={placement} collapsed={collapsed} ariaLabel={t`Background tasks`}>
      <ThreadDockHeader
        icon={Activity}
        title={t`Background tasks`}
        countLabel={<span>{tasks.length}</span>}
        actions={
          <>
            {showPlacementToggle ? <ThreadDocksPlacementToggle placement="composer" /> : null}
            {tasks.length > 1 ? (
              <ThreadDockCollapseButton
                collapsed={collapsed}
                label={collapsed ? t`Expand background tasks` : t`Collapse background tasks`}
                onPress={() => setCollapsed(!collapsed)}
              />
            ) : null}
            <ThreadDockIconButton
              label={t`Close background tasks`}
              tooltip={t`Hide tasks; they keep running`}
              onPress={() => {
                dismiss(threadId, tasks);
                onDismiss?.();
              }}
            >
              <X className="size-3.5" />
            </ThreadDockIconButton>
          </>
        }
      />
      <ThreadDockList placement={placement} collapsed={collapsed} gap="px">
        {shown.map((task) => (
          <ThreadBackgroundTaskRow
            key={`${task.taskId}:${task.startedAt ?? ""}:${JSON.stringify(task.stopAction ?? null)}`}
            threadId={threadId}
            task={task}
            placement={placement}
          />
        ))}
      </ThreadDockList>
    </ThreadDockSection>
  );
}
