import { Tooltip } from "@heroui/react";
import { Archive, Check, ChevronRight, CircleCheck, Columns2, Pencil } from "lucide-react";
import type { Project } from "@/shared/contracts";
import { ContextMenu } from "@/renderer/components/common";
import { archiveThread, toggleMarkThreadDone } from "@/renderer/actions/threadActions";
import { useAppStore } from "@/renderer/state/appStore";
import { useIsWorktreeCollapsed, useSidebarUiStore } from "@/renderer/state/sidebarUiStore";
import { InlineRenameInput } from "./InlineRenameInput";
import type { ThreadListEntry } from "./groupThreads";

export function SidebarThreadGroup(props: {
  entry: Extract<ThreadListEntry, { kind: "thread-group" }>;
  project: Project;
  editingThreadId: string | null;
  setEditingThreadId: (id: string | null) => void;
}) {
  const { entry, editingThreadId, setEditingThreadId } = props;
  const groupKey = entry.group.groupId;
  const collapseKey = `group:${groupKey}`;
  const isGroupCollapsed = useIsWorktreeCollapsed(collapseKey);
  const toggleWorktreeCollapsed = useSidebarUiStore((s) => s.toggleWorktreeCollapsed);
  const activeThreads = entry.group.threads.filter((t) => !t.done);
  const isDone = activeThreads.length === 0;
  const isRenamingGroup = editingThreadId === collapseKey;

  return (
    <div key={collapseKey} className="space-y-0.5">
      <ContextMenu
        items={[
          {
            id: "open-all",
            label: "Open All",
            icon: <Columns2 className="size-3.5" />,
            isDisabled: activeThreads.length < 2,
          },
          {
            id: "rename-group",
            label: "Rename Group",
            icon: <Pencil className="size-3.5" />,
          },
          {
            id: "mark-all-done",
            label: "Mark All Done",
            icon: <CircleCheck className="size-3.5" />,
            isDisabled: activeThreads.length === 0,
          },
          { type: "separator" as const },
          {
            id: "archive-all",
            label: "Archive All",
            icon: <Archive className="size-3.5" />,
            variant: "warning",
          },
          { id: "ungroup-all", label: "Ungroup All", variant: "warning" },
        ]}
        onAction={(key) => {
          if (key === "open-all") {
            useAppStore.getState().openGroupView(entry.group.groupId);
          }
          if (key === "rename-group") {
            setEditingThreadId(collapseKey);
          }
          if (key === "mark-all-done") {
            for (const t of entry.group.threads) {
              if (!t.done) toggleMarkThreadDone(t.id);
            }
          }
          if (key === "archive-all") {
            for (const t of entry.group.threads) {
              archiveThread(t.id);
            }
            clearThreadGroup(groupKey);
          }
          if (key === "ungroup-all") {
            clearThreadGroup(groupKey);
          }
        }}
      >
        <div className="flex w-full items-center gap-1 rounded px-1.5 py-1">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs font-medium text-muted transition-colors hover:text-foreground"
            onClick={() => toggleWorktreeCollapsed(collapseKey)}
          >
            <ChevronRight
              className={`size-3 shrink-0 transition-transform ${
                isGroupCollapsed ? "" : "rotate-90"
              }`}
            />
            {isDone && <Check className="size-3.5 shrink-0 text-success" strokeWidth={4} />}
            {isRenamingGroup ? (
              <InlineRenameInput
                initialValue={entry.group.groupName}
                onCommit={(newName) => {
                  useAppStore.setState((state) => ({
                    threads: state.threads.map((t) =>
                      t.groupId === groupKey ? { ...t, groupName: newName } : t,
                    ),
                  }));
                  setEditingThreadId(null);
                }}
                onCancel={() => setEditingThreadId(null)}
              />
            ) : (
              <>
                <span className={`truncate ${isDone ? "opacity-50 line-through" : ""}`}>
                  {entry.group.groupName}
                </span>
                <span className={`shrink-0 text-muted/60 ${isDone ? "opacity-50" : ""}`}>
                  {entry.group.threads.length}
                </span>
              </>
            )}
          </button>
          {!isRenamingGroup && activeThreads.length >= 2 && (
            <Tooltip delay={300}>
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-muted/40 transition-colors hover:bg-[var(--row-hover)] hover:text-foreground"
                onClick={() => {
                  useAppStore.getState().openGroupView(entry.group.groupId);
                }}
              >
                <Columns2 className="size-3" />
              </button>
              <Tooltip.Content>Open all in group</Tooltip.Content>
            </Tooltip>
          )}
        </div>
      </ContextMenu>
    </div>
  );
}

function clearThreadGroup(groupKey: string) {
  useAppStore.setState((state) => {
    const updatedThreads = state.threads.map((t) =>
      t.groupId === groupKey ? { ...t, groupId: undefined, groupName: undefined } : t,
    );
    const view =
      state.view.kind === "thread" && state.view.activeGroupId === groupKey
        ? { kind: "thread" as const, panes: [state.view.panes[0]] as [string] }
        : state.view;
    return { threads: updatedThreads, view };
  });
}
