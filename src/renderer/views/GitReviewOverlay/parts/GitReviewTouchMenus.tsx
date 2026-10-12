import { useState, type ReactNode } from "react";
import { FileEdit, Minus, Plus, Undo2 } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { toast } from "@heroui/react";
import type { Project } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { getBasename } from "@/shared/pathUtils";
import { readBridge } from "@/renderer/bridge";
import { ConfirmDialog } from "@/renderer/components/common";
import { BottomSheet } from "@/renderer/components/common/BottomSheet";
import { useGitStore } from "@/renderer/state/gitStore";
import { openFileInEditor } from "@/renderer/utils/gitHelpers";
import { reconcileStagingStatus } from "./GitReviewSidebar/parts/reconcileStagingStatus";
import {
  GitTouchProvider,
  type GitTouchFileTarget,
  type GitTouchGroupTarget,
} from "./GitReviewSidebar/gitTouchContext";

export function GitReviewTouchMenus(props: {
  project: Project;
  storeKey: string;
  isWorktree: boolean;
  onRefresh: () => void;
  children: ReactNode;
  worktreePath?: string;
  worktreeBranch?: string;
}) {
  const { t } = useLingui();
  const [fileTarget, setFileTarget] = useState<GitTouchFileTarget | null>(null);
  const [groupTarget, setGroupTarget] = useState<GitTouchGroupTarget | null>(null);
  const [revertFile, setRevertFile] = useState<GitTouchFileTarget | null>(null);
  const [revertGroup, setRevertGroup] = useState(false);

  async function stageFile(target: GitTouchFileTarget) {
    const store = useGitStore.getState();
    if (target.staged) {
      store.optimisticUnstageFile(props.storeKey, target.path, props.isWorktree);
      await readBridge()
        .gitUnstage({ projectLocation: props.project.location, filePath: target.path })
        .then(
          () =>
            reconcileStagingStatus({
              projectLocation: props.project.location,
              storeKey: props.storeKey,
              isWorktree: props.isWorktree,
            }),
          (error: unknown) => {
            toast.danger(friendlyError(error));
            props.onRefresh();
          },
        );
      return;
    }
    store.optimisticStageFile(props.storeKey, target.path, props.isWorktree);
    await readBridge()
      .gitStage({ projectLocation: props.project.location, filePath: target.path })
      .then(
        () =>
          reconcileStagingStatus({
            projectLocation: props.project.location,
            storeKey: props.storeKey,
            isWorktree: props.isWorktree,
          }),
        (error: unknown) => {
          toast.danger(friendlyError(error));
          props.onRefresh();
        },
      );
  }

  async function revertFileChanges(target: GitTouchFileTarget) {
    await readBridge().gitRevert({
      projectLocation: props.project.location,
      filePath: target.path,
    });
    const status = await readBridge()
      .getGitStatus({ projectLocation: props.project.location })
      .catch(() => undefined);
    if (status) {
      const store = useGitStore.getState();
      if (props.isWorktree) store.setWorktreeStatus(props.storeKey, status);
      else store.setStatus(props.storeKey, status);
    } else {
      props.onRefresh();
    }
    setRevertFile(null);
  }

  async function stageGroup(target: GitTouchGroupTarget) {
    const store = useGitStore.getState();
    if (target.staged) {
      store.optimisticUnstageAll(props.storeKey, props.isWorktree);
      await readBridge()
        .gitUnstageAll({ projectLocation: props.project.location })
        .then(
          () =>
            reconcileStagingStatus({
              projectLocation: props.project.location,
              storeKey: props.storeKey,
              isWorktree: props.isWorktree,
            }),
          (error: unknown) => {
            toast.danger(friendlyError(error));
            props.onRefresh();
          },
        );
      return;
    }
    store.optimisticStageAll(props.storeKey, props.isWorktree);
    await readBridge()
      .gitStageAll({ projectLocation: props.project.location })
      .then(
        () =>
          reconcileStagingStatus({
            projectLocation: props.project.location,
            storeKey: props.storeKey,
            isWorktree: props.isWorktree,
          }),
        (error: unknown) => {
          toast.danger(friendlyError(error));
          props.onRefresh();
        },
      );
  }

  async function revertGroupChanges() {
    await readBridge().gitRevertAll({ projectLocation: props.project.location });
    const status = await readBridge()
      .getGitStatus({ projectLocation: props.project.location })
      .catch(() => undefined);
    if (status) {
      const store = useGitStore.getState();
      if (props.isWorktree) store.setWorktreeStatus(props.storeKey, status);
      else store.setStatus(props.storeKey, status);
    } else {
      props.onRefresh();
    }
    setRevertGroup(false);
  }

  return (
    <GitTouchProvider
      value={{
        openFileMenu: (target) => {
          setGroupTarget(null);
          setFileTarget(target);
        },
        openGroupMenu: (target) => {
          setFileTarget(null);
          setGroupTarget(target);
        },
      }}
    >
      {props.children}
      {fileTarget ? (
        <BottomSheet label={getBasename(fileTarget.path)} onClose={() => setFileTarget(null)}>
          <div className="m-sheet-list">
            <button
              type="button"
              className="m-sheet-action"
              onClick={() => {
                const target = fileTarget;
                setFileTarget(null);
                void openFileInEditor(
                  props.project,
                  props.worktreePath,
                  props.worktreeBranch,
                  target.path,
                  { gitDiff: { staged: target.staged, status: target.status } },
                );
              }}
            >
              <FileEdit className="size-4 text-muted" />
              <Trans>Open in editor</Trans>
            </button>
            <button
              type="button"
              className="m-sheet-action"
              onClick={() => {
                const target = fileTarget;
                setFileTarget(null);
                void stageFile(target);
              }}
            >
              {fileTarget.staged ? (
                <Minus className="size-4 text-muted" />
              ) : (
                <Plus className="size-4 text-muted" />
              )}
              {fileTarget.staged ? <Trans>Unstage</Trans> : <Trans>Stage</Trans>}
            </button>
            {fileTarget.staged ? null : (
              <button
                type="button"
                className="m-sheet-action"
                onClick={() => {
                  setRevertFile(fileTarget);
                  setFileTarget(null);
                }}
              >
                <Undo2 className="size-4 text-muted" />
                <Trans>Revert changes</Trans>
              </button>
            )}
          </div>
        </BottomSheet>
      ) : null}
      {groupTarget ? (
        <BottomSheet label={groupTarget.title} onClose={() => setGroupTarget(null)}>
          <div className="m-sheet-list">
            <button
              type="button"
              className="m-sheet-action"
              onClick={() => {
                const target = groupTarget;
                setGroupTarget(null);
                void stageGroup(target);
              }}
            >
              {groupTarget.staged ? (
                <Minus className="size-4 text-muted" />
              ) : (
                <Plus className="size-4 text-muted" />
              )}
              {groupTarget.staged ? <Trans>Unstage all</Trans> : <Trans>Stage all</Trans>}
            </button>
            {groupTarget.staged ? null : (
              <button
                type="button"
                className="m-sheet-action"
                onClick={() => {
                  setRevertGroup(true);
                  setGroupTarget(null);
                }}
              >
                <Undo2 className="size-4 text-muted" />
                <Trans>Revert all</Trans>
              </button>
            )}
          </div>
        </BottomSheet>
      ) : null}
      <ConfirmDialog
        isOpen={revertFile !== null}
        title={t`Revert changes`}
        body={
          <Trans>
            Are you sure you want to revert <strong>{revertFile?.path}</strong>? This cannot be
            undone.
          </Trans>
        }
        confirmLabel={t`Revert`}
        onConfirm={() => {
          if (revertFile) void revertFileChanges(revertFile);
        }}
        onClose={() => setRevertFile(null)}
      />
      <ConfirmDialog
        isOpen={revertGroup}
        title={t`Revert all changes`}
        body={
          <Trans>
            Are you sure you want to revert all unstaged changes? This cannot be undone.
          </Trans>
        }
        confirmLabel={t`Revert all`}
        onConfirm={() => void revertGroupChanges()}
        onClose={() => setRevertGroup(false)}
      />
    </GitTouchProvider>
  );
}
