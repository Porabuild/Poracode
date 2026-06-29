import { useState } from "react";
import { toast } from "@heroui/react";
import { FileEdit, Lock, Minus, MoreVertical, Plus, Undo2 } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { Project } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { useGitStore } from "@/renderer/state/gitStore";
import { useGitFile } from "@/renderer/state/gitSelectors";
import { isLockFile } from "@/shared/gitUtils";
import {
  ConfirmDialog,
  FileIcon,
  FileStatusBadge,
  PathDisplay,
} from "@/renderer/components/common";
import { handleKeyActivate } from "@/renderer/utils/a11y";
import { openFileInEditor } from "@/renderer/utils/gitHelpers";
import { useGitReviewRowPadX } from "../gitReviewPadXContext";
import { useGitTouch, useLongPress } from "../gitTouchContext";

const COMPOSER_FILE_DRAG_TYPE = "application/lightcode-composer-file";

export function FileRow(props: {
  path: string;
  project: Project;
  isSelected: boolean;
  onSelect: () => void;
  onRefresh: () => void;
  storeKey: string;
  isWorktree: boolean;
  worktreePath: string | undefined;
  worktreeBranch: string | undefined;
}) {
  const {
    path,
    project,
    isSelected,
    onSelect,
    onRefresh,
    storeKey,
    isWorktree,
    worktreePath,
    worktreeBranch,
  } = props;
  const { t } = useLingui();
  const rowPadX = useGitReviewRowPadX();
  const file = useGitFile(storeKey, path, isWorktree);
  const [revertOpen, setRevertOpen] = useState(false);
  const touch = useGitTouch();
  function openMenu() {
    if (!file) return;
    touch?.openFileMenu({
      path,
      staged: file.staged,
      status: file.status,
      insertions: file.insertions,
      deletions: file.deletions,
    });
  }
  const longPress = useLongPress(openMenu);

  if (!file) return null;

  async function handleStageToggle() {
    if (!file) return;
    const store = useGitStore.getState();
    if (file.staged) {
      store.optimisticUnstageFile(storeKey, path, isWorktree);
      await readBridge()
        .gitUnstage({ projectLocation: project.location, filePath: path })
        .catch((error: unknown) => {
          toast.danger(friendlyError(error));
          onRefresh();
        });
    } else {
      store.optimisticStageFile(storeKey, path, isWorktree);
      await readBridge()
        .gitStage({ projectLocation: project.location, filePath: path })
        .catch((error: unknown) => {
          toast.danger(friendlyError(error));
          onRefresh();
        });
    }
  }

  async function handleRevert() {
    await readBridge().gitRevert({
      projectLocation: project.location,
      filePath: path,
    });
    const status = await readBridge()
      .getGitStatus({ projectLocation: project.location })
      .catch(() => undefined);
    if (status) {
      const store = useGitStore.getState();
      if (isWorktree) store.setWorktreeStatus(storeKey, status);
      else store.setStatus(storeKey, status);
    } else {
      onRefresh();
    }
    setRevertOpen(false);
  }

  function handleOpenInEditor() {
    if (!file) return;
    void openFileInEditor(project, worktreePath, worktreeBranch, path, {
      gitDiff: { staged: file.staged, status: file.status },
    });
  }

  return (
    <>
      <button
        type="button"
        draggable={!touch}
        className={`group flex w-full cursor-default items-center gap-1.5 rounded text-left transition-colors ${rowPadX} ${
          touch ? "min-h-[2.75rem] py-2 text-sm" : "py-1 text-xs"
        } ${
          isSelected
            ? "bg-[var(--row-active)] text-foreground"
            : touch
              ? "text-muted active:bg-[var(--row-hover)]"
              : "text-muted hover:bg-[var(--row-hover)] hover:text-foreground"
        }`}
        onClick={(event) => {
          // A long-press fires before the synthetic click on touch release;
          // swallow that click so press-and-hold never also opens the file.
          if (touch && longPress.firedRef.current) {
            longPress.firedRef.current = false;
            event.preventDefault();
            return;
          }
          onSelect();
        }}
        {...(touch ? { ...longPress.handlers, style: longPress.style } : {})}
        onDragStart={(event) => {
          event.dataTransfer.setData(
            COMPOSER_FILE_DRAG_TYPE,
            JSON.stringify({ path, type: "file" }),
          );
          event.dataTransfer.effectAllowed = "copy";
        }}
      >
        <FileIcon path={path} />
        <PathDisplay
          path={path}
          className="flex-1"
          trailing={
            <>
              {isLockFile(path) && (
                <Lock className="ml-1 inline-block size-2 shrink-0 text-muted/40" />
              )}
              <FileStatusBadge status={file.status} />
            </>
          }
        />
        {touch ? (
          <span className="flex shrink-0 items-center gap-1.5">
            <span className="flex items-center justify-end text-[11px] leading-4 font-medium tabular-nums">
              {file.insertions > 0 && <span className="text-success">+{file.insertions}</span>}
              {file.deletions > 0 && <span className="ml-0.5 text-danger">-{file.deletions}</span>}
            </span>
            <span
              role="button"
              tabIndex={0}
              aria-label={t`File actions`}
              className="-mr-1 rounded p-1 text-muted/70 active:bg-[var(--row-hover)]"
              onClick={(e) => {
                e.stopPropagation();
                openMenu();
              }}
              onKeyDown={(e) => handleKeyActivate(e, openMenu, { stopPropagation: true })}
            >
              <MoreVertical className="size-4" />
            </span>
          </span>
        ) : (
          <span className="relative w-14 shrink-0">
            <span className="flex items-center justify-end text-[10px] leading-4 font-medium transition-opacity group-hover:opacity-0">
              {file.insertions > 0 && <span className="text-success">+{file.insertions}</span>}
              {file.deletions > 0 && <span className="ml-0.5 text-danger">-{file.deletions}</span>}
            </span>
            <span className="absolute inset-0 flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <div
                role="button"
                tabIndex={0}
                className="rounded p-0.5 text-muted transition-colors hover:bg-[var(--row-hover)] hover:text-foreground"
                title={t`Open in editor`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenInEditor();
                }}
                onKeyDown={(e) =>
                  handleKeyActivate(e, handleOpenInEditor, { stopPropagation: true })
                }
              >
                <FileEdit className="size-3" />
              </div>
              <div
                role="button"
                tabIndex={0}
                className="rounded p-0.5 text-muted transition-colors hover:bg-[var(--row-hover)] hover:text-foreground"
                title={file.staged ? t`Unstage` : t`Stage`}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleStageToggle();
                }}
                onKeyDown={(e) =>
                  handleKeyActivate(e, () => void handleStageToggle(), { stopPropagation: true })
                }
              >
                {file.staged ? <Minus className="size-3" /> : <Plus className="size-3" />}
              </div>
              {!file.staged && (
                <div
                  role="button"
                  tabIndex={0}
                  className="rounded p-0.5 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                  title={t`Revert changes`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setRevertOpen(true);
                  }}
                  onKeyDown={(e) =>
                    handleKeyActivate(e, () => setRevertOpen(true), { stopPropagation: true })
                  }
                >
                  <Undo2 className="size-3" />
                </div>
              )}
            </span>
          </span>
        )}
      </button>

      <ConfirmDialog
        isOpen={revertOpen}
        title={t`Revert changes`}
        body={
          <Trans>
            Are you sure you want to revert <strong>{path}</strong>? This cannot be undone.
          </Trans>
        }
        confirmLabel={t`Revert`}
        onConfirm={() => void handleRevert()}
        onClose={() => setRevertOpen(false)}
      />
    </>
  );
}
