import { useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { Archive, CircleCheck, Ellipsis, Pencil, Star, Trash2 } from "lucide-react";
import type { Thread } from "@/shared/contracts";
import { Button } from "@/renderer/components/common";
import { InlineRenameInput } from "@/renderer/views/MainView/parts/Sidebar/parts/InlineRenameInput";
import { SheetMenu, StatusBadge, type SheetMenuItem } from "./components";
import type { ThreadAction } from "./useRemoteDesktop";

/**
 * The PWA shows one thread at a time, so the actions the desktop sidebar
 * hides behind hover/context menus live here, next to the thread title — as a
 * bottom drawer, matching the rest of the phone shell.
 */
function ThreadActionsMenu(props: {
  readonly thread: Thread;
  readonly onRename: () => void;
  readonly onAction: (action: ThreadAction) => void;
}) {
  const { thread } = props;
  const { t } = useLingui();

  const items: SheetMenuItem[] = [
    { id: "rename", label: t`Rename`, icon: <Pencil className="size-4 text-muted" /> },
    {
      id: "toggle-done",
      label: thread.done ? t`Unmark Done` : t`Mark Done`,
      icon: <CircleCheck className="size-4 text-muted" />,
    },
    {
      id: "toggle-star",
      label: thread.starred ? t`Unpin` : t`Pin to top`,
      icon: <Star className="size-4 text-muted" />,
    },
    {
      id: "archive",
      label: t`Archive Thread`,
      icon: <Archive className="size-4" />,
      tone: "warning",
    },
    { id: "delete", label: t`Delete Thread`, icon: <Trash2 className="size-4" />, tone: "danger" },
  ];

  const handleSelect = (id: string) => {
    if (id === "rename") props.onRename();
    if (id === "toggle-done") props.onAction({ kind: "set-done", done: !thread.done });
    if (id === "toggle-star")
      props.onAction({ kind: "set-starred", starred: !(thread.starred ?? false) });
    if (id === "archive") props.onAction({ kind: "archive" });
    if (id === "delete") props.onAction({ kind: "delete" });
  };

  return (
    <SheetMenu
      label={t`Thread actions`}
      closeLabel={t`Close thread actions`}
      items={items}
      onSelect={handleSelect}
      trigger={({ open }) => (
        <Button isIconOnly aria-label={t`Thread actions`} size="sm" variant="ghost" onPress={open}>
          <Ellipsis className="size-4" />
        </Button>
      )}
    />
  );
}

/** Thread title + status + actions; rename swaps the title for an inline input. */
export function ThreadTitleRow(props: {
  readonly thread: Thread;
  readonly onAction: (action: ThreadAction) => void;
}) {
  const { thread } = props;
  const [renaming, setRenaming] = useState(false);

  return (
    <>
      <span className="m-topbar__thread">
        {renaming ? (
          <InlineRenameInput
            initialValue={thread.title}
            onCommit={(title) => {
              props.onAction({ kind: "rename", title });
              setRenaming(false);
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <>
            <span className="m-topbar__title">{thread.title}</span>
            <StatusBadge status={thread.status} />
          </>
        )}
      </span>
      <ThreadActionsMenu
        thread={thread}
        onRename={() => setRenaming(true)}
        onAction={props.onAction}
      />
    </>
  );
}
