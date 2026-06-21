import { useState } from "react";
import { FileDiff, Minus, Plus, Undo2 } from "lucide-react";
import type { ProjectLocation } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { useGitStore } from "@/renderer/state/gitStore";
import type {
  GitTouchFileTarget,
  GitTouchGroupTarget,
} from "@/renderer/views/GitReviewOverlay/parts/GitReviewSidebar/gitTouchContext";
import { BottomSheet } from "../components";

export type GitSheetTarget =
  | { readonly kind: "file"; readonly file: GitTouchFileTarget }
  | { readonly kind: "group"; readonly group: GitTouchGroupTarget };

/**
 * Bottom-sheet context menu for git file/group actions on touch — the mobile
 * stand-in for the desktop's hover affordances. The git mutations mirror the
 * desktop FileRow/FileGroup handlers (optimistic store update + bridge call,
 * re-fetch on failure) so behaviour stays consistent across platforms.
 */
export function GitActionSheet(props: {
  readonly target: GitSheetTarget;
  readonly closing?: boolean;
  readonly effectiveLocation: ProjectLocation;
  readonly storeKey: string;
  readonly isWorktree: boolean;
  readonly onViewDiff: (path: string, staged: boolean) => void;
  readonly onRefetch: () => Promise<void>;
  readonly onClose: () => void;
}) {
  const {
    target,
    closing,
    effectiveLocation,
    storeKey,
    isWorktree,
    onViewDiff,
    onRefetch,
    onClose,
  } = props;
  const [confirmingRevert, setConfirmingRevert] = useState(false);

  async function toggleStageFile(file: GitTouchFileTarget) {
    const store = useGitStore.getState();
    if (file.staged) {
      store.optimisticUnstageFile(storeKey, file.path, isWorktree);
      await readBridge()
        .gitUnstage({ projectLocation: effectiveLocation, filePath: file.path })
        .catch(onRefetch);
    } else {
      store.optimisticStageFile(storeKey, file.path, isWorktree);
      await readBridge()
        .gitStage({ projectLocation: effectiveLocation, filePath: file.path })
        .catch(onRefetch);
    }
    onClose();
  }

  async function revertFile(file: GitTouchFileTarget) {
    await readBridge()
      .gitRevert({ projectLocation: effectiveLocation, filePath: file.path })
      .catch(() => undefined);
    await onRefetch();
    onClose();
  }

  async function stageAll() {
    useGitStore.getState().optimisticStageAll(storeKey, isWorktree);
    await readBridge().gitStageAll({ projectLocation: effectiveLocation }).catch(onRefetch);
    onClose();
  }

  async function unstageAll() {
    useGitStore.getState().optimisticUnstageAll(storeKey, isWorktree);
    await readBridge().gitUnstageAll({ projectLocation: effectiveLocation }).catch(onRefetch);
    onClose();
  }

  async function revertAll() {
    await readBridge()
      .gitRevertAll({ projectLocation: effectiveLocation })
      .catch(() => undefined);
    await onRefetch();
    onClose();
  }

  const title =
    target.kind === "file"
      ? target.file.path.split("/").pop() || target.file.path
      : target.group.title;

  return (
    <BottomSheet label="Git actions" closeLabel="Close menu" closing={closing} onClose={onClose}>
      <div className="m-sheet-head">
        <span className="min-w-0 truncate">{title}</span>
        {target.kind === "file" ? (
          <span className="flex shrink-0 items-center gap-1 text-[11px] font-normal tabular-nums">
            {target.file.insertions > 0 ? (
              <span className="text-success">+{target.file.insertions}</span>
            ) : null}
            {target.file.deletions > 0 ? (
              <span className="text-danger">-{target.file.deletions}</span>
            ) : null}
          </span>
        ) : null}
      </div>

      {confirmingRevert ? (
        <div className="m-sheet-list">
          <p className="m-git-empty">
            Discard changes to <strong>{title}</strong>? This cannot be undone.
          </p>
          <button type="button" className="m-sheet-action" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="m-sheet-action text-danger"
            onClick={() => {
              if (target.kind === "file") void revertFile(target.file);
              else void revertAll();
            }}
          >
            <Undo2 className="size-4" />
            Discard changes
          </button>
        </div>
      ) : target.kind === "file" ? (
        <div className="m-sheet-list">
          <button
            type="button"
            className="m-sheet-action"
            onClick={() => {
              onViewDiff(target.file.path, target.file.staged);
              onClose();
            }}
          >
            <FileDiff className="size-4" />
            View diff
          </button>
          <button
            type="button"
            className="m-sheet-action"
            onClick={() => void toggleStageFile(target.file)}
          >
            {target.file.staged ? <Minus className="size-4" /> : <Plus className="size-4" />}
            {target.file.staged ? "Unstage" : "Stage"}
          </button>
          {!target.file.staged ? (
            <button
              type="button"
              className="m-sheet-action text-danger"
              onClick={() => setConfirmingRevert(true)}
            >
              <Undo2 className="size-4" />
              Discard changes
            </button>
          ) : null}
        </div>
      ) : (
        <div className="m-sheet-list">
          {target.group.staged ? (
            <button type="button" className="m-sheet-action" onClick={() => void unstageAll()}>
              <Minus className="size-4" />
              Unstage all
            </button>
          ) : (
            <>
              <button type="button" className="m-sheet-action" onClick={() => void stageAll()}>
                <Plus className="size-4" />
                Stage all
              </button>
              <button
                type="button"
                className="m-sheet-action text-danger"
                onClick={() => setConfirmingRevert(true)}
              >
                <Undo2 className="size-4" />
                Discard all changes
              </button>
            </>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
