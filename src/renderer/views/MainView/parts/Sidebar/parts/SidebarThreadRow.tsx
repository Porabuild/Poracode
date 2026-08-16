import { useLingui } from "@lingui/react/macro";
import { ChevronDown } from "lucide-react";
import type { Project } from "@/shared/contracts";
import { SidebarButton } from "@/renderer/components/common/SidebarButton";
import { chatRowRailClass } from "@/renderer/components/thread/ChatPane/parts/items/chatRow";
import type { SidebarRow } from "./sidebarProjectRows";
import { SidebarThreadGroup } from "./SidebarThreadGroup";
import { SidebarWorktreeGroup } from "./SidebarWorktreeGroup";
import { SortableThreadItem } from "./SortableThreadItem/SortableThreadItem";

export function SeeMoreThreadsButton(props: { onPress: () => void }) {
  const { t } = useLingui();
  return (
    <SidebarButton
      size="xs"
      icon={<ChevronDown className="size-3.5" />}
      label={t`See more`}
      onPress={props.onPress}
    />
  );
}

/**
 * Renders one prebuilt sidebar row (thread, group, or section label). Shared by
 * the per-project list and the flat cross-project list — the caller resolves
 * the row's project and, in flat mode, its trailing project tag.
 */
export function SidebarThreadRow(props: {
  row: Exclude<SidebarRow, { kind: "see-more" }>;
  project: Project;
  editingThreadId: string | null;
  setEditingThreadId: (id: string | null) => void;
  /** Trailing project label for cross-project (flat) lists. */
  projectTag?: React.ReactNode;
}) {
  const { row, project, editingThreadId, setEditingThreadId, projectTag } = props;
  const { t } = useLingui();

  if (row.kind === "thread") {
    const item = (
      <SortableThreadItem
        thread={row.thread}
        threadIndex={row.threadIndex}
        project={project}
        showWorktreeBadge={row.showWorktreeBadge}
        {...(row.showWorktreeFilesButton !== undefined
          ? { showWorktreeFilesButton: row.showWorktreeFilesButton }
          : {})}
        editingThreadId={editingThreadId}
        setEditingThreadId={setEditingThreadId}
        group={row.group}
        {...(row.sortDisabled !== undefined ? { sortDisabled: row.sortDisabled } : {})}
        {...(projectTag !== undefined ? { projectTag } : {})}
      />
    );
    // Group children hang off the same dashed rail as the chat tool-call group
    // (shared recipe). `ml-3.5` drops the rail down the centerline of the group
    // header's icon; no left padding keeps the child hugging the rail so the
    // nesting reads without a wide indent. The first child starts slightly
    // lower so the rail does not run into the group row.
    if (row.inGroup) {
      return (
        <div
          className={`ml-3.5 pl-1 ${row.firstInGroup ? "poracode-sidebar-group-first-thread mt-1.5" : ""} ${row.lastInGroup ? "poracode-sidebar-group-last-thread" : ""} ${chatRowRailClass}`}
        >
          {item}
        </div>
      );
    }
    return item;
  }

  return (
    <div className="w-full pb-0.5">
      {row.kind === "worktree-group" ? (
        <SidebarWorktreeGroup
          group={row.group}
          entryIndex={row.entryIndex}
          project={project}
          sortableGroup={row.sortableGroup}
          sortDisabled={row.sortDisabled}
          liveBackgroundThreadIds={row.liveBackgroundThreadIds}
          {...(projectTag !== undefined ? { projectTag } : {})}
        />
      ) : row.kind === "thread-group" ? (
        <SidebarThreadGroup
          entry={row.entry}
          project={project}
          editingThreadId={editingThreadId}
          setEditingThreadId={setEditingThreadId}
          {...(projectTag !== undefined ? { projectTag } : {})}
        />
      ) : (
        <div className="px-1.5 pb-0.5 pt-2 text-[10px] font-medium uppercase tracking-wider text-muted">
          {t(row.label)}
        </div>
      )}
    </div>
  );
}
