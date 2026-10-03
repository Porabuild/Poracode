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
import { useSidebarUiStore } from "@/renderer/state/sidebarUiStore";
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
  const toggleWorktreeCollapsed = useSidebarUiStore((state) => state.toggleWorktreeCollapsed);
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

  const hasRemoveAction = row.doneThreads.length > 0;

  // The archive/delete button is a sibling of the toggle, not a child, so it
  // sits over a reserved slot between the rule and the chevron.
  return (
    <div className="group relative flex w-full items-center pb-0.5 pt-2">
      <button
        type="button"
        aria-expanded={!row.collapsed}
        className="flex min-w-0 flex-1 items-center gap-2 px-1.5 text-left text-xs font-medium text-muted transition-colors hover:text-foreground"
        onClick={() => toggleWorktreeCollapsed(row.collapseKey)}
      >
        <span className="shrink-0">{t(row.label)}</span>
        <span aria-hidden className="h-px min-w-0 flex-1 bg-border" />
        {hasRemoveAction ? <span aria-hidden className="w-[18px] shrink-0" /> : null}
        <ChevronDown
          className={`size-3.5 shrink-0 transition-transform ${row.collapsed ? "" : "rotate-180"}`}
        />
      </button>
      {hasRemoveAction ? (
        <span className="absolute bottom-0.5 right-7 top-2 flex items-center">
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
                className={`size-[18px] min-w-0 p-0 opacity-0 transition-[opacity,color,background-color] group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 ${isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none"} ${isArchive ? "hover:bg-warning/10 hover:text-warning" : "hover:bg-danger/10 hover:text-danger"}`}
              >
                {isArchive ? <Archive className="size-3.5" /> : <Trash2 className="size-3.5" />}
              </Button>
            }
          />
        </span>
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
