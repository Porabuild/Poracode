import { Activity, ChevronDown, X } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { BackgroundTask } from "@/shared/contracts";
import type { ThreadDocksPlacement } from "@/shared/settings";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { useThreadBackgroundTasksDockStore } from "@/renderer/state/threadBackgroundTasksDockStore";
import { useVisibleThreadBackgroundTasks } from "./useThreadDocksSummary";
import { ThreadDocksPlacementToggle } from "./ThreadDocksPlacementToggle";
import {
  ThreadDockHeader,
  ThreadDockIconButton,
  ThreadDockList,
  ThreadDockRow,
  ThreadDockSection,
} from "./ThreadDockUI";

/**
 * Dock listing the background work the agent is still waiting on after its
 * foreground turn ended — backgrounded commands, watchers, detached jobs.
 * Read-only: providers expose no per-task stop, only whole-turn interrupt, so
 * the list simply drains as tasks finish. Sub-agent runs are not listed here;
 * they have their own dock. Collapsed, it keeps the header count and the
 * newest task, mirroring how the collapsed Plan keeps its in-progress steps.
 */
export function ThreadBackgroundTasksDock({
  threadId,
  placement,
  showPlacementToggle = false,
}: {
  threadId: string;
  placement: ThreadDocksPlacement;
  showPlacementToggle?: boolean;
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
              <ThreadDockIconButton
                label={collapsed ? t`Expand background tasks` : t`Collapse background tasks`}
                tooltip={collapsed ? t`Expand` : t`Collapse`}
                onPress={() => setCollapsed(!collapsed)}
              >
                <ChevronDown
                  className={`size-3.5 transition-transform ${collapsed ? "-rotate-90" : "rotate-0"}`}
                />
              </ThreadDockIconButton>
            ) : null}
            <ThreadDockIconButton
              label={t`Close background tasks`}
              tooltip={t`Close`}
              onPress={() => dismiss(threadId, tasks)}
            >
              <X className="size-3.5" />
            </ThreadDockIconButton>
          </>
        }
      />
      <ThreadDockList placement={placement} collapsed={collapsed} gap="px">
        {shown.map((task) => (
          <BackgroundTaskRow key={task.taskId} task={task} />
        ))}
      </ThreadDockList>
    </ThreadDockSection>
  );
}

function BackgroundTaskRow({ task }: { task: BackgroundTask }) {
  const { t } = useLingui();
  const label = task.description.trim() || t`Background task`;
  return (
    <ThreadDockRow title={label} isActive>
      <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
        <PixelLoader size="xxs" className="text-foreground" />
      </span>
      <span
        className={`min-w-0 flex-1 truncate text-foreground ${
          task.kind === "command" ? "font-mono text-[0.95em]" : ""
        }`}
      >
        {label}
      </span>
    </ThreadDockRow>
  );
}
