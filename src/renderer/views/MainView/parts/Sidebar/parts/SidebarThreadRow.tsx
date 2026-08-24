import { useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { Archive, ChevronDown, Trash2 } from "lucide-react";
import type { Project } from "@/shared/contracts";
import { archiveThread, deleteThreadsAndOwnedWorktrees } from "@/renderer/actions/threadActions";
import { Button } from "@/renderer/components/common/Button";
import { ConfirmationPopover } from "@/renderer/components/common/ConfirmationPopover";
import { SidebarButton } from "@/renderer/components/common/SidebarButton";
import { chatRowRailClass } from "@/renderer/components/thread/ChatPane/parts/items/chatRow";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
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

function DoneSectionLabel(props: { row: Extract<SidebarRow, { kind: "section-label" }> }) {
  const { row } = props;
  const { t } = useLingui();
  const [isOpen, setIsOpen] = useState(false);
  const threadRemoveAction = useSharedSettings((state) => state.threadRemoveAction);
  const isArchive = threadRemoveAction === "archive";
  const actionLabel = isArchive ? t`Archive done threads` : t`Delete done threads`;

  const removeDoneThreads = () => {
    for (const thread of row.doneThreads) {
      if (isArchive) archiveThread(thread.id);
    }
    if (!isArchive) deleteThreadsAndOwnedWorktrees(row.doneThreads);
    setIsOpen(false);
  };

  return (
    <div className="group flex w-full items-center px-1.5 pb-0.5 pt-2 text-[10px] font-medium uppercase tracking-wider text-muted">
      <span>{t(row.label)}</span>
      {row.doneThreads.length > 0 ? (
        <ConfirmationPopover
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          title={actionLabel}
          body={
            row.hasProtectedDoneThreads
              ? isArchive
                ? t`Experiment candidates will remain; all other threads in Done will be archived.`
                : t`Experiment candidates will remain; all other threads in Done will be permanently deleted.`
              : isArchive
                ? t`All threads in Done will be archived.`
                : t`All threads in Done will be permanently deleted.`
          }
          actions={[
            {
              label: isArchive ? t`Archive` : t`Delete`,
              variant: isArchive ? "secondary" : "danger",
              onPress: removeDoneThreads,
            },
          ]}
          trigger={
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label={actionLabel}
              className={`ml-auto size-[18px] min-w-0 p-0 opacity-0 transition-[opacity,color,background-color] group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 ${isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none"} ${isArchive ? "hover:bg-warning/10 hover:text-warning" : "hover:bg-danger/10 hover:text-danger"}`}
            >
              {isArchive ? <Archive className="size-3.5" /> : <Trash2 className="size-3.5" />}
            </Button>
          }
        />
      ) : null}
    </div>
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
    // nesting reads without a wide indent.
    if (row.inGroup) {
      return <div className={`ml-3.5 pl-1 ${chatRowRailClass}`}>{item}</div>;
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
        <DoneSectionLabel row={row} />
      )}
    </div>
  );
}
