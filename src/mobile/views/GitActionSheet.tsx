import { useState } from "react";
import { toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { FileDiff, FileEdit, Minus, Plus, Undo2 } from "lucide-react";
import type { ProjectLocation } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
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
  readonly onOpenFile?: (path: string) => void;
  readonly onRefetch: () => Promise<void>;
  readonly onClose: () => void;
}) {
  const { t } = useLingui();
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
  // Guards the async revert against a double-tap: the sheet stays mounted until
  // the bridge call resolves, so the confirm button must disable in the gap.
  const [reverting, setReverting] = useState(false);

  async function recoverFromMutationError(error: unknown) {
    toast.danger(friendlyError(error));
    await onRefetch();
  }

  async function toggleStageFile(file: GitTouchFileTarget) {
    const store = useGitStore.getState();
    const bridge = readBridge();
    if (file.staged) store.optimisticUnstageFile(storeKey, file.path, isWorktree);
    else store.optimisticStageFile(storeKey, file.path, isWorktree);
    const request = file.staged
      ? bridge.gitUnstage({ projectLocation: effectiveLocation, filePath: file.path })
      : bridge.gitStage({ projectLocation: effectiveLocation, filePath: file.path });
    await request.catch(recoverFromMutationError);
    onClose();
  }

  async function performRevert(action: Promise<unknown>) {
    try {
      await action;
      await onRefetch();
    } catch (error) {
      await recoverFromMutationError(error);
    }
    onClose();
  }

  async function revertFile(file: GitTouchFileTarget) {
    await performRevert(
      readBridge().gitRevert({ projectLocation: effectiveLocation, filePath: file.path }),
    );
  }

  async function stageAll() {
    useGitStore.getState().optimisticStageAll(storeKey, isWorktree);
    await readBridge()
      .gitStageAll({ projectLocation: effectiveLocation })
      .catch(recoverFromMutationError);
    onClose();
  }

  async function unstageAll() {
    useGitStore.getState().optimisticUnstageAll(storeKey, isWorktree);
    await readBridge()
      .gitUnstageAll({ projectLocation: effectiveLocation })
      .catch(recoverFromMutationError);
    onClose();
  }

  async function revertAll() {
    await performRevert(readBridge().gitRevertAll({ projectLocation: effectiveLocation }));
  }

  const title =
    target.kind === "file"
      ? target.file.path.split("/").pop() || target.file.path
      : target.group.title;

  return (
    <BottomSheet
      label={t`Git actions`}
      closeLabel={t`Close menu`}
      closing={closing}
      onClose={onClose}
    >
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
            <Trans>
              Discard changes to <strong>{title}</strong>? This cannot be undone.
            </Trans>
          </p>
          <button type="button" className="m-sheet-action" onClick={onClose}>
            <Trans>Cancel</Trans>
          </button>
          <button
            type="button"
            className="m-sheet-action text-danger"
            disabled={reverting}
            onClick={() => {
              if (reverting) return;
              setReverting(true);
              void (target.kind === "file" ? revertFile(target.file) : revertAll());
            }}
          >
            <Undo2 className="size-4" />
            <Trans>Discard changes</Trans>
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
            <Trans>View diff</Trans>
          </button>
          {props.onOpenFile ? (
            <button
              type="button"
              className="m-sheet-action"
              onClick={() => {
                props.onOpenFile?.(target.file.path);
                onClose();
              }}
            >
              <FileEdit className="size-4" />
              <Trans>Open in editor</Trans>
            </button>
          ) : null}
          <button
            type="button"
            className="m-sheet-action"
            onClick={() => void toggleStageFile(target.file)}
          >
            {target.file.staged ? <Minus className="size-4" /> : <Plus className="size-4" />}
            {target.file.staged ? t`Unstage` : t`Stage`}
          </button>
          {!target.file.staged ? (
            <button
              type="button"
              className="m-sheet-action text-danger"
              onClick={() => setConfirmingRevert(true)}
            >
              <Undo2 className="size-4" />
              <Trans>Discard changes</Trans>
            </button>
          ) : null}
        </div>
      ) : (
        <div className="m-sheet-list">
          {target.group.staged ? (
            <button type="button" className="m-sheet-action" onClick={() => void unstageAll()}>
              <Minus className="size-4" />
              <Trans>Unstage all</Trans>
            </button>
          ) : (
            <>
              <button type="button" className="m-sheet-action" onClick={() => void stageAll()}>
                <Plus className="size-4" />
                <Trans>Stage all</Trans>
              </button>
              <button
                type="button"
                className="m-sheet-action text-danger"
                onClick={() => setConfirmingRevert(true)}
              >
                <Undo2 className="size-4" />
                <Trans>Discard all changes</Trans>
              </button>
            </>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
