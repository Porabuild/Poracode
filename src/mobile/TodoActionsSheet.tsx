import { useEffect } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { MessageSquarePlus, Pencil, Trash2 } from "lucide-react";
import {
  setTodoActionsListener,
  type TodoActionsRequest,
} from "@/renderer/views/MainView/parts/RightPanel/parts/NotesPanel/todoActions";
import { BottomSheet, useSheet } from "./components";

/**
 * Touch context menu for a long-pressed to-do. Starting a thread both seeds
 * the shared draft and moves the PWA to its composer route; changing shared
 * view state alone does not navigate a route-based mobile shell.
 */
export function TodoActionsSheet() {
  const { t } = useLingui();
  const navigate = useNavigate();
  const sheet = useSheet<TodoActionsRequest>();
  const { open } = sheet;

  useEffect(() => {
    setTodoActionsListener(open);
    return () => setTodoActionsListener(null);
  }, [open]);

  const request = sheet.target;
  if (request === null) return null;

  return (
    <BottomSheet
      label={t`To-dos`}
      closeLabel={t`Close menu`}
      closing={sheet.closing}
      onClose={sheet.close}
    >
      <div className="m-sheet-head">
        <span className="min-w-0 truncate">{request.text}</span>
      </div>
      <div className="m-sheet-list">
        <button
          type="button"
          className="m-sheet-action"
          onClick={() => {
            request.requestRename();
            sheet.close();
          }}
        >
          <Pencil className="size-4" />
          <Trans>Rename</Trans>
        </button>
        <button
          type="button"
          className="m-sheet-action"
          onClick={() => {
            request.requestNewThread();
            sheet.close();
            void navigate({ to: "/new" });
          }}
        >
          <MessageSquarePlus className="size-4" />
          <Trans>Start a new thread from this to-do</Trans>
        </button>
        <button
          type="button"
          className="m-sheet-action text-danger"
          onClick={() => {
            request.requestRemove();
            sheet.close();
          }}
        >
          <Trash2 className="size-4" />
          <Trans>Delete to-do</Trans>
        </button>
      </div>
    </BottomSheet>
  );
}
